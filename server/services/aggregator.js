/**
 * Aggregates verified transactions by period and type for HMRC MTD submissions.
 * @param {Array} transactions - Array of verified transaction objects.
 * @param {Object} options - { periodStartDate, periodEndDate, submissionType }
 * @returns {Object} - Aggregated payload matching HMRC API format.
 */
function aggregateForHMRC(transactions, { periodStartDate, periodEndDate, submissionType }) {
  // Filter transactions within the period and verified
  const filtered = transactions.filter(tx =>
    tx.status === 'verified' &&
    tx.date >= periodStartDate &&
    tx.date <= periodEndDate
  );

  // Group and sum by HMRC category
  const income = {};
  const expenses = {};

  filtered.forEach(tx => {
    if (tx.type === 'income') {
      // Example: group all income under 'turnover'
      income.turnover = (income.turnover || 0) + Number(tx.amount);
    } else if (tx.type === 'expense') {
      // Group by HMRC expense category
      const key = tx.hmrc_category || 'otherExpenses';
      expenses[key] = (expenses[key] || 0) + Number(tx.amount);
    }
  });

  // Prepare payload structure based on submission type
  const payload = {
    periodStartDate,
    periodEndDate,
    income,
    expenses
  };

  // Add submission type specific fields if needed
  if (submissionType === 'eops') {
    payload.eopsDeclaration = true;
  } else if (submissionType === 'final_declaration') {
    payload.finalDeclaration = true;
  }

  return payload;
}

module.exports = { aggregateForHMRC };
