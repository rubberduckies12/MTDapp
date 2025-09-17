require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const db = require('./utils/dbConnect');
const authenticate = require('./middleware/authenticate');

// Import routers
const authRouter = require('./routes/auth');
const filesRouter = require('./routes/files');
const transactionsRouter = require('./routes/transactions');
const submissionsRouter = require('./routes/submissions');
const notificationsRouter = require('./routes/notifications');

const app = express();
const PORT = process.env.PORT || 5000;

// --- CORS Whitelist ---
const whitelist = [
  "http://localhost:3000"
  // Add more domains as needed
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || whitelist.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// Attach db pool to app for use in routes
app.set("pool", db.pool);

// --- Public Routes ---
app.use('/auth', authRouter); // No authentication required for login/register

// --- Protected Routes ---
app.use('/files', authenticate, filesRouter);
app.use('/transactions', authenticate, transactionsRouter);
app.use('/submissions', authenticate, submissionsRouter);
app.use('/notifications', authenticate, notificationsRouter);

// --- Example Health Check ---
app.get('/', (req, res) => {
  res.send('MTDapp API is running');
});

// --- Catch-all route ---
app.get('*', (req, res) => res.status(404).send('Not Found'));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
