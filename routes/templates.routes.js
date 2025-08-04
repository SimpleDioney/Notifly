// routes/templates.routes.js
const express = require('express');
const { prisma } = require('../services/database');
const authMiddleware = require('../middleware/auth.middleware');
const validate = require('../middleware/validation.middleware');
const { templateSchema, templateParamsSchema } = require('../schemas/templates.schemas');
const logger = require('../services/logger');

const router = express.Router();

// Protege todas as rotas de template com autenticação
router.use(authMiddleware);

// POST /templates - Criar um novo template
router.post('/', validate(templateSchema), async (req, res, next) => {
    const { name, content } = req.body;
    const userId = req.user.userId;

    try {
        const newTemplate = await prisma.template.create({
            data: {
                userId,
                name,
                content,
            },
        });
        logger.info(`Template '${name}' criado para o usuário ${userId}`);
        res.status(201).json(newTemplate);
    } catch (error) {
        // P2002 é o erro do Prisma para violação de restrição única
        if (error.code === 'P2002' && error.meta?.target?.includes('name')) {
            return res.status(409).json({ error: 'Você já possui um template com este nome.' });
        }
        next(error);
    }
});

// GET /templates - Listar todos os templates do usuário
router.get('/', async (req, res, next) => {
    const userId = req.user.userId;
    try {
        const templates = await prisma.template.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        });
        res.json(templates);
    } catch (error) {
        next(error);
    }
});

// GET /templates/:id - Obter um template específico
router.get('/:id', validate(templateParamsSchema), async (req, res, next) => {
    const userId = req.user.userId;
    const templateId = req.params.id;

    try {
        const template = await prisma.template.findFirst({
            where: {
                id: templateId,
                userId, // Garante que o usuário só possa acessar seus próprios templates
            },
        });

        if (!template) {
            return res.status(404).json({ error: 'Template não encontrado.' });
        }
        res.json(template);
    } catch (error) {
        next(error);
    }
});

// PUT /templates/:id - Atualizar um template
router.put('/:id', validate(templateParamsSchema), validate(templateSchema), async (req, res, next) => {
    const userId = req.user.userId;
    const templateId = req.params.id;
    const { name, content } = req.body;

    try {
        const updatedTemplate = await prisma.template.updateMany({
            where: {
                id: templateId,
                userId,
            },
            data: {
                name,
                content,
                updatedAt: new Date(),
            },
        });

        if (updatedTemplate.count === 0) {
            return res.status(404).json({ error: 'Template não encontrado ou você não tem permissão para editá-lo.' });
        }

        logger.info(`Template ID ${templateId} atualizado para o usuário ${userId}`);
        res.json({ message: 'Template atualizado com sucesso.' });
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(409).json({ error: 'Você já possui um template com este nome.' });
        }
        next(error);
    }
});

// DELETE /templates/:id - Deletar um template
router.delete('/:id', validate(templateParamsSchema), async (req, res, next) => {
    const userId = req.user.userId;
    const templateId = parseInt(req.params.id, 10); // <-- conversão para int

    try {
        const deleteResult = await prisma.template.deleteMany({
            where: {
                id: templateId,
                userId,
            },
        });

        if (deleteResult.count === 0) {
            return res.status(404).json({ error: 'Template não encontrado ou você não tem permissão para deletá-lo.' });
        }
        
        logger.info(`Template ID ${templateId} deletado pelo usuário ${userId}`);
        res.status(204).send(); // 204 No Content
    } catch (error) {
        next(error);
    }
});

module.exports = router;