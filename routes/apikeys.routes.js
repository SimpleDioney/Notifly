// routes/apikeys.routes.js

const express = require('express');
const crypto = require('crypto');
const { prisma } = require('../services/database');
const authMiddleware = require('../middleware/auth.middleware');
const logger = require('../services/logger');

const router = express.Router();
router.use(authMiddleware);

// POST /apikeys - Gerar uma nova chave de API
router.post('/', async (req, res, next) => {
    const userId = req.user.userId;
    try {
        // Cria a chave de API "crua"
        const apiKey = `notifly_${crypto.randomBytes(24).toString('hex')}`;
        // Cria o prefixo para exibição (ex: "notifly_aB1c2D")
        const prefix = apiKey.substring(0, 12);
        // Cria o hash que será salvo no banco de dados
        const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');

        await prisma.apiKey.create({
            data: {
                userId,
                key: hashedKey,
                prefix,
            },
        });

        logger.info(`Nova chave de API gerada para o usuário ${userId}. Prefixo: ${prefix}`);
        // Retorna a chave completa para o usuário APENAS UMA VEZ.
        // Ele deve salvá-la em um local seguro.
        res.status(201).json({
            message: 'Chave de API gerada com sucesso! Guarde-a em um local seguro, pois ela não poderá ser visualizada novamente.',
            apiKey,
            prefix,
        });

    } catch (error) {
        if (error.code === 'P2002') { // Raro, mas possível colisão de prefixo/hash
            return res.status(500).json({ error: 'Erro ao gerar a chave. Por favor, tente novamente.' });
        }
        next(error);
    }
});

// GET /apikeys - Listar os prefixos das chaves do usuário
router.get('/', async (req, res, next) => {
    const userId = req.user.userId;
    try {
        const keys = await prisma.apiKey.findMany({
            where: { userId },
            select: { id: true, prefix: true, createdAt: true, lastUsed: true },
            orderBy: { createdAt: 'desc' },
        });
        res.json(keys);
    } catch (error) {
        next(error);
    }
});

// DELETE /apikeys/:id - Revogar (deletar) uma chave de API
router.delete('/:id', async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user.userId;
    try {
        await prisma.apiKey.deleteMany({
            where: {
                id: parseInt(id),
                userId: userId, // Garante que o usuário só pode deletar suas próprias chaves
            },
        });
        res.status(204).send(); // Sucesso
    } catch (error) {
        next(error);
    }
});


module.exports = router;