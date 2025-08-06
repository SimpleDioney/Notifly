// routes/platform.routes.js
const express = require('express');
const { prisma } = require('../services/database');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

// Todas as rotas aqui precisam de autenticação
router.use(authMiddleware);

// GET /platform/announcements - Listar anúncios ativos para os clientes
router.get('/announcements', async (req, res, next) => {
    try {
        const announcements = await prisma.announcement.findMany({
            where: { isActive: true },
            orderBy: { createdAt: 'desc' },
        });
        res.json(announcements);
    } catch (error) {
        next(error);
    }
});

// GET /platform/templates - Modificar a rota de templates para incluir os globais
router.get('/templates', async (req, res, next) => {
    const userId = req.user.userId;
    try {
        const userTemplates = await prisma.template.findMany({
            where: { userId },
        });
        const globalTemplates = await prisma.template.findMany({
            where: { isGlobal: true },
        });
        res.json({
            myTemplates: userTemplates,
            globalTemplates: globalTemplates,
        });
    } catch (error) {
        next(error);
    }
});


module.exports = router;