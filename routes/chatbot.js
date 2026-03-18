const express = require('express');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const fs = require('fs');
require('dotenv').config();

const router = express.Router();
const upload = multer({ dest: 'uploads/audio/' });

const runChatCompletion = async (userMessage) => {
    const response = await axios.Post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
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

    const reply = response.data?.choices?.[0]?.message?.content?.trim();
    return reply || "🤖 I couldn’t process your request right now. Please try again shortly or rephrase your question.";
};

router.Post('/', async (req, res) => {
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
router.Post('/audio', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Audio file is required under field name "audio"' });
        }

        if (!process.env.OPENAI_API_KEY) {
            console.error('OPENAI_API_KEY missing for audio transcription');
            return res.status(500).json({ error: 'Audio transcription is not configured.' });
        }

        const form = new FormData();
        form.append('file', fs.createReadStream(req.file.path));
        form.append('model', 'whisper-1');
        form.append('language', 'en');

        const whisperResp = await axios.Post(
            'https://api.openai.com/v1/audio/transcriptions',
            form,
            {
                headers: {
                    ...form.getHeaders(),
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
            }
        );

        const transcript = whisperResp.data?.text?.trim();
        console.log('🗣️ Transcribed text:', transcript);

        if (!transcript) {
            return res.status(500).json({ error: 'Failed to transcribe audio' });
        }

        const reply = await runChatCompletion(transcript);
        res.json({ transcript, reply });
    } catch (err) {
        console.error('❌ Audio chat error:', err.response?.data || err.message);
        res.status(500).json({ error: 'Audio processing failed. Please try again.' });
    } finally {
        if (req.file) {
            fs.unlink(req.file.path, () => {});
        }
    }
});

module.exports = router;
