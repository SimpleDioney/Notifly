// schemas/lists.schemas.js

const { z } = require('zod');

const listSchema = z.object({
    body: z.object({
        name: z.string({ required_error: 'O nome da lista é obrigatório' }).min(3, 'O nome da lista deve ter pelo menos 3 caracteres'),
        description: z.string().optional(),
    }),
});

const manageContactsInListSchema = z.object({
    body: z.object({
        // Espera um array de IDs de contatos
        contactIds: z.array(z.number().int().positive(), { required_error: 'O array de contactIds é obrigatório' }).nonempty('Forneça ao menos um ID de contato.'),
    }),
});

module.exports = {
    listSchema,
    manageContactsInListSchema,
};