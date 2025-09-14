const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Categorize transactions using OpenAI GPT.
 * @param {Array} rows - Array of transaction objects from spreadsheet.
 * @returns {Promise<Array>} - Array of categorized transaction objects.
 */
async function categorizeTransactions(rows) {
  const prompt = `
You are a UK Making Tax Digital (MTD) assistant.

You will be given a list of raw transactions.  
For each transaction, output a JSON object with these fields:

- description (string)
- amount (number, 2 decimal places)
- transaction_date (YYYY-MM-DD or null)
- type ("income" or "expense")
- business_category (general label like "Repairs", "Travel", "Sales")
- hmrc_category (MUST be one of the following depending on context):

For self-employment:
[CostOfGoods, WagesAndStaffCosts, CarVanTravelExpenses, RentRatesPowerInsurance,
RepairsAndMaintenance, PhoneInternetOfficeCosts, AdvertisingMarketingEntertainment,
ProfessionalFees, InterestAndBankCharges, OtherAllowableBusinessExpenses]

For property:
[RentIncome, OtherPropertyIncome, RepairsAndMaintenance, LoanInterestAndOtherFinancialCosts,
LegalManagementOtherProfessionalFees, ServicesAndGroundRents, Insurance,
UtilitiesAndPropertyCharges, OtherPropertyExpenses]

For VAT:
[StandardRatedSales, ZeroRatedSales, ExemptSales, PurchasesWithVAT, PurchasesNoVAT]

⚠️ Output a valid JSON array only. No explanations, no markdown.

Transactions:
${JSON.stringify(rows, null, 2)}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4.5-turbo",
    messages: [
      { role: "system", content: "You are a helpful assistant for UK tax categorization." },
      { role: "user", content: prompt }
    ],
    temperature: 0.2,
    max_tokens: 1500
  });

  // Defensive parsing: handle code fences, extra text, and malformed JSON
  let categorized;
  try {
    let content = response.choices[0].message.content.trim();

    // Remove code fences if present
    if (content.startsWith('```json')) {
      content = content.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (content.startsWith('```')) {
      content = content.replace(/^```/, '').replace(/```$/, '').trim();
    }

    // Try to find the first JSON array in the response
    const firstBracket = content.indexOf('[');
    const lastBracket = content.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1) {
      content = content.substring(firstBracket, lastBracket + 1);
    }

    categorized = JSON.parse(content);
    if (!Array.isArray(categorized)) {
      throw new Error("Parsed content is not an array");
    }
  } catch (e) {
    throw new Error("Failed to parse AI response: " + e.message);
  }

  // Normalize outputs
  categorized = categorized.map(row => ({
    description: row.description || '',
    amount: Number(parseFloat(row.amount).toFixed(2)),
    transaction_date: row.transaction_date
      ? new Date(row.transaction_date).toISOString().split('T')[0]
      : null,
    type: row.type?.toLowerCase() === 'income' ? 'income' : 'expense',
    business_category: row.business_category || null,
    hmrc_category: row.hmrc_category || null
  }));

  return categorized;
}

module.exports = { categorizeTransactions };