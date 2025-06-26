const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Rating = require('../models/Rating');
const Dermatologist = require('../models/Dermatologist');
const authMiddleware = require('../middleware/authMiddleware');

// Submit a rating (POST /api/ratings)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { dermatologistId, stars, message } = req.body;
    const patientId = req.user._id;

    // Validate input
    if (!dermatologistId || !stars || stars < 1 || stars > 5) {
      return res.status(400).json({ message: 'Invalid rating data' });
    }

    // Check if patient has already rated this dermatologist
    const existingRating = await Rating.findOne({ patientId, dermatologistId });
    if (existingRating) {
      return res.status(400).json({ message: 'You have already rated this dermatologist' });
    }

    // Create new rating
    const rating = new Rating({
      patientId,
      dermatologistId,
      stars,
      message: message || ''
    });

    await rating.save();

    // Update dermatologist's average rating
    await updateDermatologistAverageRating(dermatologistId);

    res.status(201).json({ 
      message: 'Rating submitted successfully',
      rating 
    });

  } catch (error) {
    console.error('Error submitting rating:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all ratings for a dermatologist (GET /api/ratings/dermatologist/:dermatologistId)
router.get('/dermatologist/:dermatologistId', async (req, res) => {
  try {
    const { dermatologistId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const ratings = await Rating.find({ dermatologistId })
      .populate('patientId', 'username')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await Rating.countDocuments({ dermatologistId });

    res.json({
      ratings,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });

  } catch (error) {
    console.error('Error fetching ratings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get average rating for a dermatologist (GET /api/ratings/dermatologist/:dermatologistId/average)
router.get('/dermatologist/:dermatologistId/average', async (req, res) => {
  try {
    const { dermatologistId } = req.params;

    const result = await Rating.aggregate([
      { $match: { dermatologistId: new mongoose.Types.ObjectId(dermatologistId) } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$stars' },
          totalRatings: { $sum: 1 }
        }
      }
    ]);

    const averageRating = result.length > 0 ? result[0].averageRating : 0;
    const totalRatings = result.length > 0 ? result[0].totalRatings : 0;

    res.json({
      averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
      totalRatings
    });

  } catch (error) {
    console.error('Error calculating average rating:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Check if patient has rated a dermatologist (GET /api/ratings/check/:dermatologistId)
router.get('/check/:dermatologistId', authMiddleware, async (req, res) => {
  try {
    const { dermatologistId } = req.params;
    const patientId = req.user._id;

    const rating = await Rating.findOne({ patientId, dermatologistId });
    
    res.json({
      hasRated: !!rating,
      rating: rating || null
    });

  } catch (error) {
    console.error('Error checking rating:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update a rating (PUT /api/ratings/:ratingId)
router.put('/:ratingId', authMiddleware, async (req, res) => {
  try {
    const { ratingId } = req.params;
    const { stars, message } = req.body;
    const patientId = req.user._id;

    const rating = await Rating.findOne({ _id: ratingId, patientId });
    
    if (!rating) {
      return res.status(404).json({ message: 'Rating not found' });
    }

    rating.stars = stars;
    rating.message = message || '';
    await rating.save();

    // Update dermatologist's average rating
    await updateDermatologistAverageRating(rating.dermatologistId);

    res.json({ 
      message: 'Rating updated successfully',
      rating 
    });

  } catch (error) {
    console.error('Error updating rating:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper function to update dermatologist's average rating
async function updateDermatologistAverageRating(dermatologistId) {
  try {
    const result = await Rating.aggregate([
      { $match: { dermatologistId: new mongoose.Types.ObjectId(dermatologistId) } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$stars' }
        }
      }
    ]);

    const averageRating = result.length > 0 ? result[0].averageRating : 4.5;
    
    await Dermatologist.findByIdAndUpdate(dermatologistId, {
      ratings: Math.round(averageRating * 10) / 10
    });

  } catch (error) {
    console.error('Error updating dermatologist average rating:', error);
  }
}

module.exports = router; 