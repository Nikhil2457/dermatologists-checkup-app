const twilio = require('twilio');

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

const sendWhatsAppMessage = async (to, message) => {
  try {
    const msg = await client.messages.create({
      from: 'whatsapp:+14155238886', // Twilio sandbox number
      to: `whatsapp:+91${to}`,
      body: message
    });
    console.log('✅ WhatsApp message sent:', msg.sid);
  } catch (err) {
    console.error('❌ Failed to send WhatsApp:', err.message);
  }
};

module.exports = { sendWhatsAppMessage };
