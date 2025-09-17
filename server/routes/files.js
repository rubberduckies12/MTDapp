const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const Papa = require('papaparse');
const { Pool } = require('pg');
const { authenticate } = require('../middleware/authenticate');
const interpretSpreadsheet = require('../services/aiCategoriser'); // updated service

const router = express.Router();
const pool = new Pool(); // DB connection
const upload = multer({ storage: multer.memoryStorage() });

// --------------------
// POST /files/upload
// --------------------
router.post('/upload', authenticate, upload.single('file'), async (req, res) => {
  try {
    const userId = req.user.id;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    // Parse into raw rows (without assumptions)
    let rawRows;
    const ext = file.originalname.split('.').pop().toLowerCase();
    if (ext === 'csv') {
      rawRows = Papa.parse(file.buffer.toString(), { header: true }).data;
    } else if (ext === 'xlsx') {
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const firstSheet = workbook.SheetNames[0];
      rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: '' });
    } else {
      return res.status(400).json({ error: 'Only CSV or XLSX files are allowed' });
    }

    // Save file metadata
    const fileResult = await pool.query(
      `INSERT INTO files (user_id, original_name, mime_type, size, status, created_at)
       VALUES ($1, $2, $3, $4, $5, now()) RETURNING id`,
      [userId, file.originalname, file.mimetype, file.size, 'uploaded']
    );
    const fileId = fileResult.rows[0].id;

    // 🔥 Let AI interpret + categorise
    const transactions = await interpretSpreadsheet(rawRows);

    // Insert AI-interpreted transactions
    const insertPromises = transactions.map(t =>
      pool.query(
        `INSERT INTO transactions (user_id, file_id, date, description, amount, type, category_ai, category_user, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())`,
        [
          userId,
          fileId,
          t.date,
          t.description,
          t.amount,
          t.type,
          t.category_ai,
          null, // user verification pending
          t.status,
        ]
      )
    );

    await Promise.all(insertPromises);

    // Mark file as parsed
    await pool.query(`UPDATE files SET status = 'parsed' WHERE id = $1`, [fileId]);

    res.status(201).json({
      message: 'File uploaded, interpreted, and transactions stored',
      fileId,
      transactions,
    });
  } catch (err) {
    console.error('❌ Error uploading file:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --------------------
// GET /files
// --------------------
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, original_name, mime_type, size, status, created_at
       FROM files WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching files:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --------------------
// GET /files/:id
// --------------------
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const fileResult = await pool.query(
      `SELECT id, original_name, mime_type, size, status, created_at
       FROM files WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const transactionsResult = await pool.query(
      `SELECT id, date, description, amount, type, category_ai, category_user, status
       FROM transactions WHERE file_id = $1 AND user_id = $2`,
      [id, userId]
    );

    res.json({ file: fileResult.rows[0], transactions: transactionsResult.rows });
  } catch (err) {
    console.error('Error fetching file details:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --------------------
// DELETE /files/:id
// --------------------
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await pool.query('DELETE FROM transactions WHERE file_id = $1 AND user_id = $2', [id, userId]);
    await pool.query('DELETE FROM files WHERE id = $1 AND user_id = $2', [id, userId]);

    res.json({ message: 'File and associated transactions deleted successfully' });
  } catch (err) {
    console.error('Error deleting file:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
