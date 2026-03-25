const express = require('express');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const router = express.Router();

// Ensure audio upload dir exists
const audioDir = path.join(__dirname, '..', 'uploads', 'audio');
if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, audioDir),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || '') || '.wav';
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
});
const upload = multer({
    storage,
    limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
});

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
router.post('/audio', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Audio file is required under field name "audio"' });
        }

        if (!process.env.OPENAI_API_KEY) {
            console.error('OPENAI_API_KEY missing for audio transcription');
            return res.status(500).json({ error: 'Audio transcription is not configured.' });
        }

        const transcribe = async () => {
            const form = new FormData();
            form.append('file', fs.createReadStream(req.file.path), {
                filename: req.file.filename,
                contentType: req.file.mimetype || 'audio/wav',
            });
            form.append('model', 'whisper-1');
            form.append('language', 'en');

            return axios.post(
                'https://api.openai.com/v1/audio/transcriptions',
                form,
                {
                    headers: {
                        ...form.getHeaders(),
                        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                    },
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity,
                    timeout: 30000,
                }
            );
        };

        let whisperResp;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                whisperResp = await transcribe();
                break;
            } catch (err) {
                if (err.response?.status === 429 && attempt === 0) {
                    await sleep(2000);
                    continue;
                }
                throw err;
            }
        }

        const transcript = whisperResp?.data?.text?.trim();
        console.log('🗣️ Transcribed text:', transcript);

        if (!transcript) {
            return res.status(500).json({ error: 'Failed to transcribe audio' });
        }

        const reply = await runChatCompletion(transcript);
        res.json({ transcript, reply });
    } catch (err) {
        console.error('❌ Audio chat error:', err.response?.data || err.message);
        const status = err.response?.status || 500;
        const message =
            err.response?.data?.error ||
            err.response?.data?.message ||
            err.message ||
            'Audio processing failed. Please try again.';
        res.status(status).json({ error: message });
    } finally {
        if (req.file) {
            fs.unlink(req.file.path, () => {});
        }
    }
});

module.exports = router;
