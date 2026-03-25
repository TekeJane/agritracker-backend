const express = require('express');
const axios = require('axios');
require('dotenv').config();

const router = express.Router();

router.post('/', async (req, res) => {
    const userMessage = req.body.message;

    console.log('\n🧠 [AI CHATBOT] POST /api/chatbot');
    console.log('📨 Incoming user message:', userMessage);

    if (!userMessage || userMessage.trim() === "") {
        console.warn("⚠️ Empty message received from user.");
        return res.status(400).json({ error: "Message cannot be empty." });
    }

    try {
        console.log('🛠️ Sending request to OpenRouter...');

        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: "openai/gpt-4o",  // You can change the model if you prefer
                messages: [
                    {
                        role: "system",
                        content: `You are an AI assistant for a Cameroon-based agritech app. Help users with:
- Registration
- Selling crops
- Checking market prices
- Crop advisory
- Contacting support`,
                    },
                    {
                        role: "user",
                        content: userMessage,
                    }
                ],
                max_tokens: 512,
                temperature: 0.7,
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        console.log("✅ OpenRouter raw response:", JSON.stringify(response.data, null, 2));

        const reply = response.data?.choices?.[0]?.message?.content?.trim();

        if (!reply) {
            console.warn("⚠️ No valid reply from OpenRouter, using fallback.");
            return res.json({
                reply: "🤖 I couldn’t process your request right now. Please try again shortly or rephrase your question.",
            });
        }

        console.log('🤖 OpenRouter Reply:', reply);
        res.json({ reply });

    } catch (err) {
        console.error('❌ OpenRouter API error:', err.response?.data || err.message);
        res.status(500).json({
            error: 'AI failed to respond due to a server or network issue. Please try again.',
        });
    }
});

module.exports = router;
