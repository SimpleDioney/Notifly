// routes/messages.routes.js
// Define os endpoints para envio e consulta de mensagens.

const express = require('express');
const { getDb } = require('../services/database');
const wppconnect = require('../services/wppconnect');
const authMiddleware = require('../middleware/auth.middleware');
const logger = require('../services/logger');

const router = express.Router();

// Middleware de autenticação aplicado a todas as rotas de mensagens
router.use(authMiddleware);

/**
 * Tenta incrementar o contador de mensagens de forma atômica.
 * Retorna true se o incremento foi bem-sucedido (dentro do limite), false caso contrário.
 * @param {number} userId - ID do usuário.
 * @returns {Promise<boolean>}
 */
async function reserveMessageSlot(userId) {
    const db = getDb();
    const user = await db.get('SELECT plan_id FROM users WHERE id = ?', userId);
    if (!user) return false;

    const plan = await db.get('SELECT message_limit FROM plans WHERE id = ?', user.plan_id);
    if (!plan) return false;

    // Planos com limite -1 são ilimitados, sempre permite
    if (plan.message_limit === -1) {
        await db.run('UPDATE users SET messages_sent = messages_sent + 1 WHERE id = ?', userId);
        return true;
    }

    // Operação atômica: só incrementa se a contagem atual for menor que o limite
    const result = await db.run(
        'UPDATE users SET messages_sent = messages_sent + 1 WHERE id = ? AND messages_sent < ?',
        [userId, plan.message_limit]
    );

    // `result.changes` será 1 se a linha foi atualizada, 0 se a condição (messages_sent < limit) falhou
    return result.changes > 0;
}

/**
 * Função para reverter a contagem de mensagens em caso de falha no envio.
 * @param {number} userId - ID do usuário.
 */
async function releaseMessageSlot(userId) {
    const db = getDb();
    await db.run('UPDATE users SET messages_sent = messages_sent - 1 WHERE id = ? AND messages_sent > 0', userId);
}


/**
 * Função auxiliar para verificar envio duplicado (anti-spam).
 * @param {number} userId - ID do usuário.
 * @param {string} to - Número do destinatário.
 * @param {string} message - Conteúdo da mensagem.
 * @returns {Promise<boolean>} - Retorna true se for um spam, false caso contrário.
 */
async function isSpam(userId, to, message) {
    const db = getDb();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    const recentMessage = await db.get(`
        SELECT id FROM messages 
        WHERE user_id = ? AND number_to = ? AND message_content = ? AND sent_at > ?
    `, [userId, to, message, fiveMinutesAgo]);

    return !!recentMessage;
}


// POST /messages/send
// Envia uma única mensagem.
router.post('/send', async (req, res, next) => {
    const { to, message, media_url } = req.body;
    const userId = req.user.userId;
    let phoneNumber = 'N/A';

    if (!to || (!message && !media_url)) {
        return res.status(400).json({ error: 'O destinatário ("to") e o conteúdo ("message" ou "media_url") são obrigatórios.' });
    }
    
    try {
        // 1. Verificar se é spam
        if (await isSpam(userId, to, message)) {
            logger.warn(`Envio duplicado bloqueado para o usuário ${userId} -> ${to}`);
            return res.status(429).json({ error: 'Mensagem idêntica enviada para o mesmo número recentemente. Evite spam.' });
        }
        
        // 2. Tentar "reservar" um slot de mensagem
        if (!(await reserveMessageSlot(userId))) {
            return res.status(429).json({ error: 'Limite de mensagens do seu plano atingido.' });
        }

        // 3. Obter um cliente WhatsApp disponível
        const connection = await wppconnect.getAvailableClient();
        if (!connection) {
            await releaseMessageSlot(userId); // Reverte a contagem se não houver cliente
            return res.status(503).json({ error: 'Nenhum serviço de envio está disponível no momento. Tente novamente mais tarde.' });
        }
        const { client } = connection;
        phoneNumber = connection.phoneNumber;
        
        const db = getDb();
        let result;
        
        // 4. Enviar a mensagem
        if (media_url) {
            result = await client.sendImage(to, media_url, 'media', message);
        } else {
            result = await client.sendText(to, message);
        }

        // 5. Registrar no banco de dados
        await db.run(
            'INSERT INTO messages (user_id, number_to, message_content, media_url, status, sent_by_number) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, to, message, media_url, 'sent', phoneNumber]
        );

        logger.info(`Mensagem enviada por ${userId} para ${to.substring(0, 6)}... via ${phoneNumber}`);
        res.status(200).json({ status: 'success', messageId: result.id, message: 'Mensagem enviada com sucesso.' });

    } catch (error) {
        logger.error(`Falha ao enviar mensagem para ${userId}: ${error.message}`);
        // Se a reserva foi feita, mas o envio falhou, revertemos
        await releaseMessageSlot(userId);
        
        await getDb().run(
            'INSERT INTO messages (user_id, number_to, message_content, media_url, status, error_message, sent_by_number) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [userId, to, message, media_url, 'failed', error.message, phoneNumber]
        );
        next(error);
    }
});

// POST /messages/send-batch
// Envia mensagens em lote.
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
    const db = getDb();

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
                    await db.run(
                        'INSERT INTO messages (user_id, number_to, message_content, media_url, status, sent_by_number) VALUES (?, ?, ?, ?, ?, ?)',
                        [userId, to, message, media_url, 'sent', phoneNumber]
                    );
                }
            } catch (error) {
                await releaseMessageSlot(userId);
                status = 'failed';
                details = error.message;
                await db.run(
                    'INSERT INTO messages (user_id, number_to, message_content, media_url, status, error_message, sent_by_number) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [userId, to, message, media_url, 'failed', details, phoneNumber]
                );
            }
        }
        results.push({ to, status, details });
    }
    
    logger.info(`Processamento de lote finalizado para o usuário ${userId}. Total: ${contacts.length}`);
    res.status(207).json({ report: results });
});


// GET /messages/history
// Retorna o histórico de mensagens do usuário com filtros.
router.get('/history', async (req, res, next) => {
    const userId = req.user.userId;
    const { startDate, endDate, status, number_to } = req.query;

    let query = 'SELECT id, number_to, message_content, media_url, status, sent_at, error_message FROM messages WHERE user_id = ?';
    const params = [userId];

    if (startDate) {
        query += ' AND sent_at >= ?';
        params.push(startDate);
    }
    if (endDate) {
        query += ' AND sent_at <= ?';
        params.push(endDate);
    }
    if (status) {
        query += ' AND status = ?';
        params.push(status);
    }
    if (number_to) {
        query += ' AND number_to = ?';
        params.push(number_to);
    }

    query += ' ORDER BY sent_at DESC LIMIT 100';

    try {
        const db = getDb();
        const messages = await db.all(query, params);
        
        const maskedMessages = messages.map(msg => ({
            ...msg,
            number_to: `${msg.number_to.substring(0, 6)}...`,
            message_content: msg.message_content ? `${msg.message_content.substring(0, 20)}...` : null
        }));

        res.json(maskedMessages);
    } catch (error) {
        next(error);
    }
});

module.exports = router;