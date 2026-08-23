const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../config/logger');

const client = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

// Fallbacks returned whenever the LLM call fails or is unconfigured, so the
// rest of the booking/visit flow never breaks because of an LLM outage.
// The doctor still sees "review needed" instead of a blank field, and the
// appointment status is never blocked on LLM success.
const FALLBACK_PRE_VISIT = {
  urgencyLevel: 'MEDIUM',
  chiefComplaint: 'Automated summary unavailable — please review symptoms manually below.',
  suggestedQuestions: [
    'When did the symptoms start?',
    'Have the symptoms gotten better, worse, or stayed the same?',
    'Are there any relevant past conditions or medications?',
  ],
  generatedByLLM: false,
};

const FALLBACK_POST_VISIT =
  'A summary could not be generated automatically this time. Please see the doctor\'s notes ' +
  'and prescription below, or contact the clinic if anything is unclear.';

function stripCodeFence(text) {
  return text.replace(/```json|```/g, '').trim();
}

async function callWithRetry(fn, retries = 2, delayMs = 500) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      logger.warn(`LLM call failed (attempt ${attempt + 1}/${retries + 1}): ${err.message}`);
      if (attempt < retries) await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
  throw lastErr;
}

/**
 * Generates a pre-visit summary for the doctor from raw patient symptom text.
 * Returns { urgencyLevel, chiefComplaint, suggestedQuestions[], generatedByLLM }
 * Never throws — falls back to a safe default so booking can always proceed.
 */
async function generatePreVisitSummary(symptomText) {
  if (!client) {
    logger.warn('ANTHROPIC_API_KEY not set — returning fallback pre-visit summary');
    return FALLBACK_PRE_VISIT;
  }

  const prompt =
    `Analyse these symptoms and return ONLY valid JSON, no preamble, no markdown fences, ` +
    `matching exactly this shape: ` +
    `{"urgencyLevel": "Low" | "Medium" | "High", "chiefComplaint": string, ` +
    `"suggestedQuestions": [string, string, string]}. ` +
    `Symptoms: ${symptomText}`;

  try {
    const result = await callWithRetry(() =>
      client.messages.create({
        model: MODEL,
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      })
    );

    const raw = result.content.find((b) => b.type === 'text')?.text || '';
    const parsed = JSON.parse(stripCodeFence(raw));

    return {
      urgencyLevel: String(parsed.urgencyLevel || 'Medium').toUpperCase(),
      chiefComplaint: parsed.chiefComplaint || FALLBACK_PRE_VISIT.chiefComplaint,
      suggestedQuestions: Array.isArray(parsed.suggestedQuestions)
        ? parsed.suggestedQuestions.slice(0, 3)
        : FALLBACK_PRE_VISIT.suggestedQuestions,
      generatedByLLM: true,
    };
  } catch (err) {
    logger.error(`Pre-visit LLM summary failed permanently: ${err.message}`);
    return FALLBACK_PRE_VISIT;
  }
}

/**
 * Converts clinical notes + prescription into a patient-friendly summary.
 * Never throws — falls back to a safe default so the visit can still be
 * marked complete and the patient still gets useful info (raw notes).
 */
async function generatePostVisitSummary(notes, prescription) {
  if (!client) {
    logger.warn('ANTHROPIC_API_KEY not set — returning fallback post-visit summary');
    return FALLBACK_POST_VISIT;
  }

  const prescriptionText = Array.isArray(prescription)
    ? prescription
        .map((p) => `${p.medicine} ${p.dosage}, ${p.frequencyPerDay}x/day for ${p.durationDays} days`)
        .join('; ')
    : 'None';

  const prompt =
    `Convert these clinical notes into a patient-friendly summary with a medication schedule ` +
    `and follow-up steps. Use simple, non-technical language and short sections. ` +
    `Clinical notes: ${notes}. Prescription: ${prescriptionText}`;

  try {
    const result = await callWithRetry(() =>
      client.messages.create({
        model: MODEL,
        max_tokens: 700,
        messages: [{ role: 'user', content: prompt }],
      })
    );

    const text = result.content.find((b) => b.type === 'text')?.text;
    return text && text.trim().length > 0 ? text.trim() : FALLBACK_POST_VISIT;
  } catch (err) {
    logger.error(`Post-visit LLM summary failed permanently: ${err.message}`);
    return FALLBACK_POST_VISIT;
  }
}

module.exports = { generatePreVisitSummary, generatePostVisitSummary };
