// schemas/auth.schemas.js
const { z } = require('zod');

const registerSchema = z.object({
    body: z.object({
        email: z.string({ required_error: 'Email é obrigatório' }).email('Formato de email inválido'),
        password: z.string({ required_error: 'Senha é obrigatória' }).min(6, 'A senha deve ter no mínimo 6 caracteres'),
    }),
});

const loginSchema = z.object({
    body: z.object({
        email: z.string({ required_error: 'Email é obrigatório' }).email('Email inválido'),
        password: z.string({ required_error: 'Senha é obrigatória' }),
    }),
});

module.exports = {
    registerSchema,
    loginSchema,
};