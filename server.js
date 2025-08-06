// server.js
require('dotenv').config();

const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors'); // 1. Importe o pacote cors
const logger = require('./services/logger');
const database = require('./services/database');
const wppconnect = require('./services/wppconnect');

// --- Importação das Rotas ---
const authRoutes = require('./routes/auth.routes');
const messagesRoutes = require('./routes/messages.routes');
const plansRoutes = require('./routes/plans.routes');
const mercadopagoRoutes = require('./routes/mercadopago.routes');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middlewares Globais ---
app.use(cors()); // 2. Adicione o middleware cors aqui
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
        // ... (o resto do arquivo permanece igual) ...
        await database.init();
        logger.info('Banco de dados inicializado com sucesso.');

        await wppconnect.initializeAllClients();
        logger.info('Módulo WppConnect inicializado.');

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