// services/database.js
// Gerencia a conexão e a estrutura do banco de dados SQLite.

const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const bcrypt = require('bcrypt');

let db;

// Função para inicializar o banco de dados
async function init() {
    db = await open({
        filename: './whatsapp_api.db',
        driver: sqlite3.Database
    });
    await createTables();
    await seedPlans();
    console.log("Banco de dados conectado e tabelas verificadas.");
}

// Função para criar as tabelas se não existirem
async function createTables() {
    // Tabela de usuários/clientes
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            plan_id INTEGER DEFAULT 1,
            messages_sent INTEGER DEFAULT 0,
            reset_date DATE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (plan_id) REFERENCES plans(id)
        );
    `);

    // Tabela de planos
    await db.exec(`
        CREATE TABLE IF NOT EXISTS plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            message_limit INTEGER NOT NULL,
            price REAL NOT NULL,
            features TEXT
        );
    `);

    // Tabela de histórico de mensagens
    await db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            number_to TEXT NOT NULL,
            message_content TEXT,
            media_url TEXT,
            status TEXT NOT NULL, -- ex: 'sent', 'failed', 'pending'
            sent_by_number TEXT NOT NULL,
            error_message TEXT,
            sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
    `);

    // Tabela para o pool de números da API
    await db.exec(`
        CREATE TABLE IF NOT EXISTS numbers_pool (
            id TEXT PRIMARY KEY,
            phone_number TEXT UNIQUE NOT NULL,
            status TEXT NOT NULL, -- 'connected', 'disconnected', 'error'
            last_used DATETIME,
            session_data TEXT
        );
    `);
}

// Função para popular a tabela de planos com valores iniciais
async function seedPlans() {
    const plans = [
        { id: 1, name: 'Grátis', limit: 5, price: 0.00, features: 'Testes' },
        { id: 2, name: 'Start', limit: 100, price: 19.90, features: 'E-mail' },
        { id: 3, name: 'Pro', limit: 500, price: 39.90, features: 'Suporte, 1 número fixo' },
        { id: 4, name: 'Master', limit: 2000, price: 89.90, features: 'Suporte prioritário' },
        { id: 5, name: 'Enterprise', limit: -1, price: 199.90, features: 'Suporte 24h, + números' } // -1 para ilimitado
    ];

    for (const plan of plans) {
        const existing = await db.get('SELECT id FROM plans WHERE id = ?', plan.id);
        if (!existing) {
            await db.run(
                'INSERT INTO plans (id, name, message_limit, price, features) VALUES (?, ?, ?, ?, ?)',
                plan.id, plan.name, plan.limit, plan.price, plan.features
            );
        }
    }
}

// Função para obter a instância do banco de dados
function getDb() {
    if (!db) {
        throw new Error("O banco de dados não foi inicializado!");
    }
    return db;
}

module.exports = {
    init,
    getDb,
};
