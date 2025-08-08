// routes/auth.routes.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { prisma } = require('../services/database');
const logger = require('../services/logger');
const validate = require('../middleware/validation.middleware');
const { registerSchema, loginSchema } = require('../schemas/auth.schemas');
const { parsePhoneNumberFromString } = require('libphonenumber-js');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'seu-segredo-super-secreto-para-jwt';
const SALT_ROUNDS = 10;

// POST /auth/register
router.post('/register', validate(registerSchema), async (req, res, next) => {
    const { email, password, whatsappNumber } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        
        const resetDate = new Date();
        resetDate.setMonth(resetDate.getMonth() + 1);

        const role = email === 'dioneygabriel20@gmail.com' ? 'ADMIN' : 'USER';

        let normalized = whatsappNumber;
        try { const p = parsePhoneNumberFromString(whatsappNumber || '', 'BR'); if (p && p.isValid()) normalized = p.number.replace('+',''); } catch {}
        const newUser = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                role: role,
                resetDate: resetDate.toISOString(),
                whatsappNumber: normalized || null,
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

// --- ALTERAÇÃO DE SENHA ---
// POST /auth/change-password
router.post('/change-password', async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token de autenticação não fornecido.' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.userId;
        const { current_password, new_password } = req.body;
        if (!current_password || !new_password) {
            return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
        }
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }
        const ok = await bcrypt.compare(current_password, user.password);
        if (!ok) {
            return res.status(401).json({ error: 'Senha atual incorreta.' });
        }
        const hashed = await bcrypt.hash(new_password, SALT_ROUNDS);
        await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
        res.json({ message: 'Senha alterada com sucesso.' });
    } catch (error) {
        next(error);
    }
});

// GET /auth/me - dados básicos do usuário (para Account)
router.get('/me', async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token não fornecido.' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
        res.json({ email: user.email, role: user.role, whatsappNumber: user.whatsappNumber, shortenerEnabled: user.shortenerEnabled });
    } catch (e) {
        next(e);
    }
});

// POST /auth/request-2fa - envia código por WhatsApp
router.post('/request-2fa', async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token não fornecido.' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.userId;
        let { whatsappNumber } = req.body || {};
        // normaliza e salva número
        try { const p = require('libphonenumber-js').parsePhoneNumberFromString(whatsappNumber || '', 'BR'); if (p && p.isValid()) whatsappNumber = p.number.replace('+',''); } catch {}
        await prisma.user.update({ where: { id: userId }, data: { whatsappNumber } });
        const code = String(Math.floor(100000 + Math.random() * 900000));
        const expires = new Date(Date.now() + 10 * 60 * 1000);
        await prisma.twoFactorCode.create({ data: { userId, code, expiresAt: expires } });
        // Envio via WppConnect (assíncrono best-effort)
        const wpp = require('../services/wppconnect');
        const client = await wpp.getAvailableClient(whatsappNumber);
        if (client?.client) {
            client.client.sendText(whatsappNumber, `Seu código de verificação Notifly: ${code}`)
              .catch(()=>{});
        }
        res.json({ message: 'Código enviado.' });
    } catch (e) { next(e); }
});

// POST /auth/verify-2fa - valida o código
router.post('/verify-2fa', async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token não fornecido.' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.userId;
        const { code } = req.body || {};
        const record = await prisma.twoFactorCode.findFirst({ where: { userId, code, usedAt: null } });
        if (!record) return res.status(400).json({ error: 'Código inválido.' });
        if (record.expiresAt < new Date()) return res.status(400).json({ error: 'Código expirado.' });
        await prisma.twoFactorCode.update({ where: { id: record.id }, data: { usedAt: new Date() } });
        await prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true } });
        res.json({ message: '2FA ativado.' });
    } catch (e) { next(e); }
});