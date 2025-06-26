const express = require('express');
const router = express.Router();
const Dermatologist = require('../models/Dermatologist');

// GET all dermatologists
router.get('/', async (req, res) => {
  try {
    const dermatologists = await Dermatologist.find();
    res.status(200).json(dermatologists);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching dermatologists', error: error.message });
  }
});

module.exports = router; 