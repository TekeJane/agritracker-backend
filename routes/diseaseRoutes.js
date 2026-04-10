const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { ensureUploadDir } = require('../config/uploadPaths');

const router = express.Router();
const upload = multer({ dest: ensureUploadDir('disease') });
const diseaseUpload = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'full_image', maxCount: 1 },
]);

const OPENAI_MODEL = process.env.OPENAI_PLANT_MODEL || 'gpt-4o-mini';
const OPENROUTER_MODEL =
  process.env.OPENROUTER_PLANT_MODEL || 'openai/gpt-4o-mini';
const REQUEST_TIMEOUT_MS = 45000;

function looksLikeApiKey(value) {
  const trimmed = value?.toString().trim();
  return !!trimmed && trimmed.startsWith('sk-');
}

function resolvePlantOpenAIKey() {
  if (looksLikeApiKey(process.env.OPENAI_PLANT_API_KEY)) {
    return process.env.OPENAI_PLANT_API_KEY;
  }
  if (looksLikeApiKey(process.env.OPENAI_API_KEY)) {
    return process.env.OPENAI_API_KEY;
  }
  // Legacy fallback for older deployments that stored the API key in the model var.
  if (looksLikeApiKey(process.env.OPENAI_PLANT_MODEL)) {
    return process.env.OPENAI_PLANT_MODEL;
  }
  return null;
}

function resolvePlantOpenRouterKey() {
  if (looksLikeApiKey(process.env.OPENROUTER_PLANT_API_KEY)) {
    return process.env.OPENROUTER_PLANT_API_KEY;
  }
  if (looksLikeApiKey(process.env.OPENROUTER_API_KEY)) {
    return process.env.OPENROUTER_API_KEY;
  }
  return null;
}

const SYSTEM_PROMPT = `You are Plant AI Doctor, a careful agronomist and plant-vision assistant.
Analyze one crop image and return only valid JSON.
Be cautious: do not invent certainty. If the image is unclear, say so.
When possible, identify the most likely crop, the most likely disease or issue, severity, confidence, why you think so, immediate actions, long-term care, prevention, and spread risk.
Only provide focusRegions when visible lesions or damaged tissue are clearly identifiable. If the affected area is not visually clear, return an empty array.
If the plant appears healthy, set isHealthy to true and explain why.
Include a short disclaimer that this is AI guidance and severe cases should be reviewed by a local agronomist.
Prioritize crop-specific reasoning when the crop is known, but stay fully usable for any crop, including crops outside the examples provided.`;

const FOLLOW_UP_SYSTEM_PROMPT = `You are Plant AI Doctor, a conversational agronomy assistant.
Answer follow-up questions about a plant diagnosis in a natural, helpful, real-time way.
Use the provided diagnosis as context, but do not pretend you are certain when the diagnosis confidence is low.
If the diagnosis provider is local or fallback, say that image-based AI diagnosis was limited and give the best practical next steps.
Keep answers specific to the user question, practical, and easy to follow.
Do not output JSON.`;

function normalizeArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => item?.toString().trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function sanitizeModelName(value, fallback) {
  const trimmed = value?.toString().trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith('sk-')) {
    console.warn(
      `[PLANT AI] Ignoring invalid model env value that looks like an API key. Using fallback model ${fallback}.`,
    );
    return fallback;
  }
  return trimmed;
}

function extractJsonObject(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  return raw.slice(first, last + 1);
}

function parseAiJson(content) {
  if (!content) return null;
  if (typeof content === 'object') return content;

  try {
    return JSON.parse(content);
  } catch (_) {
    const extracted = extractJsonObject(content);
    if (!extracted) return null;
    try {
      return JSON.parse(extracted);
    } catch (_) {
      return null;
    }
  }
}

function buildCropGuidance(cropType) {
  const normalized = cropType?.toString().trim().toLowerCase() || '';
  const general =
    'Work for any crop. If the supplied crop label seems wrong, say that clearly and infer the crop only when visual evidence is strong. Distinguish disease from nutrient deficiency, insect damage, sun scorch, herbicide injury, edema, water stress, and physical injury. When uncertain, explicitly lower confidence.';

  if (!normalized) {
    return `${general} No crop was supplied, so first infer the crop family only if the image supports it.`;
  }

  if (normalized.includes('tomato')) {
    return `${general} For tomato, carefully differentiate early blight, late blight, septoria leaf spot, bacterial spot, leaf mold, mosaic virus, spider mite stippling, sunscald, and calcium-related blossom-end rot or nutrient stress. Pay attention to concentric lesions, water-soaked tissue, yellow halos, fruit lesions, and lower-leaf progression.`;
  }

  if (normalized.includes('maize') || normalized.includes('corn')) {
    return `${general} For maize, check for northern corn leaf blight, gray leaf spot, rust, maize streak virus, fall armyworm feeding, nutrient striping, drought curling, and stalk stress. Pay attention to elongated cigar lesions, rectangular gray lesions, rust pustules, whorl feeding, and striped chlorosis.`;
  }

  if (normalized.includes('pepper') || normalized.includes('chili')) {
    return `${general} For pepper, differentiate bacterial leaf spot, anthracnose, cercospora leaf spot, mosaic virus, mite damage, edema, blossom-end rot, and sunscald. Pay attention to greasy lesions, fruit sunken spots, puckering, leaf curling, and fruit-end collapse.`;
  }

  if (normalized.includes('cassava')) {
    return `${general} For cassava, consider cassava mosaic disease, cassava brown streak disease, bacterial blight, red mite damage, anthracnose, nutrient deficiency, and drought stress. Watch for mosaic mottling, leaf distortion, stem lesions, dieback, and root-quality implications if visible.`;
  }

  if (normalized.includes('plantain') || normalized.includes('banana')) {
    return `${general} For plantain or banana, differentiate black sigatoka, yellow sigatoka, bunchy top, bacterial wilt, cigar-end rot, weevil stress, and wind tearing. Focus on elongated streaks, necrotic margins, cigar-shaped fruit-end decay, wilt pattern, and pseudostem or leaf-emergence abnormalities.`;
  }

  return `${general} The crop label is "${cropType}". Use that label as context, but remain cautious and describe what visual evidence supports or weakens the diagnosis for this specific crop.`;
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
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
  if (text.includes('401') || text.includes('invalid api key')) {
    return 'auth';
  }
  return 'unavailable';
}

function buildWeatherRisk(weather) {
  if (!weather || typeof weather !== 'object') {
    return {
      title: 'Weather context unavailable',
      message:
        'Local weather was not available for this scan, so disease pressure may be underestimated.',
      riskLevel: 'unknown',
    };
  }

  const humidity = Number(weather.humidity ?? 0);
  const tempC = Number(weather.temp_c ?? weather.tempC ?? 0);
  const summary = weather.summary?.toString() || 'Current conditions';

  if (humidity >= 85) {
    return {
      title: 'High fungal pressure',
      message: `${summary} with ${humidity}% humidity can accelerate fungal spread and leaf wetness issues.`,
      riskLevel: 'high',
    };
  }

  if (humidity >= 70) {
    return {
      title: 'Watch disease spread',
      message: `${summary} with elevated humidity can support continued disease development if airflow is poor.`,
      riskLevel: 'moderate',
    };
  }

  if (tempC >= 32) {
    return {
      title: 'Heat stress may worsen symptoms',
      message: `Around ${tempC.toStringAsFixed(1)}°C, stressed crops may decline faster even when infection pressure is moderate.`,
      riskLevel: 'moderate',
    };
  }

  return {
    title: 'Conditions are relatively stable',
    message: `${summary} does not strongly increase disease spread right now, but continued scouting is still recommended.`,
    riskLevel: 'low',
  };
}

function buildLocalFallback({ cropType, weather, failureReason }) {
  const weatherRisk = buildWeatherRisk(weather);
  const cropName = cropType || 'Plant sample';
  const isNetworkIssue = failureReason?.toLowerCase().includes('timeout');
  const failureType = detectProviderFailureType(failureReason);
  const analysisQuality = failureReason ? 'provider_unreachable' : 'fallback';
  const summary = failureReason
    ? failureType === 'billing'
      ? `The live plant diagnosis provider is configured but currently has no usable quota or credits for ${cropName}, so this result is cautious fallback guidance only.`
      : `Plant AI Doctor could not reach the live diagnosis provider for ${cropName}, so this result is cautious offline guidance only.`
    : `The image could not be confidently matched to a known disease model, so Plant AI Doctor is returning cautious guidance for ${cropName}.`;
  const plainLanguage = failureReason
    ? failureType === 'billing'
      ? 'The backend provider is out of quota or credits right now, so this screen is showing safe fallback guidance instead of a verified crop-specific diagnosis.'
      : 'The live AI diagnosis request did not complete, so this screen is showing safe fallback guidance instead of a verified crop-specific diagnosis.'
    : 'The crop may be under disease or stress pressure, but the photo is not clear enough for a precise match.';

  return {
    isHealthy: false,
    cropName,
    analysisQuality,
    provider: 'local',
    generatedAt: new Date().toISOString(),
    summary,
    mostProbableDisease: {
      name: 'Uncertain diagnosis',
      probability: 0,
      severity: 'Moderate',
      status: 'Needs review',
      summary:
        failureReason
          ? 'Visible stress may be present, but the live diagnosis provider was unavailable before the scan could be verified.'
          : 'Visible stress is present, but the image alone is not enough for a reliable disease name.',
      plainLanguage,
      treatment: {
        immediateActions: [
          'Isolate the affected plant from healthy plants if possible.',
          'Remove badly damaged leaves using clean tools.',
          'Avoid overhead watering until symptoms are confirmed.',
        ],
        longTermCare: [
          'Improve spacing and airflow around the crop canopy.',
          'Track symptom changes over the next 48 hours with fresh photos.',
        ],
        chemical: [
          'Use a crop-appropriate fungicide only after confirming fungal symptoms with a local expert.',
        ],
        biological: [
          'Sanitize tools and remove plant debris to reduce secondary spread.',
        ],
      },
      prevention: [
        'Water early in the day so foliage dries quickly.',
        'Inspect nearby plants for matching spots, wilting, or discoloration.',
        'Use clean pruning tools and discard infected debris away from the field.',
      ],
      spreadRisk: {
        level: weatherRisk.riskLevel === 'high' ? 'High' : 'Moderate',
        score: weatherRisk.riskLevel === 'high' ? 72 : 48,
        reason: weatherRisk.message,
      },
      focusRegions: [],
    },
    diseases: [
      {
        name: 'Uncertain diagnosis',
        probability: 0,
        severity: 'Moderate',
      },
    ],
    suggestions: [
      'Retake the photo in natural light with one leaf or one affected area filling most of the frame.',
      'Capture a tighter close-up of the damaged area so the next scan has stronger evidence.',
      'Compare the next scan after removing affected tissue to monitor spread.',
    ],
    environment: weather
      ? {
          location: weather.location || weather.city || 'Current location',
          condition: weather.summary || 'Unknown',
          temperatureC: weather.temp_c ?? weather.tempC,
          humidity: weather.humidity,
          riskTitle: weatherRisk.title,
          riskNote: weatherRisk.message,
        }
      : null,
    diagnosisMeta: {
      liveDiagnosisAvailable: false,
      failureReason: failureReason || null,
      isNetworkIssue,
      failureType,
    },
    disclaimer:
      'AI guidance only. For severe wilting, stem cankers, or rapid field spread, confirm with a local agronomist before treatment.',
  };
}

function sanitizeDiagnosis(raw, { cropType, weather }) {
  const fallback = buildLocalFallback({ cropType, weather });
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const disease = raw.mostProbableDisease || {};
  const probability = clampNumber(
    disease.probability ?? raw.confidence ?? 0,
    0,
    1,
    0,
  );
  const spreadScore = clampNumber(
    disease.spreadRisk?.score ?? raw.spreadRisk?.score ?? 45,
    0,
    100,
    45,
  );

  const focusRegions = Array.isArray(disease.focusRegions)
    ? disease.focusRegions
        .map((item) => ({
          x: clampNumber(item?.x, 0, 1, 0.18),
          y: clampNumber(item?.y, 0, 1, 0.2),
          width: clampNumber(item?.width, 0.05, 1, 0.4),
          height: clampNumber(item?.height, 0.05, 1, 0.3),
          label: item?.label?.toString().trim() || 'Area of concern',
        }))
        .slice(0, 3)
    : [];

  const weatherRisk = buildWeatherRisk(weather);

  return {
    isHealthy: Boolean(raw.isHealthy),
    cropName:
      raw.cropName?.toString().trim() ||
      cropType ||
      fallback.cropName,
    analysisQuality:
      raw.analysisQuality?.toString().trim() || 'structured',
    provider: raw.provider?.toString().trim() || 'ai',
    generatedAt: new Date().toISOString(),
    summary:
      raw.summary?.toString().trim() || fallback.summary,
    mostProbableDisease: {
      name:
        disease.name?.toString().trim() ||
        (raw.isHealthy ? 'Healthy plant' : fallback.mostProbableDisease.name),
      probability,
      severity:
        disease.severity?.toString().trim() ||
        (raw.isHealthy ? 'Low' : 'Moderate'),
      status:
        disease.status?.toString().trim() ||
        (raw.isHealthy ? 'Healthy' : 'Needs attention'),
      summary:
        disease.summary?.toString().trim() ||
        fallback.mostProbableDisease.summary,
      plainLanguage:
        disease.plainLanguage?.toString().trim() ||
        fallback.mostProbableDisease.plainLanguage,
      treatment: {
        immediateActions: normalizeArray(
          disease.treatment?.immediateActions,
        ),
        longTermCare: normalizeArray(disease.treatment?.longTermCare),
        chemical: normalizeArray(disease.treatment?.chemical),
        biological: normalizeArray(disease.treatment?.biological),
      },
      prevention: normalizeArray(disease.prevention),
      spreadRisk: {
        level:
          disease.spreadRisk?.level?.toString().trim() ||
          weatherRisk.riskLevel.toUpperCase(),
        score: spreadScore,
        reason:
          disease.spreadRisk?.reason?.toString().trim() ||
          weatherRisk.message,
      },
      focusRegions,
    },
    diseases: Array.isArray(raw.diseases) && raw.diseases.length
      ? raw.diseases.map((item) => ({
          name: item?.name?.toString().trim() || fallback.mostProbableDisease.name,
          probability: clampNumber(item?.probability, 0, 1, probability),
          severity: item?.severity?.toString().trim() || 'Moderate',
        }))
      : [
          {
            name:
              disease.name?.toString().trim() ||
              fallback.mostProbableDisease.name,
            probability,
            severity:
              disease.severity?.toString().trim() || 'Moderate',
          },
        ],
    suggestions: normalizeArray(raw.suggestions).length
      ? normalizeArray(raw.suggestions)
      : fallback.suggestions,
    environment: weather
      ? {
          location: weather.location || weather.city || 'Current location',
          condition: weather.summary || 'Unknown',
          temperatureC: weather.temp_c ?? weather.tempC,
          humidity: weather.humidity,
          riskTitle:
            raw.environment?.riskTitle?.toString().trim() || weatherRisk.title,
          riskNote:
            raw.environment?.riskNote?.toString().trim() || weatherRisk.message,
        }
      : raw.environment || null,
    disclaimer:
      raw.disclaimer?.toString().trim() || fallback.disclaimer,
  };
}

function shouldRefineFocusRegions(diagnosis) {
  if (!diagnosis || typeof diagnosis !== 'object') return false;
  const disease = diagnosis.mostProbableDisease || {};
  const probability = Number(disease.probability ?? 0);
  return (
    diagnosis.provider !== 'local' &&
    !diagnosis.isHealthy &&
    Number.isFinite(probability) &&
    probability >= 0.68
  );
}

function sanitizeFocusRegionResult(raw) {
  const regions = Array.isArray(raw?.focusRegions)
    ? raw.focusRegions
        .map((item) => ({
          x: clampNumber(item?.x, 0, 1, 0.18),
          y: clampNumber(item?.y, 0, 1, 0.2),
          width: clampNumber(item?.width, 0.05, 1, 0.4),
          height: clampNumber(item?.height, 0.05, 1, 0.3),
          label: item?.label?.toString().trim() || 'Area of concern',
        }))
        .slice(0, 3)
    : [];

  return {
    analysisQuality:
      raw?.analysisQuality?.toString().trim() || 'focus_unverified',
    focusRegions: regions,
    needsRetake: Boolean(raw?.needsRetake),
    retakeReason: raw?.retakeReason?.toString().trim() || '',
  };
}

async function refineFocusRegionsWithOpenAI(
  imageDataUrl,
  contextPayload,
  safeDiagnosis,
) {
  const apiKey = resolvePlantOpenAIKey();
  if (!apiKey) return null;
  const model = sanitizeModelName(OPENAI_MODEL, 'gpt-4o-mini');

  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You verify whether the diseased area is visually clear enough to box. Return only JSON.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                `Return JSON with keys: analysisQuality, focusRegions, needsRetake, retakeReason.\n` +
                `Only return focusRegions if the visibly affected tissue is obvious and bounded.\n` +
                `If the lesion area is ambiguous, small, blurred, hidden, or mixed with healthy tissue, return an empty focusRegions array and set needsRetake true.\n` +
                `Use the first-pass diagnosis only as context, not as proof.\n` +
                `First-pass context:\n${JSON.stringify({
                  cropName: safeDiagnosis.cropName,
                  summary: safeDiagnosis.summary,
                  mostProbableDisease: safeDiagnosis.mostProbableDisease,
                  weather: contextPayload.weather,
                })}`,
            },
            {
              type: 'image_url',
              image_url: { url: imageDataUrl },
            },
          ],
        },
      ],
      max_tokens: 280,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: REQUEST_TIMEOUT_MS,
    },
  );

  return sanitizeFocusRegionResult(
    parseAiJson(response.data?.choices?.[0]?.message?.content?.trim()),
  );
}

async function refineFocusRegionsWithOpenRouter(
  imageDataUrl,
  contextPayload,
  safeDiagnosis,
) {
  const apiKey = resolvePlantOpenRouterKey();
  if (!apiKey) return null;
  const model = sanitizeModelName(
    OPENROUTER_MODEL,
    'openai/gpt-4o-mini',
  );

  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You verify whether the diseased area is visually clear enough to box. Return only JSON.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                `Return JSON with keys: analysisQuality, focusRegions, needsRetake, retakeReason.\n` +
                `Only return focusRegions if the visibly affected tissue is obvious and bounded.\n` +
                `If the lesion area is ambiguous, small, blurred, hidden, or mixed with healthy tissue, return an empty focusRegions array and set needsRetake true.\n` +
                `Use the first-pass diagnosis only as context, not as proof.\n` +
                `First-pass context:\n${JSON.stringify({
                  cropName: safeDiagnosis.cropName,
                  summary: safeDiagnosis.summary,
                  mostProbableDisease: safeDiagnosis.mostProbableDisease,
                  weather: contextPayload.weather,
                })}`,
            },
            {
              type: 'image_url',
              image_url: { url: imageDataUrl },
            },
          ],
        },
      ],
      max_tokens: 280,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: REQUEST_TIMEOUT_MS,
    },
  );

  return sanitizeFocusRegionResult(
    parseAiJson(response.data?.choices?.[0]?.message?.content?.trim()),
  );
}

async function sendToOpenAI(imageDataUrl, contextPayload) {
  const apiKey = resolvePlantOpenAIKey();
  if (!apiKey) return null;
  const model = sanitizeModelName(OPENAI_MODEL, 'gpt-4o-mini');
  const cropGuidance = buildCropGuidance(contextPayload.cropType);
  const content = [
    {
      type: 'text',
      text:
        `Return JSON with keys: isHealthy, cropName, analysisQuality, summary, mostProbableDisease, diseases, suggestions, environment, disclaimer.\n` +
        `For mostProbableDisease include: name, probability, severity, status, summary, plainLanguage, treatment, prevention, spreadRisk, focusRegions.\n` +
        `Treatment must include arrays immediateActions, longTermCare, chemical, biological.\n` +
        `Be strict about uncertainty and avoid over-diagnosing from weak visual evidence.\n` +
        `If the image does not clearly isolate the damaged tissue, return focusRegions as an empty array.\n` +
        `Crop-specific guidance: ${cropGuidance}\n` +
        `SpreadRisk must include level, score, reason.\n` +
        `If manualFocus is true, the first image is a close-up of the suspected lesion and any second image is the full plant context.\n` +
        `Context:\n${JSON.stringify(contextPayload)}`,
    },
    {
      type: 'image_url',
      image_url: { url: imageDataUrl },
    },
  ];

  if (contextPayload.fullImageDataUrl) {
    content.push({
      type: 'image_url',
      image_url: { url: contextPayload.fullImageDataUrl },
    });
  }

  const payload = {
    model,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content,
      },
    ],
    max_tokens: 900,
  };

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      payload,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );

    const responseContent = response.data?.choices?.[0]?.message?.content?.trim();
    return parseAiJson(responseContent);
  } catch (error) {
    const status = error.response?.status;
    if (status !== 400 && status !== 422) throw error;

    const fallbackResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        ...payload,
        response_format: undefined,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );

    const responseContent =
      fallbackResponse.data?.choices?.[0]?.message?.content?.trim();
    return parseAiJson(responseContent);
  }
}

async function sendToOpenRouter(imageDataUrl, contextPayload) {
  const apiKey = resolvePlantOpenRouterKey();
  if (!apiKey) return null;
  const model = sanitizeModelName(
    OPENROUTER_MODEL,
    'openai/gpt-4o-mini',
  );
  const cropGuidance = buildCropGuidance(contextPayload.cropType);
  const content = [
    {
      type: 'text',
      text:
        `Return JSON with keys: isHealthy, cropName, analysisQuality, summary, mostProbableDisease, diseases, suggestions, environment, disclaimer.\n` +
        `For mostProbableDisease include: name, probability, severity, status, summary, plainLanguage, treatment, prevention, spreadRisk, focusRegions.\n` +
        `Treatment must include arrays immediateActions, longTermCare, chemical, biological.\n` +
        `Be strict about uncertainty and avoid over-diagnosing from weak visual evidence.\n` +
        `If the image does not clearly isolate the damaged tissue, return focusRegions as an empty array.\n` +
        `Crop-specific guidance: ${cropGuidance}\n` +
        `SpreadRisk must include level, score, reason.\n` +
        `If manualFocus is true, the first image is a close-up of the suspected lesion and any second image is the full plant context.\n` +
        `Context:\n${JSON.stringify(contextPayload)}`,
    },
    {
      type: 'image_url',
      image_url: { url: imageDataUrl },
    },
  ];

  if (contextPayload.fullImageDataUrl) {
    content.push({
      type: 'image_url',
      image_url: { url: contextPayload.fullImageDataUrl },
    });
  }

  const payload = {
    model,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content,
      },
    ],
    max_tokens: 900,
  };

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      payload,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );

    const responseContent = response.data?.choices?.[0]?.message?.content?.trim();
    return parseAiJson(responseContent);
  } catch (error) {
    const status = error.response?.status;
    if (status !== 400 && status !== 422) throw error;

    const fallbackResponse = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        ...payload,
        response_format: undefined,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );

    const responseContent =
      fallbackResponse.data?.choices?.[0]?.message?.content?.trim();
    return parseAiJson(responseContent);
  }
}

function buildDiagnosisChatFallback({
  diagnosis,
  question,
  weather,
}) {
  const disease = diagnosis?.mostProbableDisease || {};
  const cropName = diagnosis?.cropName || 'the crop';
  const diseaseName = disease?.name || 'the detected issue';
  const confidence = Number(disease?.probability ?? 0);
  const immediateActions = normalizeArray(disease?.treatment?.immediateActions);
  const prevention = normalizeArray(disease?.prevention);
  const weatherRisk = buildWeatherRisk(weather);

  if (confidence < 0.5 || diagnosis?.provider === 'local') {
    return `The live AI diagnosis service is limited right now, so treat this as a cautious field guide. For ${cropName}, focus on the visibly damaged area, remove badly affected tissue, keep leaves dry, improve airflow, and retake one close-up photo of only the infected spot. ${weatherRisk.message}`;
  }

  const practicalTip =
    immediateActions[0] ||
    prevention[0] ||
    'Scout nearby plants and act early before the problem spreads.';

  return `For ${cropName}, the current diagnosis points most strongly to ${diseaseName}. Based on your question, start with this: ${practicalTip} If symptoms spread fast, re-scan with a tighter close-up and confirm with a local agronomist before spraying.`;
}

async function requestDiagnosisFollowUpOpenAI(payload) {
  const apiKey = resolvePlantOpenAIKey();
  if (!apiKey) return null;
  const model = sanitizeModelName(OPENAI_MODEL, 'gpt-4o-mini');

  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model,
      temperature: 0.35,
      messages: [
        { role: 'system', content: FOLLOW_UP_SYSTEM_PROMPT },
        {
          role: 'user',
          content:
            `Diagnosis context:\n${JSON.stringify(payload.diagnosis)}\n\n` +
            `Weather context:\n${JSON.stringify(payload.weather || null)}\n\n` +
            `Conversation history:\n${JSON.stringify(payload.history || [])}\n\n` +
            `User question:\n${payload.question}`,
        },
      ],
      max_tokens: 260,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: REQUEST_TIMEOUT_MS,
    },
  );

  return response.data?.choices?.[0]?.message?.content?.trim() || null;
}

async function requestDiagnosisFollowUpOpenRouter(payload) {
  const apiKey = resolvePlantOpenRouterKey();
  if (!apiKey) return null;
  const model = sanitizeModelName(OPENROUTER_MODEL, 'openai/gpt-4o-mini');

  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model,
      temperature: 0.35,
      messages: [
        { role: 'system', content: FOLLOW_UP_SYSTEM_PROMPT },
        {
          role: 'user',
          content:
            `Diagnosis context:\n${JSON.stringify(payload.diagnosis)}\n\n` +
            `Weather context:\n${JSON.stringify(payload.weather || null)}\n\n` +
            `Conversation history:\n${JSON.stringify(payload.history || [])}\n\n` +
            `User question:\n${payload.question}`,
        },
      ],
      max_tokens: 260,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: REQUEST_TIMEOUT_MS,
    },
  );

  return response.data?.choices?.[0]?.message?.content?.trim() || null;
}

router.post(
  '/detect-plant-disease',
  diseaseUpload,
  async (req, res) => {
    try {
      const imageFile = req.files?.image?.[0];
      const fullImageFile = req.files?.full_image?.[0];

      if (!imageFile) {
        return res
          .status(400)
          .json({ message: 'Image file is required under field "image".' });
      }

      const cropType = req.body.cropType?.toString().trim() || '';
      let weather = null;

      if (req.body.weather) {
        try {
          weather = JSON.parse(req.body.weather);
        } catch (_) {
          weather = null;
        }
      }

      const imageBuffer = fs.readFileSync(imageFile.path);
      const ext = path.extname(imageFile.originalname || '').toLowerCase();
      const mimeType =
        ext === '.png'
          ? 'image/png'
          : ext === '.webp'
          ? 'image/webp'
          : 'image/jpeg';
      const imageDataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
      let fullImageDataUrl = null;

      if (fullImageFile) {
        const fullBuffer = fs.readFileSync(fullImageFile.path);
        const fullExt = path.extname(fullImageFile.originalname || '').toLowerCase();
        const fullMimeType =
          fullExt === '.png'
            ? 'image/png'
            : fullExt === '.webp'
            ? 'image/webp'
            : 'image/jpeg';
        fullImageDataUrl = `data:${fullMimeType};base64,${fullBuffer.toString('base64')}`;
      }

      const contextPayload = {
        cropType: cropType || 'unknown',
        location: req.body.locationLabel?.toString().trim() || null,
        weather,
        manualFocus: req.body.manualFocus === 'true',
        fullImageDataUrl,
      };

      let diagnosis = null;
      let provider = 'local';
      const providerErrors = [];

      try {
        diagnosis = await sendToOpenAI(imageDataUrl, contextPayload);
        if (diagnosis) provider = 'openai';
      } catch (error) {
        providerErrors.push(`OpenAI: ${summarizeProviderError(error)}`);
        console.error(
          '[PLANT AI] OpenAI diagnosis failed:',
          error.response?.data || error.message,
        );
      }

      if (!diagnosis) {
        try {
          diagnosis = await sendToOpenRouter(imageDataUrl, contextPayload);
          if (diagnosis) provider = 'openrouter';
        } catch (error) {
          providerErrors.push(`OpenRouter: ${summarizeProviderError(error)}`);
          console.error(
            '[PLANT AI] OpenRouter diagnosis failed:',
            error.response?.data || error.message,
          );
        }
      }

      let safeDiagnosis = diagnosis
        ? sanitizeDiagnosis({ ...diagnosis, provider }, { cropType, weather })
        : buildLocalFallback({
            cropType,
            weather,
            failureReason: providerErrors.join(' | '),
          });

      safeDiagnosis.diagnosisMeta = {
        ...(safeDiagnosis.diagnosisMeta || {}),
        liveDiagnosisAvailable: provider !== 'local',
        provider,
        providerErrors,
      };

      if (shouldRefineFocusRegions(safeDiagnosis)) {
        try {
          const refinement =
            provider === 'openai'
              ? await refineFocusRegionsWithOpenAI(
                  imageDataUrl,
                  contextPayload,
                  safeDiagnosis,
                )
              : provider === 'openrouter'
              ? await refineFocusRegionsWithOpenRouter(
                  imageDataUrl,
                  contextPayload,
                  safeDiagnosis,
                )
              : null;

          if (refinement) {
            safeDiagnosis = {
              ...safeDiagnosis,
              analysisQuality:
                refinement.analysisQuality || safeDiagnosis.analysisQuality,
              suggestions:
                refinement.needsRetake && refinement.retakeReason
                  ? [
                      refinement.retakeReason,
                      ...safeDiagnosis.suggestions,
                    ].slice(0, 4)
                  : safeDiagnosis.suggestions,
              mostProbableDisease: {
                ...safeDiagnosis.mostProbableDisease,
                focusRegions: refinement.focusRegions,
              },
            };
          }
        } catch (error) {
          console.error(
            '[PLANT AI] Focus region refinement failed:',
            error.response?.data || error.message,
          );
        }
      }

      return res.json(safeDiagnosis);
    } catch (err) {
      console.error('Disease detection error:', err);
      return res.status(500).json({ message: 'Failed to process image' });
    } finally {
      const uploadedFiles = Object.values(req.files || {}).flat();
      for (const file of uploadedFiles) {
        fs.unlink(file.path, () => {});
      }
    }
  },
);

router.post('/detect-plant-disease/chat', async (req, res) => {
  try {
    const question = req.body.question?.toString().trim() || '';
    const diagnosis = req.body.diagnosis;
    const history = Array.isArray(req.body.history) ? req.body.history : [];
    const weather = req.body.weather && typeof req.body.weather === 'object'
      ? req.body.weather
      : null;

    if (!question) {
      return res.status(400).json({ message: 'Question is required.' });
    }

    const payload = { question, diagnosis, history, weather };
    let reply = null;
    let provider = 'local';

    try {
      reply = await requestDiagnosisFollowUpOpenAI(payload);
      if (reply) provider = 'openai';
    } catch (error) {
      console.error(
        '[PLANT AI CHAT] OpenAI follow-up failed:',
        error.response?.data || error.message,
      );
    }

    if (!reply) {
      try {
        reply = await requestDiagnosisFollowUpOpenRouter(payload);
        if (reply) provider = 'openrouter';
      } catch (error) {
        console.error(
          '[PLANT AI CHAT] OpenRouter follow-up failed:',
          error.response?.data || error.message,
        );
      }
    }

    if (!reply) {
      reply = buildDiagnosisChatFallback({ diagnosis, question, weather });
    }

    return res.json({ reply, provider });
  } catch (error) {
    console.error('[PLANT AI CHAT] Unexpected error:', error.message);
    return res.json({
      reply: buildDiagnosisChatFallback({
        diagnosis: req.body.diagnosis,
        question: req.body.question?.toString() || '',
        weather: req.body.weather,
      }),
      provider: 'local',
    });
  }
});

module.exports = router;
