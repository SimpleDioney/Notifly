// schemas/triggers.schemas.js

const { z } = require('zod');

const triggerSendSchema = z.object({
    body: z.object({
        to: z.string({ required_error: 'O destinatário ("to") é obrigatório' }),
        templateName: z.string({ required_error: 'O nome do template ("templateName") é obrigatório' }),
        // "variables" será um objeto onde as chaves e valores são strings
        variables: z.record(z.string()).optional(),
    }),
});

module.exports = {
    triggerSendSchema,
};