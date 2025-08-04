// routes/triggers.routes.js

const express = require('express');
const validate = require('../middleware/validation.middleware');
const apiKeyMiddleware = require('../middleware/apiKey.middleware');
const { triggerSendSchema } = require('../schemas/triggers.schemas');
const { prisma } = require('../services/database');
const { addMessageToQueue } = require('../services/queue.service');
const { reserveMessageSlot } = require('../utils/message.helpers');
const logger = require('../services/logger');
const Handlebars = require('handlebars');

const router = express.Router();

// A rota inteira é protegida pelo middleware da chave de API
router.use(apiKeyMiddleware);

// POST /triggers/send - O endpoint principal do gatilho
router.post('/send', validate(triggerSendSchema), async (req, res, next) => {
    // req.user é injetado pelo apiKeyMiddleware
    const { userId } = req.user;
    const { to, templateName, variables } = req.body;

    try {
        // 1. Verificar se o usuário pode enviar a mensagem
        if (!(await reserveMessageSlot(userId))) {
            return res.status(429).json({ error: 'Limite de mensagens do plano atingido.' });
        }

        // 2. Buscar o template
        const template = await prisma.template.findFirst({
            where: { name: templateName, userId },
        });

        if (!template) {
            return res.status(404).json({ error: `Template '${templateName}' não encontrado.` });
        }

        // 3. Compilar o template com as variáveis usando Handlebars
        const compiledTemplate = Handlebars.compile(template.content);
        const messageContent = compiledTemplate(variables || {});

        // 4. Adicionar a mensagem à fila
        await addMessageToQueue({
            to,
            message: messageContent,
            userId,
        });

        res.status(202).json({ status: 'accepted', message: 'Mensagem enfileirada para envio.' });

    } catch (error) {
        logger.error(`Erro no gatilho de API para o usuário ${userId}: ${error.message}`);
        next(error);
    }
});

module.exports = router;