// routes/messages.routes.js
// Define os endpoints para envio e consulta de mensagens.

const express = require('express');
const { prisma } = require('../services/database');
const wppconnect = require('../services/wppconnect');
const authMiddleware = require('../middleware/auth.middleware');
const logger = require('../services/logger');

const router = express.Router();

// Middleware de autenticação aplicado a todas as rotas de mensagens
router.use(authMiddleware);

/**
 * Tenta incrementar o contador de mensagens.
 * Retorna true se o incremento foi bem-sucedido, false caso contrário.
 * @param {number} userId - ID do usuário.
 * @returns {Promise<boolean>}
 */
async function reserveMessageSlot(userId) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { plan: true },
    });

    if (!user || !user.plan) return false;

    // Planos com limite -1 são ilimitados
    if (user.plan.messageLimit === -1) {
        await prisma.user.update({
            where: { id: userId },
            data: { messagesSent: { increment: 1 } },
        });
        return true;
    }

    // Operação atômica: só incrementa se a contagem atual for menor que o limite
    const result = await prisma.user.updateMany({
        where: {
            id: userId,
            messagesSent: {
                lt: user.plan.messageLimit,
            },
        },
        data: {
            messagesSent: {
                increment: 1,
            },
        },
    });

    // `result.count` será 1 se a linha foi atualizada, 0 se a condição falhou
    return result.count > 0;
}

/**
 * Reverte a contagem de mensagens em caso de falha no envio.
 * @param {number} userId - ID do usuário.
 */
async function releaseMessageSlot(userId) {
    await prisma.user.updateMany({
        where: {
            id: userId,
            messagesSent: { gt: 0 },
        },
        data: {
            messagesSent: {
                decrement: 1,
            },
        },
    });
}

/**
 * Verifica envio duplicado (anti-spam).
 * @param {number} userId - ID do usuário.
 * @param {string} to - Número do destinatário.
 * @param {string} message - Conteúdo da mensagem.
 * @returns {Promise<boolean>} - Retorna true se for um spam, false caso contrário.
 */
async function isSpam(userId, to, message) {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    const recentMessage = await prisma.message.findFirst({
        where: {
            userId,
            numberTo: to,
            messageContent: message,
            sentAt: {
                gt: fiveMinutesAgo,
            },
        },
    });

    return !!recentMessage;
}


// POST /messages/send
router.post('/send', async (req, res, next) => {
    const { to, message, media_url } = req.body;
    const userId = req.user.userId;
    let phoneNumber = 'N/A';

    if (!to || (!message && !media_url)) {
        return res.status(400).json({ error: 'O destinatário ("to") e o conteúdo ("message" ou "media_url") são obrigatórios.' });
    }
    
    try {
        if (await isSpam(userId, to, message)) {
            logger.warn(`Envio duplicado bloqueado para o usuário ${userId} -> ${to}`);
            return res.status(429).json({ error: 'Mensagem idêntica enviada para o mesmo número recentemente. Evite spam.' });
        }
        
        if (!(await reserveMessageSlot(userId))) {
            return res.status(429).json({ error: 'Limite de mensagens do seu plano atingido.' });
        }

        const connection = await wppconnect.getAvailableClient();
        if (!connection) {
            await releaseMessageSlot(userId);
            return res.status(503).json({ error: 'Nenhum serviço de envio está disponível no momento. Tente novamente mais tarde.' });
        }
        const { client } = connection;
        phoneNumber = connection.phoneNumber;
        
        let result;
        
        if (media_url) {
            result = await client.sendImage(to, media_url, 'media', message);
        } else {
            result = await client.sendText(to, message);
        }

        await prisma.message.create({
            data: {
                userId,
                numberTo: to,
                messageContent: message,
                mediaUrl: media_url,
                status: 'sent',
                sentByNumber: phoneNumber,
            },
        });

        logger.info(`Mensagem enviada por ${userId} para ${to.substring(0, 6)}... via ${phoneNumber}`);
        res.status(200).json({ status: 'success', messageId: result.id, message: 'Mensagem enviada com sucesso.' });

    } catch (error) {
        logger.error(`Falha ao enviar mensagem para ${userId}: ${error.message}`);
        await releaseMessageSlot(userId);
        
        await prisma.message.create({
            data: {
                userId,
                numberTo: to,
                messageContent: message,
                mediaUrl: media_url,
                status: 'failed',
                errorMessage: error.message,
                sentByNumber: phoneNumber,
            },
        });
        next(error);
    }
});

// POST /messages/send-batch
router.post('/send-batch', async (req, res, next) => {
    const { contacts } = req.body;
    const userId = req.user.userId;

    if (!Array.isArray(contacts) || contacts.length === 0) {
        return res.status(400).json({ error: 'O campo "contacts" deve ser um array não vazio.' });
    }
    if (contacts.length > 100) {
        return res.status(400).json({ error: 'O envio em lote é limitado a 100 contatos por vez.' });
    }
    
    const results = [];

    for (const contact of contacts) {
        const { to, message, media_url } = contact;
        let status = 'pending';
        let details = '';
        let phoneNumber = 'N/A';

        if (!to || (!message && !media_url)) {
            status = 'failed';
            details = 'Campos obrigatórios ausentes.';
        } else if (await isSpam(userId, to, message)) {
            status = 'failed';
            details = 'Envio duplicado (spam).';
        } else if (!(await reserveMessageSlot(userId))) {
            status = 'failed';
            details = 'Limite do plano atingido.';
        } else {
            try {
                const connection = await wppconnect.getAvailableClient();
                if (!connection) {
                    await releaseMessageSlot(userId);
                    status = 'failed';
                    details = 'Serviço indisponível.';
                } else {
                    const { client } = connection;
                    phoneNumber = connection.phoneNumber;
                    if (media_url) {
                        await client.sendImage(to, media_url, 'media', message);
                    } else {
                        await client.sendText(to, message);
                    }
                    status = 'sent';
                    details = 'Enviado com sucesso.';
                    await prisma.message.create({
                        data: {
                            userId,
                            numberTo: to,
                            messageContent: message,
                            mediaUrl: media_url,
                            status: 'sent',
                            sentByNumber: phoneNumber,
                        },
                    });
                }
            } catch (error) {
                await releaseMessageSlot(userId);
                status = 'failed';
                details = error.message;
                await prisma.message.create({
                    data: {
                        userId,
                        numberTo: to,
                        messageContent: message,
                        mediaUrl: media_url,
                        status: 'failed',
                        errorMessage: details,
                        sentByNumber: phoneNumber,
                    },
                });
            }
        }
        results.push({ to, status, details });
    }
    
    logger.info(`Processamento de lote finalizado para o usuário ${userId}. Total: ${contacts.length}`);
    res.status(207).json({ report: results });
});

// GET /messages/history
router.get('/history', async (req, res, next) => {
    const userId = req.user.userId;
    const { startDate, endDate, status, number_to } = req.query;

    const where = { userId };

    if (startDate) where.sentAt = { ...where.sentAt, gte: new Date(startDate) };
    if (endDate) where.sentAt = { ...where.sentAt, lte: new Date(endDate) };
    if (status) where.status = status;
    if (number_to) where.numberTo = number_to;

    try {
        const messages = await prisma.message.findMany({
            where,
            orderBy: { sentAt: 'desc' },
            take: 100,
            select: {
                id: true,
                numberTo: true,
                messageContent: true,
                mediaUrl: true,
                status: true,
                sentAt: true,
                errorMessage: true,
            },
        });
        
        const maskedMessages = messages.map(msg => ({
            ...msg,
            number_to: `${msg.numberTo.substring(0, 6)}...`,
            message_content: msg.messageContent ? `${msg.messageContent.substring(0, 20)}...` : null
        }));

        res.json(maskedMessages);
    } catch (error) {
        next(error);
    }
});

module.exports = router;