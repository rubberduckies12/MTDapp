const express = require('express');
const { Pool } = require('pg');
const { authenticate } = require('../middleware/authenticate');

const router = express.Router();
const pool = new Pool(); // Use your database connection pool

// --- Endpoints ---

// GET /transactions → List all transactions (with filters)
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { start_date, end_date, status, type } = req.query;

    let query = `SELECT id, date, description, amount, type, category_ai, category_user, status, created_at
                 FROM transactions WHERE user_id = $1`;
    const params = [userId];

    if (start_date) {
      query += ` AND date >= $${params.length + 1}`;
      params.push(start_date);
    }
    if (end_date) {
      query += ` AND date <= $${params.length + 1}`;
      params.push(end_date);
    }
    if (status) {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }
    if (type) {
      query += ` AND type = $${params.length + 1}`;
      params.push(type);
    }

    query += ` ORDER BY date DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching transactions:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /transactions/:id → Get details for a single transaction
router.get('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const transactionId = req.params.id;

    const result = await pool.query(
      `SELECT id, date, description, amount, type, category_ai, category_user, status, created_at
       FROM transactions WHERE id = $1 AND user_id = $2`,
      [transactionId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching transaction details:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /transactions → Create a new manual transaction
router.post('/', authenticate, async (req, res) => {
  const { date, description, amount, type, category_user } = req.body;

  try {
    const userId = req.user.id;

    const result = await pool.query(
      `INSERT INTO transactions (user_id, date, description, amount, type, category_user, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now()) RETURNING id`,
      [userId, date, description, amount, type, category_user, 'verified']
    );

    res.status(201).json({ message: 'Transaction created successfully', transactionId: result.rows[0].id });
  } catch (err) {
    console.error('Error creating transaction:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /transactions/:id → Update transaction fields
router.put('/:id', authenticate, async (req, res) => {
  const transactionId = req.params.id;
  const { date, description, amount, type, category_user } = req.body;

  try {
    const userId = req.user.id;

    const result = await pool.query(
      `UPDATE transactions
       SET date = $1, description = $2, amount = $3, type = $4, category_user = $5, updated_at = now()
       WHERE id = $6 AND user_id = $7 RETURNING id`,
      [date, description, amount, type, category_user, transactionId, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json({ message: 'Transaction updated successfully' });
  } catch (err) {
    console.error('Error updating transaction:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /transactions/:id/verify → Verify/update category
router.patch('/:id/verify', authenticate, async (req, res) => {
  const transactionId = req.params.id;
  const { category_user } = req.body;

  try {
    const userId = req.user.id;

    const result = await pool.query(
      `UPDATE transactions
       SET category_user = $1, status = $2, updated_at = now()
       WHERE id = $3 AND user_id = $4 RETURNING id`,
      [category_user, 'verified', transactionId, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json({ message: 'Transaction verified successfully' });
  } catch (err) {
    console.error('Error verifying transaction:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /transactions/:id → Delete a transaction
router.delete('/:id', authenticate, async (req, res) => {
  const transactionId = req.params.id;

  try {
    const userId = req.user.id;

    const result = await pool.query(
      `DELETE FROM transactions WHERE id = $1 AND user_id = $2 RETURNING id`,
      [transactionId, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json({ message: 'Transaction deleted successfully' });
  } catch (err) {
    console.error('Error deleting transaction:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /transactions/bulk-verify → Verify multiple transactions at once
router.post('/bulk-verify', authenticate, async (req, res) => {
  const { transactionIds, category_user } = req.body;

  try {
    const userId = req.user.id;

    const result = await pool.query(
      `UPDATE transactions
       SET category_user = $1, status = $2, updated_at = now()
       WHERE id = ANY($3) AND user_id = $4 RETURNING id`,
      [category_user, 'verified', transactionIds, userId]
    );

    res.json({ message: `${result.rowCount} transactions verified successfully` });
  } catch (err) {
    console.error('Error bulk verifying transactions:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
