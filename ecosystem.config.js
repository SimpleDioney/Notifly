// ecosystem.config.js
// Arquivo de configuração para o gerenciador de processos PM2.

module.exports = {
  apps: [{
    name: 'wppconnect-api',
    script: 'server.js',
    instances: 1, // Rodar em uma única instância. Para cluster, use 'max'.
    autorestart: true,
    watch: false, // Desabilitado por padrão, habilite se quiser que reinicie em alterações de arquivo.
    max_memory_restart: '1G', // Reinicia se o uso de memória exceder 1GB.
    env: {
      NODE_ENV: 'development',
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 8080, // Porta para produção
      JWT_SECRET: 'mude-este-segredo-em-producao-com-algo-longo-e-aleatorio'
    }
  }]
};
