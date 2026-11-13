const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/', async (req, res) => {
    try {
        const query = `
            Ventas.*, usuarios.nombre as cajero_nombre 
            FROM ventas 
            LEFT JOIN usuarios ON ventas.usuario_id = usuarios.id 
            ORDER BY ventas.created_at DESC;
        `;
        
        const result = await pool.query('SELECT * FROM ventas ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Error al obtener las ventas' });
    }
});

router.post('/', async (req, res) => {
    const { usuario_id, folio, subtotal, descuento, iva, total, metodo_pago, tipo_venta, items } = req.body;
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN'); 

        const ventaQuery = `
            INSERT INTO ventas (folio, usuario_id, subtotal, descuento, iva, total, metodo_pago, tipo_venta)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id;
        `;
        const ventaValues = [folio, usuario_id, subtotal, descuento, iva, total, metodo_pago, tipo_venta];
        const ventaResult = await client.query(ventaQuery, ventaValues);
        const ventaId = ventaResult.rows[0].id;

        for (const item of items) {
            
            const detalleQuery = `
                INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario)
                VALUES ($1, $2, $3, $4);
            `;
            await client.query(detalleQuery, [ventaId, item.id, item.cantidad, item.precio_unitario]);

            const stockQuery = `
                UPDATE productos 
                SET stock = stock - $1 
                WHERE id = $2 AND stock >= $1;
            `;
            const stockResult = await client.query(stockQuery, [item.cantidad, item.id]);
            
            if (stockResult.rowCount === 0) {
                throw new Error(`Stock insuficiente o producto no encontrado (ID: ${item.id})`);
            }
        }

        await client.query('COMMIT'); 
        res.status(201).json({ 
            success: true, 
            message: 'Venta procesada y stock actualizado con éxito', 
            folio 
        });

    } catch (err) {
        await client.query('ROLLBACK'); 
        console.error('Error crítico en la venta (Rollback aplicado):', err.message);
        res.status(400).json({ success: false, error: err.message });
    } finally {
        client.release(); 
    }
});

module.exports = router;