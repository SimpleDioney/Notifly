// schemas/plans.schemas.js
const { z } = require('zod');

const upgradePlanSchema = z.object({
    body: z.object({
        new_plan_id: z.number({ required_error: 'O ID do novo plano é obrigatório' }).int().positive(),
        card_token_id: z.string({ required_error: 'O token do cartão é obrigatório' }),
    }),
});

module.exports = {
    upgradePlanSchema,
};