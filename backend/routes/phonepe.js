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
        let status = 'PROCESSING';
        if (payment.paid === true) {
            status = 'SUCCESS';
        } else if (payment.paid === false && payment.used === false) {
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
    } catch (error) {
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
    // Validate Authorization header
    const authHeader = req.headers['authorization'];
    const username = process.env.PHONEPE_WEBHOOK_USERNAME;
    const password = process.env.PHONEPE_WEBHOOK_PASSWORD;
    const expectedHash = crypto.createHash('sha256').update(`${username}:${password}`).digest('hex');
    if (!authHeader || authHeader !== expectedHash) {
      return res.status(401).send('Unauthorized');
    }
    // Extract event and payload
    const event = req.body.event;
    const payload = req.body.payload;
    if (!event || !payload || !payload.orderId || !payload.state) {
      return res.status(400).send('Malformed payload');
    }
    const orderId = payload.orderId;
    const state = payload.state;
    // Find payment in DB
    const payment = await Payment.findOne({ orderId });
    if (!payment) {
      return res.status(404).send('Payment not found');
    }
    // Update payment status based on payload.state
    if (state === 'COMPLETED') {
      payment.paid = true;
      await payment.save();
    } else if (state === 'FAILED' || state === 'CANCELLED' || state === 'EXPIRED') {
      payment.paid = false;
      await payment.save();
    }
    res.status(200).send('OK');
  } catch (err) {
    res.status(500).send('Error');
  }
});

module.exports = router; 