const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');

const router = express.Router();

// Use memory storage for multer
const upload = multer({ storage: multer.memoryStorage() });

// Dummy AI categorization function (replace with your actual implementation)
async function categorizeTransactions(rows) {
  // Example: assign 'uncategorized' to all
  return rows.map(row => ({ ...row, hmrc_category: 'uncategorized' }));
}

// POST /upload
router.post('/', upload.single('file'), async (req, res) => {
  try {
    const userId = req.user.id; // Assumes authentication middleware sets req.user
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    // Only accept CSV or XLSX
    const ext = file.originalname.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx'].includes(ext)) {
      return res.status(400).json({ error: 'Only CSV or XLSX files are allowed' });
    }

    // Parse spreadsheet in memory
    let workbook;
    if (ext === 'csv') {
      workbook = XLSX.read(file.buffer, { type: 'buffer', codepage: 65001 });
    } else {
      workbook = XLSX.read(file.buffer, { type: 'buffer' });
    }
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    // Send rows to AI categorization
    const categorizedRows = await categorizeTransactions(rows);


    // Use pooled connection from app
    const pool = req.app.get('pool');
    const insertPromises = categorizedRows.map(row =>
      pool.query(
        `INSERT INTO transactions (user_id, type, category, hmrc_category, description, amount, transaction_date, verified, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now()) RETURNING *`,
        [
          userId,
          row.type || null,
          row.category || null,
          row.hmrc_category || null,
          row.description || null,
          row.amount || null,
          row.transaction_date || null,
          false
        ]
      )
    );
    await Promise.all(insertPromises);

    // Optionally, record the upload event (not file/metadata)
    // await pool.query('INSERT INTO uploads (user_id, uploaded_at) VALUES ($1, now())', [userId]);

    res.json({
      success: true,
      transactions: categorizedRows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

module.exports = router;