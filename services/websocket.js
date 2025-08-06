// services/websocket.js
const WebSocket = require('ws');
const logger = require('./logger');

let wss;

function init(server) {
  wss = new WebSocket.Server({ server });

  wss.on('connection', (ws) => {
    logger.info('Cliente frontend conectado via WebSocket.');

    ws.on('close', () => {
      logger.info('Cliente frontend desconectado do WebSocket.');
    });

    ws.on('error', (error) => {
        logger.error('Erro no WebSocket:', error);
    });
  });

  logger.info('Servidor WebSocket inicializado e a aguardar conexões.');
}

function broadcast(data) {
  if (!wss) {
    logger.warn('Tentativa de broadcast, mas o WebSocket Server não está inicializado.');
    return;
  }

  const message = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

module.exports = {
  init,
  broadcast,
};
