const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Otp = require('../models/Otp');
const router = express.Router();

// Signup route (requires verified OTP)
router.post('/signup', async (req, res) => {
  let { username, password, role, phoneNumber } = req.body;
  username = username.trim();
  password = password.trim();
  
  console.log('Signup attempt:', { username, role, phoneNumber });
  
  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ message: 'Username already exists' });
    
    if (!/^[0-9]{10}$/.test(phoneNumber)) {
      return res.status(400).json({ message: 'Invalid phone number. Must be 10 digits.' });
    }
    
    // Require verified OTP
    const otpRecord = await Otp.findOne({ phoneNumber, verified: true });
    console.log('OTP record found:', otpRecord);
    
    if (!otpRecord) return res.status(400).json({ message: 'Phone number not verified. Please verify OTP.' });
    if (otpRecord.expiresAt < new Date()) return res.status(400).json({ message: 'OTP expired. Please request a new one.' });
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword, role, phoneNumber });
    
    console.log('Attempting to save user...');
    await newUser.save();
    console.log('User saved successfully:', newUser._id);
    
    await Otp.deleteMany({ phoneNumber }); // Clean up OTPs
    
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not set!');
      return res.status(500).json({ message: 'Server configuration error' });
    }
    
    const token = jwt.sign(
      { id: newUser._id, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );
    
    console.log('Token generated successfully');
    
    res.status(201).json({
      message: 'User registered successfully',
      token,
      role: newUser.role,
      user: {
        id: newUser._id,
        username: newUser.username,
        role: newUser.role,
        phoneNumber: newUser.phoneNumber
      }
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Login Route
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user._id, role: user.role, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({ token, role: user.role, username: user.username });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});


// POST /api/users/forgot-credentials
router.post('/forgot-credentials', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ message: "Phone number is required" });

  try {
    const users = await User.find({ phoneNumber: phone });
    if (users.length === 0) {
      return res.status(404).json({ message: "No account found with this phone number" });
    }
    res.json({ usernames: users.map(u => u.username) });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/users/update-password
router.post('/update-password', async (req, res) => {
  const { phone, username, newPassword } = req.body;
  if (!phone || !username || !newPassword) {
    return res.status(400).json({ message: "Phone, username, and new password are required" });
  }

  try {
    const user = await User.findOne({ phoneNumber: phone, username: username });
    if (!user) {
      return res.status(404).json({ message: "No account found with this phone and username" });
    }
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ message: "Password updated successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});


module.exports = router;
