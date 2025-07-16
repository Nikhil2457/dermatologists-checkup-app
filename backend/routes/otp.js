const express = require('express');
const router = express.Router();
const Otp = require('../models/Otp');
const axios = require('axios');

// Send OTP endpoint
router.post('/send-otp', async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ message: 'Phone number is required' });
    }

    if (!/^[0-9]{10}$/.test(phoneNumber)) {
      return res.status(400).json({ message: 'Invalid phone number. Must be 10 digits.' });
    }

    // Change OTP to 4 digits
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min expiry

    // Remove old OTPs for this phone number
    await Otp.deleteMany({ phoneNumber });

    // Create new OTP
    await Otp.create({ phoneNumber, otp, expiresAt });

    // Send OTP via 2factor.in
    const apiKey = process.env.TWOFACTOR_API_KEY; // Set this in your .env
    const templateName = 'DermaCare'; // Use your approved template name
    const formattedPhone = `+91${phoneNumber}`;
    const url = `https://2factor.in/API/V1/${apiKey}/SMS/${formattedPhone}/${otp}/${templateName}`;

    try {
      const response = await axios.get(url);
      if (response.data.Status === 'Success') {
        console.log('✅ OTP sent via 2factor.in:', response.data.Details);
      } else {
        console.log('❌ 2factor.in error:', response.data);
      }
    } catch (apiError) {
      console.log('❌ 2factor.in API failed, but OTP is:', otp);
      console.log('For testing, use this OTP:', otp);
      console.log('2factor.in Error:', apiError.message);
    }

    res.json({ message: 'OTP sent successfully' });
  } catch (err) {
    console.error('OTP send error:', err);
    res.status(500).json({ message: 'Failed to send OTP', error: err.message });
  }
});

// Verify OTP endpoint
router.post('/verify-otp', async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;
    
    if (!phoneNumber || !otp) {
      return res.status(400).json({ message: 'Phone number and OTP are required' });
    }

    const record = await Otp.findOne({ phoneNumber, otp });
    
    if (!record) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }
    
    if (record.expiresAt < new Date()) {
      return res.status(400).json({ message: 'OTP expired' });
    }

    record.verified = true;
    await record.save();
    
    res.json({ message: 'OTP verified successfully' });
  } catch (err) {
    console.error('OTP verify error:', err);
    res.status(500).json({ message: 'Failed to verify OTP', error: err.message });
  }
});

module.exports = router; 