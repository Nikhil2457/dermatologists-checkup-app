const express = require('express');
const mongoose = require('mongoose');
const { Types } = require('mongoose');

const cors = require('cors');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Dermatologist = require('./models/Dermatologist');
const Admin = require('./models/Admin');
require('dotenv').config();

const checkupRequestRouter = require('./routes/checkupRequest');
const authRoutes = require('./routes/users');
const checkupRoutes = require('./routes/checkup');
const dermatologistRoutes = require('./routes/dermatologist');
const dermatologistProfileRoutes = require('./routes/dermatologistRoutes');
const adminRoutes = require('./routes/admin');
const phonepeRoutes = require('./routes/phonepe');
const otpRoutes = require('./routes/otp');

const app = express();

// ✅ CORS - More permissive for debugging
app.use(cors({
  origin: process.env.FRONTEND_URL, // Allow all origins for debugging
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE','PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// ✅ Debugging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url} - ${new Date().toISOString()}`);
  next();
});

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Serve uploads folder
app.use('/uploads', express.static('uploads'));

// ✅ Test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend is working!', timestamp: new Date().toISOString() });
});

// ✅ Routes - Fixed order to avoid conflicts
app.use('/api/dermatologists', dermatologistRoutes);
app.use('/api/patient', require('./routes/patientRoutes'));
app.use('/api/dermatologist', dermatologistProfileRoutes);
app.use('/api', checkupRequestRouter); // Checkup requests
app.use('/api', checkupRoutes); // Checkup requests
app.use('/api/admin', adminRoutes);
app.use('/api/ai', require('./routes/ai'));
app.use('/api/ratings', require('./routes/ratings')); // Ratings system
app.use('/api/phonepe', phonepeRoutes);
app.use('/api/users',authRoutes);
app.use('/api/otp', otpRoutes);

// File upload routes

// ✅ Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ message: 'Internal server error', error: err.message });
});

// ✅ Connect MongoDB with fallback
const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/dermatology-checkup-app';
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log('MongoDB Connected to:', mongoURI);

  // ✅ Migration: Update existing Payment records to have default values
  try {
    const Payment = require('./models/Payment');
    const result = await Payment.updateMany(
      { $or: [{ orderId: { $exists: false } }, { amount: { $exists: false } }] },
      { 
        $set: { 
          orderId: null,
          amount: 0 
        } 
      }
    );
    if (result.modifiedCount > 0) {
      console.log(`✅ Migrated ${result.modifiedCount} Payment records`);
    }
  } catch (migrationError) {
    console.log('⚠️ Payment migration skipped:', migrationError.message);
  }

  // ✅ Auto-create default admin if not exists
  // const existingAdmin = await Admin.findOne({ username: 'admin' });
  // if (!existingAdmin) {
  //   const admin = new Admin({ username: 'admin', password: 'admin123' });
  //   await admin.save();
  //   console.log('✅ Default admin created: admin / admin123');
  // } else {
  //   console.log('✅ Admin already exists');
  // }

  app.listen(5000, () => console.log('Server started on port 5000'));
  
}).catch(err => {
  console.log('MongoDB connection failed:', err.message);
  console.log('Starting server without MongoDB...');
  app.listen(5000, () => console.log('Server started on port 5000 (without MongoDB)'));
});
