const express = require('express');
const axios = require('axios');
require('dotenv').config();

const router = express.Router();
const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';
const OPENROUTER_CHAT_MODEL =
  process.env.OPENROUTER_CHAT_MODEL || 'openai/gpt-4o-mini';

function looksLikeApiKey(value) {
  const trimmed = value?.toString().trim();
  return !!trimmed && trimmed.startsWith('sk-');
}

function sanitizeModelName(value, fallback) {
  const trimmed = value?.toString().trim();
  if (!trimmed) return fallback;
  if (looksLikeApiKey(trimmed)) {
    console.warn(
      `[AI CHATBOT] Ignoring invalid model env value that looks like an API key. Using fallback model ${fallback}.`,
    );
    return fallback;
  }
  return trimmed;
}

function resolveOpenAIKey() {
  if (looksLikeApiKey(process.env.OPENAI_CHAT_API_KEY)) {
    return process.env.OPENAI_CHAT_API_KEY;
  }
  if (looksLikeApiKey(process.env.OPENAI_API_KEY)) {
    return process.env.OPENAI_API_KEY;
  }
  if (looksLikeApiKey(process.env.OPENAI_CHAT_MODEL)) {
    return process.env.OPENAI_CHAT_MODEL;
  }
  return null;
}

function resolveOpenRouterKey() {
  if (looksLikeApiKey(process.env.OPENROUTER_CHAT_API_KEY)) {
    return process.env.OPENROUTER_CHAT_API_KEY;
  }
  if (looksLikeApiKey(process.env.OPENROUTER_API_KEY)) {
    return process.env.OPENROUTER_API_KEY;
  }
  if (looksLikeApiKey(process.env.OPENROUTER_CHAT_MODEL)) {
    return process.env.OPENROUTER_CHAT_MODEL;
  }
  return null;
}

function summarizeProviderError(error) {
  if (!error) return 'Unknown provider error';
  const status = error.response?.status;
  const remoteMessage =
    error.response?.data?.error?.message ||
    error.response?.data?.message ||
    error.response?.data?.error ||
    error.message;
  return status ? `${status}: ${remoteMessage}` : `${remoteMessage}`;
}

function detectProviderFailureType(failureReason) {
  const text = String(failureReason || '').toLowerCase();
  if (!text) return 'unknown';
  if (
    text.includes('insufficient_quota') ||
    text.includes('exceeded your current quota') ||
    text.includes('insufficient credits') ||
    text.includes('never purchased credits') ||
    text.includes('402:')
  ) {
    return 'billing';
  }
  if (text.includes('timeout')) {
    return 'timeout';
  }
  if (
    text.includes('401') ||
    text.includes('invalid api key') ||
    text.includes('incorrect api key') ||
    text.includes('unauthorized')
  ) {
    return 'auth';
  }
  return 'unavailable';
}

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
  const apiKey = resolveOpenAIKey();
  if (!apiKey) {
    return null;
  }

  console.log('[AI CHATBOT] Sending request to OpenAI...');

  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: sanitizeModelName(OPENAI_CHAT_MODEL, 'gpt-4o-mini'),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 180,
      temperature: 0.4,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    },
  );

  return response.data?.choices?.[0]?.message?.content?.trim() || null;
}

async function requestOpenRouter(userMessage) {
  const apiKey = resolveOpenRouterKey();
  if (!apiKey) {
    return null;
  }

  console.log('[AI CHATBOT] Sending request to OpenRouter...');

  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: sanitizeModelName(
        OPENROUTER_CHAT_MODEL,
        'openai/gpt-4o-mini',
      ),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 180,
      temperature: 0.4,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer':
          process.env.APP_BASE_URL ||
          process.env.BACKEND_PUBLIC_URL ||
          'https://agritracker-backend-production-1636.up.railway.app',
        'X-Title': 'AgriTracker AI Chat',
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
    const providerErrors = [];

    try {
      reply = await requestOpenAI(userMessage);
      if (reply) {
        provider = 'openai';
      }
    } catch (error) {
      providerErrors.push(`OpenAI: ${summarizeProviderError(error)}`);
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
        providerErrors.push(`OpenRouter: ${summarizeProviderError(error)}`);
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

    return res.json({
      reply,
      provider,
      meta: {
        liveReplyAvailable: provider !== 'local',
        configuredProviders: {
          openai: !!resolveOpenAIKey(),
          openrouter: !!resolveOpenRouterKey(),
        },
        failureReason: providerErrors.join(' | '),
        failureType: detectProviderFailureType(providerErrors.join(' | ')),
        providerErrors,
      },
    });
  } catch (error) {
    console.error('[AI CHATBOT] Unexpected error:', error.message);
    return res.json({
      reply: buildLocalFallback(userMessage),
      provider: 'local',
      meta: {
        liveReplyAvailable: false,
        configuredProviders: {
          openai: !!resolveOpenAIKey(),
          openrouter: !!resolveOpenRouterKey(),
        },
        failureReason: error.message,
        failureType: detectProviderFailureType(error.message),
        providerErrors: [error.message],
      },
    });
  }
});

router.get('/health', (_req, res) => {
  return res.json({
    configuredProviders: {
      openai: !!resolveOpenAIKey(),
      openrouter: !!resolveOpenRouterKey(),
    },
    models: {
      openai: sanitizeModelName(OPENAI_CHAT_MODEL, 'gpt-4o-mini'),
      openrouter: sanitizeModelName(
        OPENROUTER_CHAT_MODEL,
        'openai/gpt-4o-mini',
      ),
    },
  });
});

module.exports = router;
