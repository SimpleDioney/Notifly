// schemas/messages.schemas.js
const { z } = require('zod');

const sendSchema = z.object({
  body: z.object({
        to: z.string({ required_error: 'O destinatário ("to") é obrigatório' }),
        message: z.string().optional(),
        media_url: z.string().url('A URL da mídia é inválida').optional(),
        // Aceita formatos retornados por input datetime-local (ex: YYYY-MM-DDTHH:mm) ou ISO completo
        scheduledAt: z.string().refine((val) => {
            if (!val) return true;
            const timestamp = Date.parse(val);
            return !Number.isNaN(timestamp);
        }, { message: 'Formato de data de agendamento inválido.' }).optional(),
    }).refine(data => data.message || data.media_url, {
        message: 'O conteúdo ("message", "media_url" ou "media_url") é obrigatório',
    }),
});

const sendBatchSchema = z.object({
    body: z.object({
        templateName: z.string(), // Usaremos templates para envios em lote
        contactListId: z.number().int().positive().optional(),
        contacts: z.array(z.object({
            to: z.string(),
            // As variáveis para o template serão passadas aqui
            variables: z.record(z.string()).optional(), 
        })).optional(),
    }).refine(data => data.contactListId || data.contacts, {
        message: 'Você deve fornecer ou "contactListId" ou um array de "contacts"',
    }).refine(data => !(data.contactListId && data.contacts), {
        message: 'Você não pode fornecer "contactListId" e "contacts" ao mesmo tempo',
    }),
});

const historySchema = z.object({
    query: z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Data inválida, deve ser YYYY-MM-DD" }).optional(),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Data inválida, deve ser YYYY-MM-DD" }).optional(),

        status: z.enum(['sent', 'failed', 'pending']).optional(),
        number_to: z.string().optional(),
    }),
});

module.exports = {
    sendSchema,
    sendBatchSchema,
    historySchema,
};