// backend/services/resumeParser.js
const PDFParser = require('pdf-parse');
const { Document } = require('docx');

/**
 * Parse PDF file buffer to text
 */
async function parsePDF(fileBuffer) {
  try {
    const data = await PDFParser(fileBuffer);
    return data.text;
  } catch (error) {
    console.error('PDF parsing error:', error);
    throw new Error(`Failed to parse PDF: ${error.message}`);
  }
}

/**
 * Parse DOCX file buffer to text
 */
async function parseDOCX(fileBuffer) {
  try {
    const doc = await Document.load(fileBuffer);
    
    let text = '';
    for (const paragraph of doc.paragraphs || []) {
      if (paragraph.text) {
        text += paragraph.text + '\n';
      }
    }

    return text || '';
  } catch (error) {
    console.error('DOCX parsing error:', error);
    throw new Error(`Failed to parse DOCX: ${error.message}`);
  }
}

/**
 * Parse resume file (PDF or DOCX)
 */
async function parseResume(fileBuffer, filename, mimetype) {
  try {
    let text = '';

    if (mimetype === 'application/pdf' || filename.endsWith('.pdf')) {
      text = await parsePDF(fileBuffer);
    } else if (
      mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      filename.endsWith('.docx')
    ) {
      text = await parseDOCX(fileBuffer);
    } else {
      throw new Error('Unsupported file format. Only PDF and DOCX are supported.');
    }

    // Clean up text
    text = text
      .replace(/\s+/g, ' ')  // Remove extra whitespace
      .trim();

    return {
      filename,
      mimetype,
      textLength: text.length,
      text,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Resume parsing error:', error);
    throw error;
  }
}

/**
 * Batch parse multiple resume files
 */
async function parseResumesBatch(files) {
  const results = [];

  for (const file of files) {
    try {
      const result = await parseResume(
        file.buffer,
        file.originalname,
        file.mimetype
      );

      results.push({
        ...result,
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        status: 'success',
      });
    } catch (error) {
      results.push({
        filename: file.originalname,
        status: 'error',
        error: error.message,
      });
    }
  }

  return results;
}

module.exports = {
  parseResume,
  parseResumesBatch,
  parsePDF,
  parseDOCX,
};