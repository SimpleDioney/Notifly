const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth.middleware');
const { upgradePlanSchema } = require('../schemas/plans.schemas');
const validate = require('../middleware/validation.middleware');
const { processPayment } = require('../services/mercadopago');

const router = express.Router();
const prisma = new PrismaClient();

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
            features: plan.features,
            createdAt: plan.createdAt,
            updatedAt: plan.updatedAt
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
        let resetDate = user.planResetDate;
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
    const { new_plan_id, card_token_id, payment_method_id, issuer_id } = req.body;

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

        // Se for um plano pago, processa o pagamento
        if (!card_token_id || !payment_method_id || !issuer_id) {
            return res.status(400).json({ error: 'Dados do cartão são obrigatórios para planos pagos.' });
        }

        const paymentResult = await processPayment({
            token: card_token_id,
            issuer_id: issuer_id,
            payment_method_id: payment_method_id,
            transaction_amount: newPlan.price,
            description: `Assinatura do plano ${newPlan.name}`,
            payer: { email: user.email }
        });

        if (paymentResult.status === 'approved') {
            await prisma.user.update({
                where: { id: req.user.userId },
                data: {
                    planId: new_plan_id,
                    messagesSent: 0,
                    planResetDate: new Date(new Date().setMonth(new Date().getMonth() + 1)),
                    lastPaymentId: paymentResult.id.toString()
                }
            });
            return res.status(200).json({ message: 'Pagamento aprovado e plano atualizado!' });
        } else {
            return res.status(400).json({
                error: 'Pagamento falhou.',
                details: paymentResult.status_detail
            });
        }

    } catch (error) {
        console.error("Erro no upgrade de plano:", error);
        res.status(500).json({ error: 'Erro interno ao processar o upgrade.' });
    }
});


module.exports = router;
