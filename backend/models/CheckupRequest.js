const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema({
  imageFilename: String,       // Just the file path
  description: String
});

const checkupRequestSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  dermatologistId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dermatologist' },
  images: [imageSchema],
  status: {
    type: String,
    enum: ['Pending', 'In Progress', 'Completed'],
    default: 'Pending'
  },
  products: { type: String },         // 🆕 Added
  description: { type: String },
  paid: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  
  // 🆕 New Dermatology-specific fields
  bodyPart: { type: String },
  skinType: { 
    type: String, 
    enum: ['Oily', 'Dry', 'Combination', 'Sensitive', ''] 
  },
  symptoms: { type: String },
  duration: { type: String },
  onsetType: { 
    type: String, 
    enum: ['Sudden', 'Gradual', ''] 
  },
  spreading: { 
    type: String, 
    enum: ['Localized', 'Spreading', 'Generalized', ''] 
  },
  itchLevel: { 
    type: Number, 
    min: 0, 
    max: 10, 
    default: 0 
  },
  painLevel: { 
    type: Number, 
    min: 0, 
    max: 10, 
    default: 0 
  },
  bleedingOrPus: { 
    type: String, 
    enum: ['None', 'Occasional', 'Continuous', ''] 
  },
  sunExposure: { 
    type: String, 
    enum: ['High', 'Moderate', 'Low', ''] 
  },
  cosmeticUse: { type: String },
  newProductUse: { type: String },
  workExposure: { type: String },
  allergies: { type: String },
  pastSkinConditions: { type: String },
  familyHistory: { type: String },
  medicationsUsed: { type: String },
  
  // Lesion characteristics
  lesionType: { type: String },
  lesionColor: { type: String },
  lesionShape: { type: String },
  lesionBorder: { type: String },
  lesionTexture: { type: String },
  associatedFeatures: { type: String },
  patientNotes: { type: String }
});

module.exports = mongoose.model('CheckupRequest', checkupRequestSchema);
