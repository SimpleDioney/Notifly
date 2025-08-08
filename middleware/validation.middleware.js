// middleware/validation.middleware.js
const { z } = require('zod');

const validate = (schema) => (req, res, next) => {
    try {
        // Crie um objeto contendo todas as partes da requisição que podem ser validadas.
        const dataToValidate = {
            body: req.body,
            query: req.query,
            params: req.params,
        };

        // Remova a lógica if/else e sempre valide o objeto 'dataToValidate'.
        // Zod irá ignorar as chaves que não estão no schema (ex: 'query' e 'params' para o sendSchema).
        const parsed = schema.parse(dataToValidate);

        // Propaga valores parseados/transformados de volta para a request
        if (parsed.body) req.body = parsed.body;
        if (parsed.query) req.query = parsed.query;
        if (parsed.params) req.params = parsed.params;

        next();
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                error: 'Erro de validação',
                // Retornar 'issues' é ótimo para debugar no frontend.
                issues: error.flatten(),
            });
        }
        // Para outros erros inesperados
        next(error);
    }
};

module.exports = validate;