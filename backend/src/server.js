const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth.routes');
const productosRoutes = require('./routes/productos.routes'); 
const ventasRoutes = require('./routes/ventas.routes');
const ticketsRoutes = require('./routes/tickets.routes');
const paymentsRoutes = require('./routes/payments.routes');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/ventas', ventasRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/productos', productosRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/payments', paymentsRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo`);
});