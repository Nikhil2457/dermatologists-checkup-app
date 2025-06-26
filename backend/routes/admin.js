const express = require('express');
const bcrypt = require('bcryptjs');
const { Types } = require('mongoose');
const User = require('../models/User');
const Dermatologist = require('../models/Dermatologist');
const Admin = require('../models/Admin');
const jwt = require('jsonwebtoken');
const adminAuth = require('../middleware/adminAuth');
const CheckupRequest = require('../models/CheckupRequest');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;

router.get('/dashboard', adminAuth, (req, res) => {
  res.json({ message: 'Welcome Admin!', adminId: req.adminId });
});


// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ role: 'patient' });
    const totalDermatologists = await User.countDocuments({ role: 'dermatologist' });
    const totalRequests = await CheckupRequest.countDocuments();
    const totalDermatologistsAvailable = await Dermatologist.countDocuments();
    const pendingRequests = await CheckupRequest.countDocuments({ status: 'Pending' });
    const inProgressRequests = await CheckupRequest.countDocuments({ status: 'In Progress' });
    const completedRequests = await CheckupRequest.countDocuments({ status: 'Completed' });

    res.status(200).json({
      totalUsers,
      totalDermatologists,
      totalRequests,
      pendingRequests,
      inProgressRequests,
      completedRequests,
      totalDermatologistsAvailable
    });
  } catch (err) {
    console.error('❌ Admin stats error:', err);
    res.status(500).json({ message: 'Failed to fetch admin stats', error: err.message });
  }
});


router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const admin = await Admin.findOne({ username });
    if (!admin) return res.status(401).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ adminId: admin._id }, JWT_SECRET, { expiresIn: '15m' }); // 15 mins session
res.cookie('admin_token', token, {
  httpOnly: true,
  secure: false,
  sameSite: 'Lax',
  maxAge: 15 * 60 * 1000 // 15 mins
});

    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: 'Login failed', error: err.message });
  }
});

// POST /api/admin/create-dermatologist-user
router.post('/create-dermatologist-user', async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;

    // Check dermatologist exists
    const dermatologist = await Dermatologist.findOne({ phoneNumber });
    if (!dermatologist) return res.status(404).json({ message: 'Dermatologist not found' });

    // Check if user already exists
    const existingUser = await User.findOne({ username: phoneNumber });
    if (existingUser) return res.status(400).json({ message: 'User already exists' });

    // Hash password and create user
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({
      _id: dermatologist._id,
      username: phoneNumber,
      password: hashedPassword,
      role: 'dermatologist'
    });

    res.status(201).json({ message: 'Dermatologist user created', userId: newUser._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create dermatologist user', error: err.message });
  }
});

// POST /api/admin/add-dermatologist
router.post('/add-dermatologist', async (req, res) => {
    try {
      const newDermatologist = await Dermatologist.create(req.body);
      res.status(201).json({ message: 'Dermatologist profile created', dermatologist: newDermatologist });
    } catch (err) {
      console.error('Error adding dermatologist:', err);
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  });
  

module.exports = router;
