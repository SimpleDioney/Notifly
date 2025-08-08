// routes/users.routes.js
const express = require('express');
const { prisma } = require('../services/database');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();
router.use(authMiddleware);

// PUT /users/preferences  { shortenerEnabled?: boolean }
router.put('/preferences', async (req, res, next) => {
  const userId = req.user.userId;
  const { shortenerEnabled } = req.body || {};
  try {
    await prisma.user.update({ where: { id: userId }, data: { shortenerEnabled: !!shortenerEnabled } });
    res.json({ message: 'Preferências atualizadas.' });
  } catch (e) { next(e); }
});

module.exports = router;


