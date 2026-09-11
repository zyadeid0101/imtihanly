const express = require('express');
const router = express.Router();
const { getClassStats } = require('../services/db');
const { requireAuth, requireTeacher } = require('../middleware/auth');

// Every route below requires a valid session AND a teacher-role account.
router.use(requireAuth, requireTeacher);

// GET /api/teacher/stats
// Returns stats scoped to ONLY the students who joined this teacher's class
// via their class code - not a global scan of every student in the app.
router.get('/stats', (req, res) => {
  try {
    const stats = getClassStats(req.user.email);
    res.json(stats);
  } catch (err) {
    console.error('[GET /api/teacher/stats]', err.message);
    res.status(500).json({ error: 'Failed to load class statistics' });
  }
});

module.exports = router;
