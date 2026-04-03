// backend/services/scoringService.js
const { OpenAI } = require('openai');

// Initialize OpenAI client pointed at local Ollama instance
const ollama = new OpenAI({
  apiKey: 'ollama', // Required but intentionally ignored by Ollama
  baseURL: 'http://localhost:11434/v1', // Ollama's OpenAI-compatible endpoint
});

/**
 * Simple keyword-based mock scorer for local development without API costs
 */
function mockScoreCandidate(jobDescription, resumeText) {
  const jobWords = (jobDescription || '').toLowerCase().split(/\W+/).filter(w => w.length > 4);
  const resumeLower = (resumeText || '').toLowerCase();
  
  let matchCount = 0;
  jobWords.forEach(word => {
    if (resumeLower.includes(word)) matchCount++;
  });
  
  const matchPercentage = jobWords.length > 0 ? (matchCount / jobWords.length) : 0;
  // Score 1-10 based on match percentage, biased to be higher
  const score = Math.min(10, Math.max(1, Math.round((matchPercentage * 10) + 3))); 
  
  return {
    score: score,
    reasoning: "LOCAL FALLBACK: Evaluated based on simple keyword matching because the AI API limit was reached or Ollama was not running.",
    strengths: ["Keyword matches found in resume"],
    gaps: ["Deep semantic analysis skipped (Fallback mode)"],
    explainabilityTags: ["mock-evaluation", "keyword-match"],
    confidence: 0.5,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Score a candidate against job description
 * Returns score (1-10) + explainability tags
 */
async function scoreCandidate(jobDescription, anonymisedResume, jobTitle) {
  try {
    const prompt = `You are an expert recruiter scoring candidates for the role: ${jobTitle}

Job Description:
${jobDescription}

---

Candidate Resume (Anonymised):
${anonymisedResume}

---

Score this candidate on a scale of 1-10 based on:
1. Skill match (does their experience match the job requirements?)
2. Years of experience (is their experience level appropriate?)
3. Role relevance (have they done similar work?)
4. Communication (if evident in resume, how clear is their writing?)

Return ONLY valid JSON format:
{
  "score": <number 1-10>,
  "reasoning": "<2-3 sentence explanation>",
  "strengths": [
    "<skill or experience match>",
    "<another strength>"
  ],
  "gaps": [
    "<missing skill or experience>",
    "<another gap>"
  ],
  "tags": [
    "<skill>",
    "<years of exp>",
    "<role relevance>"
  ],
  "confidence": <0.0-1.0>
}`;

    const modelName = process.env.OLLAMA_MODEL || 'llama3';

    const response = await ollama.chat.completions.create({
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    });
    
    const content = response.choices[0].message.content;

    // Parse JSON response safely
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse Ollama response: ' + content);
    }
    
    const parsed = JSON.parse(jsonMatch[0]);

    return {
      score: parsed.score,
      reasoning: parsed.reasoning,
      strengths: parsed.strengths || [],
      gaps: parsed.gaps || [],
      explainabilityTags: parsed.tags || [],
      confidence: parsed.confidence || 0.85,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('API Error during scoring (Is Ollama running?):', error.message);
    console.log('Falling back to local mock scoring...');
    return mockScoreCandidate(jobDescription, anonymisedResume);
  }
}

/**
 * Score multiple candidates in parallel (batched for Ollama)
 * Ollama is local — no rate limits, so we run concurrently.
 * Capped at 5 concurrent requests to avoid overwhelming RAM.
 */
async function scoreCandidatesBatch(jobDescription, candidates, jobTitle) {
  const CONCURRENCY = 5;
  const results = [];

  // Process in chunks of CONCURRENCY
  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const chunk = candidates.slice(i, i + CONCURRENCY);

    const chunkResults = await Promise.all(
      chunk.map(async (candidate) => {
        let retries = 3;
        let delay = 1000; // 1s for local Ollama (not a cloud API)

        while (retries > 0) {
          try {
            const result = await scoreCandidate(
              jobDescription,
              candidate.anonymisedText,
              jobTitle
            );
            return {
              candidateId: candidate.id,
              ...result,
              status: 'success',
            };
          } catch (err) {
            retries--;
            if (retries === 0) {
              return {
                candidateId: candidate.id,
                status: 'error',
                error: err.message,
              };
            }
            console.log(`Retrying in ${delay / 1000}s... (${retries} left)`);
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

module.exports = {
  scoreCandidate,
  scoreCandidatesBatch,
};