// services/wppconnect.js
// Gerencia a criação, inicialização e monitoramento das sessões do WppConnect.

const wppconnect = require('@wppconnect-team/wppconnect');
const { getDb } = require('./database');
const logger = require('./logger');

const clients = new Map();

const numbersToConnect = [
    { id: 'primary_number', number: '554399241054' },
    // Adicione mais números conforme necessário
];

/**
 * Cria e inicializa um cliente WPPConnect para um número específico.
 */
async function createClient(numberInfo) {
    const { id, number } = numberInfo;
    logger.info(`Iniciando criação do cliente para a sessão: ${id} (${number})`);
    
    try {
        const client = await wppconnect.create({
            session: id,
            catchQR: (base64Qr, asciiQR) => {
                logger.info(`QR Code para a sessão ${id}. Escaneie para conectar.`);
                console.log(asciiQR); // Mostra o QR Code no terminal
                updateNumberStatus(id, 'disconnected', number); // Define como desconectado ao gerar QR
            },
            statusFind: (statusSession, session) => {
                logger.info(`Status da sessão ${session}: ${statusSession}`);
                // A conexão só é confirmada quando o status for 'isLogged' ou 'inChat'
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

/**
 * Inicializa todos os clientes definidos em `numbersToConnect`.
 */
async function initializeAllClients() {
    logger.info('Inicializando todos os clientes WppConnect...');
    const promises = numbersToConnect.map(num => createClient(num));
    await Promise.all(promises);
    logger.info('Processo de inicialização de clientes finalizado.');
    
    setInterval(monitorClientStatus, 60000);
}

/**
 * Atualiza o status de um número no banco de dados.
 */
async function updateNumberStatus(id, status, phoneNumber = null) {
    const db = getDb();
    const phone = phoneNumber || (numbersToConnect.find(n => n.id === id) || {}).number;
    if (!phone) {
        logger.warn(`Não foi possível encontrar o número para o ID de sessão: ${id}`);
        return;
    }

    try {
        const existing = await db.get('SELECT * FROM numbers_pool WHERE id = ?', id);
        if (existing) {
            await db.run('UPDATE numbers_pool SET status = ?, last_used = CURRENT_TIMESTAMP WHERE id = ?', [status, id]);
        } else {
            await db.run('INSERT INTO numbers_pool (id, phone_number, status) VALUES (?, ?, ?)', [id, phone, status]);
        }
        logger.info(`Status do número ${phone} (${id}) atualizado para: ${status}`);
    } catch (error) {
        logger.error(`Erro ao atualizar status do número ${phone} no banco de dados:`, error);
    }
}

/**
 * Seleciona o melhor cliente disponível do pool para enviar uma mensagem.
 */
async function getAvailableClient() {
    const db = getDb();
    try {
        const bestNumber = await db.get(`
            SELECT id, phone_number FROM numbers_pool 
            WHERE status = 'connected' 
            ORDER BY last_used ASC 
            LIMIT 1
        `);

        if (bestNumber && clients.has(bestNumber.id)) {
            logger.info(`Cliente selecionado para envio: ${bestNumber.id} (${bestNumber.phone_number})`);
            await db.run('UPDATE numbers_pool SET last_used = CURRENT_TIMESTAMP WHERE id = ?', bestNumber.id);
            return {
                client: clients.get(bestNumber.id),
                phoneNumber: bestNumber.phone_number
            };
        }
        
        // Log aprimorado para depuração
        const poolStatus = await db.all('SELECT id, phone_number, status FROM numbers_pool');
        logger.warn('Nenhum cliente WppConnect disponível para envio.', { poolStatus });
        return null;

    } catch (error) {
        logger.error('Erro ao selecionar cliente disponível:', error);
        return null;
    }
}

/**
 * Monitora o status de todos os clientes e tenta reconectar se necessário.
 */
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