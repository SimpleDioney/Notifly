// schemas/templates.schemas.js
const { z } = require('zod');

const templateSchema = z.object({
    body: z.object({
        name: z.string({ required_error: 'O nome do template é obrigatório' }).min(1, 'O nome não pode ser vazio'),
        content: z.string({ required_error: 'O conteúdo do template é obrigatório' }).min(1, 'O conteúdo não pode ser vazio'),
    }),
});

const templateParamsSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, "O ID do template deve ser um número inteiro positivo").transform(Number),
    }),
});


module.exports = {
    templateSchema,
    templateParamsSchema,
};