// services/mercadopago.js
const axios = require('axios');
const logger = require('./logger');

const MERCADO_PAGO_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN;

const apiClient = axios.create({
    baseURL: 'https://api.mercadopago.com',
    headers: {
        'Authorization': `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
    }
});

const planIdMap = {
    2: '01c3d340ca9a41da80571ace33315d76', // Start
    3: '9eedb69125814198bd02fa87011d55bf', // Pro
    4: '1ef792043d90469788fd89e925d604d0', // Master
};

/**
 * Busca todas as assinaturas ativas na conta do Mercado Pago.
 * @returns {Promise<Map<string, object>>} - Um Map onde a chave é o ID da assinatura e o valor é o objeto da assinatura.
 */
async function getAllActiveSubscriptions() {
    const activeSubscriptions = new Map();
    let offset = 0;
    const limit = 50;
    let total = 0;

    try {
        do {
            const response = await apiClient.get('/preapproval/search', {
                params: {
                    status: 'authorized',
                    limit: limit,
                    offset: offset
                }
            });
            
            const results = response.data.results || [];
            // A chave do Map agora é o ID da assinatura, que sempre está presente.
            results.forEach(sub => {
                if (sub.id) {
                    activeSubscriptions.set(sub.id, sub);
                }
            });

            total = response.data.paging.total;
            offset += results.length;

        } while (offset < total);

        logger.info(`Encontradas ${activeSubscriptions.size} assinaturas ativas no Mercado Pago.`);
        return activeSubscriptions;

    } catch (error) {
        const errorData = error.response ? error.response.data : error.message;
        logger.error('Erro ao buscar todas as assinaturas ativas no Mercado Pago:', JSON.stringify(errorData, null, 2));
        return new Map();
    }
}

async function createSubscription(planName, planId, userEmail, cardTokenId) {
    const preapproval_plan_id = planIdMap[planId];
    if (!preapproval_plan_id) {
        logger.error(`ID de plano do MP não encontrado para o plano local: ${planId}`);
        return null;
    }
    const body = {
        preapproval_plan_id,
        payer_email: userEmail,
        card_token_id: cardTokenId,
        reason: `Assinatura Plano ${planName}`,
        status: 'authorized'
    };
    try {
        const response = await apiClient.post('/preapproval', body);
        logger.info(`Assinatura criada com sucesso para ${userEmail} no plano ${planName}`);
        return response.data;
    } catch (error) {
        const errorData = error.response ? error.response.data : error.message;
        logger.error('Erro ao criar assinatura no Mercado Pago:', JSON.stringify(errorData, null, 2));
        throw new Error(errorData?.message || 'Falha ao processar pagamento.');
    }
}

async function getSubscriptionDetails(subscriptionId) {
    try {
        const response = await apiClient.get(`/preapproval/${subscriptionId}`);
        return response.data;
    } catch (error) {
        logger.error(`Erro ao buscar detalhes da assinatura ${subscriptionId}:`, error.response ? error.response.data : error.message);
        return null;
    }
}

module.exports = { 
    createSubscription, 
    getSubscriptionDetails, 
    getAllActiveSubscriptions,
    planIdMap 
};
