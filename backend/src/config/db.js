const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    family: 4
});

pool.on('connect', () => {
    console.log('Base de datos conectada exitosamente a Supabase');
});

module.exports = pool;