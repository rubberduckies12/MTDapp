const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { categorizeTransactions } = require('../../server/api/taxOpenAi'); // <-- Import AI function

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// POST /upload
router.post('/', upload.single('file'), async (req, res) => {
  try {
    const userId = req.user.id;
    const file = req.file;
    const { category } = req.body; // Accept category from request body

    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    // Validate category
    if (!['property', 'self_employed'].includes(category)) {
      return res.status(400).json({ error: 'Category must be "property" or "self_employed"' });
    }

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

    // Use OpenAI to categorize and format for HMRC, passing the category
    const categorizedRows = await categorizeTransactions(rows, category);

    // Store categorized transactions in DB
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

    // Respond with the HMRC-ready JSON
    res.json({
      success: true,
      transactions: categorizedRows // This is now formatted for HMRC
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

module.exports = router;