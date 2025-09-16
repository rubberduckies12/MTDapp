// dbConnect.js
// PostgreSQL connection using pg and dotenv

const { Pool } = require('pg');
require('dotenv').config();


const pool = new Pool({
	user: process.env.PGUSER,
	host: process.env.PGHOST,
	database: process.env.PGDATABASE,
	password: process.env.PGPASSWORD,
	port: process.env.PGPORT,
});

pool.on('connect', () => {
	console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
	console.error('Unexpected error on idle client', err);
	process.exit(-1);
});

module.exports = {
	query: (text, params) => pool.query(text, params),
	pool,
};
