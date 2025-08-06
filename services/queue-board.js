// services/queue-board.js
const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const { Queue } = require('bullmq');

// Crie a mesma conexão Redis que o seu worker usa
const redisConnection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
};

// Crie uma instância da sua fila para o board poder monitorizá-la
const messageQueue = new Queue('message-queue', { connection: redisConnection });

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues'); // Define o caminho para o dashboard

createBullBoard({
    queues: [new BullMQAdapter(messageQueue)],
    serverAdapter: serverAdapter,
});

module.exports = serverAdapter;