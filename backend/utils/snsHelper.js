const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

const sns = new AWS.SNS();

/**
 * Send SMS using AWS SNS
 * @param {string} phoneNumber - Phone number with country code (e.g., +91XXXXXXXXXX)
 * @param {string} message - Message to send
 * @returns {Promise} - AWS SNS response
 */
const sendSMS = async (phoneNumber, message) => {
  try {
    const params = {
      Message: message,
      PhoneNumber: phoneNumber,
      MessageAttributes: {
        'AWS.SNS.SMS.SMSType': {
          DataType: 'String',
          StringValue: 'Transactional'
        }
      }
    };

    const result = await sns.publish(params).promise();
    console.log('✅ AWS SNS SMS sent successfully:', result.MessageId);
    return result;
  } catch (error) {
    console.error('❌ AWS SNS SMS error:', error);
    throw error;
  }
};

/**
 * Send SMS to Indian phone numbers (adds +91 prefix if not present)
 * @param {string} phoneNumber - Phone number (with or without +91)
 * @param {string} message - Message to send
 * @returns {Promise} - AWS SNS response
 */
const sendSMSToIndia = async (phoneNumber, message) => {
  let formattedNumber = phoneNumber;
  
  // Remove any existing +91 prefix and add it back
  if (phoneNumber.startsWith('+91')) {
    formattedNumber = phoneNumber;
  } else if (phoneNumber.startsWith('91')) {
    formattedNumber = `+${phoneNumber}`;
  } else {
    formattedNumber = `+91${phoneNumber}`;
  }

  return sendSMS(formattedNumber, message);
};

module.exports = {
  sendSMS,
  sendSMSToIndia
}; 