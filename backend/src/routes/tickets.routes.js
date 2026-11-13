const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM ventas ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Error al obtener los tickets' });
    }
});


router.post('/', async (req, res) => {

    res.status(201).json({ success: true, message: 'Ticket guardado correctamente' });
});

module.exports = router;