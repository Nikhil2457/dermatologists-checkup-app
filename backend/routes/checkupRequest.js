const express = require('express');
const router = express.Router();
const multer = require('multer');
const axios = require('axios');
const CheckupRequest = require('../models/CheckupRequest');
const Dermatologist = require('../models/Dermatologist');
const User = require('../models/User'); // ✅ Required to get patient name
const Payment = require('../models/Payment');
const phonepeHelper = require('../utils/phonepeHelper');
const { Buffer } = require('node:buffer');
const crypto = require('crypto');
const { randomUUID } = require('crypto');
const { sendSMSToIndia } = require('../utils/snsHelper');

// PhonePe SDK imports
const { StandardCheckoutClient, Env, MetaInfo, StandardCheckoutPayRequest } = require('pg-sdk-node');

// 📁 Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// PhonePe Configuration
const PHONEPE_CLIENT_ID = process.env.PHONEPE_CLIENT_ID || 'TEST-M238CJJ16JL8W_25062';
const PHONEPE_CLIENT_SECRET = process.env.PHONEPE_CLIENT_SECRET || 'YWRhODgxYzEtYWRiNS00ZmQ2LWE4ZTEtNGRhMDAwY2QyODkx';
const PHONEPE_CLIENT_VERSION = 1;
const PHONEPE_ENV = Env.SANDBOX; // Change to Env.PRODUCTION when going live
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Initialize PhonePe client
const phonepeClient = StandardCheckoutClient.getInstance(
  PHONEPE_CLIENT_ID, 
  PHONEPE_CLIENT_SECRET, 
  PHONEPE_CLIENT_VERSION, 
  PHONEPE_ENV
);

console.log('PhonePe Config:', {
  clientId: PHONEPE_CLIENT_ID,
  clientSecret: PHONEPE_CLIENT_SECRET ? '***loaded***' : '***missing***',
  clientVersion: PHONEPE_CLIENT_VERSION,
  env: PHONEPE_ENV
});

// ✅ POST /checkup-request
router.post('/checkup-request', upload.single('images'), async (req, res) => {
  try {
    const { 
      patientId, 
      dermatologistId, 
      description,
      bodyPart,
      skinType,
      symptoms,
      duration,
      onsetType,
      spreading,
      itchLevel,
      painLevel,
      bleedingOrPus,
      sunExposure,
      cosmeticUse,
      newProductUse,
      workExposure,
      allergies,
      pastSkinConditions,
      familyHistory,
      medicationsUsed,
      lesionType,
      lesionColor,
      lesionShape,
      lesionBorder,
      lesionTexture,
      associatedFeatures,
      patientNotes
    } = req.body;
    const image = req.file;

    if (!image) return res.status(400).json({ message: 'Image is required' });

    // Find an unused, paid payment
    const payment = await Payment.findOne({ patientId, dermatologistId, paid: true, used: false });
    if (!payment) {
      return res.status(400).json({ message: 'No unused payment found. Please pay before requesting a checkup.' });
    }

    // Mark payment as used
    payment.used = true;
    await payment.save();

    const newRequest = new CheckupRequest({
      patientId,
      dermatologistId,
      images: [{
        imageFilename: image.path,
        description: description || '',
      }],
      description,
      bodyPart,
      skinType,
      symptoms,
      duration,
      onsetType,
      spreading,
      itchLevel: parseInt(itchLevel) || 0,
      painLevel: parseInt(painLevel) || 0,
      bleedingOrPus,
      sunExposure,
      cosmeticUse,
      newProductUse,
      workExposure,
      allergies,
      pastSkinConditions,
      familyHistory,
      medicationsUsed,
      lesionType,
      lesionColor,
      lesionShape,
      lesionBorder,
      lesionTexture,
      associatedFeatures,
      patientNotes
    });

    await newRequest.save();
    console.log('✅ Checkup request saved successfully and payment marked as used');

    //🔔 Send SMS with dermatologist and patient name using AWS SNS
    try {
      const dermatologist = await Dermatologist.findById(dermatologistId);
      const patient = await User.findById(patientId); // ✅ Fetch patient name

      if (dermatologist && dermatologist.phoneNumber && patient) {
        const messageBody = `🧴 Hello Dr. ${dermatologist.name}, you received a new checkup request from ${patient.username}. Login to dashboard to review.`;

        await sendSMSToIndia(dermatologist.phoneNumber, messageBody);
        console.log('✅ AWS SNS SMS sent to dermatologist');
      } else {
        console.log('❌ Missing dermatologist or patient info');
      }
    } catch (smsErr) {
      console.error('❌ AWS SNS SMS error:', smsErr.message);
    }

    res.status(201).json({ message: 'Checkup request sent successfully' });
  } catch (error) {
    console.error('❌ Error creating checkup request:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ✅ POST /create-pending - Create a pending checkup request for payment
router.post('/create-pending', async (req, res) => {
  try {
    const { patientId, dermatologistId } = req.body;

    if (!patientId || !dermatologistId) {
      return res.status(400).json({ message: 'Patient ID and Dermatologist ID are required' });
    }

    const newRequest = new CheckupRequest({
      patientId,
      dermatologistId,
      images: [], // Empty images array - will be added later
      status: 'Pending',
      paid: false, // Explicitly set to false
    });

    await newRequest.save();
    console.log('✅ Pending checkup request created successfully');

    res.status(201).json({ 
      message: 'Pending checkup request created successfully',
      checkupRequestId: newRequest._id
    });
  } catch (error) {
    console.error('❌ Error creating pending checkup request:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ✅ GET requests for patient
router.get('/patient/:patientId/requests', async (req, res) => {
  try {
    const { patientId } = req.params;
    const { status } = req.query;

    const filter = { patientId };
    if (status && status.toLowerCase() !== 'all') {
      filter.status = new RegExp(status, 'i');
    }

    const requests = await CheckupRequest.find(filter)
      .populate('dermatologistId', 'name phoneNumber')
      .sort({ createdAt: -1 })
      .exec();
      
    const count = await CheckupRequest.countDocuments(filter);

    res.json({ requests, count });
  } catch (err) {
    console.error("Error fetching requests:", err);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// PATCH /api/checkup-request/:id/pay
router.patch('/:id/pay', async (req, res) => {
  try {
    const updated = await CheckupRequest.findByIdAndUpdate(
      req.params.id,
      { paid: true },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: 'Request not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Payment update failed', error: err.message });
  }
});

// PATCH /api/checkup-request/:id/add-images - Add images to existing checkup request
router.patch('/:id/add-images', upload.single('images'), async (req, res) => {
  try {
    const { id } = req.params;
    const { descriptions } = req.body;
    const image = req.file;

    if (!image) return res.status(400).json({ message: 'Image is required' });

    const checkupRequest = await CheckupRequest.findById(id);
    if (!checkupRequest) {
      return res.status(404).json({ message: 'Checkup request not found' });
    }

    // Add the new image to the existing images array
    checkupRequest.images.push({
      imageFilename: image.path,
      description: descriptions || '',
    });

    await checkupRequest.save();
    console.log('✅ Images added to checkup request successfully');

    res.json({ message: 'Images added to checkup request successfully' });
  } catch (error) {
    console.error('❌ Error adding images to checkup request:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/payments/status?patientId=...&dermatologistId=...
router.get('/payments/status', async (req, res) => {
  try {
    const { patientId, dermatologistId } = req.query;
    console.log('[PAYMENT][STATUS] Request received', { patientId, dermatologistId });
    if (!patientId || !dermatologistId) {
      console.warn('[PAYMENT][STATUS] Missing patientId or dermatologistId', { patientId, dermatologistId });
      return res.status(400).json({ paid: false, message: 'Missing patientId or dermatologistId' });
    }
    const payment = await Payment.findOne({ patientId, dermatologistId });
    console.log('[PAYMENT][STATUS] DB result', { payment });
    res.json({ paid: !!(payment && payment.paid) });
  } catch (err) {
    console.error('[PAYMENT][STATUS] Error checking payment status:', err);
    res.status(500).json({ paid: false, message: 'Error checking payment status' });
  }
});

// POST /api/payments/mark-paid
router.post('/payments/mark-paid', async (req, res) => {
  try {
    const { patientId, dermatologistId } = req.body;
    console.log('[PAYMENT][MARK-PAID] Request received', { patientId, dermatologistId });
    if (!patientId || !dermatologistId) {
      console.warn('[PAYMENT][MARK-PAID] Missing patientId or dermatologistId', { patientId, dermatologistId });
      return res.status(400).json({ success: false, message: 'Missing patientId or dermatologistId' });
    }
    let payment = await Payment.findOne({ patientId, dermatologistId });
    console.log('[PAYMENT][MARK-PAID] Payment found in DB:', payment);
    if (!payment) {
      payment = new Payment({ patientId, dermatologistId, paid: true });
      console.log('[PAYMENT][MARK-PAID] New payment created', { payment });
    } else {
      payment.paid = true;
      payment.timestamp = new Date();
      console.log('[PAYMENT][MARK-PAID] Existing payment updated', { payment });
    }
    await payment.save();
    console.log('[PAYMENT][MARK-PAID] Payment saved', { payment });
    res.json({ success: true });
    console.log('[PAYMENT][MARK-PAID] Response sent: { success: true }');
  } catch (err) {
    console.error('[PAYMENT][MARK-PAID] Error marking payment as paid:', err);
    res.status(500).json({ success: false, message: 'Error marking payment as paid' });
  }
});

// GET /api/payments/unused-count?patientId=...&dermatologistId=...
router.get('/payments/unused-count', async (req, res) => {
  try {
    const { patientId, dermatologistId } = req.query;
    if (!patientId || !dermatologistId) {
      return res.status(400).json({ count: 0, message: 'Missing patientId or dermatologistId' });
    }
    const count = await Payment.countDocuments({ patientId, dermatologistId, paid: true, used: false });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ count: 0, message: 'Error checking unused payment count' });
  }
});

// POST /checkup-request/initiate-payment (PhonePe)
router.post('/checkup-request/initiate-payment', async (req, res) => {
  try {
    const { amount, patientId, dermatologistId } = req.body;
    if (!amount || !patientId || !dermatologistId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const merchantOrderId = randomUUID();
    const amountInPaise = parseFloat(amount) * 100; // Convert to paise
    const redirectUrl = `${FRONTEND_URL}/payment-status?orderId=${merchantOrderId}&patientId=${patientId}&dermatologistId=${dermatologistId}`;
    
    const metaInfo = MetaInfo.builder()
      .udf1(patientId)
      .udf2(dermatologistId)
      .build();

    const request = StandardCheckoutPayRequest.builder()
      .merchantOrderId(merchantOrderId)
      .amount(amountInPaise)
      .redirectUrl(redirectUrl)
      .metaInfo(metaInfo) 
      .build();

    console.log('PhonePe Request:', {
      merchantOrderId,
      amount: amountInPaise,
      redirectUrl,
      metaInfo: { udf1: patientId, udf2: dermatologistId }
    });

    const response = await phonepeClient.pay(request);
    
    console.log('PhonePe Response:', {
      state: response.state,
      redirectUrl: response.redirectUrl,
      orderId: response.orderId,
      expireAt: response.expireAt
    });

    if (response.state === 'PENDING' && response.redirectUrl) {
      // Save payment initiation in DB
      await Payment.create({ patientId, dermatologistId, paid: false, used: false });
      res.status(200).json({
        url: response.redirectUrl,
        orderId: merchantOrderId,
        pgOrderId: response.orderId
      });
    } else {
      res.status(500).json({ error: 'Failed to initiate payment' });
    }
  } catch (error) {
    console.error('PhonePe payment initiation error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
