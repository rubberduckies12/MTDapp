const jwt = require('jsonwebtoken');

async function generateAuthToken(accountId) {
	try {
		const expiresIn = '1h';
		const token = jwt.sign({
			id: accountId
		}, process.env.AUTH_TOKEN_KEY, {
			expiresIn: expiresIn
		});

		return token;
	} catch(err) {
		console.error('Error generating auth token:', err);
		throw new Error('Failed to generate authentication token');
	}
}

const token = req.cookies.token;
if (!token) {
  return res.status(401).json({ error: 'Authentication required' });
}

module.exports = generateAuthToken;
