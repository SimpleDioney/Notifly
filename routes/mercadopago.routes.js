// routes/mercadopago.routes.js
// Define o endpoint de webhook para notificações do Mercado Pago.

const express = require('express');
const { prisma } = require('../services/database');
const mercadopago = require('../services/mercadopago');
const wppconnect = require('../services/wppconnect');
const logger = require('../services/logger');

const router = express.Router();

const YOUR_WHATSAPP_NUMBER = '554391964950'; // Número que receberá a notificação

router.post('/webhook', async (req, res) => {
    const { id, type } = req.body;

    logger.info('Webhook do Mercado Pago recebido:', req.body);

    if (type === 'preapproval') {
        try {
            const subscription = await mercadopago.getSubscriptionDetails(id);

            if (subscription && subscription.status === 'authorized') {
                const user = await prisma.user.findUnique({
                    where: { email: subscription.payer_email },
                });
                
                if (user) {
                    const localPlanId = Object.keys(mercadopago.planIdMap).find(
                        key => mercadopago.planIdMap[key] === subscription.preapproval_plan_id
                    );

                    if (localPlanId) {
                        const newResetDate = new Date();
                        newResetDate.setMonth(newResetDate.getMonth() + 1);

                        await prisma.user.update({
                            where: { id: user.id },
                            data: {
                                planId: parseInt(localPlanId),
                                messagesSent: 0,
                                resetDate: newResetDate.toISOString(),
                            },
                        });
                        
                        logger.info(`Plano do usuário ${user.email} atualizado para ${localPlanId} via webhook.`);
                        
                        const connection = await wppconnect.getAvailableClient();
                        if (connection) {
                            const message = `🎉 Nova assinatura confirmada!\n\n` +
                                            `Cliente: ${subscription.payer_email}\n` +
                                            `Plano: ${subscription.reason}\n` +
                                            `Valor: R$ ${subscription.auto_recurring.transaction_amount}\n` +
                                            `Status: ${subscription.status}`;
                            
                            await connection.client.sendText(YOUR_WHATSAPP_NUMBER, message);
                            logger.info(`Notificação de nova assinatura enviada para ${YOUR_WHATSAPP_NUMBER}.`);
                        }
                    }
                }
            }
        } catch (error) {
            logger.error('Erro ao processar webhook do Mercado Pago:', error);
        }
    }

    res.status(200).send('OK');
});

module.exports = router;