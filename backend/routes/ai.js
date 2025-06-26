const express = require('express');
const router = express.Router();
const axios = require('axios');
require('dotenv').config();

router.post('/analyze', async (req, res) => {
  const { symptom, role = 'user', name = 'User' } = req.body;

  let prompt;

  if (role === 'dermatologist') {
    // Dermatologist input treated as a free-form clinical description
    prompt = `I am your AI dermatology assistant. Based on the following input, provide a clear, professional analysis, potential diagnosis, or advice: "${symptom}". Explain in 4-5 simple bullet points, easy to understand.`;
  } else {
    // For patients: short, bullet-point friendly response
    prompt = `Hi ${name}, here's what your symptom "${symptom}" might mean. Explain in 4-5 simple bullet points, easy to understand.`;
  }

  const payload = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

  try {
    const response = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
    });

    let text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No useful response from AI.';

    // Limit length only for patients
    if (role !== 'dermatologist' && text.length > 700) {
      text = text.slice(0, 680) + '...';
    }

    res.json({ result: text });
  } catch (err) {
    console.error('❌ Gemini API error:', err.response?.data || err.message);
    res.status(500).json({ result: 'AI analysis failed. Please try again.' });
  }
});

module.exports = router;
