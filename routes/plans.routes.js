const express = require('express');
const { prisma } = require('../services/database');
const authMiddleware = require('../middleware/auth.middleware');
const { upgradePlanSchema } = require('../schemas/plans.schemas');
const validate = require('../middleware/validation.middleware');
const { createSubscription } = require('../services/mercadopago');

const router = express.Router();

/**
 * @route   GET /plan/available
 * @desc    Lista todos os planos disponíveis
 * @access  Public
 */
router.get('/available', async (req, res) => {
    try {
        const plansFromDb = await prisma.plan.findMany({
            orderBy: {
                price: 'asc'
            }
        });

        // Mapeia o campo 'messageLimit' (do Prisma) para 'message_limit' (esperado pelo frontend)
        const plans = plansFromDb.map(plan => ({
            id: plan.id,
            name: plan.name,
            price: plan.price,
            message_limit: plan.messageLimit,
            features: plan.features
        }));

        res.json(plans);
    } catch (error) {
        console.error("Erro ao buscar planos:", error);
        res.status(500).json({ error: 'Erro ao buscar planos.' });
    }
});


/**
 * @route   GET /plan/status
 * @desc    Retorna o status do plano atual do usuário
 * @access  Private
 */
router.get('/status', authMiddleware, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            include: { plan: true }
        });

        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }

        const messagesRemaining = user.plan.messageLimit === -1
            ? 'Ilimitado'
            : user.plan.messageLimit - user.messagesSent;

        // FIX: Garante que uma data de renovação válida seja sempre retornada.
        // Se a data de renovação for nula, calcula uma com base na data de criação do usuário.
        let resetDate = user.resetDate;
        if (!resetDate) {
            const createdAt = new Date(user.createdAt);
            resetDate = new Date(createdAt.setMonth(createdAt.getMonth() + 1));
        }

        res.json({
            plan_name: user.plan.name,
            message_limit: user.plan.messageLimit,
            messages_sent: user.messagesSent,
            messages_remaining: messagesRemaining,
            reset_date: resetDate
        });
    } catch (error) {
        console.error("Erro ao obter status do plano:", error);
        res.status(500).json({ error: 'Erro interno ao buscar status do plano.' });
    }
});

/**
 * @route   POST /plan/upgrade
 * @desc    Faz o upgrade do plano do usuário
 * @access  Private
 */
router.post('/upgrade', authMiddleware, validate(upgradePlanSchema), async (req, res) => {
    const { new_plan_id, card_token_id } = req.body;

    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.userId }});
        const newPlan = await prisma.plan.findUnique({ where: { id: new_plan_id } });

        if (!newPlan) {
            return res.status(404).json({ error: 'Plano não encontrado.' });
        }

        // Se o plano for gratuito ou o preço for zero, atualiza diretamente
        if (newPlan.price === 0) {
             await prisma.user.update({
                where: { id: req.user.userId },
                data: {
                    planId: new_plan_id,
                    messagesSent: 0,
                    planResetDate: new Date(new Date().setMonth(new Date().getMonth() + 1))
                }
            });
            return res.status(200).json({ message: 'Plano atualizado com sucesso!' });
        }

        // Se for um plano pago, cria assinatura no Mercado Pago
        if (!card_token_id) {
            return res.status(400).json({ error: 'O campo card_token_id é obrigatório para planos pagos.' });
        }

        const subscription = await createSubscription(newPlan.name, new_plan_id, user.email, card_token_id);

        if (subscription && subscription.status === 'authorized') {
            await prisma.user.update({
                where: { id: req.user.userId },
                data: {
                    planId: new_plan_id,
                    messagesSent: 0,
                    resetDate: new Date(new Date().setMonth(new Date().getMonth() + 1)),
                    mercadopagoSubscriptionId: subscription.id
                }
            });
            return res.status(200).json({ message: 'Plano atualizado! Assinatura criada e autorizada no Mercado Pago.' });
        } else {
            return res.status(400).json({
                error: 'Falha ao criar a assinatura no Mercado Pago.'
            });
        }

    } catch (error) {
        console.error("Erro no upgrade de plano:", error);
        res.status(500).json({ error: 'Erro interno ao processar o upgrade.' });
    }
});


module.exports = router;
