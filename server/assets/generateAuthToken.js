// generateAuthToken.js
// Utility to generate JWT and set as HTTP-only cookie

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
const COOKIE_NAME = 'auth_token';
const COOKIE_OPTIONS = {
	httpOnly: true,
	secure: process.env.NODE_ENV === 'production',
	sameSite: 'strict',
	maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
};

/**
 * Generates a JWT for the user and sets it as a cookie on the response.
 * @param {Object} res - Express response object
 * @param {Object} user - User object (must have id)
 */
function generateAuthToken(res, user) {
	const payload = { id: user.id, email: user.email };
	const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
	res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
	return token;
}

module.exports = generateAuthToken;
