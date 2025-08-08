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
            where: {
                OR: [
                    { isGlobal: true },
                    { userId: null }
                ]
            },
            orderBy: { createdAt: 'desc' }
        });
        // placeholders obrigatórios (extração simples)
        const extractPlaceholders = (content) => {
            const matches = content.match(/{{\s*([\w\.]+)\s*}}/g) || [];
            return Array.from(new Set(matches.map(m => m.replace(/[{}\s]/g,'').trim())));
        };
        const withMeta = (arr) => arr.map(t => ({ ...t, placeholders: extractPlaceholders(t.content) }));
        res.json({ myTemplates: withMeta(userTemplates), globalTemplates: withMeta(globalTemplates) });
    } catch (error) {
        next(error);
    }
});


module.exports = router;