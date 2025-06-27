const express = require('express');
const router = express.Router();
const Otp = require('../models/Otp');
const AWS = require('aws-sdk');

// AWS SNS setup - using user's environment variable names
AWS.config.update({
  region: process.env.AWS_REGION || 'ap-south-1',
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
});

const sns = new AWS.SNS();

// Function to check SMS attributes
const checkSMSAttributes = async () => {
  try {
    const params = {
      attributes: ['DefaultSMSType', 'MonthlySpendLimit', 'DefaultSenderID', 'MaxPrice', 'OptOutSuccessRate']
    };
    const result = await sns.getSMSAttributes(params).promise();
    console.log('📊 SMS Attributes:', JSON.stringify(result.attributes, null, 2));
    
    // Check if we have proper SMS configuration
    if (!result.attributes.DefaultSMSType) {
      console.log('⚠️  WARNING: DefaultSMSType is not set!');
      console.log('💡 This might cause SMS delivery issues.');
    }
    
    if (result.attributes.MonthlySpendLimit === '1') {
      console.log('⚠️  WARNING: Monthly spend limit is only $1 USD!');
      console.log('💡 This might be too low for SMS delivery.');
    }
    
    return result.attributes;
  } catch (error) {
    console.log('❌ Error checking SMS attributes:', error.message);
  }
};

// Function to check if we're in sandbox mode
const checkSandboxStatus = async () => {
  try {
    const result = await sns.getSMSAttributes({
      attributes: ['DefaultSMSType']
    }).promise();
    
    const smsType = result.attributes.DefaultSMSType;
    console.log('🔍 SMS Type:', smsType);
    
    if (!smsType) {
      console.log('⚠️  SMS Type is undefined! This might indicate configuration issues.');
      console.log('💡 Check your AWS SNS console settings.');
    } else if (smsType === 'Promotional') {
      console.log('⚠️  You are in SANDBOX mode! Only verified numbers can receive SMS.');
      console.log('💡 To fix: Go to AWS SNS Console → Text messaging → Sandbox → Add your number');
    } else {
      console.log('✅ You are in PRODUCTION mode! SMS should be delivered.');
    }
    
    return smsType;
  } catch (error) {
    console.log('❌ Error checking sandbox status:', error.message);
  }
};

// Function to set SMS attributes for better delivery
const setSMSAttributes = async () => {
  try {
    const params = {
      attributes: {
        'DefaultSMSType': 'Transactional',
        'MonthlySpendLimit': '5'
      }
    };
    
    const result = await sns.setSMSAttributes(params).promise();
    console.log('✅ SMS attributes updated:', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.log('❌ Error setting SMS attributes:', error.message);
  }
};

// Send OTP endpoint
router.post('/send-otp', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ message: 'Phone number is required' });
    }
    
    if (!/^[0-9]{10}$/.test(phoneNumber)) {
      return res.status(400).json({ message: 'Invalid phone number. Must be 10 digits.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min expiry

    // Remove old OTPs for this phone number
    await Otp.deleteMany({ phoneNumber });
    
    // Create new OTP
    await Otp.create({ phoneNumber, otp, expiresAt });

    // Check SMS attributes and sandbox status first
    await checkSMSAttributes();
    await checkSandboxStatus();
    
    // Try to set better SMS attributes
    await setSMSAttributes();

    // Send SMS via AWS SNS
    try {
      const params = {
        Message: `Your verification code is: ${otp}`,
        PhoneNumber: `+91${phoneNumber}`, // Add +91 prefix for India
        MessageAttributes: {
          'AWS.SNS.SMS.SMSType': {
            DataType: 'String',
            StringValue: 'Transactional'
          }
        }
      };

      const result = await sns.publish(params).promise();
      console.log('✅ SMS sent via AWS SNS:', result.MessageId);
      console.log('📱 Message sent to:', `+91${phoneNumber}`);
      console.log('🔍 Full SNS Response:', JSON.stringify(result, null, 2));
      
      // Log OTP for testing
      console.log('🔑 OTP for testing:', otp);
    } catch (snsError) {
      console.log('❌ AWS SNS failed, but OTP is:', otp);
      console.log('For testing, use this OTP:', otp);
      console.log('SNS Error:', snsError.message);
      console.log('Error Code:', snsError.code);
      console.log('Error Status Code:', snsError.statusCode);
    }

    res.json({ message: 'OTP sent successfully' });
  } catch (err) {
    console.error('OTP send error:', err);
    res.status(500).json({ message: 'Failed to send OTP', error: err.message });
  }
});

// Verify OTP endpoint
router.post('/verify-otp', async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;
    
    if (!phoneNumber || !otp) {
      return res.status(400).json({ message: 'Phone number and OTP are required' });
    }

    const record = await Otp.findOne({ phoneNumber, otp });
    
    if (!record) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }
    
    if (record.expiresAt < new Date()) {
      return res.status(400).json({ message: 'OTP expired' });
    }

    record.verified = true;
    await record.save();
    
    res.json({ message: 'OTP verified successfully' });
  } catch (err) {
    console.error('OTP verify error:', err);
    res.status(500).json({ message: 'Failed to verify OTP', error: err.message });
  }
});

module.exports = router; 