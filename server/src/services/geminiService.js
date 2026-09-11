const { extractJSON } = require('../utils/jsonExtractor');

const MODEL = process.env.GROQ_MODEL || 'groq/compound';
const API_KEY = process.env.GROQ_API_KEY;

function dialectInstruction(dialect) {
  return dialect === 'egyptian'
    ? 'اكتب دايمًا باللهجة المصرية العامية الطبيعية، زي ما بيتكلم صاحبك اللي بيشرحلك، مش بالفصحى.'
    : 'اكتب دايمًا باللغة العربية الفصحى الواضحة والمبسطة.';
}

async function callGroq(systemPrompt, userText, maxTokens = 1000) {
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
    throw new Error(`Groq API error (${response.status}): ${message}`);
  }

  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('Groq returned no text');
  }
  return text;
}

async function generateQuiz({ subject, grade, topic, dialect }) {
  const system = `أنت مصمم اختبارات تعليمية للطلاب المصريين. ${dialectInstruction(
    dialect
  )} مهمتك توليد أسئلة تقييم حقيقية (مش اختيار من متعدد) تكشف مدى فهم الطالب الحقيقي، مش مجرد حفظ. رد بصيغة JSON فقط، بدون أي نص إضافي قبله أو بعده، وبدون علامات markdown.`;

  const user = `المادة: ${subject}
المرحلة الدراسية: ${grade}
محتوى الدرس أو الموضوع: """${topic}"""

ولّد بالضبط 4 أسئلة تقييمية متنوعة (short_answer, fill_blank, explain_why) تغطي 4 مفاهيم فرعية مختلفة داخل هذا الموضوع، من الأسهل للأصعب. كل سؤال يجب أن يكون قصيرًا وواضحًا (سطر أو سطرين).

أعد النتيجة بهذا الشكل بالضبط:
{"questions":[{"concept":"اسم المفهوم الفرعي بإيجاز","type":"short_answer|fill_blank|explain_why","prompt":"نص السؤال"}]}`;

  const raw = await callGroq(system, user, 1200);
  const parsed = extractJSON(raw);

  if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    throw new Error('Model did not return a valid questions array');
  }

  return parsed.questions.slice(0, 4).map((q, i) => ({
    concept: q.concept,
    type: q.type,
    prompt: q.prompt,
    conceptIndex: i,
    isFollowUp: false,
  }));
}

async function evaluateAnswer({ question, concept, studentAnswer, dialect }) {
  const system = `أنت معلّم يقيّم إجابات طلاب مصريين بعدل ودقة. ${dialectInstruction(
    dialect
  )} لو الإجابة غلط، اشرح بالظبط نقطة سوء الفهم من غير ما تكون قاسي. رد بصيغة JSON فقط بدون أي نص خارجها.`;

  const user = `السؤال: "${question}"
المفهوم المستهدف: "${concept}"
إجابة الطالب: "${studentAnswer}"

قيّم الإجابة وأرجع JSON بهذا الشكل بالضبط:
{"verdict":"correct|partial|incorrect","feedback":"تعليق قصير (سطرين كحد أقصى) يوضح ليه الإجابة كده","explanation":"شرح مبسط جدًا للمفهوم الصحيح لو الإجابة partial أو incorrect، أو نص فارغ لو correct"}`;

  const raw = await callGroq(system, user, 900);
  const parsed = extractJSON(raw);

  if (!['correct', 'partial', 'incorrect'].includes(parsed.verdict)) {
    throw new Error('Model returned an invalid verdict');
  }

  return parsed;
}

async function generateFollowUp({ concept, originalPrompt, dialect }) {
  const system = `أنت معلّم بتساعد طالب فهم نقطة معينة أوقعت له. ${dialectInstruction(
    dialect
  )} رد بصيغة JSON فقط بدون أي نص خارجها.`;

  const user = `المفهوم: "${concept}"
السؤال الأصلي كان: "${originalPrompt}"
الطالب أجاب إجابة غير مكتملة أو غلط.

ولّد سؤال متابعة أسهل وأبسط عن نفس المفهوم، يساعد نتأكد فهم الأساسيات. أعد JSON بهذا الشكل بالضبط:
{"type":"short_answer|fill_blank|explain_why","prompt":"نص السؤال الأسهل"}`;

  const raw = await callGroq(system, user, 500);
  const parsed = extractJSON(raw);

  if (!parsed.prompt) {
    throw new Error('Model did not return a follow-up prompt');
  }

  return parsed;
}

module.exports = { generateQuiz, evaluateAnswer, generateFollowUp };
