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
            redirectUrl: `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/phonepe/payment-status?orderId=${orderId}&patientId=${patientId}&dermatologistId=${dermatologistId}`,
            callbackUrl: `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/phonepe/payment-status?orderId=${orderId}&patientId=${patientId}&dermatologistId=${dermatologistId}`,
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

// Check PhonePe payment status
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
        if (!payment) {
            console.warn('[PHONEPE][STATUS] Payment not found in database for orderId:', orderId);
            return res.status(404).json({ 
                success: false,
                status: 'FAILED', 
                message: 'Payment not found' 
            });
        }

        // Use PhonePe API to get order status
        const statusPayload = {
            merchantId: PHONEPE_MERCHANT_ID,
            merchantTransactionId: orderId
        };

        const statusPayloadBase64 = Buffer.from(JSON.stringify(statusPayload), 'utf8').toString('base64');
        const statusChecksum = await generateChecksum(statusPayloadBase64, '/pg/v1/status', PHONEPE_SALT_KEY);

        const statusOptions = {
            method: 'POST',
            url: PHONEPE_STATUS_URL,
            headers: {
                accept: 'application/json',
                'Content-Type': 'application/json',
                'X-VERIFY': statusChecksum
            },
            data: { request: statusPayloadBase64 }
        };

        console.log('[PHONEPE][STATUS] Making status request to PhonePe...');
        const response = await axios.request(statusOptions);
        
        console.log('[PHONEPE][STATUS] PhonePe status response:', {
            success: response.data?.success,
            code: response.data?.code,
            state: response.data?.data?.state
        });

        if (response.data && response.data.success && response.data.data) {
            const phonepeState = response.data.data.state;
            let status = 'PROCESSING';
            
            if (phonepeState === 'SUCCESS' || phonepeState === 'COMPLETED') {
                status = 'SUCCESS';
                // Update payment record if successful
                if (!payment.paid) {
                    payment.paid = true;
                    await payment.save();
                    console.log('[PHONEPE][STATUS] Payment marked as paid in database');
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

// GET /payment-status - Backend route to handle payment status redirects
router.get('/payment-status', async (req, res) => {
    const { orderId, patientId, dermatologistId } = req.query;
    console.log('[PHONEPE][REDIRECT] Payment status redirect:', { orderId, patientId, dermatologistId });
    
    if (!orderId || !patientId || !dermatologistId) {
        console.warn('[PHONEPE][REDIRECT] Missing query parameters');
        return res.redirect(`${FRONTEND_URL}/payment-status.html?error=missing_params`);
    }

    // Trust the redirect: mark payment as paid
    try {
        const payment = await Payment.findOneAndUpdate(
            { orderId, patientId, dermatologistId },
            { paid: true },
            { new: true }
        );
        if (payment) {
            console.log('[PHONEPE][REDIRECT] Payment marked as paid:', payment._id);
        } else {
            console.warn('[PHONEPE][REDIRECT] Payment not found to mark as paid');
        }
    } catch (err) {
        console.error('[PHONEPE][REDIRECT] Error marking payment as paid:', err);
    }

    // Redirect to React route (HashRouter)
    const reactUrl = `${FRONTEND_URL}/#/payment-status?orderId=${orderId}&patientId=${patientId}&dermatologistId=${dermatologistId}`;
    res.redirect(reactUrl);
});

module.exports = router; 