const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { ensureUploadDir } = require('../config/uploadPaths');

const router = express.Router();
const upload = multer({ dest: ensureUploadDir('disease') });

const OPENAI_MODEL = process.env.OPENAI_PLANT_MODEL || 'gpt-4o-mini';
const OPENROUTER_MODEL =
  process.env.OPENROUTER_PLANT_MODEL || 'openai/gpt-4o-mini';
const REQUEST_TIMEOUT_MS = 45000;

const SYSTEM_PROMPT = `You are Plant AI Doctor, a careful agronomist and plant-vision assistant.
Analyze one crop image and return only valid JSON.
Be cautious: do not invent certainty. If the image is unclear, say so.
When possible, identify the most likely crop, the most likely disease or issue, severity, confidence, why you think so, immediate actions, long-term care, prevention, and spread risk.
Only provide focusRegions when visible lesions or damaged tissue are clearly identifiable. If the affected area is not visually clear, return an empty array.
If the plant appears healthy, set isHealthy to true and explain why.
Include a short disclaimer that this is AI guidance and severe cases should be reviewed by a local agronomist.
Prioritize crop-specific reasoning when the crop is known, but stay fully usable for any crop, including crops outside the examples provided.`;

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

  if (normalized.contains('tomato')) {
    return `${general} For tomato, carefully differentiate early blight, late blight, septoria leaf spot, bacterial spot, leaf mold, mosaic virus, spider mite stippling, sunscald, and calcium-related blossom-end rot or nutrient stress. Pay attention to concentric lesions, water-soaked tissue, yellow halos, fruit lesions, and lower-leaf progression.`;
  }

  if (normalized.contains('maize') || normalized.contains('corn')) {
    return `${general} For maize, check for northern corn leaf blight, gray leaf spot, rust, maize streak virus, fall armyworm feeding, nutrient striping, drought curling, and stalk stress. Pay attention to elongated cigar lesions, rectangular gray lesions, rust pustules, whorl feeding, and striped chlorosis.`;
  }

  if (normalized.contains('pepper') || normalized.contains('chili')) {
    return `${general} For pepper, differentiate bacterial leaf spot, anthracnose, cercospora leaf spot, mosaic virus, mite damage, edema, blossom-end rot, and sunscald. Pay attention to greasy lesions, fruit sunken spots, puckering, leaf curling, and fruit-end collapse.`;
  }

  if (normalized.contains('cassava')) {
    return `${general} For cassava, consider cassava mosaic disease, cassava brown streak disease, bacterial blight, red mite damage, anthracnose, nutrient deficiency, and drought stress. Watch for mosaic mottling, leaf distortion, stem lesions, dieback, and root-quality implications if visible.`;
  }

  if (normalized.contains('plantain') || normalized.contains('banana')) {
    return `${general} For plantain or banana, differentiate black sigatoka, yellow sigatoka, bunchy top, bacterial wilt, cigar-end rot, weevil stress, and wind tearing. Focus on elongated streaks, necrotic margins, cigar-shaped fruit-end decay, wilt pattern, and pseudostem or leaf-emergence abnormalities.`;
  }

  return `${general} The crop label is "${cropType}". Use that label as context, but remain cautious and describe what visual evidence supports or weakens the diagnosis for this specific crop.`;
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
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

function buildLocalFallback({ cropType, weather }) {
  const weatherRisk = buildWeatherRisk(weather);
  const cropName = cropType || 'Plant sample';

  return {
    isHealthy: false,
    cropName,
    analysisQuality: 'fallback',
    provider: 'local',
    generatedAt: new Date().toISOString(),
    summary:
      `The image could not be confidently matched to a known disease model, so Plant AI Doctor is returning cautious guidance for ${cropName}.`,
    mostProbableDisease: {
      name: 'Uncertain diagnosis',
      probability: 0.38,
      severity: 'Moderate',
      status: 'Needs review',
      summary:
        'Visible stress is present, but the image alone is not enough for a reliable disease name.',
      plainLanguage:
        'The crop may be under disease or stress pressure, but the photo is not clear enough for a precise match.',
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
        probability: 0.38,
        severity: 'Moderate',
      },
    ],
    suggestions: [
      'Retake the photo in natural light with one leaf or one affected area filling most of the frame.',
      'Send the crop type before analysis for better context-specific treatment advice.',
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
    disease.probability ?? raw.confidence ?? 0.35,
    0,
    1,
    0.35,
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

  const allowFocusRegions =
    !raw.isHealthy &&
    probability >= 0.55 &&
    raw.analysisQuality?.toString().trim() !== 'fallback' &&
    focusRegions.length > 0;

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
      focusRegions: allowFocusRegions ? focusRegions : [],
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

async function sendToOpenAI(imageDataUrl, contextPayload) {
  if (!process.env.OPENAI_API_KEY) return null;
  const model = sanitizeModelName(OPENAI_MODEL, 'gpt-4o-mini');
  const cropGuidance = buildCropGuidance(contextPayload.cropType);

  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
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
                `Context:\n${JSON.stringify(contextPayload)}`,
            },
            {
              type: 'image_url',
              image_url: { url: imageDataUrl },
            },
          ],
        },
      ],
      max_tokens: 900,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: REQUEST_TIMEOUT_MS,
    },
  );

  const content = response.data?.choices?.[0]?.message?.content?.trim();
  return parseAiJson(content);
}

async function sendToOpenRouter(imageDataUrl, contextPayload) {
  if (!process.env.OPENROUTER_API_KEY) return null;
  const model = sanitizeModelName(
    OPENROUTER_MODEL,
    'openai/gpt-4o-mini',
  );
  const cropGuidance = buildCropGuidance(contextPayload.cropType);

  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
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
                `Context:\n${JSON.stringify(contextPayload)}`,
            },
            {
              type: 'image_url',
              image_url: { url: imageDataUrl },
            },
          ],
        },
      ],
      max_tokens: 900,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: REQUEST_TIMEOUT_MS,
    },
  );

  const content = response.data?.choices?.[0]?.message?.content?.trim();
  return parseAiJson(content);
}

router.post(
  '/detect-plant-disease',
  upload.single('image'),
  async (req, res) => {
    try {
      if (!req.file) {
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

      const imageBuffer = fs.readFileSync(req.file.path);
      const ext = path.extname(req.file.originalname || '').toLowerCase();
      const mimeType =
        ext === '.png'
          ? 'image/png'
          : ext === '.webp'
          ? 'image/webp'
          : 'image/jpeg';
      const imageDataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;

      const contextPayload = {
        cropType: cropType || 'unknown',
        location: req.body.locationLabel?.toString().trim() || null,
        weather,
      };

      let diagnosis = null;
      let provider = 'local';

      try {
        diagnosis = await sendToOpenAI(imageDataUrl, contextPayload);
        if (diagnosis) provider = 'openai';
      } catch (error) {
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
          console.error(
            '[PLANT AI] OpenRouter diagnosis failed:',
            error.response?.data || error.message,
          );
        }
      }

      const safeDiagnosis = diagnosis
        ? sanitizeDiagnosis({ ...diagnosis, provider }, { cropType, weather })
        : buildLocalFallback({ cropType, weather });

      return res.json(safeDiagnosis);
    } catch (err) {
      console.error('Disease detection error:', err);
      return res.status(500).json({ message: 'Failed to process image' });
    } finally {
      if (req.file) {
        fs.unlink(req.file.path, () => {});
      }
    }
  },
);

module.exports = router;
