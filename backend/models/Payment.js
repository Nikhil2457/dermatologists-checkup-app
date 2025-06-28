const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dermatologistId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dermatologist', required: true },
  orderId: { type: String, unique: true, sparse: true },
  amount: { type: Number, default: 0 },
  paid: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now },
  used: { type: Boolean, default: false }
});

module.exports = mongoose.model('Payment', paymentSchema); 