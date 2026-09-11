const express = require('express');
const router = express.Router();
const {
  getStudentProfile,
  getAggregateStats,
  getUserByClassCode,
  joinClass,
  getJoinedClassesFormatted,
} = require('../services/db');
const { requireAuth, requireStudent } = require('../middleware/auth');

// Every route below requires a valid session AND a student-role account.
// Routes use "/me" rather than "/:id" - the student's identity comes from
// their session token, not from a URL parameter they could edit to try to
// view another student's data.
router.use(requireAuth, requireStudent);

// GET /api/students/me/mastery
router.get('/me/mastery', (req, res) => {
  try {
    const profile = getStudentProfile(req.user.email);
    res.json({ email: req.user.email, subjects: profile });
  } catch (err) {
    console.error('[GET /api/students/me/mastery]', err.message);
    res.status(500).json({ error: 'Failed to load mastery profile' });
  }
});

// GET /api/students/me/weaknesses
router.get('/me/weaknesses', (req, res) => {
  try {
    const profile = getStudentProfile(req.user.email);
    const flattened = [];
    for (const [subject, subjectData] of Object.entries(profile)) {
      for (const [concept, data] of Object.entries(subjectData.concepts || {})) {
        flattened.push({ subject, concept, ...data });
      }
    }
    flattened.sort((a, b) => a.masteryScore - b.masteryScore);
    res.json({ email: req.user.email, weaknesses: flattened });
  } catch (err) {
    console.error('[GET /api/students/me/weaknesses]', err.message);
    res.status(500).json({ error: 'Failed to load weaknesses' });
  }
});

// GET /api/students/me/stats
router.get('/me/stats', (req, res) => {
  try {
    const stats = getAggregateStats(req.user.email);
    res.json({ email: req.user.email, ...stats });
  } catch (err) {
    console.error('[GET /api/students/me/stats]', err.message);
    res.status(500).json({ error: 'Failed to load statistics' });
  }
});

// GET /api/students/me/classes
// Returns the student's currently joined classes.
router.get('/me/classes', (req, res) => {
  try {
    res.json({ joinedClasses: getJoinedClassesFormatted(req.user.email) });
  } catch (err) {
    console.error('[GET /api/students/me/classes]', err.message);
    res.status(500).json({ error: 'Failed to load classes' });
  }
});

// POST /api/students/me/join-class
// body: { subject, classCode }
// Lets a student join a teacher's class any time after signup, not just
// at the moment their account was created.
router.post('/me/join-class', (req, res) => {
  try {
    const { subject, classCode } = req.body;
    if (!subject || !classCode || !classCode.trim()) {
      return res.status(400).json({ error: 'اختر المادة واكتب الكود' });
    }
    const teacher = getUserByClassCode(classCode);
    if (!teacher) {
      return res.status(400).json({ error: 'الكود غير صحيح. تأكد منه مع معلمك.' });
    }
    if (teacher.subject !== subject || teacher.grade !== req.user.grade) {
      return res.status(400).json({ error: 'الكود ده بيخص مادة أو مرحلة دراسية مختلفة.' });
    }
    const joinedClasses = joinClass(req.user.email, subject, teacher.email);
    res.json({ joinedClasses, teacherName: teacher.name });
  } catch (err) {
    console.error('[POST /api/students/me/join-class]', err.message);
    res.status(500).json({ error: 'فشل الانضمام للفصل: ' + err.message });
  }
});

module.exports = router;
