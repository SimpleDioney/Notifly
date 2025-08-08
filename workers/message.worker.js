// workers/message.worker.js

const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const logger = require('../services/logger');
const { prisma } = require('../services/database');
const wppconnect = require('../services/wppconnect');
const { reserveMessageSlot, releaseMessageSlot } = require('../utils/message.helpers');
const { dlqQueue, rateLimitChip } = require('../services/queue.service');

const connection = new IORedis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
    maxRetriesPerRequest: null,
});

const worker = new Worker('message-queue', async (job) => {
    const { to, message, media_url, userId, scheduledAt } = job.data;
    let phoneNumber = 'N/A';
    logger.info(`Processando job ${job.id} para: ${to}`);

    try {
        // Verifica e reserva cota do plano no momento do envio
        const reserved = await reserveMessageSlot(userId);
        if (!reserved) {
            await prisma.message.create({
                data: {
                    userId,
                    numberTo: to,
                    messageContent: message,
                    mediaUrl: media_url,
                    status: 'failed',
                    errorMessage: 'Limite de mensagens do plano atingido.',
                    sentByNumber: phoneNumber,
                    sentAt: new Date(),
                },
            });
            logger.warn(`Limite do plano atingido para o usuário ${userId}. Mensagem não enviada.`);
            return;
        }

        // Passa o número do destinatário para a função de seleção
        const connection = await wppconnect.getAvailableClient(to);
        if (!connection) {
            throw new Error('Nenhum serviço de envio disponível no momento.');
        }

        const { client, chipId } = connection;
        phoneNumber = connection.phoneNumber;

        // Throttling por chip (ex.: 30 envios/min)
        await rateLimitChip(chipId, 30);

        // Shortener automático se habilitado
        let finalMessage = message;
        try {
            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (user?.shortenerEnabled && message) {
                const urlRegex = /https?:\/\/[^\s]+/g;
                const urls = (message.match(urlRegex) || []).slice(0, 5);
                for (const u of urls) {
                    // cria slug simples baseado em hash curto
                    const slug = `l${Math.random().toString(36).slice(2, 8)}`;
                    try {
                        await prisma.shortLink.create({ data: { userId, slug, targetUrl: u } });
                        finalMessage = finalMessage.replace(u, `${process.env.API_PUBLIC_BASE || ''}/s/${slug}`.replace(/\/$/, ''));
                    } catch {}
                }
            }
        } catch {}

        if (media_url) {
            await client.sendImage(to, media_url, 'media', finalMessage);
        } else {
            await client.sendText(to, finalMessage);
        }

        // Se o envio foi bem-sucedido, atualizamos ou criamos o registro da mensagem
        await prisma.message.create({
            data: {
                userId,
                numberTo: to,
                messageContent: message,
                mediaUrl: media_url,
                status: 'sent',
                sentByNumber: phoneNumber,
                chipId: chipId,
                sentAt: new Date(),
            },
        });

        // Atualiza reputação básica do chip
        await prisma.numbersPool.updateMany({
            where: { id: chipId },
            data: { successCount: { increment: 1 } }
        });

        // CRIA o mapeamento de chip x contato caso não exista
        await prisma.chipContactMap.upsert({
            where: { contactNumber_chipId: { contactNumber: to, chipId } },
            update: {},
            create: {
                contactNumber: to,
                chipId: chipId,
            }
        });


        logger.info(`Mensagem enviada com sucesso para ${to.substring(0, 6)}... via ${phoneNumber}`);

    } catch (error) {
        logger.error(`Falha no job ${job.id} para ${userId}: ${error.message}`);

        // Se a reserva foi feita, mas o envio falhou, revertemos
        await releaseMessageSlot(userId);

        // Registramos a falha no banco
        await prisma.message.create({
            data: {
                userId,
                numberTo: to,
                messageContent: message,
                mediaUrl: media_url,
                status: 'failed',
                errorMessage: error.message,
                sentByNumber: phoneNumber,
                chipId: (await (async ()=>{ try { const c = await wppconnect.getAvailableClient(to); return c?.chipId; } catch { return null; } })()) || null,
                sentAt: new Date(),
            },
        });

        await prisma.numbersPool.updateMany({
            where: { id: (await (async ()=>{ try { const c = await wppconnect.getAvailableClient(to); return c?.chipId; } catch { return null; } })()) || '' },
            data: { failureCount: { increment: 1 } }
        });

        // Encaminha para DLQ e re-lança para BullMQ aplicar retries/backoff
        await dlqQueue.add('failed-message', job.data, { removeOnComplete: 1000, removeOnFail: 5000 });
        throw error;
    }
}, { connection });

worker.on('completed', (job) => {
    logger.info(`Job ${job.id} foi completado com sucesso.`);
});

worker.on('failed', (job, err) => {
    logger.error(`Job ${job.id} falhou com o erro: ${err.message}`);
});

module.exports = worker;