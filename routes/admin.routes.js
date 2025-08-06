// routes/admin.routes.js
const express = require('express');
const { prisma } = require('../services/database');
const authMiddleware = require('../middleware/auth.middleware');
const adminMiddleware = require('../middleware/admin.middleware');
const wppconnect = require('../services/wppconnect'); // Importar para gestão de chips
const logger = require('../services/logger');

const router = express.Router();

// Aplica o middleware de autenticação e depois o de admin a todas as rotas
router.use(authMiddleware);
router.use(adminMiddleware);

// --- Gestão de Usuários ---

// GET /admin/users - Listar todos os usuários
router.get('/users', async (req, res, next) => {
    try {
        const users = await prisma.user.findMany({
            include: { plan: true },
            orderBy: { createdAt: 'desc' },
        });
        res.json(users);
    } catch (error) {
        next(error);
    }
});

// POST /admin/users/:id/ban - Banir um usuário
router.post('/users/:id/ban', async (req, res, next) => {
    try {
        const user = await prisma.user.update({
            where: { id: parseInt(req.params.id) },
            data: { isBanned: true },
        });
        logger.info(`Usuário ${user.email} foi BANIDO pelo admin ${req.user.email}`);
        res.json({ message: 'Usuário banido com sucesso.', user });
    } catch (error) {
        next(error);
    }
});

// POST /admin/users/:id/unban - Desbanir um usuário
router.post('/users/:id/unban', async (req, res, next) => {
    try {
        const user = await prisma.user.update({
            where: { id: parseInt(req.params.id) },
            data: { isBanned: false },
        });
        logger.info(`Usuário ${user.email} foi DESBANIDO pelo admin ${req.user.email}`);
        res.json({ message: 'Banimento do usuário removido.', user });
    } catch (error) {
        next(error);
    }
});

// PUT /admin/users/:id/quota - Ajustar quota de mensagens
router.put('/users/:id/quota', async (req, res, next) => {
    const { messagesSent } = req.body;
    if (typeof messagesSent !== 'number') {
        return res.status(400).json({ error: 'O campo "messagesSent" deve ser um número.' });
    }
    try {
        const user = await prisma.user.update({
            where: { id: parseInt(req.params.id) },
            data: { messagesSent },
        });
        logger.info(`Quota do usuário ${user.email} ajustada para ${messagesSent} pelo admin ${req.user.email}`);
        res.json({ message: 'Quota de mensagens ajustada.', user });
    } catch (error) {
        next(error);
    }
});

// GET /admin/users/:id/messages - Ver histórico de mensagens de um usuário
router.get('/users/:id/messages', async (req, res, next) => {
    try {
        const messages = await prisma.message.findMany({
            where: { userId: parseInt(req.params.id) },
            orderBy: { sentAt: 'desc' },
            take: 100,
        });
        res.json(messages);
    } catch (error) {
        next(error);
    }
});


// --- Análises e Finanças (Dashboard) ---

// GET /admin/stats - Obter estatísticas do sistema
router.get('/stats', async (req, res, next) => {
    try {
        const totalUsers = await prisma.user.count();
        const newUsersToday = await prisma.user.count({
            where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
        });
        const totalMessagesSent = await prisma.message.count({ where: { status: 'sent' } });
        const messagesSentToday = await prisma.message.count({
            where: { status: 'sent', sentAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } }
        });

        // Cálculo simples de MRR (Receita Mensal Recorrente)
        const activeSubscriptions = await prisma.user.findMany({
            where: { mercadopagoSubscriptionId: { not: null } },
            include: { plan: true },
        });
        const mrr = activeSubscriptions.reduce((sum, sub) => sum + sub.plan.price, 0);

        res.json({
            totalUsers,
            newUsersToday,
            totalMessagesSent,
            messagesSentToday,
            mrr: mrr.toFixed(2),
        });
    } catch (error) {
        next(error);
    }
});

// --- Gestão de Chips (Números de Envio) ---

// GET /admin/chips - Listar status dos chips de envio
router.get('/chips', async (req, res, next) => {
    try {
        const chips = await prisma.numbersPool.findMany({
            orderBy: { phoneNumber: 'asc' },
        });
        res.json(chips);
    } catch (error) {
        next(error);
    }
});

// POST /admin/chips/:id/reconnect - Forçar a reconexão de um chip
router.post('/chips/:id/reconnect', async (req, res, next) => {
    const { id } = req.params;
    try {
        logger.info(`Admin ${req.user.email} solicitou reconexão para o chip ${id}`);
        const result = await wppconnect.reconnectClient(id);
        res.status(200).json(result);
    } catch (error) {
        logger.error(`Falha na API de reconexão para o chip ${id}. Erro: ${error.message}`);
        next(error);
    }
});

router.post('/chips', async (req, res, next) => {
    const { id, phoneNumber } = req.body;

    if (!id || !phoneNumber) {
        return res.status(400).json({ error: 'Os campos "id" (ID da Sessão) e "phoneNumber" são obrigatórios.' });
    }

    try {
        const newChip = await wppconnect.addAndInitializeChip({ id, phoneNumber });
        logger.info(`Admin ${req.user.email} adicionou novo chip: ${id}`);
        res.status(201).json({ message: 'Chip adicionado com sucesso! Verifique a consola do servidor para o QR Code.', chip: newChip });
    } catch (error) {
        logger.error(`Falha ao adicionar novo chip: ${error.message}`);
        // Retorna um erro 409 (Conflict) se o chip já existir
        res.status(409).json({ error: error.message });
    }
});

// --- Gestão de Templates Globais ---

// POST /admin/templates - Criar um novo template global
router.post('/templates', async (req, res, next) => {
    const { name, content } = req.body;
    try {
        const template = await prisma.template.create({
            data: {
                name,
                content,
                isGlobal: true, // Marcado como global
                // userId é nulo
            },
        });
        logger.info(`Template global "${name}" criado pelo admin ${req.user.email}`);
        res.status(201).json(template);
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(409).json({ error: 'Já existe um template com este nome.' });
        }
        next(error);
    }
});

// --- Gestão de Anúncios ---

// POST /admin/announcements - Criar um novo anúncio
// GET /admin/announcements - Listar todos os anúncios
router.get('/announcements', async (req, res, next) => {
    try {
        const announcements = await prisma.announcement.findMany({
            orderBy: { createdAt: 'desc' },
        });
        res.json(announcements);
    } catch (error) {
        next(error);
    }
});

// POST /admin/announcements - Criar um novo anúncio
router.post('/announcements', async (req, res, next) => {
    const { title, content, isActive } = req.body;
    try {
        const announcement = await prisma.announcement.create({
            data: { title, content, isActive },
        });
        logger.info(`Anúncio "${title}" criado pelo admin ${req.user.email}`);
        res.status(201).json(announcement);
    } catch (error) {
        next(error);
    }
});

// DELETE /admin/announcements/:id - Deletar um anúncio
router.delete('/announcements/:id', async (req, res, next) => {
    const { id } = req.params;
    try {
        await prisma.announcement.delete({
            where: { id: parseInt(id, 10) },
        });
        logger.info(`Anúncio ID ${id} deletado pelo admin ${req.user.email}`);
        res.status(204).send(); // Resposta de sucesso sem conteúdo
    } catch (error) {
        next(error);
    }
});

module.exports = router;