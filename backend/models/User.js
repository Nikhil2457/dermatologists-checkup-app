// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['patient', 'dermatologist'], required: true },
  phoneNumber: { type: String } // ✅ Newly added
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
