const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcrypt');

router.post('/register', async (req, res) => {
    const nombreVal = req.body.nombre || req.body.name; 
    const { username, email, password, rol } = req.body;
    
    try {
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        const query = `
            INSERT INTO usuarios (nombre, username, email, password_hash, rol)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, nombre, username, email, rol;
        `;
        const values = [nombreVal, username.toLowerCase(), email, passwordHash, rol || 'cajero'];
        const result = await pool.query(query, values);
        
        res.status(201).json({ success: true, user: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(400).json({ success: false, error: 'El usuario o correo ya existen' });
    }
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const query = `SELECT * FROM usuarios WHERE username = $1`;
        const result = await pool.query(query, [username.toLowerCase()]);

        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, error: 'Usuario o contraseña incorrectos' });
        }

        const user = result.rows[0];
        const match = await bcrypt.compare(password, user.password_hash);

        if (!match) {
            return res.status(401).json({ success: false, error: 'Usuario o contraseña incorrectos' });
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.nombre,
                username: user.username,
                email: user.email,
                role: user.rol
            },
            token: 'demo-token-jwt'
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Error en el servidor' });
    }
});

router.get('/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, nombre, username, email, rol FROM usuarios');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener usuarios' });
    }
});

module.exports = router;