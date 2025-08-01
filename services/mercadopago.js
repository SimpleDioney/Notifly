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
 * Cria a assinatura diretamente na API do Mercado Pago usando um card_token_id.
 * @param {string} planName - O nome do plano.
 * @param {string} planId - O ID do plano na sua API.
 * @param {string} userEmail - O e-mail do usuário.
 * @param {string} cardTokenId - O token do cartão gerado pelo Brick.
 * @returns {Promise<object|null>} - Retorna o objeto da assinatura criada.
 */
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
        status: 'authorized' // Tentamos autorizar a assinatura imediatamente
    };

    try {
        const response = await apiClient.post('/preapproval', body);
        logger.info(`Assinatura criada com sucesso para ${userEmail} no plano ${planName}`);
        return response.data;
    } catch (error) {
        const errorData = error.response ? error.response.data : error.message;
        logger.error('Erro ao criar assinatura no Mercado Pago:', JSON.stringify(errorData, null, 2));
        // Lança o erro para que a rota possa capturá-lo e enviar uma resposta adequada
        throw new Error(errorData?.message || 'Falha ao processar pagamento.');
    }
}

// ... (getSubscriptionDetails permanece o mesmo) ...
async function getSubscriptionDetails(subscriptionId) {
    try {
        const response = await apiClient.get(`/preapproval/${subscriptionId}`);
        return response.data;
    } catch (error) {
        logger.error(`Erro ao buscar detalhes da assinatura ${subscriptionId}:`, error.response ? error.response.data : error.message);
        return null;
    }
}

module.exports = { createSubscription, getSubscriptionDetails, planIdMap };