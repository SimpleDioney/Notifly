// server.js
require('dotenv').config();

const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const logger = require('./services/logger');
const database = require('./services/database');
const wppconnect = require('./services/wppconnect');
const subscriptionVerifier = require('./services/subscription-verifier');
const messageWorker = require('./workers/message.worker');

// --- Importação das Rotas ---
const authRoutes = require('./routes/auth.routes');
const messagesRoutes = require('./routes/messages.routes');
const plansRoutes = require('./routes/plans.routes');
const mercadopagoRoutes = require('./routes/mercadopago.routes');
const templatesRoutes = require('./routes/templates.routes');
const contactsRoutes = require('./routes/contacts.routes');
const listsRoutes = require('./routes/lists.routes');
const apiKeysRoutes = require('./routes/apikeys.routes');
const triggersRoutes = require('./routes/triggers.routes'); 

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middlewares Globais ---
app.use(cors());
app.use(helmet());
app.use(express.json());
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Muitas requisições enviadas deste IP, por favor tente novamente após 15 minutos.',
});
app.use(limiter);

// --- Inicialização do Servidor e Configuração das Rotas ---
async function startServer() {
    try {
        await database.init();
        logger.info('Banco de dados inicializado com sucesso.');

        // O worker é inicializado mas não bloqueia o início do servidor
        logger.info('Módulo de Fila (Worker) inicializado e pronto para processar jobs.');
        
        await wppconnect.initializeAllClients();
        logger.info('Módulo WppConnect inicializado.');

        subscriptionVerifier.start();

        app.get('/', (req, res) => {
            res.json({
                status: 'API em funcionamento',
                message: 'Bem-vindo à API de Notificações via WhatsApp.',
            });
        });
        
        app.use('/auth', authRoutes);
        app.use('/plan', plansRoutes);
        app.use('/messages', messagesRoutes);
        app.use('/mercadopago', mercadopagoRoutes);
        app.use('/templates', templatesRoutes);
        app.use('/contacts', contactsRoutes);
        app.use('/lists', listsRoutes);
        app.use('/apikeys', apiKeysRoutes);
        app.use('/triggers', triggersRoutes);

        app.listen(PORT, () => {
            logger.info(`Servidor rodando na porta ${PORT}`);
        });

    } catch (error) {
        logger.error('Falha fatal ao iniciar o servidor:', error);
        process.exit(1);
    }
}

// Middleware de Tratamento de Erros
app.use((err, req, res, next) => {
    logger.error({
        message: err.message,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
    });
    res.status(err.status || 500).json({
        error: {
            message: err.message || 'Ocorreu um erro interno no servidor.',
        },
    });
});

startServer();