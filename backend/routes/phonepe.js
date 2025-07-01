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


// Initiate PhonePe payment
router.post('/initiate', async (req, res) => {
    try {
        console.log('[PHONEPE][INITIATE] Request received:', req.body);
        
        const { amount, patientId, dermatologistId } = req.body;
        if (!amount || !patientId || !dermatologistId) {
            console.warn('[PHONEPE][INITIATE] Missing required fields:', { amount, patientId, dermatologistId });
            return res.status(400).json({ error: 'Missing required fields: amount, patientId, dermatologistId' });
        }

        const orderId = generateOrderId();
        console.log('[PHONEPE][INITIATE] Generated orderId:', orderId);

        const paymentPayload = {
            merchantId: PHONEPE_MERCHANT_ID,
            merchantTransactionId: orderId,
            merchantUserId: patientId,
            amount: parseFloat(amount) * 100, // in paise
            redirectUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/#/payment-status?orderId=${orderId}&patientId=${patientId}&dermatologistId=${dermatologistId}`,
            callbackUrl: `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/phonepe/webhook`,
            paymentInstrument: { type: 'PAY_PAGE' }
        };

        console.log('[PHONEPE][INITIATE] Payment payload:', paymentPayload);

        const payloadBase64 = Buffer.from(JSON.stringify(paymentPayload), 'utf8').toString('base64');
        const checksum = await generateChecksum(payloadBase64, '/pg/v1/pay', PHONEPE_SALT_KEY);

        const options = {
            method: 'POST',
            url: PHONEPE_BASE_URL,
            headers: {
                accept: 'application/json',
                'Content-Type': 'application/json',
                'X-VERIFY': checksum
            },
            data: { request: payloadBase64 }
        };

        console.log('[PHONEPE][INITIATE] Making request to PhonePe...');
        const response = await axios.request(options);
        
        console.log('[PHONEPE][INITIATE] PhonePe response received:', {
            success: response.data?.success,
            code: response.data?.code,
            message: response.data?.message
        });

        if (response.data && response.data.success && response.data.data && response.data.data.instrumentResponse) {
            // Save payment initiation in DB
            const payment = await Payment.create({ 
                patientId, 
                dermatologistId, 
                orderId,
                amount: parseFloat(amount),
                paid: false, 
                used: false 
            });
            
            console.log('[PHONEPE][INITIATE] Payment record created:', payment._id);

            res.status(200).json({
                success: true,
                url: response.data.data.instrumentResponse.redirectInfo.url,
                orderId,
                message: 'Payment initiated successfully'
            });
        } else {
            console.error('[PHONEPE][INITIATE] PhonePe response error:', response.data);
            res.status(500).json({ 
                success: false,
                error: 'Failed to initiate payment',
                details: response.data?.message || 'Unknown error'
            });
        }
    } catch (error) {
        console.error('[PHONEPE][INITIATE] Error:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Payment initiation failed',
            message: error.message 
        });
    }
});

// Check PhonePe payment status (Hermes/legacy style)
router.get('/status/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        console.log('[PHONEPE][STATUS] Checking status for orderId:', orderId);
        
        if (!orderId) {
            console.warn('[PHONEPE][STATUS] Missing orderId');
            return res.status(400).json({ 
                success: false,
                status: 'FAILED', 
                message: 'Missing orderId' 
            });
        }

        // First check if we have this payment in our database
        const payment = await Payment.findOne({ orderId });
        console.log('[PHONEPE][STATUS] Payment from DB:', payment);
        if (!payment) {
            console.warn('[PHONEPE][STATUS] Payment not found in database for orderId:', orderId);
            return res.status(404).json({ 
                success: false,
                status: 'FAILED', 
                message: 'Payment not found' 
            });
        }

        // Use PhonePe Hermes API to get order status (POST request)
        const statusPayload = {
            merchantId: PHONEPE_MERCHANT_ID,
            merchantTransactionId: orderId
        };

        const statusPayloadBase64 = Buffer.from(JSON.stringify(statusPayload), 'utf8').toString('base64');
        const statusChecksum = await generateChecksum(statusPayloadBase64, '/pg/v1/status', PHONEPE_SALT_KEY);

        const statusOptions = {
            method: 'POST',
            url: `${PHONEPE_STATUS_URL}/pg/v1/status`,
            headers: {
                accept: 'application/json',
                'Content-Type': 'application/json',
                'X-VERIFY': statusChecksum
            },
            data: { request: statusPayloadBase64 }
        };

        console.log('[PHONEPE][STATUS] Making POST status request to PhonePe Hermes...', statusOptions.url);
        const response = await axios.request(statusOptions);
        console.log('[PHONEPE][STATUS] Full PhonePe response:', response.data);
        
        if (response.data && response.data.success && response.data.data) {
            const phonepeState = response.data.data.state;
            console.log('[PHONEPE][STATUS] PhonePe state:', phonepeState);
            let status = 'PROCESSING';
            
            if (phonepeState === 'SUCCESS' || phonepeState === 'COMPLETED') {
                status = 'SUCCESS';
                // Update payment record if successful
                if (!payment.paid) {
                    console.log('[PHONEPE][STATUS] Marking payment as paid. Before update:', payment);
                    payment.paid = true;
                    await payment.save();
                    console.log('[PHONEPE][STATUS] Payment after update:', payment);
                }
            } else if (phonepeState === 'FAILED' || phonepeState === 'CANCELLED' || phonepeState === 'EXPIRED') {
                status = 'FAILED';
            }

            res.json({ 
                success: true,
                status, 
                orderId,
                amount: payment.amount,
                patientId: payment.patientId,
                dermatologistId: payment.dermatologistId,
                message: `Payment status: ${status}`
            });
        } else {
            console.error('[PHONEPE][STATUS] PhonePe status response error:', response.data);
            res.status(500).json({ 
                success: false,
                status: 'FAILED', 
                message: 'Failed to get payment status',
                details: response.data?.message || 'Unknown error'
            });
        }
    } catch (error) {
        console.error('[PHONEPE][STATUS] Error:', error.message, error.response?.data);
        res.status(500).json({ 
            success: false,
            status: 'FAILED', 
            message: 'Error checking payment status',
            error: error.message,
            phonepeError: error.response?.data
        });
    }
});

// Webhook endpoint for PhonePe payment status updates
router.post('/webhook', async (req, res) => {
  try {
    // 1. Validate Authorization header
    const authHeader = req.headers['authorization'];
    const username = process.env.PHONEPE_WEBHOOK_USERNAME;
    const password = process.env.PHONEPE_WEBHOOK_PASSWORD;
    const expectedHash = crypto.createHash('sha256').update(`${username}:${password}`).digest('hex');

    if (!authHeader || authHeader !== expectedHash) {
      console.warn('[PHONEPE][WEBHOOK] Invalid Authorization header');
      return res.status(401).send('Unauthorized');
    }

    // 2. Extract event and payload
    const event = req.body.event;
    const payload = req.body.payload;
    if (!event || !payload || !payload.orderId || !payload.state) {
      console.warn('[PHONEPE][WEBHOOK] Malformed webhook payload:', req.body);
      return res.status(400).send('Malformed payload');
    }

    const orderId = payload.orderId;
    const state = payload.state;

    // 3. Find payment in DB
    const payment = await Payment.findOne({ orderId });
    if (!payment) {
      console.warn(`[PHONEPE][WEBHOOK] No payment found for orderId: ${orderId}`);
      return res.status(404).send('Payment not found');
    }

    // 4. Update payment status based on payload.state
    if (state === 'COMPLETED') {
      payment.paid = true;
      await payment.save();
      console.log(`[PHONEPE][WEBHOOK] Payment marked as PAID for orderId: ${orderId}`);
    } else if (state === 'FAILED' || state === 'CANCELLED' || state === 'EXPIRED') {
      payment.paid = false;
      await payment.save();
      console.log(`[PHONEPE][WEBHOOK] Payment marked as FAILED for orderId: ${orderId}`);
    } else {
      console.log(`[PHONEPE][WEBHOOK] Payment state "${state}" for orderId: ${orderId} - no action taken`);
    }

    // 5. Always respond quickly
    res.status(200).send('OK');
  } catch (err) {
    console.error('[PHONEPE][WEBHOOK] Error handling webhook:', err);
    res.status(500).send('Error');
  }
});

module.exports = router; 