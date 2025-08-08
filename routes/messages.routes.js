// routes/messages.routes.js
// Define os endpoints para envio e consulta de mensagens.

const express = require('express');
const { prisma } = require('../services/database');
const wppconnect = require('../services/wppconnect');
const authMiddleware = require('../middleware/auth.middleware');
const logger = require('../services/logger');
const validate = require('../middleware/validation.middleware');
const { sendSchema, historySchema } = require('../schemas/messages.schemas');
const { parsePhoneNumberFromString } = require('libphonenumber-js');
const { addMessageToQueue } = require('../services/queue.service');
const Handlebars = require('handlebars');

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
router.post('/send', validate(sendSchema), async (req, res, next) => {
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
        
        // Não consumimos cota aqui: o consumo acontece no worker (fonte única de verdade)

        const connection = await wppconnect.getAvailableClient(to);
        if (!connection) {
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
        // Nada a reverter aqui, já que a cota é consumida no worker
        
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

// POST /messages/queue - Enfileirar envio (agendamento opcional)
router.post('/queue', validate(sendSchema), async (req, res, next) => {
    let { to, message, media_url, scheduledAt } = req.body;
    const userId = req.user.userId;

    try {
        // Normalização de número (BR default se não vier com código)
        try {
            const parsed = parsePhoneNumberFromString(to, 'BR');
            if (parsed && parsed.isValid()) {
                to = parsed.number.replace('+', '');
            }
        } catch {}
        // Aceita agendamento opcional via scheduledAt ISO
        const opts = {};
        if (scheduledAt) {
            const delay = Math.max(0, new Date(scheduledAt).getTime() - Date.now());
            opts.delay = delay;
        }
        // Não aguardar para evitar travar o request em ambientes sem Redis estável
        addMessageToQueue({ to, message, media_url, userId, scheduledAt }, opts)
            .catch((err) => logger.error('Falha ao enfileirar mensagem:', err));
        return res.status(202).json({ status: 'accepted', message: 'Mensagem enfileirada.' });
    } catch (error) {
        next(error);
    }
});

// POST /messages/send-batch
router.post('/send-batch', async (req, res, next) => {
    const { contacts, templateName, contactListId, segmentId, suppressionListId, defaultVariables } = req.body;
    const userId = req.user.userId;

    // Suporta dois modos: por lista + template OU por contacts explícitos
    if (!(templateName && (contactListId || segmentId)) && (!Array.isArray(contacts) || contacts.length === 0)) {
        return res.status(400).json({ error: 'Envie "templateName" e ("contactListId" ou "segmentId") OU um array "contacts" não vazio.' });
    }
    if (Array.isArray(contacts) && contacts.length > 100) {
        return res.status(400).json({ error: 'O envio em lote é limitado a 100 contatos por vez.' });
    }
    
    const results = [];

    let contactsToProcess = contacts;
    try {
        if (templateName && (contactListId || segmentId)) {
            // Base de contatos por lista ou segmento
            let baseContacts = [];
            if (contactListId) {
                baseContacts = await prisma.contact.findMany({
                    where: { userId, lists: { some: { id: contactListId } } },
                    select: { id: true, number: true, name: true },
                });
            } else if (segmentId) {
                const segment = await prisma.segment.findFirst({ where: { id: segmentId, userId } });
                if (!segment) return res.status(404).json({ error: 'Segmento não encontrado.' });
                if (segment.type === 'STATIC') {
                    const members = await prisma.segmentMember.findMany({
                        where: { segmentId: segment.id },
                        include: { contact: { select: { id: true, number: true, name: true } } },
                    });
                    baseContacts = members.map(m => m.contact);
                } else {
                    // DYNAMIC: aplica filtro JSON simples em attributes (match por chave/valor exato)
                    const filter = segment.filter || {};
                    baseContacts = await prisma.contact.findMany({
                        where: { userId },
                        select: { id: true, number: true, name: true, attributes: true },
                    });
                    baseContacts = baseContacts.filter(c => {
                        if (!filter || Object.keys(filter).length === 0) return true;
                        if (!c.attributes) return false;
                        try {
                            const attrs = typeof c.attributes === 'string' ? JSON.parse(c.attributes) : c.attributes;
                            return Object.entries(filter).every(([k, v]) => attrs?.[k] === v);
                        } catch { return false; }
                    });
                }
            }
            // Suppression por lista
            if (suppressionListId) {
                const suppressed = await prisma.contact.findMany({
                    where: { userId, lists: { some: { id: suppressionListId } } },
                    select: { id: true },
                });
                const suppressedIds = new Set(suppressed.map(s => s.id));
                baseContacts = baseContacts.filter(c => !suppressedIds.has(c.id));
            }
            const listContacts = baseContacts;
            if (listContacts.length === 0) {
                return res.status(400).json({ error: 'A lista selecionada não possui contatos.' });
            }
            const template = await prisma.template.findFirst({
                where: {
                    name: templateName,
                    OR: [{ userId }, { isGlobal: true }]
                }
            });
            if (!template) {
                return res.status(404).json({ error: `Template '${templateName}' não encontrado.` });
            }
            const compiled = Handlebars.compile(template.content);
            contactsToProcess = listContacts.map((c) => ({
                to: c.number,
                message: compiled({ nome: c.name, ...(defaultVariables || {}) })
            }));
        }
    } catch (err) {
        return next(err);
    }

    // Novo fluxo: enfileira todos para processamento assíncrono
    let enqueued = 0;
    for (const contact of contactsToProcess) {
        const { to, message, media_url } = contact;
        if (!to || (!message && !media_url)) {
            results.push({ to, status: 'failed', details: 'Campos obrigatórios ausentes.' });
            continue;
        }
        await addMessageToQueue({ to, message, media_url, userId, templateName: templateName || null });
        // auditoria leve do enfileiramento
        try { logger.audit(userId, 'enqueue_message', { to }); } catch {}
        enqueued++;
        results.push({ to, status: 'queued', details: 'Mensagem enfileirada.' });
    }

    if (enqueued === 0) {
        return res.status(400).json({ error: 'Nenhuma mensagem válida para enfileirar.' });
    }
    logger.info(`Lote enfileirado para o usuário ${userId}. Total: ${contactsToProcess ? contactsToProcess.length : 0}`);
    res.status(202).json({ message: 'Mensagens enfileiradas.', enqueued, report: results });
});

// GET /messages/history
router.get('/history', validate(historySchema), async (req, res, next) => {
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