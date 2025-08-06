// services/database.js
// Gerencia a conexão com o banco de dados através do Prisma.

const { PrismaClient } = require('@prisma/client');
const logger = require('./logger');

const prisma = new PrismaClient();

// Função para popular a tabela de planos com valores iniciais
async function seedPlans() {
    logger.info('Verificando e semeando planos...');
    const plans = [
        { id: 1, name: 'Grátis', messageLimit: 5, price: 0.00, features: 'Testes' },
        { id: 2, name: 'Start', messageLimit: 100, price: 19.90, features: 'E-mail' },
        { id: 3, name: 'Pro', messageLimit: 500, price: 39.90, features: 'Suporte, 1 número fixo' },
        { id: 4, name: 'Master', messageLimit: 2000, price: 89.90, features: 'Suporte prioritário' },
        { id: 5, name: 'Enterprise', messageLimit: -1, price: 199.90, features: 'Suporte 24h, + números' } // -1 para ilimitado
    ];

    for (const plan of plans) {
        await prisma.plan.upsert({
            where: { id: plan.id },
            update: {},
            create: plan,
        });
    }
    logger.info('Planos semeados com sucesso.');
}

// Função de inicialização
async function init() {
    try {
        await prisma.$connect();
        logger.info("Prisma Client conectado ao banco de dados.");
        await seedPlans();
    } catch (error) {
        logger.error("Falha ao conectar o Prisma Client:", error);
        throw error;
    }
}

module.exports = {
    prisma,
    init,
};