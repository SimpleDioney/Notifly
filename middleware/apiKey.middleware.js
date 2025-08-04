// middleware/apiKey.middleware.js

const { prisma } = require('../services/database');
const crypto = require('crypto');

async function apiKeyMiddleware(req, res, next) {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
        return res.status(401).json({ error: 'Chave de API não fornecida. Utilize o header "X-API-Key".' });
    }

    try {
        // O hash da chave recebida para comparar com o que está no banco
        const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');

        const keyData = await prisma.apiKey.findUnique({
            where: { key: hashedKey },
            include: { user: true }, // Pega os dados do usuário dono da chave
        });

        if (!keyData) {
            return res.status(403).json({ error: 'Chave de API inválida.' });
        }

        // Anexa o usuário à requisição para que a rota de trigger saiba quem está fazendo a chamada
        req.user = {
            userId: keyData.user.id,
            email: keyData.user.email,
        };
        
        // Atualiza a data do último uso da chave (não precisa esperar a conclusão)
        prisma.apiKey.update({
            where: { id: keyData.id },
            data: { lastUsed: new Date() },
        }).catch(err => console.error("Falha ao atualizar lastUsed da chave de API:", err));


        next();
    } catch (error) {
        next(error);
    }
}

module.exports = apiKeyMiddleware;