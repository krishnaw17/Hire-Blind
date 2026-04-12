// backend/services/scoringService.js
const { OpenAI } = require('openai');

// ─── Ollama (local fallback) ───
const ollama = new OpenAI({
  apiKey: 'ollama',
  baseURL: 'http://localhost:11434/v1',
  timeout: 120000,
});

// ─── Gemini (fast cloud API — primary) ───
const gemini = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  timeout: 30000,
});

/**
 * Determine which AI backend to use.
 * Priority: Gemini (fast, cloud) → Ollama (local) → Mock (keyword)
 */
function getBackend() {
  if (process.env.SCORING_BACKEND === 'ollama') return 'ollama';
  if (process.env.SCORING_BACKEND === 'mock') return 'mock';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return 'ollama'; // default if no cloud key
}

/**
 * Simple keyword-based mock scorer for local development
 */
function mockScoreCandidate(jobDescription, resumeText) {
  const jobWords = (jobDescription || '').toLowerCase().split(/\W+/).filter(w => w.length > 4);
  const resumeLower = (resumeText || '').toLowerCase();
  
  let matchCount = 0;
  jobWords.forEach(word => {
    if (resumeLower.includes(word)) matchCount++;
  });
  
  const matchPercentage = jobWords.length > 0 ? (matchCount / jobWords.length) : 0;
  const score = Math.min(10, Math.max(1, Math.round((matchPercentage * 10) + 3))); 
  
  return {
    score,
    reasoning: "LOCAL FALLBACK: Evaluated based on keyword matching (AI backend unavailable).",
    strengths: ["Keyword matches found in resume"],
    gaps: ["Deep semantic analysis skipped (Fallback mode)"],
    explainabilityTags: ["mock-evaluation", "keyword-match"],
    confidence: 0.5,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build the scoring prompt
 */
function buildScoringPrompt(jobDescription, anonymisedResume, jobTitle) {
  return `You are an expert recruiter scoring candidates for: ${jobTitle}

Job Description:
${jobDescription}

---

Candidate Resume (Anonymised):
${anonymisedResume}

---

Score 1-10 based on: skill match, experience level, role relevance, communication.

Return ONLY valid JSON:
{"score": 7, "reasoning": "2-3 sentences", "strengths": ["str1"], "gaps": ["gap1"], "tags": ["tag1"], "confidence": 0.85}`;
}

/**
 * Parse the AI response safely with multiple fallback strategies
 */
function parseScoreResponse(content) {
  // Try direct parse
  try { return JSON.parse(content); } catch (e) { /* continue */ }

  // Try extracting JSON from markdown or mixed text
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch (e) { /* continue */ }
    
    // Try fixing trailing commas
    try {
      const fixed = jsonMatch[0].replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(fixed);
    } catch (e) { /* continue */ }
  }

  return null;
}

/**
 * Score a candidate using Gemini (cloud — fast, ~1-2s)
 */
async function scoreCandidateGemini(jobDescription, anonymisedResume, jobTitle) {
  const prompt = buildScoringPrompt(jobDescription, anonymisedResume, jobTitle);

  const response = await gemini.chat.completions.create({
    model: 'gemini-2.0-flash',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
  });

  const content = (response.choices[0].message.content || '').trim();
  const parsed = parseScoreResponse(content);

  if (!parsed || typeof parsed.score !== 'number') {
    throw new Error('Invalid Gemini response: ' + content.substring(0, 200));
  }

  return {
    score: parsed.score,
    reasoning: parsed.reasoning || '',
    strengths: parsed.strengths || [],
    gaps: parsed.gaps || [],
    explainabilityTags: parsed.tags || [],
    confidence: parsed.confidence || 0.85,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Score a candidate using Ollama (local — slow, ~45-90s on CPU)
 */
async function scoreCandidateOllama(jobDescription, anonymisedResume, jobTitle) {
  const prompt = buildScoringPrompt(jobDescription, anonymisedResume, jobTitle);
  const modelName = process.env.OLLAMA_MODEL || 'llama3';

  const response = await ollama.chat.completions.create({
    model: modelName,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  });

  const content = (response.choices[0].message.content || '').trim();
  const parsed = parseScoreResponse(content);

  if (!parsed || typeof parsed.score !== 'number') {
    throw new Error('Invalid Ollama response: ' + content.substring(0, 200));
  }

  return {
    score: parsed.score,
    reasoning: parsed.reasoning || '',
    strengths: parsed.strengths || [],
    gaps: parsed.gaps || [],
    explainabilityTags: parsed.tags || [],
    confidence: parsed.confidence || 0.85,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Score a single candidate — tries the configured backend, then falls back.
 * Priority: Gemini → Ollama → Mock
 */
async function scoreCandidate(jobDescription, anonymisedResume, jobTitle) {
  const backend = getBackend();

  // Try primary backend
  if (backend === 'gemini') {
    try {
      return await scoreCandidateGemini(jobDescription, anonymisedResume, jobTitle);
    } catch (error) {
      console.warn(`Gemini scoring failed: ${error.message}`);
      // Fall through to Ollama
    }
  }

  if (backend === 'gemini' || backend === 'ollama') {
    try {
      return await scoreCandidateOllama(jobDescription, anonymisedResume, jobTitle);
    } catch (error) {
      console.warn(`Ollama scoring failed: ${error.message}`);
      // Fall through to mock
    }
  }

  // Final fallback: keyword-based mock scoring
  console.log('Using mock scoring (no AI backend available)');
  return mockScoreCandidate(jobDescription, anonymisedResume);
}

/**
 * Score multiple candidates in parallel.
 * Gemini handles concurrency well. Ollama queues internally.
 */
async function scoreCandidatesBatch(jobDescription, candidates, jobTitle) {
  const backend = getBackend();
  const CONCURRENCY = backend === 'gemini' ? 5 : 3; // Gemini handles more parallel requests
  const results = [];

  console.log(`Scoring ${candidates.length} candidates using: ${backend.toUpperCase()}`);

  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const chunk = candidates.slice(i, i + CONCURRENCY);

    const chunkResults = await Promise.all(
      chunk.map(async (candidate) => {
        let retries = 2;
        let delay = backend === 'gemini' ? 500 : 1000;

        while (retries > 0) {
          try {
            const result = await scoreCandidate(
              jobDescription,
              candidate.anonymisedText,
              jobTitle
            );
            return { candidateId: candidate.id, ...result, status: 'success' };
          } catch (err) {
            retries--;
            if (retries === 0) {
              return { candidateId: candidate.id, status: 'error', error: err.message };
            }
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay *= 2;
          }
        }
      })
    );

    results.push(...chunkResults);
  }

  // Sort by score (descending)
  results.sort((a, b) => (b.score || 0) - (a.score || 0));
  return results;
}

module.exports = { scoreCandidate, scoreCandidatesBatch };