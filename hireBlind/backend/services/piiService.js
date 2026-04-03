// backend/services/piiService.js
const { OpenAI } = require('openai');

const ollama = new OpenAI({
  apiKey: 'ollama', // Required but intentionally ignored by Ollama
  baseURL: 'http://localhost:11434/v1',
});

/**
 * Strip PII from resume text using Ollama
 * Returns anonymised text + audit log of what was removed
 */
async function stripPII(resumeText) {
  try {
    const prompt = `You are a privacy filter. Read the following resume text and fully redact any Personally Identifiable Information (PII) such as Name, Email, Phone number, Social Links, Address, DOB, Age, Gender pronouns, and Nationality.
Replace all such information with generic placeholders like [EMAIL_REDACTED], [PHONE_REDACTED], [NAME_REDACTED], etc.

Return ONLY valid JSON format with the following structure:
{
  "anonymisedText": "<The fully redacted resume text>",
  "removedFields": [
     { "field": "<field type, e.g. email or name>", "originalValue": "<original text you removed>", "replacement": "<the placeholder you used>" }
  ]
}

Resume Text:
${resumeText}`;

    const modelName = process.env.OLLAMA_MODEL || 'llama3';

    const response = await ollama.chat.completions.create({
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse Ollama PII response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      anonymisedText: parsed.anonymisedText || resumeText,
      removedFields: parsed.removedFields || [],
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Ollama PII error (falling back to simple regex redaction):', error.message);
    
    // Basic fallback to prevent total failure if Ollama isn't running or hallucinates
    const fallbackText = resumeText
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]')
      .replace(/(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g, '[PHONE_REDACTED]');
      
    return {
      anonymisedText: fallbackText,
      removedFields: [{ field: 'fallback', originalValue: 'API Failed', replacement: 'Fallback regex applied' }],
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Batch process multiple resumes — runs all in parallel for speed
 */
async function stripPIIBatch(resumes) {
  const results = await Promise.all(
    resumes.map(async (resume) => {
      try {
        const result = await stripPII(resume.text);
        return {
          resumeId: resume.id,
          ...result,
          status: 'success',
        };
      } catch (error) {
        return {
          resumeId: resume.id,
          status: 'error',
          error: error.message,
        };
      }
    })
  );

  return results;
}

module.exports = {
  stripPII,
  stripPIIBatch,
};