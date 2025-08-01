// routes/auth.routes.js
// Define os endpoints para registro e login de usuários.

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getDb } = require('../services/database');
const logger = require('../services/logger');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'seu-segredo-super-secreto-para-jwt';
const SALT_ROUNDS = 10;

// POST /auth/register
// Endpoint para registrar um novo cliente.
router.post('/register', async (req, res, next) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
    }

    try {
        const db = getDb();
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        
        // Define a data de reset do plano para 1 mês a partir de agora
        const resetDate = new Date();
        resetDate.setMonth(resetDate.getMonth() + 1);

        const result = await db.run(
            'INSERT INTO users (email, password, reset_date) VALUES (?, ?, ?)',
            [email, hashedPassword, resetDate.toISOString()]
        );

        logger.info(`Novo usuário registrado: ${email} (ID: ${result.lastID})`);
        res.status(201).json({ message: 'Usuário registrado com sucesso!', userId: result.lastID });
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT') {
            return res.status(409).json({ error: 'Este email já está em uso.' });
        }
        next(error);
    }
});

// POST /auth/login
// Endpoint para autenticar um cliente e retornar um token JWT.
router.post('/login', async (req, res, next) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
    }

    try {
        const db = getDb();
        const user = await db.get('SELECT * FROM users WHERE email = ?', email);

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Credenciais inválidas.' });
        }

        const token = jwt.sign(
            { userId: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        logger.info(`Usuário logado com sucesso: ${email}`);
        // CORREÇÃO: Adicionado o e-mail na resposta para o front-end
        res.json({ message: 'Login bem-sucedido!', token, email: user.email });

    } catch (error) {
        next(error);
    }
});


module.exports = router;
