const nodemailer = require('nodemailer');

// Setup transporter (using SMTP)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT || 587,
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Send an email
 *
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - HTML body
 * @param {string} [text] - Plaintext fallback
 */
async function sendEmail(to, subject, html, text = '') {
  try {
    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM || '"MTD SaaS" <no-reply@mtdapp.com>',
      to,
      subject,
      text,
      html,
    });

    console.log(`📧 Email sent to ${to}: ${info.messageId}`);
    return { success: true, id: info.messageId };
  } catch (err) {
    console.error('❌ Email send failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Compose and send a templated notification email
 *
 * @param {string} to - Recipient email
 * @param {string} type - Notification type ("deadline_reminder", "submission_success", "submission_failure")
 * @param {Object} data - Data to inject into template
 */
async function sendNotification(to, type, data = {}) {
  let subject, html, text;

  switch (type) {
    case 'deadline_reminder':
      subject = `Reminder: MTD submission due ${data.deadline}`;
      html = `<p>Hello,</p>
              <p>This is a friendly reminder that your MTD submission is due by <b>${data.deadline}</b>.</p>
              <p>Please log in to your dashboard to review and submit.</p>`;
      text = `Reminder: Your MTD submission is due by ${data.deadline}.`;
      break;

    case 'submission_success':
      subject = `✅ Submission Accepted by HMRC`;
      html = `<p>Your submission for the period <b>${data.period}</b> was <b>accepted</b> by HMRC.</p>`;
      text = `Submission accepted for period ${data.period}`;
      break;

    case 'submission_failure':
      subject = `⚠️ Submission Failed — Action Required`;
      html = `<p>Your submission for the period <b>${data.period}</b> failed.</p>
              <p>Error: ${data.error || 'Unknown issue'}</p>
              <p>Please log in and retry.</p>`;
      text = `Submission failed for period ${data.period}. Error: ${data.error}`;
      break;

    default:
      subject = 'MTD Notification';
      html = `<p>${data.message || 'Notification from MTD SaaS'}</p>`;
      text = data.message || 'Notification from MTD SaaS';
  }

  return sendEmail(to, subject, html, text);
}

module.exports = {
  sendEmail,
  sendNotification,
};