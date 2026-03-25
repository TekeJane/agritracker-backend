const express = require('express');
const axios = require('axios');
require('dotenv').config();

const router = express.Router();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runChatCompletion = async (userMessage) => {
    const body = {
        model: "openai/gpt-4o",
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
            { role: "user", content: userMessage },
        ],
        max_tokens: 512,
        temperature: 0.7,
    };

    const headers = {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
    };

    // simple retry for rate-limit (429)
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const response = await axios.post(
                'https://openrouter.ai/api/v1/chat/completions',
                body,
                { headers, timeout: 30000 }
            );
            const reply = response.data?.choices?.[0]?.message?.content?.trim();
            return reply || "🤖 I couldn’t process your request right now. Please try again shortly or rephrase your question.";
        } catch (err) {
            const status = err.response?.status;
            if (status === 429 && attempt === 0) {
                await sleep(2000);
                continue;
            }
            throw err;
        }
    }
};

router.post('/', async (req, res) => {
    const userMessage = req.body.message;

    console.log('\n🧠 [AI CHATBOT] Post /api/chatbot');
    console.log('📨 Incoming user message:', userMessage);

    if (!userMessage || userMessage.trim() === "") {
        console.warn("⚠️ Empty message received from user.");
        return res.status(400).json({ error: "Message cannot be empty." });
    }

    try {
        const reply = await runChatCompletion(userMessage);
        res.json({ reply });
    } catch (err) {
        console.error('❌ OpenRouter API error:', err.response?.data || err.message);
        res.status(500).json({
            error: 'AI failed to respond due to a server or network issue. Please try again.',
        });
    }
});

// Audio → text → chat reply
module.exports = router;
