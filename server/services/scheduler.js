const { Pool } = require('pg');
const cron = require('node-cron');
const { sendNotification } = require('./emailer');

const pool = new Pool();

// Run daily at 9 AM
cron.schedule('0 9 * * *', async () => {
  console.log('⏰ Running daily reminder scheduler...');
  await sendDeadlineReminders();
});

async function sendDeadlineReminders() {
  try {
    // Find users with submissions due in the next 7 days and not yet submitted
    const result = await pool.query(`
      SELECT u.id AS user_id, u.email, s.period_end
      FROM users u
      JOIN submissions s ON u.id = s.user_id
      WHERE s.status = 'pending'
        AND s.period_end >= CURRENT_DATE
        AND s.period_end <= CURRENT_DATE + INTERVAL '7 days'
    `);

    for (const row of result.rows) {
      const { user_id, email, period_end } = row;
      const deadline = period_end.toISOString().split('T')[0];

      // Send reminder email
      const sendResult = await sendNotification(email, 'deadline_reminder', { deadline });

      // Log notification attempt
      await pool.query(
        `INSERT INTO notifications (user_id, type, message, status, sent_at, created_at)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [
          user_id,
          'deadline_reminder',
          `Reminder: MTD submission due by ${deadline}`,
          sendResult.success ? 'sent' : 'failed',
          sendResult.success ? new Date() : null
        ]
      );
    }
  } catch (err) {
    console.error('❌ Scheduler error:', err.message);
  }
}

module.exports = {
  sendDeadlineReminders
};