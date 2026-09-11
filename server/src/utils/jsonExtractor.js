/**
 * Claude is instructed to reply with pure JSON, but models sometimes wrap
 * output in markdown fences or add stray whitespace. This strips that noise
 * and safely parses the first JSON object/array found in the text.
 */
function extractJSON(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Empty response from model');
  }

  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();

  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');

  let start = firstBrace;
  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    start = firstBracket;
  }

  if (start === -1) {
    throw new Error('No JSON object found in model response: ' + cleaned.slice(0, 200));
  }

  const lastBrace = cleaned.lastIndexOf('}');
  const lastBracket = cleaned.lastIndexOf(']');
  const end = Math.max(lastBrace, lastBracket);

  const jsonSlice = cleaned.slice(start, end + 1);

  try {
    return JSON.parse(jsonSlice);
  } catch (err) {
    throw new Error('Failed to parse JSON from model response: ' + err.message);
  }
}

module.exports = { extractJSON };
