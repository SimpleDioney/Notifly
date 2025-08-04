// services/subscription-verifier.js
const cron = require('node-cron');
const { prisma } = require('./database');
const mercadopago = require('./mercadopago');
const logger = require('./logger');

async function getAllUsersFromDB() {
    return prisma.user.findMany({
        select: {
            id: true,
            email: true,
            planId: true,
            mercadopagoSubscriptionId: true,
        },
    });
}

function getLocalPlanId(mpPlanId) {
    for (const [localId, mpId] of Object.entries(mercadopago.planIdMap)) {
        if (mpId === mpPlanId) return parseInt(localId, 10);
    }
    return null;
}

async function syncAllSubscriptions() {
    logger.info('Iniciando sincronização completa de assinaturas...');
    
    const activeMpSubscriptions = await mercadopago.getAllActiveSubscriptions();
    const localUsers = await getAllUsersFromDB();

    let activatedCount = 0, deactivatedCount = 0;

    for (const user of localUsers) {
        if (!user.mercadopagoSubscriptionId) continue;

        const activeSubscription = activeMpSubscriptions.get(user.mercadopagoSubscriptionId);

        if (activeSubscription) {
            const correctLocalPlanId = getLocalPlanId(activeSubscription.preapproval_plan_id);

            if (correctLocalPlanId && user.planId !== correctLocalPlanId) {
                logger.info(`Sincronizando/Reativando plano para ${user.email}. Plano antigo: ${user.planId}, Novo: ${correctLocalPlanId}`);
                await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        planId: correctLocalPlanId,
                        resetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                    },
                });
                activatedCount++;
            }
        } else {
            if (user.planId !== 1) { // 1 é o ID do plano Grátis
                logger.warn(`Usuário ${user.email} (ID: ${user.id}) tem uma assinatura registrada (${user.mercadopagoSubscriptionId}) que não está mais ativa no MP. Revertendo para o plano grátis.`);
                await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        planId: 1,
                        mercadopagoSubscriptionId: null,
                    },
                });
                deactivatedCount++;
            }
        }
    }

    logger.info(`Sincronização finalizada. Ativados/Corrigidos: ${activatedCount}. Desativados: ${deactivatedCount}.`);
}

async function start() {
    await syncAllSubscriptions();
    cron.schedule('0 * * * *', syncAllSubscriptions);
    logger.info('Serviço de sincronização de assinaturas agendado para rodar a cada hora.');
}

module.exports = { start };