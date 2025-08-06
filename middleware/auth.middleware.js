// middleware/auth.middleware.js

const jwt = require('jsonwebtoken');
const { prisma } = require('../services/database'); // Importe o Prisma
const logger = require('../services/logger');
const JWT_SECRET = process.env.JWT_SECRET || 'seu-segredo-super-secreto-para-jwt';

async function authMiddleware(req, res, next) { // A função agora é assíncrona
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token de autenticação não fornecido ou mal formatado.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // --- CORREÇÃO DE SEGURANÇA ADICIONADA AQUI ---
        // A cada requisição, busca o usuário no banco de dados
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
        });

        // Verifica se o usuário ainda existe ou se foi banido
        if (!user) {
            logger.warn(`Tentativa de acesso com token para usuário inexistente: ID ${decoded.userId}`);
            return res.status(401).json({ error: 'Usuário não encontrado.' });
        }

        if (user.isBanned) {
            logger.warn(`Acesso bloqueado para usuário banido em tempo real: ${user.email}`);
            return res.status(403).json({ error: 'Sua conta foi suspensa. Acesso negado.' });
        }
        // --- FIM DA CORREÇÃO ---

        // Se tudo estiver OK, anexa os dados do usuário à requisição
        req.user = decoded; 
        next();

    } catch (error) {
        logger.warn('Token JWT inválido ou expirado:', error.message);
        return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
}

module.exports = authMiddleware;
