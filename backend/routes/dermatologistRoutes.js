const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const User = require('../models/User');
const Dermatologist = require('../models/Dermatologist');
const CheckupRequest=require('../models/CheckupRequest')
const accountSid = 'AC3e1b18c53358b3bd90413768e913a31a';
const authToken = '9a86ef69626a15fcb48dd990c33567a9';
const client = require('twilio')(accountSid, authToken);

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user || user.role !== 'dermatologist') {
      return res.status(403).json({ message: 'Access denied. Not a dermatologist.' });
    }
    const dermatologistProfile = await Dermatologist.findById(user._id);
    if (!dermatologistProfile) {
      return res.status(404).json({ message: 'Dermatologist profile not found' });
    }
    res.json({ user, profile: dermatologistProfile });
  } catch (error) {
    console.error('❌ Dermatologist /me route error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/me/requests', authMiddleware, async (req, res) => {
  try {
    const dermatologistId = req.user.id;
    const { status } = req.query;
    const filter = { dermatologistId };
    if (status && status.toLowerCase() !== 'all') {
      filter.status = new RegExp(status, 'i');
    }
    const requests = await CheckupRequest.find(filter).sort({ createdAt: -1 });
    const count = await CheckupRequest.countDocuments(filter);
    res.json({ requests, count });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch dermatologist checkup requests' });
  }
});

router.patch('/me/:id/update', async (req, res) => {
  try {
    const { status, products, description } = req.body;
    const updateFields = { status };
    if (products) updateFields.products = products;
    if (description) updateFields.description = description;
    const updated = await CheckupRequest.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ message: 'Checkup request not found' });
    }
    // ✅ Send SMS to patient based on status
    // try {
    //   const dermatologist = await Dermatologist.findById(updated.dermatologistId);
    //   const patient = await User.findById(updated.patientId);

    //   if (patient && patient.phoneNumber && dermatologist) {
    //     let messageBody = '';
    //     const statusLower = status.toLowerCase();

    //     if (statusLower === 'completed') {
    //       messageBody = `✅ Hello ${patient.username}, your checkup with Dr. ${dermatologist.name} is completed. Please check your dashboard for details.`;
    //     } else if (statusLower === 'in progress') {
    //       messageBody = `🦷 Hello ${patient.username}, your dental checkup with Dr. ${dermatologist.name} is in progress. You'll get your report soon.`;
    //     }

    //     if (messageBody) {
    //       const response = await client.messages.create({
    //         body: messageBody,
    //         from: '+14179812807',
    //         to: `+91${patient.phoneNumber}`
    //       });

    //       console.log(`✅ Twilio SMS sent to patient (${status}):`, response.sid);
    //     }
    //   } else {
    //     console.log('❌ Missing patient or dentist info');
    //   }
    // } catch (smsErr) {
    //   console.error('❌ Twilio SMS error:', smsErr);
    // }



    res.status(200).json({
      message: `Request updated successfully to "${status}"`,
      data: updated
    });
  } catch (err) {
    res.status(500).json({ message: 'Update failed', error: err.message });
  }
});

module.exports = router; 