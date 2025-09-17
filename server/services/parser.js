const XLSX = require('xlsx');
const Papa = require('papaparse');

/**
 * Parses a file buffer and returns an array of raw rows.
 * Detects file type (CSV/XLSX) and uses the appropriate parser.
 * @param {Buffer} fileBuffer - The uploaded file buffer.
 * @param {string} originalName - The original filename (for extension).
 * @returns {Array} - Array of raw row objects (headers as in file).
 */
function parseFile(fileBuffer, originalName) {
  const ext = originalName.split('.').pop().toLowerCase();

  if (ext === 'csv') {
    // Parse CSV
    const result = Papa.parse(fileBuffer.toString(), { header: true, skipEmptyLines: true });
    return result.data;
  } else if (ext === 'xlsx') {
    // Parse XLSX
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
  } else {
    throw new Error('Unsupported file type. Only CSV and XLSX are allowed.');
  }
}

module.exports = { parseFile };