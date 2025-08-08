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
            include: { user: true },
        });

        if (!keyData) {
            return res.status(403).json({ error: 'Chave de API inválida.' });
        }

        // Verificações avançadas: status, janela de validade, whitelist de IP
        const now = new Date();
        if (keyData.status === 'REVOKED') {
            return res.status(403).json({ error: 'Chave de API revogada.' });
        }
        if (keyData.validFrom && now < new Date(keyData.validFrom)) {
            return res.status(403).json({ error: 'Chave de API ainda não está válida.' });
        }
        if (keyData.validTo && now > new Date(keyData.validTo)) {
            return res.status(403).json({ error: 'Chave de API expirada.' });
        }
        if (keyData.allowedIps) {
            const list = keyData.allowedIps.split(',').map(s => s.trim()).filter(Boolean);
            const reqIp = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
            if (list.length > 0 && !list.includes(reqIp)) {
                return res.status(403).json({ error: 'IP não autorizado para esta chave.' });
            }
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