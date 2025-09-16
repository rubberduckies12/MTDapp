const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { Pool } = require('pg');
const { authenticate } = require('../middleware/authenticate');
const { categorizeTransactions } = require('../services/aiCategoriser');

const router = express.Router();
const pool = new Pool(); // Use your database connection pool
const upload = multer({ storage: multer.memoryStorage() });

// --- Endpoints ---

// POST /files/upload → Upload & parse spreadsheet
router.post('/upload', authenticate, upload.single('file'), async (req, res) => {
  try {
    const userId = req.user.id;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    // Parse spreadsheet
    const ext = file.originalname.split('.').pop().toLowerCase();
    let rows;
    if (ext === 'csv') {
      const Papa = require('papaparse');
      rows = Papa.parse(file.buffer.toString(), { header: true }).data;
    } else if (ext === 'xlsx') {
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    } else {
      return res.status(400).json({ error: 'Only CSV or XLSX files are allowed' });
    }

    // Save file metadata in files table
    const fileResult = await pool.query(
      `INSERT INTO files (user_id, filename, original_name, mime_type, size, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, now()) RETURNING id`,
      [userId, file.filename, file.originalname, file.mimetype, file.size, 'uploaded']
    );
    const fileId = fileResult.rows[0].id;

    // Normalize rows and insert into transactions table
    const insertPromises = rows.map(async (row) => {
      const normalizedRow = {
        date: row.date || null,
        description: row.description || '',
        amount: parseFloat(row.amount) || 0,
        type: row.type?.toLowerCase() === 'income' ? 'income' : 'expense',
      };

      // Call AI categorizer for category suggestions
      const categoryAI = await categorizeTransactions([normalizedRow]);

      return pool.query(
        `INSERT INTO transactions (user_id, file_id, date, description, amount, type, category_ai, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
        [
          userId,
          fileId,
          normalizedRow.date,
          normalizedRow.description,
          normalizedRow.amount,
          normalizedRow.type,
          categoryAI[0]?.category_ai || null,
          'pending_verification',
        ]
      );
    });

    await Promise.all(insertPromises);

    res.status(201).json({ message: 'File uploaded and parsed successfully', fileId });
  } catch (err) {
    console.error('Error uploading file:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /files → List user’s uploaded files
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT id, original_name, mime_type, size, status, created_at
       FROM files WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching files:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /files/:id → Fetch details of one file + parsed transactions
router.get('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const fileId = req.params.id;

    // Fetch file details
    const fileResult = await pool.query(
      `SELECT id, original_name, mime_type, size, status, created_at
       FROM files WHERE id = $1 AND user_id = $2`,
      [fileId, userId]
    );

    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Fetch transactions linked to the file
    const transactionsResult = await pool.query(
      `SELECT id, date, description, amount, type, category_ai, category_user, status
       FROM transactions WHERE file_id = $1 AND user_id = $2`,
      [fileId, userId]
    );

    res.json({ file: fileResult.rows[0], transactions: transactionsResult.rows });
  } catch (err) {
    console.error('Error fetching file details:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /files/:id → Remove file + associated transactions
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const fileId = req.params.id;

    // Delete transactions and file
    await pool.query('DELETE FROM transactions WHERE file_id = $1 AND user_id = $2', [fileId, userId]);
    await pool.query('DELETE FROM files WHERE id = $1 AND user_id = $2', [fileId, userId]);

    res.json({ message: 'File and associated transactions deleted successfully' });
  } catch (err) {
    console.error('Error deleting file:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;