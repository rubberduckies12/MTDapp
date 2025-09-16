const express = require('express');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const { authenticate } = require('../middleware/authenticate');
const generateAuthToken = require('../utils/generateAuthToken');
const axios = require('axios');

const router = express.Router();
const pool = new Pool(); // Use your database connection pool

// --- User Authentication ---

// POST /auth/register → Create account
router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;

  try {
    // Check if email already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already in use' });
    }

    // Hash the password
    const passwordHash = await bcrypt.hash(password, 10);

    // Insert new user into the database
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name, created_at, updated_at)
       VALUES ($1, $2, $3, now(), now()) RETURNING id, email, name, role`,
      [email, passwordHash, name]
    );

    const user = result.rows[0];
    res.status(201).json({ message: 'User registered successfully', user });
  } catch (err) {
    console.error('Error during registration:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/login → Verify password, issue JWT
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Find user by email
    const result = await pool.query('SELECT id, email, password_hash, name, role FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT using external utility
    const token = await generateAuthToken(user.id);

    // Set JWT in HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 60 * 60 * 1000, // 1 hour
    });

    res.json({ message: 'Login successful', user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    console.error('Error during login:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/logout → Clear JWT cookie
router.post('/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, secure: true, sameSite: 'none' });
  res.json({ message: 'Logout successful' });
});

// GET /auth/me → Return current user profile (requires auth middleware)
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = req.user; // `authenticate` middleware attaches user to req
    res.json({ user });
  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- HMRC OAuth ---

// GET /auth/hmrc → Redirect user to HMRC’s OAuth2 consent page
router.get('/hmrc', (req, res) => {
  const clientId = process.env.HMRC_CLIENT_ID;
  const redirectUri = process.env.HMRC_REDIRECT_URI;
  const scope = 'read:vat write:vat';
  const state = 'random_state_string'; // Replace with a secure random string

  const authUrl = `https://test-api.service.hmrc.gov.uk/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
  res.redirect(authUrl);
});

// GET /auth/hmrc/callback → Handle OAuth redirect, exchange code for tokens, save tokens in DB
router.get('/hmrc/callback', async (req, res) => {
  const { code, state } = req.query;

  try {
    const tokenResponse = await axios.post('https://test-api.service.hmrc.gov.uk/oauth/token', null, {
      params: {
        client_id: process.env.HMRC_CLIENT_ID,
        client_secret: process.env.HMRC_CLIENT_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: process.env.HMRC_REDIRECT_URI,
        code,
      },
    });

    const { access_token, refresh_token, expires_in, scope } = tokenResponse.data;

    // Save tokens in the database
    await pool.query(
      `INSERT INTO hmrc_tokens (user_id, access_token, refresh_token, expires_at, scope, created_at, updated_at)
       VALUES ($1, $2, $3, now() + interval '${expires_in} seconds', $4, now(), now())
       ON CONFLICT (user_id) DO UPDATE SET
       access_token = $2, refresh_token = $3, expires_at = now() + interval '${expires_in} seconds', scope = $4, updated_at = now()`,
      [req.user.id, access_token, refresh_token, scope]
    );

    res.json({ message: 'HMRC account connected successfully' });
  } catch (err) {
    console.error('Error during HMRC OAuth callback:', err);
    res.status(500).json({ error: 'Failed to connect HMRC account' });
  }
});

// GET /auth/hmrc/status → Check if user has connected HMRC
router.get('/hmrc/status', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM hmrc_tokens WHERE user_id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ connected: false });
    }

    const token = result.rows[0];
    const isTokenValid = new Date(token.expires_at) > new Date();

    res.json({ connected: true, valid: isTokenValid });
  } catch (err) {
    console.error('Error checking HMRC connection status:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;