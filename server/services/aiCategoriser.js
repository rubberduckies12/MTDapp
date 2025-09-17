const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Categorizes and normalizes raw transaction rows using GPT-4.5.
 * @param {Array} rawRows - Messy rows from XLSX/CSV parser.
 * @returns {Promise<Array>} - Array of normalized transaction objects.
 */
async function categorizeTransactions(rawRows) {
  const prompt = `
You are a UK Making Tax Digital (MTD) assistant.

You will be given a list of raw transactions (messy headers, mixed data).
For each transaction, output a JSON object with these fields:
- date (YYYY-MM-DD or null)
- description (string)
- amount (number, 2 decimal places)
- type ("income" or "expense")
- category_ai (one of: travel, office, rent, repairs, wages, sales, utilities, professional_fees, interest, other)
- status ("pending_verification")

Strictly use only the allowed values for category_ai.
Output a valid JSON array only. No explanations, no markdown.

Transactions:
${JSON.stringify(rawRows, null, 2)}
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4.5-turbo",
      messages: [
        { role: "system", content: "You are a helpful assistant for UK tax categorization." },
        { role: "user", content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 1500
    });

    let content = response.choices[0].message.content.trim();

    // Defensive parsing: remove code fences, extract JSON array
    if (content.startsWith('```json')) {
      content = content.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (content.startsWith('```')) {
      content = content.replace(/^```/, '').replace(/```$/, '').trim();
    }
    const firstBracket = content.indexOf('[');
    const lastBracket = content.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1) {
      content = content.substring(firstBracket, lastBracket + 1);
    }

    let categorized = JSON.parse(content);
    if (!Array.isArray(categorized)) throw new Error("Parsed content is not an array");

    // Normalize outputs
    categorized = categorized.map(row => ({
      date: row.date
        ? new Date(row.date).toISOString().split('T')[0]
        : null,
      description: row.description || '',
      amount: Number(parseFloat(row.amount).toFixed(2)),
      type: row.type?.toLowerCase() === 'income' ? 'income' : 'expense',
      category_ai: [
        "travel", "office", "rent", "repairs", "wages", "sales", "utilities", "professional_fees", "interest", "other"
      ].includes(row.category_ai) ? row.category_ai : "other",
      status: "pending_verification"
    }));

    return categorized;
  } catch (e) {
    console.error("AI categorization failed:", e.message);
    return [];
  }
}

module.exports = { categorizeTransactions };