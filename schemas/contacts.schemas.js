// schemas/contacts.schemas.js

const { z } = require('zod');

const contactSchema = z.object({
    body: z.object({
        name: z.string({ required_error: 'O nome do contato é obrigatório' }).min(2, 'O nome deve ter pelo menos 2 caracteres'),
        // Simples validação para verificar se contém apenas números e talvez um '+' no início
        number: z.string({ required_error: 'O número do contato é obrigatório' }).regex(/^\+?[0-9]{10,15}$/, 'Formato de número inválido.'),
    }),
});

module.exports = {
    contactSchema,
};