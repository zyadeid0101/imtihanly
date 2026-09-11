const { getSession, getUserByEmail } = require('../services/db');

function extractToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

/**
 * Verifies the request carries a valid session token and attaches the
 * authenticated user to req.user. Every route that touches student or
 * teacher data should sit behind this - it's what makes role checks a real
 * server-side boundary instead of something the client can bypass.
 */
function requireAuth(req, res, next) {
  const token = extractToken(req);
  const session = token ? getSession(token) : null;
  if (!session) {
    return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً' });
  }
  const user = getUserByEmail(session.email);
  if (!user) {
    return res.status(401).json({ error: 'المستخدم غير موجود' });
  }
  req.user = { email: user.email, name: user.name, role: user.role, subject: user.subject, grade: user.grade };
  next();
}

function requireTeacher(req, res, next) {
  if (req.user?.role !== 'teacher') {
    return res.status(403).json({ error: 'هذه الصفحة متاحة لحسابات المعلمين فقط' });
  }
  next();
}

function requireStudent(req, res, next) {
  if (req.user?.role !== 'student') {
    return res.status(403).json({ error: 'هذه الصفحة متاحة لحسابات الطلاب فقط' });
  }
  next();
}

module.exports = { requireAuth, requireTeacher, requireStudent };
