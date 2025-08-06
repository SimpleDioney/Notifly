// middleware/admin.middleware.js

const adminMiddleware = (req, res, next) => {
    // req.user é populado pelo auth.middleware
    if (req.user && req.user.role === 'ADMIN') {
        next(); // O usuário é admin, pode prosseguir
    } else {
        res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
    }
};

module.exports = adminMiddleware;