const express = require('express');
const router = express.Router();
const {
  generateQuiz,
  evaluateAnswer,
  generateFollowUp,
} = require('../services/aiService');
const { getConceptMastery, getStudentProfile, updateMastery } = require('../services/db');
const { requireAuth, requireStudent } = require('../middleware/auth');

// Every route below requires a valid session AND a student-role account.
// The student's identity for mastery tracking always comes from the
// authenticated session (req.user.email), never from anything the client
// sends in the request body - so there's no way to record an attempt
// against a different student's profile.
router.use(requireAuth, requireStudent);

// POST /api/quiz/generate
// body: { subject, grade, topic, dialect, questionCount }
router.post('/generate', async (req, res) => {
  try {
    const { subject, grade, topic, dialect, questionCount } = req.body;
    if (!topic || !topic.trim()) {
      return res.status(400).json({ error: 'topic is required' });
    }

    // Pull this student's existing mastery for this subject (if any) so the
    // model can adapt difficulty for concepts it has seen before, per the
    // adaptive exam engine requirement.
    let masteryMap = {};
    const profile = getStudentProfile(req.user.email);
    const subjectData = profile[subject || 'عام'];
    if (subjectData) {
      masteryMap = Object.fromEntries(
        Object.entries(subjectData.concepts).map(([concept, data]) => [concept, data.masteryScore])
      );
    }

    const questions = await generateQuiz({
      subject: subject || 'عام',
      grade: grade || 'المرحلة الثانوية',
      topic,
      dialect: dialect === 'msa' ? 'msa' : 'egyptian',
      masteryMap,
      questionCount,
    });
    res.json({ questions });
  } catch (err) {
    console.error('[POST /api/quiz/generate]', err.message);
    if (err.code === 'IRRELEVANT_TOPIC') {
      return res.status(400).json({ error: err.message, code: 'IRRELEVANT_TOPIC' });
    }
    res.status(500).json({ error: 'Failed to generate quiz: ' + err.message });
  }
});

// POST /api/quiz/evaluate
// body: { subject, grade, question, concept, studentAnswer, dialect }
router.post('/evaluate', async (req, res) => {
  try {
    const { subject, grade, question, concept, studentAnswer, dialect } = req.body;
    if (!question || !studentAnswer) {
      return res.status(400).json({ error: 'question and studentAnswer are required' });
    }
    const result = await evaluateAnswer({
      question,
      concept: concept || '',
      studentAnswer,
      dialect: dialect === 'msa' ? 'msa' : 'egyptian',
    });

    let masteryUpdate = null;
    if (concept) {
      masteryUpdate = updateMastery({
        studentId: req.user.email,
        subject: subject || 'عام',
        grade: grade || null,
        concept,
        verdict: result.verdict,
        mistakeType: result.mistake_type,
      });
    }

    res.json({ ...result, mastery: masteryUpdate });
  } catch (err) {
    console.error('[POST /api/quiz/evaluate]', err.message);
    res.status(500).json({ error: 'Failed to evaluate answer: ' + err.message });
  }
});

// POST /api/quiz/follow-up
// body: { subject, concept, originalPrompt, dialect }
router.post('/follow-up', async (req, res) => {
  try {
    const { subject, concept, originalPrompt, dialect } = req.body;
    if (!concept || !originalPrompt) {
      return res.status(400).json({ error: 'concept and originalPrompt are required' });
    }

    const existing = getConceptMastery(req.user.email, subject || 'عام', concept);
    const masteryScore = existing?.masteryScore ?? null;

    const result = await generateFollowUp({
      concept,
      originalPrompt,
      dialect: dialect === 'msa' ? 'msa' : 'egyptian',
      masteryScore,
    });
    res.json(result);
  } catch (err) {
    console.error('[POST /api/quiz/follow-up]', err.message);
    res.status(500).json({ error: 'Failed to generate follow-up question: ' + err.message });
  }
});

module.exports = router;
