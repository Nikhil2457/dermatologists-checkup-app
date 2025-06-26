const mongoose = require('mongoose');

const RatingSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  dermatologistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dermatologist',
    required: true
  },
  stars: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  message: {
    type: String,
    trim: true,
    maxlength: 500
  },
  date: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Ensure one rating per patient per dermatologist
RatingSchema.index({ patientId: 1, dermatologistId: 1 }, { unique: true });

const Rating = mongoose.model('Rating', RatingSchema);

module.exports = Rating; 