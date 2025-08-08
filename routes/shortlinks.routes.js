// routes/shortlinks.routes.js
const express = require('express');
const { prisma } = require('../services/database');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

// Redirect público
router.get('/s/:slug', async (req, res, next) => {
  const { slug } = req.params;
  try {
    const link = await prisma.shortLink.findUnique({ where: { slug } });
    if (!link) return res.status(404).send('Not found');
    await prisma.shortLink.update({ where: { id: link.id }, data: { clicks: { increment: 1 } } });
    res.redirect(link.targetUrl);
  } catch (e) { next(e); }
});

// Protegido
router.use(authMiddleware);

// GET /shortlinks
router.get('/', async (req, res, next) => {
  const userId = req.user.userId;
  try {
    const links = await prisma.shortLink.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    res.json(links);
  } catch (e) { next(e); }
});

// POST /shortlinks
router.post('/', async (req, res, next) => {
  const userId = req.user.userId;
  const { slug, targetUrl } = req.body || {};
  if (!slug || !targetUrl) return res.status(400).json({ error: 'slug e targetUrl são obrigatórios.' });
  try {
    const link = await prisma.shortLink.create({ data: { userId, slug, targetUrl } });
    res.status(201).json(link);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Slug já existe.' });
    next(e);
  }
});

// DELETE /shortlinks/:id
router.delete('/:id', async (req, res, next) => {
  const userId = req.user.userId;
  const id = parseInt(req.params.id, 10);
  try {
    const del = await prisma.shortLink.deleteMany({ where: { id, userId } });
    if (del.count === 0) return res.status(404).json({ error: 'Shortlink não encontrado.' });
    res.status(204).send();
  } catch (e) { next(e); }
});

module.exports = router;


