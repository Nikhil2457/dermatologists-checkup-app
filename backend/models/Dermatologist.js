const mongoose = require('mongoose');

const DermatologistSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
  },
  place: {
    type: String,
    required: true,
  },
  experience: {
    type: String,
    required: true,
  },
  yearsOfExperience: {
    type: Number,
    required: true,
  },
  qualifications: {
    type: [String],
    required: true,
  },
  ratings: {
    type: Number,
    default: 4.5,
  },
  profileImage: {
    type: String,
    default: "",
  },
  clinicName: {
    type: String,
    default: "",
  },
  fee: {
    type: String,
    default: "Free",
  },
  isAvailable: {
    type: Boolean,
    default: true,
  },
  isVerified: {
    type: Boolean,
    default: false,
  }
}, { timestamps: true });

const Dermatologist = mongoose.model('Dermatologist', DermatologistSchema);

module.exports = Dermatologist; 