// utils/message.helpers.js

const { prisma } = require('../services/database');

/**
 * Tenta incrementar o contador de mensagens.
 * Retorna true se o incremento foi bem-sucedido, false caso contrário.
 */
async function reserveMessageSlot(userId) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { plan: true },
    });

    if (!user || !user.plan) return false;

    if (user.plan.messageLimit === -1) {
        await prisma.user.update({
            where: { id: userId },
            data: { messagesSent: { increment: 1 } },
        });
        return true;
    }

    const result = await prisma.user.updateMany({
        where: {
            id: userId,
            messagesSent: { lt: user.plan.messageLimit },
        },
        data: { messagesSent: { increment: 1 } },
    });
    return result.count > 0;
}

/**
 * Reverte a contagem de mensagens em caso de falha.
 */
async function releaseMessageSlot(userId) {
    await prisma.user.updateMany({
        where: {
            id: userId,
            messagesSent: { gt: 0 },
        },
        data: { messagesSent: { decrement: 1 } },
    });
}

async function isSpam(userId, to, message) {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentMessage = await prisma.message.findFirst({
        where: {
            userId,
            numberTo: to,
            messageContent: message,
            sentAt: {
                gt: fiveMinutesAgo,
            },
        },
    });
    return !!recentMessage;
}

module.exports = {
    reserveMessageSlot,
    releaseMessageSlot,
    isSpam
};