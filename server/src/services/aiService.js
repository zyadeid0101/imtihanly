const { extractJSON } = require('../utils/jsonExtractor');

const MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
const API_KEY = process.env.GROQ_API_KEY;

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

const VALID_TYPES = ['short_answer', 'fill_blank', 'explain_why'];
const VALID_MISTAKE_TYPES = [
  'conceptual_misunderstanding',
  'careless_mistake',
  'incomplete_answer',
  'calculation_error',
  'not_applicable',
];

function dialectInstruction(dialect) {
  return dialect === 'egyptian'
    ? 'اكتب دايمًا باللهجة المصرية العامية الطبيعية، زي ما بيتكلم صاحبك اللي بيشرحلك، مش بالفصحى.'
    : 'اكتب دايمًا باللغة العربية الفصحى الواضحة والمبسطة.';
}

/**
 * Turns a mastery score (0-100, or null if never attempted) into a plain
 * instruction the model can follow, per the mastery -> difficulty mapping:
 * >85 harder, 60-85 medium, <60 easier + more scaffolding.
 */
function difficultyInstruction(masteryScore) {
  if (masteryScore == null) {
    return 'الطالب بيواجه المفهوم ده لأول مرة، فابدأ بمستوى صعوبة متوسط.';
  }
  if (masteryScore > 85) {
    return `الطالب متمكن من المفهوم ده (إتقان ${masteryScore}%)، فاسأل سؤال أصعب شوية يتحدى فهمه الأعمق، مش سؤال أساسي.`;
  }
  if (masteryScore >= 60) {
    return `الطالب عنده فهم متوسط للمفهوم ده (إتقان ${masteryScore}%)، فخليه سؤال بمستوى متوسط.`;
  }
  return `الطالب لسه بيواجه صعوبة في المفهوم ده (إتقان ${masteryScore}%)، فخلي السؤال أسهل ومباشر أكتر.`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Groq's 429 error message includes a suggested wait time, e.g.
 * "Please try again in 34.95749999s." This parses that out so we can wait
 * the right amount and retry automatically, instead of surfacing the error
 * and making the student click again to effectively do the same thing.
 */
function parseRetryDelayMs(message) {
  const match = /try again in ([\d.]+)s/i.exec(message || '');
  if (!match) return 3000; // fallback if the message format ever changes
  const seconds = parseFloat(match[1]);
  return Math.min(Math.ceil(seconds * 1000) + 300, 45000); // cap at 45s so we never hang indefinitely, but still honor realistic per-minute reset windows
}

async function callGroq(systemPrompt, userText, maxTokens = 1000, isRetry = false) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText },
      ],
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message || 'Unknown Groq API error';

    // Rate limit: wait the suggested delay and retry once automatically,
    // rather than making the student click "generate" again themselves.
    if (response.status === 429 && !isRetry) {
      const delay = parseRetryDelayMs(message);
      console.warn(`[callGroq] Rate limited, waiting ${delay}ms before one automatic retry`);
      await sleep(delay);
      return callGroq(systemPrompt, userText, maxTokens, true);
    }

    throw new Error(`Groq API error (${response.status}): ${message}`);
  }

  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('Groq returned no text');
  }
  return text;
}

/**
 * Calls Groq and parses the response as JSON, automatically retrying once
 * with a stricter reminder if the first response fails to parse. This is
 * what fixes the "sometimes I have to click twice" symptom - occasional
 * malformed model output now gets silently retried server-side instead of
 * surfacing as an error the student has to manually retry from the UI.
 */
async function callGroqJSON(systemPrompt, userText, maxTokens) {
  try {
    const raw = await callGroq(systemPrompt, userText, maxTokens);
    return extractJSON(raw);
  } catch (firstErr) {
    console.warn('[callGroqJSON] first attempt failed, retrying once:', firstErr.message);
    const stricterSystem =
      systemPrompt + '\n\nمهم جدًا: رد بصيغة JSON صحيحة فقط، بدون أي نص أو شرح أو علامات markdown قبله أو بعده.';
    const raw = await callGroq(stricterSystem, userText, maxTokens);
    return extractJSON(raw);
  }
}

/**
 * DeepSeek uses the same OpenAI-compatible chat completions shape as Groq,
 * so this mirrors callGroq closely. Used both as a fallback provider (if
 * Groq fails entirely) and as a "second opinion" reviewer for wrong answers.
 */
async function callDeepSeek(systemPrompt, userText, maxTokens = 1000) {
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      max_tokens: maxTokens,
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText },
      ],
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message || 'Unknown DeepSeek API error';
    throw new Error(`DeepSeek API error (${response.status}): ${message}`);
  }

  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('DeepSeek returned no text');
  }
  return text;
}

async function callDeepSeekJSON(systemPrompt, userText, maxTokens) {
  const raw = await callDeepSeek(systemPrompt, userText, maxTokens);
  return extractJSON(raw);
}

/**
 * The main entry point every AI operation should use. Tries Groq first
 * (which already retries once internally on rate limits / bad JSON). If
 * Groq fails completely and a DeepSeek key is configured, falls back to
 * DeepSeek so a Groq outage doesn't take the whole app down.
 */
async function callAIJSON(systemPrompt, userText, maxTokens) {
  try {
    return await callGroqJSON(systemPrompt, userText, maxTokens);
  } catch (groqErr) {
    if (!DEEPSEEK_API_KEY) throw groqErr;
    console.warn('[callAIJSON] Groq failed entirely, falling back to DeepSeek:', groqErr.message);
    try {
      return await callDeepSeekJSON(systemPrompt, userText, maxTokens);
    } catch (deepseekErr) {
      console.error('[callAIJSON] DeepSeek fallback also failed:', deepseekErr.message);
      throw groqErr; // surface the original, more informative Groq error
    }
  }
}

/**
 * For a wrong/partial answer, asks DeepSeek to independently review Groq's
 * grading and provide a deeper explanation. Never lowers a student's grade -
 * only upgrades it if DeepSeek is more generous, so a disagreement between
 * models always benefits the student, never penalizes them.
 */
async function enhanceAndVerify({ question, concept, studentAnswer, groqVerdict, groqExplanation, dialect }) {
  const system = `أنت معلّم خبير بتراجع تقييم زميلك المعلم لإجابة طالب، وتضيف شرح أعمق لو محتاج. ${dialectInstruction(
    dialect
  )} رد بصيغة JSON فقط بدون أي نص خارجها.`;

  const user = `السؤال: "${question}"
المفهوم: "${concept}"
إجابة الطالب: "${studentAnswer}"
تقييم الزميل: "${groqVerdict}"
شرح الزميل: "${groqExplanation}"

راجع التقييم: هل توافق عليه؟ لو الإجابة تستاهل تقييم أعلى (مثلاً كانت partial بس تستاهل correct)، وضّح ده. وقدم شرح أعمق وأوضح من شرح الزميل، بمثال واقعي لو ممكن.

أعد JSON بهذا الشكل بالضبط:
{"agrees": true|false, "finalVerdict": "correct|partial|incorrect", "enhancedExplanation": "شرح أعمق وأوضح من شرح الزميل"}`;

  return callDeepSeekJSON(system, user, 700);
}

/**
 * Lightweight validation layer - catches the most common failure modes
 * (missing fields, invalid type, empty/duplicate prompts) before a bad
 * question ever reaches the student. Does not call the model again; just
 * filters/repairs what came back, which is enough for hackathon reliability
 * without building a full regenerate-on-failure pipeline.
 */
function validateQuestions(questions) {
  const seen = new Set();
  return questions.filter((q) => {
    if (!q.concept || !q.prompt) return false;
    if (!VALID_TYPES.includes(q.type)) q.type = 'short_answer';
    const key = q.prompt.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * masteryMap: optional { conceptName: masteryScore } for concepts this
 * student has attempted before in this subject - lets question difficulty
 * adapt to history instead of always starting from scratch.
 *
 * questionCount: how many questions to generate (2-8, default 4).
 *
 * The model is also asked to validate that the topic actually belongs to
 * the chosen subject and is appropriate for the chosen grade level. If not,
 * it returns {"valid":false,"reason":"..."} instead of questions, which this
 * function turns into a distinguishable error (err.code = 'IRRELEVANT_TOPIC')
 * so the route layer can return a clean 400 instead of a generic 500.
 */
async function generateQuiz({ subject, grade, topic, dialect, masteryMap = {}, questionCount = 4 }) {
  const count = Math.min(Math.max(parseInt(questionCount, 10) || 4, 2), 8);
  const hasHistory = Object.keys(masteryMap).length > 0;
  const historyNote = hasHistory
    ? `\nمستوى إتقان الطالب لمفاهيم سابقة في نفس المادة: ${JSON.stringify(
        masteryMap
      )}. لو أي مفهوم من المفاهيم دي هيتكرر في الأسئلة الجديدة، اضبط صعوبته حسب مستوى الإتقان ده.`
    : '';

  const system = `أنت مصمم اختبارات تعليمية للطلاب المصريين. ${dialectInstruction(
    dialect
  )} مهمتك توليد أسئلة تقييم حقيقية (مش اختيار من متعدد) تكشف مدى فهم الطالب الحقيقي، مش مجرد حفظ.

قبل توليد أي أسئلة، تأكد إن الموضوع المُدخل فعلاً له علاقة بالمادة الدراسية المحددة ومناسب للمرحلة الدراسية. لو الموضوع مش له علاقة بالمادة، أو مش موضوع تعليمي أصلاً، أو مش مناسب للمرحلة الدراسية دي، رد فقط بـ:
{"valid":false,"reason":"شرح قصير بالعربي ليه الموضوع مش مناسب"}

لو الموضوع مناسب، رد بصيغة JSON فقط بالشكل المطلوب تحت، بدون أي نص إضافي قبله أو بعده، وبدون علامات markdown.`;

  const user = `المادة: ${subject}
المرحلة الدراسية: ${grade}
محتوى الدرس أو الموضوع: """${topic}"""${historyNote}

لو الموضوع مناسب، ولّد بالضبط ${count} أسئلة تقييمية متنوعة (short_answer, fill_blank, explain_why) تغطي ${count} مفاهيم فرعية مختلفة داخل هذا الموضوع، من الأسهل للأصعب. كل سؤال يجب أن يكون قصيرًا وواضحًا (سطر أو سطرين).

أعد النتيجة بهذا الشكل بالضبط:
{"questions":[{"concept":"اسم المفهوم الفرعي بإيجاز","type":"short_answer|fill_blank|explain_why","prompt":"نص السؤال"}]}`;

  const parsed = await callAIJSON(system, user, 300 + count * 250);

  if (parsed.valid === false) {
    const err = new Error(parsed.reason || 'الموضوع غير مرتبط بالمادة أو المرحلة الدراسية المختارة.');
    err.code = 'IRRELEVANT_TOPIC';
    throw err;
  }

  if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    throw new Error('Model did not return a valid questions array');
  }

  const validated = validateQuestions(parsed.questions);
  if (validated.length === 0) {
    throw new Error('No valid questions survived validation');
  }

  return validated.slice(0, count).map((q, i) => ({
    concept: q.concept,
    type: q.type,
    prompt: q.prompt,
    conceptIndex: i,
    isFollowUp: false,
  }));
}

/**
 * Now returns a mistake_type classification alongside the verdict, so wrong
 * answers are diagnosed (conceptual gap vs. careless slip vs. incomplete
 * answer vs. calculation error) instead of just marked wrong.
 */
async function evaluateAnswer({ question, concept, studentAnswer, dialect }) {
  const system = `أنت معلّم يقيّم إجابات طلاب مصريين بعدل ودقة. ${dialectInstruction(
    dialect
  )} لو الإجابة غلط، اشرح بالظبط نقطة سوء الفهم من غير ما تكون قاسي، وصنّف نوع الخطأ. رد بصيغة JSON فقط بدون أي نص خارجها.`;

  const user = `السؤال: "${question}"
المفهوم المستهدف: "${concept}"
إجابة الطالب: "${studentAnswer}"

قيّم الإجابة وأرجع JSON بهذا الشكل بالضبط:
{"verdict":"correct|partial|incorrect","mistake_type":"conceptual_misunderstanding|careless_mistake|incomplete_answer|calculation_error|not_applicable","feedback":"تعليق قصير (سطرين كحد أقصى) يوضح ليه الإجابة كده","explanation":"شرح مبسط جدًا للمفهوم الصحيح لو الإجابة partial أو incorrect، أو نص فارغ لو correct"}

ملاحظة: استخدم "not_applicable" لـ mistake_type لو الإجابة correct.`;

  const parsed = await callAIJSON(system, user, 900);

  if (!['correct', 'partial', 'incorrect'].includes(parsed.verdict)) {
    throw new Error('Model returned an invalid verdict');
  }
  if (!VALID_MISTAKE_TYPES.includes(parsed.mistake_type)) {
    parsed.mistake_type = parsed.verdict === 'correct' ? 'not_applicable' : 'conceptual_misunderstanding';
  }

  // For wrong/partial answers, get a second opinion from DeepSeek: it can
  // deepen the explanation and/or upgrade the verdict if it's more generous
  // than Groq's - but this step is best-effort. If DeepSeek isn't
  // configured or the call fails for any reason, Groq's own result stands
  // unchanged rather than the whole request failing.
  if (parsed.verdict !== 'correct' && DEEPSEEK_API_KEY) {
    try {
      const review = await enhanceAndVerify({
        question,
        concept,
        studentAnswer,
        groqVerdict: parsed.verdict,
        groqExplanation: parsed.explanation,
        dialect,
      });

      const verdictRank = { incorrect: 0, partial: 1, correct: 2 };
      if (verdictRank[review.finalVerdict] > verdictRank[parsed.verdict]) {
        parsed.verdict = review.finalVerdict;
        if (parsed.verdict === 'correct') parsed.mistake_type = 'not_applicable';
      }
      if (review.enhancedExplanation) {
        parsed.explanation = review.enhancedExplanation;
        parsed.enhanced = true;
      }
    } catch (err) {
      console.warn('[evaluateAnswer] DeepSeek enhancement step failed, using Groq result as-is:', err.message);
    }
  }

  return parsed;
}

/**
 * masteryScore: this student's current mastery of the concept (or null),
 * used to decide whether the follow-up should be easier (weak concept) or
 * the student just needs a nudge (moderate mastery, careless mistake).
 */
async function generateFollowUp({ concept, originalPrompt, dialect, masteryScore = null }) {
  const system = `أنت معلّم بتساعد طالب فهم نقطة معينة أوقعت له. ${dialectInstruction(
    dialect
  )} رد بصيغة JSON فقط بدون أي نص خارجها.`;

  const user = `المفهوم: "${concept}"
السؤال الأصلي كان: "${originalPrompt}"
الطالب أجاب إجابة غير مكتملة أو غلط.
${difficultyInstruction(masteryScore)}

ولّد سؤال متابعة عن نفس المفهوم يساعد نتأكد من فهم الأساسيات، بالمستوى المناسب المذكور فوق. أعد JSON بهذا الشكل بالضبط:
{"type":"short_answer|fill_blank|explain_why","prompt":"نص السؤال"}`;

  const parsed = await callAIJSON(system, user, 500);

  if (!parsed.prompt) {
    throw new Error('Model did not return a follow-up prompt');
  }

  return parsed;
}

module.exports = { generateQuiz, evaluateAnswer, generateFollowUp };
