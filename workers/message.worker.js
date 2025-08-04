// workers/message.worker.js

const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const logger = require('../services/logger');
const { prisma } = require('../services/database');
const wppconnect = require('../services/wppconnect');
const { releaseMessageSlot } = require('../utils/message.helpers'); // Helper que criaremos

const connection = new IORedis({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    maxRetriesPerRequest: null,
});

const worker = new Worker('message-queue', async (job) => {
    const { to, message, media_url, userId, scheduledAt } = job.data;
    let phoneNumber = 'N/A';
    logger.info(`Processando job ${job.id} para: ${to}`);

    try {
        const connection = await wppconnect.getAvailableClient();
        if (!connection) {
            throw new Error('Nenhum serviço de envio disponível no momento.');
        }
        
        const { client } = connection;
        phoneNumber = connection.phoneNumber;

        if (media_url) {
            await client.sendImage(to, media_url, 'media', message);
        } else {
            await client.sendText(to, message);
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
                sentAt: new Date(),
                // Se foi agendada, podemos registrar a data original do agendamento
                // scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
            },
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
                sentAt: new Date(),
            },
        });
        
        // Lança o erro para que o BullMQ possa registrar a falha do job
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