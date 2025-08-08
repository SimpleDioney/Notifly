// routes/reports.routes.js
const express = require('express');
const { prisma } = require('../services/database');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();
router.use(authMiddleware);

// GET /reports/funnel?start&end
router.get('/funnel', async (req, res, next) => {
  const userId = req.user.userId;
  const { start, end } = req.query;
  const where = { userId };
  if (start) where.sentAt = { ...(where.sentAt || {}), gte: new Date(start) };
  if (end) where.sentAt = { ...(where.sentAt || {}), lte: new Date(end) };
  try {
    const [queued, sent, failed] = await Promise.all([
      prisma.message.count({ where: { ...where, status: 'queued' } }),
      prisma.message.count({ where: { ...where, status: 'sent' } }),
      prisma.message.count({ where: { ...where, status: 'failed' } }),
    ]);
    res.json({ queued, sent, failed });
  } catch (e) { next(e); }
});

// GET /reports/chips
router.get('/chips', async (req, res, next) => {
  const userId = req.user.userId;
  try {
    const byChip = await prisma.message.groupBy({ by: ['chipId'], where: { userId }, _count: { _all: true } });
    res.json(byChip);
  } catch (e) { next(e); }
});

// GET /reports/top-errors
router.get('/top-errors', async (req, res, next) => {
  const userId = req.user.userId;
  try {
    const failed = await prisma.message.findMany({ where: { userId, status: 'failed' }, select: { errorMessage: true }, take: 1000 });
    const counts = {};
    failed.forEach(f => { const k = f.errorMessage || 'Unknown'; counts[k] = (counts[k] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([error, count])=>({ error, count }));
    res.json(sorted);
  } catch (e) { next(e); }
});

// GET /reports/campaign-rates?templateName=...
router.get('/campaign-rates', async (req, res, next) => {
  const userId = req.user.userId;
  const { templateName } = req.query;
  try {
    const where = { userId };
    if (templateName) where.templateName = String(templateName);
    const total = await prisma.message.count({ where });
    const sent = await prisma.message.count({ where: { ...where, status: 'sent' } });
    const failed = await prisma.message.count({ where: { ...where, status: 'failed' } });
    res.json({ total, sent, failed, sentRate: total ? sent/total : 0, failRate: total ? failed/total : 0 });
  } catch (e) { next(e); }
});

module.exports = router;


