const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Categorize transactions using OpenAI GPT.
 * @param {Array} rows - Array of transaction objects from spreadsheet.
 * @returns {Promise<Array>} - Array of categorized transaction objects.
 */
async function categorizeTransactions(rows) {
  const prompt = `
You are a tax assistant for UK Making Tax Digital (MTD).
For each transaction, determine:
- type: 'income' or 'expense'
- category: a suitable business category (e.g., travel, office, marketing)
- hmrc_category: the best-fit HMRC MTD category (if possible)

Return an array of objects, each with all original fields plus 'type', 'category', and 'hmrc_category'.

Transactions:
${JSON.stringify(rows, null, 2)}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4.5-turbo", // Use GPT-4.5 Turbo model
    messages: [
      { role: "system", content: "You are a helpful assistant for UK tax categorization." },
      { role: "user", content: prompt }
    ],
    temperature: 0.2,
    max_tokens: 1500
  });

  // Try to extract JSON from the response
  let categorized;
  try {
    const content = response.choices[0].message.content;
    // Try to extract JSON from markdown code block if present
    const match = content.match(/```json([\s\S]*?)```/);
    if (match) {
      categorized = JSON.parse(match[1]);
    } else {
      categorized = JSON.parse(content);
    }
  } catch (e) {
    throw new Error("Failed to parse AI response: " + e.message);
  }

  return categorized;
}

module.exports = { categorizeTransactions };