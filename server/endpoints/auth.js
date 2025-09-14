const express = require('express');
const bcrypt = require('bcrypt');
const generateAuthToken = require('../assets/generateAuthToken');
const router = express.Router();

// Registration endpoint
router.post('/register', async (req, res) => {
	try {
		const pool = req.app.get('pool');
		const { first_name, last_name, email, password } = req.body;
		if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

		// Check for duplicate email
		const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
		if (existing.rows.length > 0) {
			return res.status(409).json({ error: 'Email already registered' });
		}

		// Hash password
		const password_hash = await bcrypt.hash(password, 10);

		// Insert user
		const result = await pool.query(
			`INSERT INTO users (first_name, last_name, email, password_hash, created_at, updated_at)
			 VALUES ($1, $2, $3, $4, now(), now()) RETURNING id, email`,
			[first_name, last_name, email, password_hash]
		);
		const user = result.rows[0];

		// Generate JWT
		const token = await generateAuthToken(user.id);
		res.cookie('token', token, {
			httpOnly: true,
			secure: true,
			sameSite: 'none',
			maxAge: 60 * 60 * 1000, // 1 hour
		});

		res.status(201).json({ success: true, user: { id: user.id, email: user.email } });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Registration failed' });
	}
});

// Login endpoint
router.post('/login', async (req, res) => {
	try {
		const pool = req.app.get('pool');
		const { email, password } = req.body;
		if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

		// Find user
		const result = await pool.query('SELECT id, email, password_hash FROM users WHERE email = $1', [email]);
		if (result.rows.length === 0) {
			return res.status(401).json({ error: 'Invalid credentials' });
		}
		const user = result.rows[0];

		// Check password
		const valid = await bcrypt.compare(password, user.password_hash);
		if (!valid) {
			return res.status(401).json({ error: 'Invalid credentials' });
		}

		// Generate JWT
		const token = await generateAuthToken(user.id);
		res.cookie('token', token, {
			httpOnly: true,
			secure: true,
			sameSite: 'none',
			maxAge: 60 * 60 * 1000, // 1 hour
		});

		res.json({ success: true, user: { id: user.id, email: user.email } });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Login failed' });
	}
});

module.exports = router;
