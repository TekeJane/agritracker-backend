const express = require('express');
const axios = require('axios');
require('dotenv').config();

const router = express.Router();

const SYSTEM_PROMPT = `You are AgriTech AI, an assistant for a Cameroon-based agritech app.
Help users with farming advice, weather-based crop actions, pests, selling crops, market questions, registration, and support.
Keep replies practical, concise, and easy to follow.
If the user asks for a short answer, keep it short.
Do not use emojis unless the user asks for them.`;

function buildLocalFallback(userMessage) {
  const weatherMatch = userMessage.match(
    /Condition:\s*([^,]+),\s*temperature:\s*([0-9.]+)[^,]*,\s*humidity:\s*([0-9.]+)%/i,
  );

  if (weatherMatch) {
    const condition = weatherMatch[1].trim().toLowerCase();
    const temp = Number(weatherMatch[2]);
    const humidity = Number(weatherMatch[3]);

    if (condition.includes('rain') || condition.includes('drizzle')) {
      return 'Delay spraying today, clear drainage channels, and check fields for waterlogging before planting or fertilizer application.';
    }

    if (condition.includes('cloud')) {
      if (humidity >= 75) {
        return 'Use the cooler cloudy window for weeding and field inspection, and watch closely for fungal disease because humidity is elevated.';
      }

      return 'Use the cooler cloudy period for transplanting, weeding, or mulching, and water only after checking soil moisture around the root zone.';
    }

    if (condition.includes('clear') || temp >= 31) {
      return 'Water early in the morning, add mulch around crops, and avoid transplanting during the hottest part of the day.';
    }

    if (humidity >= 80) {
      return 'Improve airflow around crops, avoid late-day irrigation, and inspect leaves for mildew or other moisture-related disease symptoms.';
    }

    return 'Check soil moisture first, work during the cooler hours, and adjust irrigation or field activity to match today’s conditions.';
  }

  return 'I can help with crops, pests, weather-based farm decisions, selling produce, and account support. Please send your question again.';
}

async function requestOpenAI(userMessage) {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  console.log('[AI CHATBOT] Sending request to OpenAI...');

  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 180,
      temperature: 0.4,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    },
  );

  return response.data?.choices?.[0]?.message?.content?.trim() || null;
}

async function requestOpenRouter(userMessage) {
  if (!process.env.OPENROUTER_API_KEY) {
    return null;
  }

  console.log('[AI CHATBOT] Sending request to OpenRouter...');

  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 180,
      temperature: 0.4,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    },
  );

  return response.data?.choices?.[0]?.message?.content?.trim() || null;
}

router.post('/', async (req, res) => {
  const userMessage = req.body.message?.toString() || '';

  console.log('\n[AI CHATBOT] POST /api/chatbot');
  console.log('[AI CHATBOT] Incoming user message:', userMessage);

  if (!userMessage.trim()) {
    console.warn('[AI CHATBOT] Empty message received.');
    return res.status(400).json({ error: 'Message cannot be empty.' });
  }

  try {
    let reply = null;
    let provider = 'local';

    try {
      reply = await requestOpenAI(userMessage);
      if (reply) {
        provider = 'openai';
      }
    } catch (error) {
      console.error(
        '[AI CHATBOT] OpenAI error:',
        error.response?.data || error.message,
      );
    }

    if (!reply) {
      try {
        reply = await requestOpenRouter(userMessage);
        if (reply) {
          provider = 'openrouter';
        }
      } catch (error) {
        console.error(
          '[AI CHATBOT] OpenRouter error:',
          error.response?.data || error.message,
        );
      }
    }

    if (!reply) {
      reply = buildLocalFallback(userMessage);
    }

    console.log(`[AI CHATBOT] Reply provider: ${provider}`);
    console.log('[AI CHATBOT] Final reply:', reply);

    return res.json({ reply, provider });
  } catch (error) {
    console.error('[AI CHATBOT] Unexpected error:', error.message);
    return res.json({
      reply: buildLocalFallback(userMessage),
      provider: 'local',
    });
  }
});

module.exports = router;
