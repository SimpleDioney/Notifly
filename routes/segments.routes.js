// routes/segments.routes.js
const express = require('express');
const { prisma } = require('../services/database');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();
router.use(authMiddleware);

// GET /segments
router.get('/', async (req, res, next) => {
  const userId = req.user.userId;
  try {
    const segments = await prisma.segment.findMany({ where: { userId }, orderBy: { name: 'asc' } });
    res.json(segments);
  } catch (e) { next(e); }
});

// POST /segments
router.post('/', async (req, res, next) => {
  const userId = req.user.userId;
  const { name, type, filter, contactIds } = req.body || {};
  if (!name || !type) return res.status(400).json({ error: 'name e type são obrigatórios.' });
  try {
    const seg = await prisma.segment.create({ data: { userId, name, type, filter } });
    if (type === 'STATIC' && Array.isArray(contactIds) && contactIds.length > 0) {
      const ops = contactIds.map(cid => prisma.segmentMember.create({ data: { segmentId: seg.id, contactId: cid } }));
      await prisma.$transaction(ops);
    }
    res.status(201).json(seg);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Já existe um segmento com este nome.' });
    next(e);
  }
});

// PUT /segments/:id
router.put('/:id', async (req, res, next) => {
  const userId = req.user.userId;
  const id = parseInt(req.params.id, 10);
  const { name, type, filter, contactIds } = req.body || {};
  try {
    const updated = await prisma.segment.updateMany({ where: { id, userId }, data: { name, type, filter } });
    if (updated.count === 0) return res.status(404).json({ error: 'Segmento não encontrado.' });
    if (type === 'STATIC' && Array.isArray(contactIds)) {
      await prisma.segmentMember.deleteMany({ where: { segmentId: id } });
      if (contactIds.length > 0) {
        const ops = contactIds.map(cid => prisma.segmentMember.create({ data: { segmentId: id, contactId: cid } }));
        await prisma.$transaction(ops);
      }
    }
    res.json({ message: 'Segmento atualizado.' });
  } catch (e) { next(e); }
});

// DELETE /segments/:id
router.delete('/:id', async (req, res, next) => {
  const userId = req.user.userId;
  const id = parseInt(req.params.id, 10);
  try {
    const del = await prisma.segment.deleteMany({ where: { id, userId } });
    if (del.count === 0) return res.status(404).json({ error: 'Segmento não encontrado.' });
    res.status(204).send();
  } catch (e) { next(e); }
});

module.exports = router;


