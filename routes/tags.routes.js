// routes/tags.routes.js
const express = require('express');
const { prisma } = require('../services/database');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();
router.use(authMiddleware);

// GET /tags
router.get('/', async (req, res, next) => {
  const userId = req.user.userId;
  try {
    const tags = await prisma.tag.findMany({ where: { userId }, orderBy: { name: 'asc' } });
    res.json(tags);
  } catch (e) { next(e); }
});

// POST /tags
router.post('/', async (req, res, next) => {
  const userId = req.user.userId;
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório.' });
  try {
    const tag = await prisma.tag.create({ data: { userId, name } });
    res.status(201).json(tag);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Já existe uma tag com este nome.' });
    next(e);
  }
});

// DELETE /tags/:id
router.delete('/:id', async (req, res, next) => {
  const userId = req.user.userId;
  const id = parseInt(req.params.id, 10);
  try {
    const del = await prisma.tag.deleteMany({ where: { id, userId } });
    if (del.count === 0) return res.status(404).json({ error: 'Tag não encontrada.' });
    res.status(204).send();
  } catch (e) { next(e); }
});

// POST /tags/:id/attach-contacts  body: { contactIds: number[] }
router.post('/:id/attach-contacts', async (req, res, next) => {
  const userId = req.user.userId;
  const id = parseInt(req.params.id, 10);
  const { contactIds } = req.body || {};
  if (!Array.isArray(contactIds) || contactIds.length === 0) return res.status(400).json({ error: 'contactIds é obrigatório.' });
  try {
    const tag = await prisma.tag.findFirst({ where: { id, userId } });
    if (!tag) return res.status(404).json({ error: 'Tag não encontrada.' });
    const operations = contactIds.map(cid => prisma.contactTag.upsert({
      where: { contactId_tagId: { contactId: cid, tagId: id } },
      update: {},
      create: { contactId: cid, tagId: id },
    }));
    await prisma.$transaction(operations);
    res.json({ attached: contactIds.length });
  } catch (e) { next(e); }
});

// POST /tags/:id/detach-contacts  body: { contactIds: number[] }
router.post('/:id/detach-contacts', async (req, res, next) => {
  const userId = req.user.userId;
  const id = parseInt(req.params.id, 10);
  const { contactIds } = req.body || {};
  if (!Array.isArray(contactIds) || contactIds.length === 0) return res.status(400).json({ error: 'contactIds é obrigatório.' });
  try {
    const tag = await prisma.tag.findFirst({ where: { id, userId } });
    if (!tag) return res.status(404).json({ error: 'Tag não encontrada.' });
    const del = await prisma.contactTag.deleteMany({ where: { tagId: id, contactId: { in: contactIds } } });
    res.json({ detached: del.count });
  } catch (e) { next(e); }
});

module.exports = router;


