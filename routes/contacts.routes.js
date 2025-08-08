const express = require('express');
const { prisma } = require('../services/database');
const authMiddleware = require('../middleware/auth.middleware');
const validate = require('../middleware/validation.middleware');
const { contactSchema } = require('../schemas/contacts.schemas');
const logger = require('../services/logger');
const { parsePhoneNumberFromString } = require('libphonenumber-js');

const router = express.Router();
router.use(authMiddleware);

// POST /contacts - Criar um novo contato
router.post('/', validate(contactSchema), async (req, res, next) => {
    const { name, number } = req.body;
    const userId = req.user.userId;

    try {
        let normalized = number;
        try {
            const parsed = parsePhoneNumberFromString(number, 'BR');
            if (parsed && parsed.isValid()) normalized = parsed.number.replace('+','');
        } catch {}
        const newContact = await prisma.contact.create({
            data: { userId, name, number },
        });
        logger.info(`Contato '${name}' (${number}) criado para o usuário ${userId}.`);
        res.status(201).json(newContact);
    } catch (error) {
        if (error.code === 'P2002') {
            // Diferenciar colisão por unique(userId, number) de colisão em outra constraint
            return res.status(409).json({ error: 'Você já possui um contato com este número.' });
        }
        next(error);
    }
});

// GET /contacts - Listar contatos do usuário
router.get('/', async (req, res, next) => {
    const userId = req.user.userId;
    try {
        const contacts = await prisma.contact.findMany({
            where: { userId },
            orderBy: { name: 'asc' },
        });
        res.json(contacts);
    } catch (error) {
        next(error);
    }
});

// PUT /contacts/:id - Editar um contato
router.put('/:id', validate(contactSchema), async (req, res, next) => {
    const { id } = req.params;
    const { name, number } = req.body;
    const userId = req.user.userId;

    try {
        // Verifica se outro contato do mesmo usuário já tem o novo número
        const existingContact = await prisma.contact.findFirst({
            where: {
                number,
                userId,
                id: { not: parseInt(id) }, // Exclui o contato atual da verificação
            },
        });

        if (existingContact) {
            return res.status(409).json({ error: 'Você já possui outro contato com este número.' });
        }

        const { count } = await prisma.contact.updateMany({
            where: {
                id: parseInt(id),
                userId: userId, // Garante que o usuário só pode editar seus próprios contatos
            },
            data: { name, number },
        });

        if (count === 0) {
            return res.status(404).json({ error: 'Contato não encontrado ou não autorizado.' });
        }
        
        logger.info(`Contato ID ${id} atualizado para '${name}' (${number}) pelo usuário ${userId}.`);
        const updatedContact = await prisma.contact.findUnique({ where: { id: parseInt(id) } });
        res.status(200).json(updatedContact);

    } catch (error) {
        next(error);
    }
});

// DELETE /contacts/:id - Deletar um contato
router.delete('/:id', async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user.userId;

    try {
        const { count } = await prisma.contact.deleteMany({
            where: {
                id: parseInt(id),
                userId: userId, // Garante que um usuário só pode deletar seus próprios contatos
            },
        });
        
        if (count === 0) {
            return res.status(404).json({ error: 'Contato não encontrado ou não autorizado.' });
        }

        logger.info(`Contato ID ${id} removido pelo usuário ${userId}.`);
        res.status(204).send(); // Sucesso, sem conteúdo
    } catch (error) {
        next(error);
    }
});

module.exports = router;

// POST /contacts/bulk  { listId?, rows: [{...}], mapping: { name: 'Nome', number: 'Telefone'}, dedupePerList?: boolean }
router.post('/bulk', async (req, res, next) => {
    const userId = req.user.userId;
    const { listId, rows, mapping, dedupePerList } = req.body || {};
    if (!Array.isArray(rows) || !mapping || !mapping.number) {
        return res.status(400).json({ error: 'rows e mapping.number são obrigatórios.' });
    }
    try {
        const created = [];
        const updated = [];
        const skipped = [];
        const seenNumbers = new Set();
        const list = listId ? await prisma.contactList.findFirst({ where: { id: listId, userId } }) : null;
        if (listId && !list) return res.status(404).json({ error: 'Lista não encontrada.' });
        for (const r of rows) {
            let name = mapping.name ? r[mapping.name] : (r.name || '');
            let number = r[mapping.number] || r.number;
            if (!number) { skipped.push({ reason: 'missing_number', row: r }); continue; }
            // normalize
            try {
                const parsed = parsePhoneNumberFromString(String(number), 'BR');
                if (parsed && parsed.isValid()) number = parsed.number.replace('+','');
            } catch {}
            if (seenNumbers.has(number)) { skipped.push({ reason: 'duplicate_in_file', number }); continue; }
            seenNumbers.add(number);
            // find existing
            const existing = await prisma.contact.findFirst({ where: { userId, number } });
            if (existing) {
                // dedupe per list: connect only if not connected
                if (listId) {
                    await prisma.contactList.update({
                        where: { id: listId },
                        data: { contacts: { connect: { id: existing.id } } }
                    }).catch(()=>{});
                }
                // update name if provided and different
                if (name && existing.name !== name) {
                    await prisma.contact.update({ where: { id: existing.id }, data: { name } });
                    updated.push(number);
                } else {
                    skipped.push({ reason: 'existing_contact', number });
                }
                continue;
            }
            const contact = await prisma.contact.create({ data: { userId, name: name || '', number } });
            if (listId) {
                await prisma.contactList.update({ where: { id: listId }, data: { contacts: { connect: { id: contact.id } } } });
            }
            created.push(number);
        }
        res.json({ created: created.length, updated: updated.length, skipped });
    } catch (e) {
        next(e);
    }
});