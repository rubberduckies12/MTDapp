const jwt = require('jsonwebtoken');

async function authenticate(req, res, next) {
    try {
        const token = req.cookies.token;
        if (!token) return res.status(401).json({ error: 'Authentication required' });

        // Synchronous verification
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Check user exists in DB
        const pool = req.app.get('pool');
        const result = await pool.query(
            'SELECT id, email, first_name, last_name FROM users WHERE id = $1',
            [decoded.id]
        );
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }

        req.user = result.rows[0]; // Attach user info to request
        next();
    } catch (err) {
        if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
        console.error('Error in authenticate middleware:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = authenticate;
