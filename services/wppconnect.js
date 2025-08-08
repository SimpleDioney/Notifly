// services/wppconnect.js
const wppconnect = require('@wppconnect-team/wppconnect');
const { prisma } = require('./database');
const logger = require('./logger');
const websocketService = require('./websocket');
const path = require('path');

const clients = new Map();

async function createClient(numberInfo) {
    const { id, phoneNumber } = numberInfo;
    logger.info(`Iniciando criação do cliente para a sessão: ${id} (${phoneNumber})`);
    
    try {
        if (clients.has(id)) {
            const oldClient = clients.get(id);
            await oldClient.close();
            clients.delete(id);
            logger.info(`Sessão antiga ${id} foi fechada antes de recriar.`);
        }

        const client = await wppconnect.create({
            session: id,
            catchQR: (base64Qr, asciiQR) => {
                logger.info(`QR Code gerado para a sessão ${id}. Enviando para o frontend...`);
                
                // --- CORREÇÃO APLICADA AQUI ---
                // A variável `base64Qr` já vem com o prefixo "data:image/png;base64,".
                // Não é necessário adicioná-lo novamente.
                websocketService.broadcast({
                    type: 'qrcode',
                    sessionId: id,
                    data: base64Qr // Envia a string original sem modificação
                });

                updateNumberStatus(id, 'disconnected', phoneNumber);
            },
            statusFind: (statusSession, session) => {
                logger.info(`Status da sessão ${session}: ${statusSession}`);
                const isConnected = ['isLogged', 'inChat'].includes(statusSession);
                updateNumberStatus(id, isConnected ? 'connected' : 'disconnected', phoneNumber);
                websocketService.broadcast({
                    type: 'status',
                    sessionId: session,
                    status: statusSession
                });
            },
            headless: true,
            devtools: false,
            useChrome: true,
            logQR: true,
            puppeteerOptions: {
                userDataDir: path.join(__dirname, '..', 'tokens', id),
            },
            browserArgs: [
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ]
        });

        clients.set(id, client);
        logger.info(`Cliente para a sessão ${id} foi inicializado. Aguardando autenticação...`);
        return client;

    } catch (error) {
        logger.error(`Erro ao criar cliente para a sessão ${id}: ${error.message}`);
        await updateNumberStatus(id, 'error', phoneNumber);
    }
}

async function initializeAllClients() {
    logger.info('Inicializando todos os clientes a partir do banco de dados...');
    try {
        const numbersFromDb = await prisma.numbersPool.findMany();
        if (numbersFromDb.length === 0) {
            logger.warn('Nenhum chip encontrado no banco de dados para inicializar.');
            return;
        }
        const promises = numbersFromDb.map(num => createClient(num));
        await Promise.all(promises);
        logger.info('Processo de inicialização de clientes finalizado.');
        
        setInterval(monitorClientStatus, 60000);
    } catch (dbError) {
        logger.error('Erro ao buscar chips do banco de dados:', dbError);
    }
}

async function addAndInitializeChip({ id, phoneNumber }) {
    logger.info(`Tentando adicionar novo chip: ${id} (${phoneNumber})`);
    
    const existingChipById = await prisma.numbersPool.findUnique({ where: { id } });
    if (existingChipById) {
        throw new Error(`Já existe um chip com a ID de sessão "${id}".`);
    }
    
    const existingChipByNumber = await prisma.numbersPool.findUnique({ where: { phoneNumber } });
    if (existingChipByNumber) {
        throw new Error(`O número de telefone ${phoneNumber} já está registado.`);
    }

    const newChip = await prisma.numbersPool.create({
        data: { id, phoneNumber, status: 'disconnected' },
    });

    await createClient(newChip);
    
    return newChip;
}

async function reconnectClient(id) {
    logger.info(`Solicitação de reconexão recebida para a sessão: ${id}`);
    const numberInfo = await prisma.numbersPool.findUnique({ where: { id } });

    if (!numberInfo) {
        logger.error(`Tentativa de reconectar uma sessão inválida: ${id}`);
        throw new Error(`Chip com a ID de sessão "${id}" não foi encontrado no banco de dados.`);
    }

    await createClient(numberInfo);
    return { message: `Processo de reconexão iniciado para ${id}. Verifique o frontend para o QR Code.` };
}

async function updateNumberStatus(id, status, phoneNumber = null) {
    try {
        let phone = phoneNumber;
        if (!phone) {
            const chipInDb = await prisma.numbersPool.findUnique({ where: { id } });
            if (chipInDb) {
                phone = chipInDb.phoneNumber;
            } else {
                logger.error(`Não foi possível atualizar o status para o chip ID ${id} porque ele não existe no DB e nenhum número de telefone foi fornecido.`);
                return;
            }
        }

        await prisma.numbersPool.upsert({
            where: { id },
            update: { status },
            create: {
                id,
                phoneNumber: phone,
                status,
            },
        });
        logger.info(`Status do número com ID ${id} atualizado para: ${status}`);
    } catch (error) {
        logger.error(`Erro ao atualizar status do chip ${id} no banco de dados:`, error);
    }
}

async function getAvailableClient(contactNumber) {
    try {
        const mapping = await prisma.chipContactMap.findFirst({
            where: { contactNumber },
        });

        if (mapping && clients.has(mapping.chipId)) {
            const client = clients.get(mapping.chipId);
            const isConnected = await client.isConnected();
            if (isConnected) {
                logger.info(`Cliente selecionado via mapeamento para ${contactNumber}: ${mapping.chipId}`);
                await prisma.numbersPool.update({
                    where: { id: mapping.chipId },
                    data: { lastUsed: new Date() },
                });
                const chipDetails = await prisma.numbersPool.findUnique({ where: { id: mapping.chipId } });
                return { client, phoneNumber: chipDetails.phoneNumber, chipId: mapping.chipId };
            }
        }

        const bestNumber = await prisma.numbersPool.findFirst({
            where: { status: 'connected' },
            orderBy: [
                { reputationScore: 'desc' },
                { lastUsed: 'asc' },
            ],
        });

        if (bestNumber && clients.has(bestNumber.id)) {
            logger.info(`Cliente selecionado para novo mapeamento: ${bestNumber.id}`);
            await prisma.numbersPool.update({
                where: { id: bestNumber.id },
                data: { lastUsed: new Date() },
            });
            return { client: clients.get(bestNumber.id), phoneNumber: bestNumber.phoneNumber, chipId: bestNumber.id };
        }
        
        logger.warn('Nenhum cliente WppConnect disponível para envio.');
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
            await updateNumberStatus(id, isConnected ? 'connected' : 'disconnected');
            if (isConnected) {
                 logger.info(`Sessão ${id} está saudável e conectada.`);
            } else {
                 logger.warn(`Sessão ${id} está desconectada.`);
            }
        } catch (error) {
            logger.error(`Erro ao verificar status da sessão ${id}:`, error);
            await updateNumberStatus(id, 'error');
        }
    }
}

module.exports = {
    initializeAllClients,
    addAndInitializeChip,
    getAvailableClient,
    reconnectClient,
    clients,
};
