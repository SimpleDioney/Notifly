// routes/auth.routes.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { prisma } = require('../services/database');
const logger = require('../services/logger');
const validate = require('../middleware/validation.middleware');
const { registerSchema, loginSchema } = require('../schemas/auth.schemas');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'seu-segredo-super-secreto-para-jwt';
const SALT_ROUNDS = 10;

// POST /auth/register
router.post('/register', validate(registerSchema), async (req, res, next) => {
    const { email, password } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        
        const resetDate = new Date();
        resetDate.setMonth(resetDate.getMonth() + 1);

        const role = email === 'dioneygabriel20@gmail.com' ? 'ADMIN' : 'USER';

        const newUser = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                role: role,
                resetDate: resetDate.toISOString(),
            },
        });

        logger.info(`Novo usuário registrado: ${email} (ID: ${newUser.id})`);
        res.status(201).json({ message: 'Usuário registrado com sucesso!', userId: newUser.id });
    } catch (error) {
        if (error.code === 'P2002' && error.meta?.target?.includes('email')) {
            return res.status(409).json({ error: 'Este email já está em uso.' });
        }
        next(error);
    }
});

// POST /auth/login
router.post('/login', validate(loginSchema), async (req, res, next) => {
    const { email, password } = req.body;

    try {
        const user = await prisma.user.findUnique({
            where: { email },
        });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Credenciais inválidas.' });
        }

        // --- CORREÇÃO CRÍTICA ADICIONADA AQUI ---
        // Verifica se o usuário está banido ANTES de gerar o token.
        if (user.isBanned) {
            logger.warn(`Tentativa de login bloqueada para usuário banido: ${email}`);
            return res.status(403).json({ error: 'Sua conta está suspensa. Entre em contato com o suporte.' });
        }
        // --- FIM DA CORREÇÃO ---

        const token = jwt.sign(
            { userId: user.id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        logger.info(`Usuário logado com sucesso: ${email}`);
        
        // Retorna também o cargo (role) e o status de banido (isBanned) no corpo da resposta
        res.json({ 
            message: 'Login bem-sucedido!', 
            token, 
            email: user.email,
            role: user.role,
            isBanned: user.isBanned 
        });

    } catch (error) {
        next(error);
    }
});

module.exports = router;
