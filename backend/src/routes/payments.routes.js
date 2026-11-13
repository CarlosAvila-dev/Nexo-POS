const express = require('express');
const router = express.Router();
const { MercadoPagoConfig, Preference } = require('mercadopago');

const client = new MercadoPagoConfig({ 
    accessToken: process.env.MP_ACCESS_TOKEN 
});

router.post('/charge', async (req, res) => {
    const { amount, method, external_reference, back_urls, notification_url } = req.body;
    
    try {
        const preference = new Preference(client);
        
        const result = await preference.create({
            body: {
                items: [
                    {
                        id: external_reference || 'NEXO-POS-TICKET',
                        title: 'Compra en Nexo POS',
                        quantity: 1,
                        unit_price: Number(amount),
                        currency_id: 'MXN'
                    }
                ],
                back_urls: back_urls || {
                    success: 'http://localhost:3000?pago=ok',
                    failure: 'http://localhost:3000?pago=error',
                    pending: 'http://localhost:3000?pago=pendiente'
                },
                auto_return: 'approved',
                external_reference: external_reference,
                notification_url: notification_url
            }
        });

        res.json({
            status: 'pending_redirect',
            redirectUrl: result.init_point, 
            reference: external_reference
        });

    } catch (err) {
        console.error('Error al crear preferencia en Mercado Pago:', err);
        res.status(500).json({ success: false, error: 'Error al conectar con la pasarela de pagos' });
    }
});

// Webhook confirmaciones asíncronas de Mercado Pago
router.post('/webhook', async (req, res) => {
    const query = req.query;
    try {
        if (query.topic === 'payment' || query.type === 'payment') {
            const paymentId = query['data.id'] || query.id;
            console.log(`Notificación de pago recibida ID: ${paymentId}`);
        }
        res.status(200).send('Webhook OK');
    } catch (err) {
        console.error('Error en webhook de MP:', err);
        res.status(500).send('Error');
    }
});

module.exports = router;