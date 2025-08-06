// services/queue.service.js

const { Queue } = require('bullmq');
const IORedis = require('ioredis');
const logger = require('./logger');

// Cria uma conexão reutilizável com o Redis
const connection = new IORedis({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    maxRetriesPerRequest: null, // Necessário para BullMQ
});

connection.on('connect', () => logger.info('Conectado ao Redis para a fila.'));
connection.on('error', (err) => logger.error('Erro de conexão com o Redis:', err));

// Cria a fila de mensagens
const messageQueue = new Queue('message-queue', { connection });

/**
 * Adiciona um job de envio de mensagem à fila.
 * @param {object} data - Os dados do job (ex: { to, message, media_url, userId }).
 * @param {object} opts - Opções do job (ex: { delay: 5000 } para agendamento).
 */
async function addMessageToQueue(data, opts = {}) {
    try {
        await messageQueue.add('send-message', data, opts);
        logger.info(`Job adicionado à fila para o número: ${data.to}`);
    } catch (error) {
        logger.error('Erro ao adicionar job à fila:', error);
    }
}

module.exports = {
    messageQueue,
    addMessageToQueue,
};