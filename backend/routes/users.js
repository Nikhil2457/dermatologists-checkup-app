const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const router = express.Router();

router.post('/signup', async (req, res) => {
  let { username, password, role, phoneNumber } = req.body;

  // ✅ Trim input fields
  username = username.trim();
  password = password.trim();

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ message: 'Username already exists' });

    // ✅ Validate 10-digit phone number
    if (!/^\d{10}$/.test(phoneNumber)) {
      return res.status(400).json({ message: 'Invalid phone number. Must be 10 digits.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      username,
      password: hashedPassword,
      role,
      phoneNumber
    });

    await newUser.save();

    const token = jwt.sign(
      { id: newUser._id, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

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
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ Login Route
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

module.exports = router;
