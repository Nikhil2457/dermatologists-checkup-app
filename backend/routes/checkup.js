// routes/checkup.js
const express = require('express');
const router = express.Router();
const CheckupRequest = require('../models/CheckupRequest');
const authenticatePatient = require('../middleware/authMiddleware');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const sharp = require('sharp');
const SupportIssue = require('../models/SupportIssue');

// POST /api/checkup-request/:dermatologistId


// GET /api/checkup-results
router.get('/checkup-results', authenticatePatient, async (req, res) => {
  const { patientId } = req;

  try {
    const results = await CheckupRequest.find({ patientId })
      .populate('dermatologistId', 'username')
      .sort({ createdAt: -1 });

    res.status(200).json(results);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch checkup results' });
  }
});


// GET /api/export/:checkupId
router.get('/export/:checkupId', async (req, res) => {
  try {
    const { checkupId } = req.params;
    const checkup = await CheckupRequest.findById(checkupId)
      .populate('patientId', 'username phoneNumber')
      .populate('dermatologistId', 'name phoneNumber qualifications place experience clinicName fee')
      .lean();

    // 1. Log the fetched checkup object
    console.log('Checkup found:', checkup);

    if (!checkup) {
      return res.status(404).json({ message: 'No checkup request found' });
    }

    // Fetch payment info
    const Payment = require('../models/Payment');
    const payment = await Payment.findOne({ patientId: checkup.patientId._id, dermatologistId: checkup.dermatologistId._id });

    // 2. Log the fetched payment object
    console.log('Payment found:', payment);

    // Format timestamps
    const requestedAt = checkup.createdAt ? new Date(checkup.createdAt).toLocaleString() : 'N/A';
    const completedAt = checkup.status === 'Completed' && checkup.updatedAt ? new Date(checkup.updatedAt).toLocaleString() : (checkup.status === 'Completed' ? requestedAt : 'N/A');
    const paymentStatus = payment && payment.paid ? 'Paid' : 'Unpaid';
    const paymentTime = payment && payment.timestamp ? new Date(payment.timestamp).toLocaleString() : 'N/A';

    // Create PDF
    const doc = new PDFDocument({ margin: 40 });
    const fileName = `checkup_${checkupId}.pdf`;
    const filePath = path.join(__dirname, '..', 'pdfs', fileName);
    fs.mkdirSync(path.join(__dirname, '..', 'pdfs'), { recursive: true });
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    // Header
    doc.fontSize(22).text('🩺 Dermatology Medical Report', { align: 'center', underline: true });
    doc.moveDown(1.5);

    // Doctor Section
    doc.fontSize(14).text('Doctor Information', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12)
      .text(`Name: Dr. ${checkup.dermatologistId.name}`)
      .text(`Phone: ${checkup.dermatologistId.phoneNumber}`)
      .text(`Qualifications: ${(checkup.dermatologistId.qualifications || []).join(', ')}`)
      .text(`Clinic: ${checkup.dermatologistId.clinicName || 'N/A'}`)
      .text(`Place: ${checkup.dermatologistId.place}`)
      .text(`Experience: ${checkup.dermatologistId.experience}`)
      .text(`Fee: ${checkup.dermatologistId.fee}`);
    doc.moveDown(1);

    // Patient Section
    doc.fontSize(14).text('Patient Information', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12)
      .text(`Name: ${checkup.patientId.username}`)
      .text(`Phone: ${checkup.patientId.phoneNumber || 'N/A'}`);
    doc.moveDown(1);

    // Checkup Request Section
    doc.fontSize(14).text('Checkup Request Details', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12)
      .text(`Status: ${checkup.status}`)
      .text(`Requested At: ${requestedAt}`)
      .text(`Completed At: ${completedAt}`)
      .text(`Payment Status: ${paymentStatus}`)
      .text(`Payment Time: ${paymentTime}`)
      .moveDown(0.5)
      .text(`Body Part: ${checkup.bodyPart || 'N/A'}`)
      .text(`Skin Type: ${checkup.skinType || 'N/A'}`)
      .text(`Symptoms: ${checkup.symptoms || 'N/A'}`)
      .text(`Duration: ${checkup.duration || 'N/A'}`)
      .text(`Onset Type: ${checkup.onsetType || 'N/A'}`)
      .text(`Spreading: ${checkup.spreading || 'N/A'}`)
      .text(`Itch Level: ${checkup.itchLevel}/10`)
      .text(`Pain Level: ${checkup.painLevel}/10`)
      .text(`Bleeding or Pus: ${checkup.bleedingOrPus || 'N/A'}`)
      .text(`Sun Exposure: ${checkup.sunExposure || 'N/A'}`)
      .text(`Cosmetic Use: ${checkup.cosmeticUse || 'N/A'}`)
      .text(`New Product Use: ${checkup.newProductUse || 'N/A'}`)
      .text(`Work Exposure: ${checkup.workExposure || 'N/A'}`)
      .text(`Allergies: ${checkup.allergies || 'N/A'}`)
      .text(`Past Skin Conditions: ${checkup.pastSkinConditions || 'N/A'}`)
      .text(`Family History: ${checkup.familyHistory || 'N/A'}`)
      .text(`Medications Used: ${checkup.medicationsUsed || 'N/A'}`)
      .moveDown(0.5)
      .text(`Lesion Type: ${checkup.lesionType || 'N/A'}`)
      .text(`Lesion Color: ${checkup.lesionColor || 'N/A'}`)
      .text(`Lesion Shape: ${checkup.lesionShape || 'N/A'}`)
      .text(`Lesion Border: ${checkup.lesionBorder || 'N/A'}`)
      .text(`Lesion Texture: ${checkup.lesionTexture || 'N/A'}`)
      .text(`Associated Features: ${checkup.associatedFeatures || 'N/A'}`)
      .text(`Patient Notes: ${checkup.patientNotes || 'N/A'}`);
    doc.moveDown(1);

    // Products Section (with word wrap)
    if (checkup.products) {
      doc.fontSize(14).text('Recommended Products', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(12).text(checkup.products, { width: 480 });
      doc.moveDown(1);
    }

    // Description Section
    if (checkup.description) {
      doc.fontSize(14).text('Doctor Notes', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(12).text(checkup.description, { width: 480 });
      doc.moveDown(1);
    }

    // Images Section
    if (checkup.images && checkup.images.length > 0) {
      doc.fontSize(14).text('Images', { underline: true });
      doc.moveDown(0.5);
      for (const img of checkup.images) {
        if (img.description) doc.fontSize(12).text(`Description: ${img.description}`);
        const imagePath = path.join(__dirname, '..', img.imageFilename);
        console.log('Image path:', imagePath, 'Exists:', fs.existsSync(imagePath));
        if (fs.existsSync(imagePath)) {
          let imageToUse = imagePath;
          let tempPngPath = null;
          if (imagePath.toLowerCase().endsWith('.webp')) {
            // Convert .webp to .png using sharp
            tempPngPath = imagePath.replace(/\.webp$/i, `-pdf-tmp.png`);
            try {
              await sharp(imagePath).png().toFile(tempPngPath);
              imageToUse = tempPngPath;
              console.log('Converted .webp to .png for PDF:', tempPngPath);
            } catch (err) {
              console.error('Error converting .webp to .png:', err);
              continue; // Skip this image
            }
          }
          try {
            doc.image(imageToUse, { width: 250 });
            doc.moveDown(1);
          } catch (err) {
            console.error('Error adding image to PDF:', err);
          }
          // Clean up temp file if created
          if (tempPngPath && fs.existsSync(tempPngPath)) {
            fs.unlink(tempPngPath, (err) => {
              if (err) console.error('Error deleting temp PNG:', err);
            });
          }
        }
      }
      doc.moveDown(1);
    }

    // Thank you message
    doc.moveDown(2);
    doc.fontSize(14).text('Thank you for consulting us. Wishing you good health!', { align: 'center', italic: true });

    doc.end();
    writeStream.on('finish', () => {
      res.download(filePath, fileName);
    });
  } catch (err) {
    // 4. Improved error logging
    console.error('PDF Export Error:', err);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
});

// Helper to generate unique 6-digit tokenId
async function generateUniqueTokenId() {
  const SupportIssue = require('../models/SupportIssue');
  let tokenId;
  let exists = true;
  while (exists) {
    tokenId = Math.floor(100000 + Math.random() * 900000).toString();
    exists = await SupportIssue.findOne({ tokenId });
  }
  return tokenId;
}

// POST /api/support-issue (raise new issue)
router.post('/support-issue', authenticatePatient, async (req, res) => {
  try {
    const user = req.user;
    const { issue } = req.body;
    if (!issue || !issue.trim()) return res.status(400).json({ message: 'Issue description required' });
    // Only one pending issue at a time
    const pending = await SupportIssue.findOne({ patientId: user._id, status: 'pending' });
    if (pending) return res.status(400).json({ message: 'You already have a pending issue', tokenId: pending.tokenId });
    const tokenId = await generateUniqueTokenId();
    let phone = user.phoneNumber;
    if ((!phone || phone === '') && user.role === 'dermatologist') {
      // Fetch from Dermatologist profile
      const Dermatologist = require('../models/Dermatologist');
      const derm = await Dermatologist.findById(user._id);
      phone = derm ? derm.phoneNumber : '';
    }
    if (!phone) return res.status(400).json({ message: 'Phone number not found for user.' });
    const newIssue = await SupportIssue.create({
      tokenId,
      patientId: user._id,
      name: user.username,
      phone,
      role: user.role,
      issue,
      status: 'pending'
    });
    res.status(201).json({ message: 'Issue raised', tokenId: newIssue.tokenId, issue: newIssue });
  } catch (err) {
    console.error('SupportIssue POST error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/support-issue/mine (get all issues for user)
router.get('/support-issue/mine', authenticatePatient, async (req, res) => {
  try {
    const user = req.user;
    const issues = await SupportIssue.find({ patientId: user._id }).sort({ createdAt: -1 });
    res.json({ issues });
  } catch (err) {
    console.error('SupportIssue GET error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PATCH /api/support-issue/:tokenId/clarify (mark as clarified)
router.patch('/support-issue/:tokenId/clarify', async (req, res) => {
  try {
    const { tokenId } = req.params;
    const issue = await SupportIssue.findOne({ tokenId });
    if (!issue) return res.status(404).json({ message: 'Issue not found' });
    if (issue.status === 'clarified') return res.status(400).json({ message: 'Already clarified' });
    issue.status = 'clarified';
    issue.clarifiedAt = new Date();
    await issue.save();
    res.json({ message: 'Issue marked as clarified', issue });
  } catch (err) {
    console.error('SupportIssue PATCH error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/support-issue/all (admin fetch all issues)
router.get('/support-issue/all', async (req, res) => {
  try {
    const issues = await SupportIssue.find().sort({ createdAt: -1 });
    res.json({ issues });
  } catch (err) {
    console.error('SupportIssue ALL GET error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
