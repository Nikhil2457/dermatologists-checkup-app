const mongoose = require('mongoose');

const supportIssueSchema = new mongoose.Schema({
  tokenId: { type: String, required: true, unique: true }, // 6-digit string
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  role: { type: String, required: true },
  issue: { type: String, required: true },
  status: { type: String, enum: ['pending', 'clarified'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  clarifiedAt: { type: Date }
});

module.exports = mongoose.model('SupportIssue', supportIssueSchema); 