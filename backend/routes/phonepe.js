const express = require('express');
const router = express.Router();
const axios = require('axios');
const { Buffer } = require('node:buffer');
const { generateOrderId, generateChecksum } = require('../utils/phonepeHelper');
const Payment = require('../models/Payment');
const crypto = require('crypto');

// Use environment variables for credentials
const PHONEPE_MERCHANT_ID = process.env.PHONEPE_MERCHANT_ID ;
const PHONEPE_BASE_URL = process.env.PHONEPE_BASE_URL;
const PHONEPE_STATUS_URL = process.env.PHONEPE_STATUS_URL ;
const PHONEPE_SALT_KEY = process.env.PHONEPE_SALT_KEY ;



// Add a new GET /webhook-status/:orderId route that returns the payment status from the DB only
router.get('/webhook-status/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        if (!orderId) {
            return res.status(400).json({
                success: false,
                status: 'FAILED',
                message: 'Missing orderId'
            });
        }
        const payment = await Payment.findOne({ orderId });
        if (!payment) {
            return res.status(404).json({
                success: false,
                status: 'FAILED',
                message: 'Payment not found'
            });
        }
        
        console.log('[PHONEPE][WEBHOOK-STATUS] Payment record:', {
            orderId: payment.orderId,
            paid: payment.paid,
            used: payment.used,
            amount: payment.amount,
            timestamp: payment.timestamp
        });
        
        let status = 'PROCESSING';
        if (payment.paid === true) {
            status = 'SUCCESS';
        } else if (payment.paid === false) {
            // If payment is explicitly marked as not paid, it's failed
            // If payment.paid is undefined/null, it's still processing
            status = payment.paid === false ? 'FAILED' : 'PROCESSING';
        }
        
        console.log('[PHONEPE][WEBHOOK-STATUS] Determined status:', status);
        
        res.json({
            success: true,
            status,
            orderId,
            amount: payment.amount,
            patientId: payment.patientId,
            dermatologistId: payment.dermatologistId,
            message: `Payment status: ${status}`
        });
    } catch (error) {
        console.error('[PHONEPE][WEBHOOK-STATUS] Error:', error);
        res.status(500).json({
            success: false,
            status: 'FAILED',
            message: 'Error checking payment status',
            error: error.message
        });
    }
});

// Add a POST /status route for checking payment status via PhonePe's GET /pg/v1/status/{merchantId}/{merchantTransactionId} endpoint
router.post('/status', async (req, res) => {
    try {
        const merchantTransactionId = req.query.id;
        const merchantId = process.env.PHONEPE_MERCHANT_ID;
        const salt_key = process.env.PHONEPE_SALT_KEY;
        const keyIndex = 1;
        if (!merchantTransactionId || !merchantId || !salt_key) {
            return res.status(400).json({ error: 'Missing required parameters or environment variables.' });
        }
        const path = `/pg/v1/status/${merchantId}/${merchantTransactionId}`;
        const string = path + salt_key;
        const sha256 = crypto.createHash('sha256').update(string).digest('hex');
        const checksum = sha256 + '###' + keyIndex;
        const options = {
            method: 'GET',
            url: `${process.env.PHONEPE_STATUS_URL}${path}`,
            headers: {
                accept: 'application/json',
                'Content-Type': 'application/json',
                'X-VERIFY': checksum,
                'X-MERCHANT-ID': merchantId
            }
        };
        // CHECK PAYMENT STATUS
        axios.request(options).then(async (response) => {
            if (response.data.success === true) {
                const url = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/success`;
                return res.redirect(url);
            } else {
                const url = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/failure`;
                return res.redirect(url);
            }
        }).catch((error) => {
            console.error(error);
            res.status(500).json({ error: 'Error checking payment status', details: error.message });
        });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Webhook endpoint for PhonePe payment status updates
router.post('/webhook', async (req, res) => {
  try {
    console.log('[PHONEPE][WEBHOOK] Webhook received:', {
      headers: req.headers,
      body: req.body
    });

    // Validate Authorization header
    const authHeader = req.headers['authorization'];
    const username = process.env.PHONEPE_WEBHOOK_USERNAME;
    const password = process.env.PHONEPE_WEBHOOK_PASSWORD;
    const expectedHash = crypto.createHash('sha256').update(`${username}:${password}`).digest('hex');
    
    console.log('[PHONEPE][WEBHOOK] Auth validation:', {
      hasAuthHeader: !!authHeader,
      hasUsername: !!username,
      hasPassword: !!password,
      authMatch: authHeader === expectedHash
    });

    if (!authHeader || authHeader !== expectedHash) {
      console.warn('[PHONEPE][WEBHOOK] Invalid Authorization header');
      return res.status(401).send('Unauthorized');
    }

    // Extract event and payload
    const event = req.body.event;
    const payload = req.body.payload;
    console.log('[PHONEPE][WEBHOOK] Extracted data:', { event, payload });

    if (!event || !payload || !payload.orderId || !payload.state) {
      console.warn('[PHONEPE][WEBHOOK] Malformed webhook payload:', req.body);
      return res.status(400).send('Malformed payload');
    }

    const orderId = payload.orderId;
    const merchantOrderId = payload.merchantOrderId;
    const state = payload.state;
    console.log('[PHONEPE][WEBHOOK] Processing payment:', { orderId, merchantOrderId, state });

    // Find payment in DB by merchantOrderId (our orderId)
    const payment = await Payment.findOne({ orderId: merchantOrderId });
    console.log('[PHONEPE][WEBHOOK] Payment found in DB:', payment);

    if (!payment) {
      console.warn(`[PHONEPE][WEBHOOK] No payment found for merchantOrderId: ${merchantOrderId}`);
      return res.status(404).send('Payment not found');
    }

    // Update payment status based on payload.state
    if (state === 'COMPLETED') {
      payment.paid = true;
      await payment.save();
      console.log(`[PHONEPE][WEBHOOK] Payment marked as PAID for merchantOrderId: ${merchantOrderId}`);
    } else if (state === 'FAILED' || state === 'CANCELLED' || state === 'EXPIRED') {
      payment.paid = false;
      await payment.save();
      console.log(`[PHONEPE][WEBHOOK] Payment marked as FAILED for merchantOrderId: ${merchantOrderId}`);
    } else {
      console.log(`[PHONEPE][WEBHOOK] Payment state "${state}" for merchantOrderId: ${merchantOrderId} - no action taken`);
    }

    console.log('[PHONEPE][WEBHOOK] Webhook processed successfully');
    res.status(200).send('OK');
  } catch (err) {
    console.error('[PHONEPE][WEBHOOK] Error handling webhook:', err);
    res.status(500).send('Error');
  }
});

// Manual payment status update endpoint for debugging
router.post('/manual-update-status', async (req, res) => {
    try {
        const { orderId, paid } = req.body;
        if (!orderId || typeof paid !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'Missing orderId or paid status'
            });
        }
        
        const payment = await Payment.findOne({ orderId });
        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Payment not found'
            });
        }
        
        payment.paid = paid;
        await payment.save();
        
        console.log(`[PHONEPE][MANUAL-UPDATE] Payment ${orderId} manually marked as paid: ${paid}`);
        
        res.json({
            success: true,
            message: `Payment ${orderId} updated to paid: ${paid}`,
            payment: {
                orderId: payment.orderId,
                paid: payment.paid,
                used: payment.used,
                amount: payment.amount
            }
        });
    } catch (error) {
        console.error('[PHONEPE][MANUAL-UPDATE] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating payment status',
            error: error.message
        });
    }
});

module.exports = router; 