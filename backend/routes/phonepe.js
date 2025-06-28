const express = require('express');
const router = express.Router();
const axios = require('axios');
const { Buffer } = require('node:buffer');
const { generateOrderId, generateChecksum } = require('../utils/phonepeHelper');
const Payment = require('../models/Payment');

// Use environment variables for credentials
const PHONEPE_MERCHANT_ID = process.env.PHONEPE_MERCHANT_ID || 'TEST-M238CJJ16JL8W_25062';
const PHONEPE_BASE_URL = process.env.PHONEPE_BASE_URL || 'https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay';
const PHONEPE_STATUS_URL = process.env.PHONEPE_STATUS_URL || 'https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/status';
const PHONEPE_SALT_KEY = process.env.PHONEPE_SALT_KEY || 'YWRhODgxYzEtYWRiNS00ZmQ2LWE4ZTEtNGRhMDAwY2QyODkx';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Initiate PhonePe payment
router.post('/initiate', async (req, res) => {
    try {
        const { amount, patientId, dermatologistId } = req.body;
        if (!amount || !patientId || !dermatologistId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const orderId = generateOrderId();
        const paymentPayload = {
            merchantId: PHONEPE_MERCHANT_ID,
            merchantTransactionId: orderId,
            merchantUserId: patientId,
            amount: parseFloat(amount) * 100, // in paise
            redirectUrl: `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/phonepe/payment-status?orderId=${orderId}&patientId=${patientId}&dermatologistId=${dermatologistId}`,
            callbackUrl: `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/phonepe/payment-status?orderId=${orderId}&patientId=${patientId}&dermatologistId=${dermatologistId}`,
            paymentInstrument: { type: 'PAY_PAGE' }
        };
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
        const response = await axios.request(options);
        if (response.data && response.data.data && response.data.data.instrumentResponse) {
            // Optionally, save payment initiation in DB
            await Payment.create({ patientId, dermatologistId, paid: false, used: false });
            res.status(200).json({
                url: response.data.data.instrumentResponse.redirectInfo.url,
                orderId
            });
        } else {
            res.status(500).json({ error: 'Failed to initiate payment' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Check PhonePe payment status
router.get('/status/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        if (!orderId) {
            return res.status(400).json({ status: 'FAILED', message: 'Missing orderId' });
        }
        // Use PhonePe SDK to get order status
        const { StandardCheckoutClient, Env } = require('pg-sdk-node');
        const PHONEPE_CLIENT_ID = process.env.PHONEPE_CLIENT_ID || 'TEST-M238CJJ16JL8W_25062';
        const PHONEPE_CLIENT_SECRET = process.env.PHONEPE_CLIENT_SECRET || 'YWRhODgxYzEtYWRiNS00ZmQ2LWE4ZTEtNGRhMDAwY2QyODkx';
        const PHONEPE_CLIENT_VERSION = 1;
        const PHONEPE_ENV = Env.SANDBOX;
        const phonepeClient = StandardCheckoutClient.getInstance(
            PHONEPE_CLIENT_ID,
            PHONEPE_CLIENT_SECRET,
            PHONEPE_CLIENT_VERSION,
            PHONEPE_ENV
        );
        const response = await phonepeClient.getOrderStatus(orderId);
        // response.state can be SUCCESS, FAILED, PENDING, etc.
        let status = 'PROCESSING';
        if (response.state === 'SUCCESS' || response.state === 'COMPLETED') status = 'SUCCESS';
        else if (response.state === 'FAILED' || response.state === 'CANCELLED') status = 'FAILED';
        res.json({ status, raw: response });
    } catch (error) {
        console.error('PhonePe status check error:', error);
        res.status(500).json({ status: 'FAILED', message: error.message });
    }
});

// GET /payment-status - Backend route to handle payment status redirects
router.get('/payment-status', (req, res) => {
  const { orderId, patientId, dermatologistId } = req.query;
  const frontendUrl = `${FRONTEND_URL}/payment-status?orderId=${orderId}&patientId=${patientId}&dermatologistId=${dermatologistId}`;
  res.redirect(frontendUrl);
});

module.exports = router; 