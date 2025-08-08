// server.js
require('dotenv').config();

const express = require('express');
const http = require('http');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors'); // Importa o cors
const logger = require('./services/logger');
const database = require('./services/database');
const wppconnect = require('./services/wppconnect');
const subscriptionVerifier = require('./services/subscription-verifier');
const messageWorker = require('./workers/message.worker');
const websocketService = require('./services/websocket');
const queueBoard = require('./services/queue-board');

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
const adminRoutes = require('./routes/admin.routes');
const platformRoutes = require('./routes/platform.routes');
const tagsRoutes = require('./routes/tags.routes');
const segmentsRoutes = require('./routes/segments.routes');
const shortlinksRoutes = require('./routes/shortlinks.routes');
const reportsRoutes = require('./routes/reports.routes');
const usersRoutes = require('./routes/users.routes');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

// --- Middlewares Globais ---

// --- CORREÇÃO DE CORS ROBUSTA APLICADA AQUI ---
// Esta configuração é mais permissiva e deve resolver os problemas de preflight.
app.use(cors({
  origin: '*', // Permite todas as origens (ideal para desenvolvimento com Ngrok)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));
// --- FIM DA CORREÇÃO ---

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "frame-ancestors": ["'self'", "http://localhost:5173", "http://localhost:8080", "https://notiflyapp.vercel.app"],
      },
    },
  })
);

app.use(express.json());

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
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

        websocketService.init(server);

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

        // Healthcheck simples para monitoramento/infra
        app.get('/healthz', (req, res) => {
            res.status(200).json({ ok: true });
        });

        app.use('/auth', authRoutes);
        app.use('/plan', plansRoutes);
        app.use('/messages', messagesRoutes);
        app.use('/mercadopago', mercadopagoRoutes);
        app.use('/templates', templatesRoutes);
        app.use('/contacts', contactsRoutes);
        app.use('/lists', listsRoutes);
        app.use('/tags', tagsRoutes);
        app.use('/segments', segmentsRoutes);
        // Public redirect /s/:slug (montado na raiz)
        app.use('/', shortlinksRoutes);
        // CRUD autenticado montado em /shortlinks
        app.use('/shortlinks', shortlinksRoutes);
        app.use('/apikeys', apiKeysRoutes);
        app.use('/reports', reportsRoutes);
        app.use('/users', usersRoutes);
        app.use('/triggers', triggersRoutes);
        app.use('/admin/queues', queueBoard.getRouter());
        app.use('/admin', adminRoutes);
        app.use('/platform', platformRoutes);

        // 404 handler para rotas inexistentes
        app.use((req, res) => {
            res.status(404).json({ error: 'Rota não encontrada' });
        });

        server.listen(PORT, () => {
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
