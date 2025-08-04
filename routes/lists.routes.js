const express = require('express');
const { prisma } = require('../services/database');
const authMiddleware = require('../middleware/auth.middleware');
const validate = require('../middleware/validation.middleware');
const { listSchema, manageContactsInListSchema } = require('../schemas/lists.schemas');
const logger = require('../services/logger');

const router = express.Router();
router.use(authMiddleware);

// POST /lists - Criar uma nova lista de contatos
router.post('/', validate(listSchema), async (req, res, next) => {
    const { name, description } = req.body;
    const userId = req.user.userId;
    try {
        const newList = await prisma.contactList.create({
            data: { userId, name, description },
        });
        logger.info(`Lista '${name}' criada para o usuário ${userId}.`);
        res.status(201).json(newList);
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(409).json({ error: 'Você já possui uma lista com este nome.' });
        }
        next(error);
    }
});

// GET /lists - Listar todas as listas do usuário
router.get('/', async (req, res, next) => {
    const userId = req.user.userId;
    try {
        const lists = await prisma.contactList.findMany({
            where: { userId },
            include: { _count: { select: { contacts: true } } }, // Inclui a contagem de contatos
            orderBy: { name: 'asc' },
        });
        res.json(lists);
    } catch (error) {
        next(error);
    }
});

// GET /lists/:id - Detalhes de uma lista, incluindo os contatos
router.get('/:id', async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user.userId;
    try {
        const list = await prisma.contactList.findFirst({
            where: { id: parseInt(id), userId },
            include: { contacts: true },
        });
        if (!list) {
            return res.status(404).json({ error: 'Lista não encontrada.' });
        }
        res.json(list);
    } catch (error) {
        next(error);
    }
});

// PUT /lists/:id - Editar uma lista de contatos
router.put('/:id', validate(listSchema), async (req, res, next) => {
    const { id } = req.params;
    const { name, description } = req.body;
    const userId = req.user.userId;
    try {
        const { count } = await prisma.contactList.updateMany({
            where: { id: parseInt(id), userId },
            data: { name, description },
        });

        if (count === 0) {
            return res.status(404).json({ error: 'Lista não encontrada ou não autorizada.' });
        }
        logger.info(`Lista ID ${id} atualizada pelo usuário ${userId}.`);
        const updatedList = await prisma.contactList.findUnique({ where: { id: parseInt(id) } });
        res.status(200).json(updatedList);
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(409).json({ error: 'Você já possui uma lista com este nome.' });
        }
        next(error);
    }
});

// DELETE /lists/:id - Deletar uma lista de contatos
router.delete('/:id', async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user.userId;
    try {
        const { count } = await prisma.contactList.deleteMany({
            where: { id: parseInt(id), userId },
        });

        if (count === 0) {
            return res.status(404).json({ error: 'Lista não encontrada ou não autorizada.' });
        }
        logger.info(`Lista ID ${id} removida pelo usuário ${userId}.`);
        res.status(204).send();
    } catch (error) {
        next(error);
    }
});

// POST /lists/:id/contacts - Adicionar contatos a uma lista
router.post('/:id/contacts', validate(manageContactsInListSchema), async (req, res, next) => {
    const { id } = req.params;
    const { contactIds } = req.body;
    const userId = req.user.userId;

    try {
        const list = await prisma.contactList.update({
            where: { id: parseInt(id), userId }, // Garante que o usuário é dono da lista
            data: {
                contacts: {
                    connect: contactIds.map(id => ({ id })), // Conecta os contatos existentes
                },
            },
        });
        res.status(200).json(list);
    } catch (error) {
        logger.error(error);
        res.status(500).json({ error: 'Não foi possível adicionar contatos à lista.' });
    }
});

module.exports = router;