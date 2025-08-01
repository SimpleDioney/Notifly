// routes/plans.routes.js
// Define os endpoints para consulta e gerenciamento de planos.

const express = require('express');
const { getDb } = require('../services/database');
const authMiddleware = require('../middleware/auth.middleware');
const logger = require('../services/logger');
const mercadopago = require('../services/mercadopago');

const router = express.Router();

// GET /plan/available
// Lista todos os planos disponíveis. Não requer autenticação.
router.get('/available', async (req, res, next) => {
    try {
        const db = getDb();
        const plans = await db.all('SELECT id, name, message_limit, price, features FROM plans ORDER BY price ASC');
        res.json(plans);
    } catch (error) {
        next(error);
    }
});

// A partir daqui, todas as rotas exigem autenticação
router.use(authMiddleware);

// GET /plan/status
// Mostra o status do plano atual do cliente.
router.get('/status', async (req, res, next) => {
    const userId = req.user.userId;
    try {
        const db = getDb();
        const status = await db.get(`
            SELECT 
                p.name as plan_name,
                p.message_limit,
                u.messages_sent,
                u.reset_date
            FROM users u
            JOIN plans p ON u.plan_id = p.id
            WHERE u.id = ?
        `, userId);

        if (!status) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }
        
        // Calcula as mensagens restantes
        const remaining = status.message_limit === -1 
            ? 'Ilimitado' 
            : status.message_limit - status.messages_sent;

        res.json({
            ...status,
            messages_remaining: remaining
        });
    } catch (error) {
        next(error);
    }
});

// POST /plan/upgrade
// Permite que o cliente faça o upgrade do seu plano.
router.post('/upgrade', async (req, res, next) => {
    // Recebe o token do cartão do front-end
    const { new_plan_id, card_token_id } = req.body;
    const userId = req.user.userId;
    const userEmail = req.user.email;

    if (!new_plan_id || !card_token_id) {
        return res.status(400).json({ error: 'O ID do plano e o token do cartão são obrigatórios.' });
    }

    try {
        const db = getDb();
        const plan = await db.get('SELECT name FROM plans WHERE id = ?', new_plan_id);
        if (!plan) {
            return res.status(404).json({ error: 'Plano não encontrado.' });
        }

        const subscription = await mercadopago.createSubscription(plan.name, new_plan_id, userEmail, card_token_id);

        if (subscription && subscription.id) {
            // Se a assinatura foi criada com sucesso, atualizamos nosso banco de dados.
            // A lógica do webhook ainda serve como uma garantia secundária.
            const newResetDate = new Date();
            newResetDate.setMonth(newResetDate.getMonth() + 1);
            await db.run(
                'UPDATE users SET plan_id = ?, messages_sent = 0, reset_date = ? WHERE id = ?',
                [new_plan_id, newResetDate.toISOString(), userId]
            );
            
            res.json({ 
                message: 'Assinatura criada e plano atualizado com sucesso!',
                subscription_id: subscription.id,
                status: subscription.status
            });
        } else {
             res.status(500).json({ error: 'Não foi possível criar a assinatura.' });
        }
    } catch (error) {
        // Retorna o erro específico do Mercado Pago para o front-end
        res.status(400).json({ error: error.message });
    }
});


module.exports = router;

