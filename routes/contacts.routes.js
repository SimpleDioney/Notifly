const express = require('express');
const { prisma } = require('../services/database');
const authMiddleware = require('../middleware/auth.middleware');
const validate = require('../middleware/validation.middleware');
const { contactSchema } = require('../schemas/contacts.schemas');
const logger = require('../services/logger');

const router = express.Router();
router.use(authMiddleware);

// POST /contacts - Criar um novo contato
router.post('/', validate(contactSchema), async (req, res, next) => {
    const { name, number } = req.body;
    const userId = req.user.userId;

    try {
        const newContact = await prisma.contact.create({
            data: { userId, name, number },
        });
        logger.info(`Contato '${name}' (${number}) criado para o usuário ${userId}.`);
        res.status(201).json(newContact);
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(409).json({ error: 'Você já possui um contato com este número.' });
        }
        next(error);
    }
});

// GET /contacts - Listar contatos do usuário
router.get('/', async (req, res, next) => {
    const userId = req.user.userId;
    try {
        const contacts = await prisma.contact.findMany({
            where: { userId },
            orderBy: { name: 'asc' },
        });
        res.json(contacts);
    } catch (error) {
        next(error);
    }
});

// PUT /contacts/:id - Editar um contato
router.put('/:id', validate(contactSchema), async (req, res, next) => {
    const { id } = req.params;
    const { name, number } = req.body;
    const userId = req.user.userId;

    try {
        // Verifica se outro contato do mesmo usuário já tem o novo número
        const existingContact = await prisma.contact.findFirst({
            where: {
                number,
                userId,
                id: { not: parseInt(id) }, // Exclui o contato atual da verificação
            },
        });

        if (existingContact) {
            return res.status(409).json({ error: 'Você já possui outro contato com este número.' });
        }

        const { count } = await prisma.contact.updateMany({
            where: {
                id: parseInt(id),
                userId: userId, // Garante que o usuário só pode editar seus próprios contatos
            },
            data: { name, number },
        });

        if (count === 0) {
            return res.status(404).json({ error: 'Contato não encontrado ou não autorizado.' });
        }
        
        logger.info(`Contato ID ${id} atualizado para '${name}' (${number}) pelo usuário ${userId}.`);
        const updatedContact = await prisma.contact.findUnique({ where: { id: parseInt(id) } });
        res.status(200).json(updatedContact);

    } catch (error) {
        next(error);
    }
});

// DELETE /contacts/:id - Deletar um contato
router.delete('/:id', async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user.userId;

    try {
        const { count } = await prisma.contact.deleteMany({
            where: {
                id: parseInt(id),
                userId: userId, // Garante que um usuário só pode deletar seus próprios contatos
            },
        });
        
        if (count === 0) {
            return res.status(404).json({ error: 'Contato não encontrado ou não autorizado.' });
        }

        logger.info(`Contato ID ${id} removido pelo usuário ${userId}.`);
        res.status(204).send(); // Sucesso, sem conteúdo
    } catch (error) {
        next(error);
    }
});

module.exports = router;