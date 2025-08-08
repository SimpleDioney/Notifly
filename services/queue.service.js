// services/queue.service.js

const { Queue } = require('bullmq');
const IORedis = require('ioredis');
const logger = require('./logger');

// Cria uma conexão reutilizável com o Redis
const connection = new IORedis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
    maxRetriesPerRequest: null, // Necessário para BullMQ
});

connection.on('connect', () => logger.info('Conectado ao Redis para a fila.'));
connection.on('error', (err) => logger.error('Erro de conexão com o Redis:', err));

// Cria a fila de mensagens
const messageQueue = new Queue('message-queue', {
    connection,
    defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
    },
});

// DLQ (Dead Letter Queue)
const dlqQueue = new Queue('message-dlq', { connection });

// Rate limit por chip (token bucket simplificado por minuto)
async function rateLimitChip(chipId, maxPerMinute = 30) {
    const key = `chip:${chipId}:rate`;
    const current = await connection.incr(key);
    if (current === 1) {
        await connection.expire(key, 60);
    }
    if (current > maxPerMinute) {
        const ttl = await connection.ttl(key);
        const waitMs = Math.max(1000, (ttl || 60) * 1000);
        logger.warn(`Rate limit atingido para chip ${chipId}. Aguardando ${waitMs}ms`);
        await new Promise((r) => setTimeout(r, waitMs));
    }
}

// Idempotência baseada em Redis
async function isDuplicateIdempotency(userId, key, ttlSeconds = 3600) {
    if (!key) return false;
    const redisKey = `idem:${userId}:${key}`;
    const set = await connection.set(redisKey, '1', 'NX', 'EX', ttlSeconds);
    return set !== 'OK';
}

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
    dlqQueue,
    addMessageToQueue,
    rateLimitChip,
    isDuplicateIdempotency,
};