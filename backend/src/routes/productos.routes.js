const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM productos ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Error al obtener los productos' });
    }
});

router.post('/', async (req, res) => {
    const { nombre, descripcion, categoria, precio, costo, stock, stock_minimo, codigo_barras } = req.body;
    try {
        const query = `
            INSERT INTO productos (nombre, descripcion, categoria, precio, costo, stock, stock_minimo, codigo_barras)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *;
        `;
        const values = [nombre, descripcion, categoria, precio, costo, stock, stock_minimo || 5, codigo_barras];
        const result = await pool.query(query, values);
        
        res.status(201).json({ success: true, product: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(400).json({ success: false, error: 'Error al guardar el producto (revisa que el código de barras no esté duplicado)' });
    }
});

router.delete('/:id', async (req, res) => {
    const { id } = req.body.id || req.params;
    try {
        await pool.query('DELETE FROM productos WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Producto eliminado correctamente' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Error al eliminar el producto' });
    }
});

module.exports = router;