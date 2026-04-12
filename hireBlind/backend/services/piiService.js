// backend/services/piiService.js
const { OpenAI } = require('openai');

const ollama = new OpenAI({
  apiKey: 'ollama', // Required but intentionally ignored by Ollama
  baseURL: 'http://localhost:11434/v1',
  timeout: 120000, // 120s — llama3 (8B) on CPU needs 45-90s per resume
});

// ─────────────────────────────────────────────────────────────────────────────
// ENHANCED REGEX PATTERNS — Primary PII removal (fast, deterministic, instant)
// ─────────────────────────────────────────────────────────────────────────────
const PII_PATTERNS = [
  { field: 'email',       pattern: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,                                     replacement: '[EMAIL_REDACTED]'       },
  { field: 'phone',       pattern: /(\+?\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}/g,                      replacement: '[PHONE_REDACTED]'       },
  { field: 'linkedin',    pattern: /https?:\/\/(?:www\.)?linkedin\.com\/in\/[^\s,)>"']*/gi,                                    replacement: '[LINKEDIN_REDACTED]'    },
  { field: 'github',      pattern: /https?:\/\/(?:www\.)?github\.com\/[^\s,)>"']*/gi,                                          replacement: '[GITHUB_REDACTED]'      },
  { field: 'twitter',     pattern: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^\s,)>"']*/gi,                                  replacement: '[TWITTER_REDACTED]'     },
  { field: 'url',         pattern: /https?:\/\/[^\s,)>"']{10,}/gi,                                                            replacement: '[URL_REDACTED]'         },
  { field: 'dob',         pattern: /\b(?:DOB|Date of Birth|Born)[:\s]+[\d]{1,2}[\/\-.][\d]{1,2}[\/\-.][\d]{2,4}/gi,          replacement: '[DOB_REDACTED]'         },
  { field: 'address',     pattern: /\b\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Za-z]+){1,4},?\s+[A-Z][a-z]+/g,                        replacement: '[ADDRESS_REDACTED]'     },
  { field: 'postcode',    pattern: /\b[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}\b|\b\d{5}(?:-\d{4})?\b/g,                       replacement: '[POSTCODE_REDACTED]'    },
  { field: 'gender',      pattern: /\b(?:Pronouns?|Gender)[:\s]+[^\n,;]{2,20}/gi,                                             replacement: '[GENDER_REDACTED]'      },
  { field: 'nationality', pattern: /\b(?:Nationality|Citizenship)[:\s]+[^\n,;]{2,30}/gi,                                      replacement: '[NATIONALITY_REDACTED]' },
];

// ─────────────────────────────────────────────────────────────────────────────
// JSON REPAIR — Fixes common LLM output mistakes before parsing
// ─────────────────────────────────────────────────────────────────────────────
function repairJSON(str) {
  let s = str;

  // Remove markdown code fences
  s = s.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

  // Extract just the JSON object
  const match = s.match(/\{[\s\S]*\}/);
  if (!match) return null;
  s = match[0];

  // Fix trailing commas before } or ]
  s = s.replace(/,\s*([}\]])/g, '$1');

  // Fix unquoted property names: { field: "value" } → { "field": "value" }
  s = s.replace(/{\s*(\w+)\s*:/g, '{"$1":');
  s = s.replace(/,\s*(\w+)\s*:/g, ',"$1":');

  // Fix single quotes to double quotes (but not within strings)
  s = s.replace(/'/g, '"');

  // Try to fix unterminated strings: add closing quote before } or ]
  // Count quotes — if odd, add one at the end before the last }
  const quoteCount = (s.match(/"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    // Find last unterminated string and close it
    const lastBrace = s.lastIndexOf('}');
    if (lastBrace > 0) {
      s = s.substring(0, lastBrace) + '"' + s.substring(lastBrace);
    }
  }

  // Fix common escaping issues — literal newlines inside strings
  s = s.replace(/(?<=": ")([\s\S]*?)(?=")/g, (match) => {
    return match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
  });

  return s;
}

function safeParseJSON(content) {
  // Attempt 1: Direct parse
  try {
    return JSON.parse(content);
  } catch (e) { /* continue */ }

  // Attempt 2: Extract and parse JSON object
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) { /* continue */ }
  }

  // Attempt 3: Repair and parse
  const repaired = repairJSON(content);
  if (repaired) {
    try {
      return JSON.parse(repaired);
    } catch (e) { /* continue */ }
  }

  // Attempt 4: If we can at least find the anonymisedText, extract it manually
  const textMatch = content.match(/anonymi[sz]edText['":\s]+['"]?([\s\S]*?)['"]?\s*[,}]/i);
  if (textMatch) {
    return {
      anonymisedText: textMatch[1].trim(),
      removedFields: [],
    };
  }

  return null;
}

/**
 * Strip PII using enhanced regex patterns — zero latency, zero failures.
 */
function stripPIIWithRegex(resumeText) {
  let anonymisedText = resumeText;
  const removedFields = [];

  for (const { pattern, replacement, field } of PII_PATTERNS) {
    const matches = anonymisedText.match(pattern);
    if (matches) {
      matches.forEach((match) => {
        removedFields.push({ field, originalValue: match, replacement });
      });
      anonymisedText = anonymisedText.replace(pattern, replacement);
    }
  }

  return { anonymisedText, removedFields };
}

/**
 * Strip PII with Ollama LLM for deeper semantic detection.
 * Uses a simplified prompt that's easier for small models to follow.
 */
async function stripPIIWithOllama(resumeText) {
  const modelName = process.env.OLLAMA_MODEL || 'llama3';

  // Simpler, shorter prompt — small models handle this much better
  const prompt = `Redact all personal info from this resume. Replace names with [NAME_REDACTED], emails with [EMAIL_REDACTED], phones with [PHONE_REDACTED], addresses with [ADDRESS_REDACTED], and any other PII with appropriate [X_REDACTED] tags.

Return JSON: {"anonymisedText": "the redacted resume text"}

Resume:
${resumeText.substring(0, 3000)}`; // Cap at 3000 chars to avoid overwhelming small models

  const response = await ollama.chat.completions.create({
    model: modelName,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
  });

  const content = (response.choices[0].message.content || '').trim();
  const parsed = safeParseJSON(content);

  if (!parsed || !parsed.anonymisedText) {
    throw new Error(`Could not parse Ollama response (${content.length} chars)`);
  }

  return {
    anonymisedText: parsed.anonymisedText,
    removedFields: parsed.removedFields || [],
  };
}

/**
 * Strip PII from a single resume.
 * 
 * When OLLAMA_PII=true: Runs regex FIRST (instant), then enhances with Ollama
 * for deeper detection (catches names, contextual info regex can't find).
 * When OLLAMA_PII=false (default): Regex only.
 */
async function stripPII(resumeText) {
  // Step 1: Always run regex first (instant, reliable)
  const regexResult = stripPIIWithRegex(resumeText);

  // Step 2: Optionally enhance with Ollama for deeper PII detection
  const useOllama = process.env.OLLAMA_PII === 'true';

  if (useOllama) {
    try {
      // Feed the already-regex-cleaned text to Ollama for deeper cleaning
      const ollamaResult = await stripPIIWithOllama(regexResult.anonymisedText);
      return {
        anonymisedText: ollamaResult.anonymisedText,
        removedFields: [...regexResult.removedFields, ...(ollamaResult.removedFields || [])],
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.warn('Ollama PII enhancement failed, using regex-only result:', error.message);
      // Regex result is still valid — use it
    }
  }

  return { ...regexResult, timestamp: new Date().toISOString() };
}

/**
 * Batch process resumes in parallel — safe since regex is non-blocking.
 */
async function stripPIIBatch(resumes) {
  const results = await Promise.all(
    resumes.map(async (resume) => {
      try {
        const result = await stripPII(resume.text);
        return { resumeId: resume.id, ...result, status: 'success' };
      } catch (error) {
        return { resumeId: resume.id, status: 'error', error: error.message };
      }
    })
  );
  return results;
}

module.exports = { stripPII, stripPIIBatch };