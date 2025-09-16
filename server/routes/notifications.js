const express = require('express');
const { Pool } = require('pg');
const { authenticate } = require('../middleware/authenticate');
const emailer = require('../services/emailer'); // Service for sending emails
const scheduler = require('../services/scheduler'); // Service for scheduling notifications

const router = express.Router();
const pool = new Pool(); // Use your database connection pool

// --- Endpoints ---

// GET /notifications → List all notifications for the current user
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT id, type, message, sent_at, status, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /notifications/:id → Fetch details of a single notification
router.get('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;

    const result = await pool.query(
      `SELECT id, type, message, sent_at, status, created_at
       FROM notifications
       WHERE id = $1 AND user_id = $2`,
      [notificationId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching notification details:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /notifications/:id/resend → Resend a specific notification
router.post('/:id/resend', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;

    // Fetch the notification
    const result = await pool.query(
      `SELECT id, type, message, status
       FROM notifications
       WHERE id = $1 AND user_id = $2`,
      [notificationId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    const notification = result.rows[0];

    // Resend the notification
    if (notification.status === 'sent') {
      return res.status(400).json({ error: 'Notification has already been sent' });
    }

    await emailer.sendNotification(req.user.email, notification.message);

    // Update the notification status
    await pool.query(
      `UPDATE notifications
       SET status = 'sent', sent_at = now()
       WHERE id = $1`,
      [notificationId]
    );

    res.json({ message: 'Notification resent successfully' });
  } catch (err) {
    console.error('Error resending notification:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// (admin) POST /notifications/test → Send yourself a test notification
router.post('/test', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    // Send a test notification
    const testMessage = 'This is a test notification.';
    await emailer.sendNotification(req.user.email, testMessage);

    // Log the test notification in the database
    await pool.query(
      `INSERT INTO notifications (user_id, type, message, status, created_at)
       VALUES ($1, $2, $3, $4, now())`,
      [userId, 'test', testMessage, 'sent']
    );

    res.json({ message: 'Test notification sent successfully' });
  } catch (err) {
    console.error('Error sending test notification:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
