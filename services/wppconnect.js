// services/wppconnect.js
// Gerencia a criação, inicialização e monitoramento das sessões do WppConnect.

const wppconnect = require('@wppconnect-team/wppconnect');
const { prisma } = require('./database');
const logger = require('./logger');

const clients = new Map();

const numbersToConnect = [
    { id: 'primary_number', number: '554399241054' },
    // Adicione mais números conforme necessário
];

async function createClient(numberInfo) {
    const { id, number } = numberInfo;
    logger.info(`Iniciando criação do cliente para a sessão: ${id} (${number})`);
    
    try {
        const client = await wppconnect.create({
            session: id,
            catchQR: (base64Qr, asciiQR) => {
                logger.info(`QR Code para a sessão ${id}. Escaneie para conectar.`);
                console.log(asciiQR);
                updateNumberStatus(id, 'disconnected', number);
            },
            statusFind: (statusSession, session) => {
                logger.info(`Status da sessão ${session}: ${statusSession}`);
                const isConnected = ['isLogged', 'inChat'].includes(statusSession);
                updateNumberStatus(id, isConnected ? 'connected' : 'disconnected');
            },
            headless: true,
            devtools: false,
            useChrome: true,
            logQR: true,
        });

        clients.set(id, client);
        logger.info(`Cliente para a sessão ${id} foi inicializado. Aguardando autenticação via QR Code...`);
        return client;

    } catch (error) {
        logger.error(`Erro ao criar cliente para a sessão ${id}:`, error);
        await updateNumberStatus(id, 'error', number);
    }
}

async function initializeAllClients() {
    logger.info('Inicializando todos os clientes WppConnect...');
    const promises = numbersToConnect.map(num => createClient(num));
    await Promise.all(promises);
    logger.info('Processo de inicialização de clientes finalizado.');
    
    setInterval(monitorClientStatus, 60000);
}

async function updateNumberStatus(id, status, phoneNumber = null) {
    const phone = phoneNumber || (numbersToConnect.find(n => n.id === id) || {}).number;
    if (!phone) {
        logger.warn(`Não foi possível encontrar o número para o ID de sessão: ${id}`);
        return;
    }

    try {
        await prisma.numbersPool.upsert({
            where: { id },
            update: { status, lastUsed: new Date() },
            create: { id, phoneNumber: phone, status },
        });
        logger.info(`Status do número ${phone} (${id}) atualizado para: ${status}`);
    } catch (error) {
        logger.error(`Erro ao atualizar status do número ${phone} no banco de dados:`, error);
    }
}

async function getAvailableClient() {
    try {
        const bestNumber = await prisma.numbersPool.findFirst({
            where: { status: 'connected' },
            orderBy: { lastUsed: 'asc' },
        });

        if (bestNumber && clients.has(bestNumber.id)) {
            logger.info(`Cliente selecionado para envio: ${bestNumber.id} (${bestNumber.phoneNumber})`);
            await prisma.numbersPool.update({
                where: { id: bestNumber.id },
                data: { lastUsed: new Date() },
            });
            return {
                client: clients.get(bestNumber.id),
                phoneNumber: bestNumber.phoneNumber
            };
        }
        
        const poolStatus = await prisma.numbersPool.findMany();
        logger.warn('Nenhum cliente WppConnect disponível para envio.', { poolStatus });
        return null;

    } catch (error) {
        logger.error('Erro ao selecionar cliente disponível:', error);
        return null;
    }
}

async function monitorClientStatus() {
    logger.info('Executando verificação de saúde das sessões...');
    for (const [id, client] of clients.entries()) {
        try {
            const isConnected = await client.isConnected();
            if (!isConnected) {
                logger.warn(`Sessão ${id} está desconectada. Tentando reconectar...`);
                await updateNumberStatus(id, 'disconnected');
            } else {
                 await updateNumberStatus(id, 'connected');
                 logger.info(`Sessão ${id} está saudável e conectada.`);
            }
        } catch (error) {
            logger.error(`Erro ao verificar status da sessão ${id}:`, error);
            await updateNumberStatus(id, 'error');
        }
    }
}

module.exports = {
    initializeAllClients,
    getAvailableClient,
    clients,
};