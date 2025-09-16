const express = require('express');
const { Pool } = require('pg');
const { authenticate } = require('../middleware/authenticate');
const hmrcApi = require('../services/hmrcAPI'); // Service for interacting with HMRC API

const router = express.Router();
const pool = new Pool(); // Use your database connection pool

// --- Endpoints ---

// GET /submissions → List all submissions for the current user
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT id, period_start, period_end, type, status, submitted_at, created_at
       FROM submissions
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching submissions:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /submissions/:id → Get one submission + HMRC response
router.get('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const submissionId = req.params.id;

    const result = await pool.query(
      `SELECT id, period_start, period_end, type, status, payload, hmrc_response, submitted_at, created_at
       FROM submissions
       WHERE id = $1 AND user_id = $2`,
      [submissionId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching submission details:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /submissions → Create a new submission (aggregate + send)
router.post('/', authenticate, async (req, res) => {
  const { period_start, period_end, type } = req.body;

  try {
    const userId = req.user.id;

    // Aggregate verified transactions for the given period
    const transactionsResult = await pool.query(
      `SELECT date, description, amount, type, category_user
       FROM transactions
       WHERE user_id = $1 AND status = 'verified' AND date BETWEEN $2 AND $3`,
      [userId, period_start, period_end]
    );

    const transactions = transactionsResult.rows;

    if (transactions.length === 0) {
      return res.status(400).json({ error: 'No verified transactions found for the given period' });
    }

    // Build HMRC-compliant payload
    const payload = {
      period_start,
      period_end,
      transactions,
    };

    // Call HMRC API to send submission
    const hmrcResponse = await hmrcApi.submit(payload, userId);

    // Store request + response in the submissions table
    const submissionResult = await pool.query(
      `INSERT INTO submissions (user_id, period_start, period_end, type, payload, hmrc_response, status, submitted_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
       RETURNING id`,
      [userId, period_start, period_end, type, payload, hmrcResponse, 'accepted']
    );

    const submissionId = submissionResult.rows[0].id;

    res.status(201).json({ message: 'Submission created successfully', submissionId });
  } catch (err) {
    console.error('Error creating submission:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /submissions/:id/retry → Retry failed submission
router.post('/:id/retry', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const submissionId = req.params.id;

    // Fetch the failed submission
    const result = await pool.query(
      `SELECT id, payload, status
       FROM submissions
       WHERE id = $1 AND user_id = $2`,
      [submissionId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    const submission = result.rows[0];

    if (submission.status !== 'failed') {
      return res.status(400).json({ error: 'Only failed submissions can be retried' });
    }

    // Retry the submission
    const hmrcResponse = await hmrcApi.submit(submission.payload, userId);

    // Update the submission status and response
    await pool.query(
      `UPDATE submissions
       SET hmrc_response = $1, status = $2, submitted_at = now(), updated_at = now()
       WHERE id = $3`,
      [hmrcResponse, 'accepted', submissionId]
    );

    res.json({ message: 'Submission retried successfully' });
  } catch (err) {
    console.error('Error retrying submission:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /submissions/:id/status → Fetch status only (lightweight)
router.get('/:id/status', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const submissionId = req.params.id;

    const result = await pool.query(
      `SELECT id, status
       FROM submissions
       WHERE id = $1 AND user_id = $2`,
      [submissionId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    res.json({ status: result.rows[0].status });
  } catch (err) {
    console.error('Error fetching submission status:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;