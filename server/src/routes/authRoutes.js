const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const {
  createUser,
  getUserByEmail,
  getUserByClassCode,
  getJoinedClassesFormatted,
  createSession,
  getSession,
  deleteSession,
} = require('../services/db');

function determineRole(email) {
  const lower = email.toLowerCase().trim();
  if (lower.endsWith('@gmail.com')) return 'student';
  if (lower.endsWith('@imtihanly.com')) return 'teacher';
  return null;
}

const VALID_GRADES = ['المرحلة الإعدادية', 'المرحلة الثانوية'];

function buildUserResponse(user) {
  const base = {
    email: user.email,
    name: user.name,
    role: user.role,
    subject: user.subject,
    grade: user.grade,
  };
  if (user.role === 'teacher') {
    base.classCode = user.classCode;
  }
  if (user.role === 'student') {
    base.joinedClasses = getJoinedClassesFormatted(user.email);
  }
  return base;
}

router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, subject, grade, classCodes } = req.body;
    if (!name || !name.trim() || !email || !password) {
      return res.status(400).json({ error: 'الاسم والبريد الإلكتروني وكلمة المرور مطلوبين' });
    }
    const role = determineRole(email);
    if (!role) {
      return res.status(400).json({
        error: 'البريد الإلكتروني لازم ينتهي بـ @gmail.com لو أنت طالب، أو @imtihanly.com لو أنت معلم',
      });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'كلمة المرور لازم تكون 6 أحرف على الأقل' });
    }
    if (!grade || !VALID_GRADES.includes(grade)) {
      return res.status(400).json({ error: 'اختر المرحلة الدراسية' });
    }
    if (role === 'teacher' && (!subject || !subject.trim())) {
      return res.status(400).json({ error: 'اختر المادة التي تدرّسها' });
    }

    // For students, each subject can optionally have its own teacher's
    // class code. Every non-empty code gets validated individually: it must
    // exist, and it must belong to a teacher whose own subject+grade
    // actually matches the subject it was entered under - otherwise a code
    // for "Physics, secondary" typed into the "Math" field would silently
    // (and wrongly) link the student to the wrong class.
    const joinedClasses = {};
    if (role === 'student' && classCodes && typeof classCodes === 'object') {
      for (const [subjectName, code] of Object.entries(classCodes)) {
        if (!code || !code.trim()) continue;
        const teacher = getUserByClassCode(code);
        if (!teacher) {
          return res.status(400).json({
            error: `الكود الخاص بمادة "${subjectName}" غير صحيح. تأكد منه مع المعلم، أو اسيبه فاضي.`,
          });
        }
        if (teacher.subject !== subjectName || teacher.grade !== grade) {
          return res.status(400).json({
            error: `الكود اللي كتبته لمادة "${subjectName}" بيخص مادة أو مرحلة دراسية مختلفة.`,
          });
        }
        joinedClasses[subjectName] = teacher.email;
      }
    }

    const existing = getUserByEmail(email);
    if (existing) {
      return res.status(400).json({ error: 'يوجد حساب مسجل بهذا البريد الإلكتروني بالفعل' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = createUser({
      email,
      passwordHash,
      name: name.trim(),
      role,
      subject: role === 'teacher' ? subject : null,
      grade,
      joinedClasses: role === 'student' ? joinedClasses : undefined,
    });
    const token = createSession(user.email, user.role);

    res.json({ token, user: buildUserResponse(user) });
  } catch (err) {
    console.error('[POST /api/auth/signup]', err.message);
    res.status(500).json({ error: 'فشل إنشاء الحساب: ' + err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبين' });
    }
    const user = getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    }

    const token = createSession(user.email, user.role);
    res.json({ token, user: buildUserResponse(user) });
  } catch (err) {
    console.error('[POST /api/auth/login]', err.message);
    res.status(500).json({ error: 'فشل تسجيل الدخول: ' + err.message });
  }
});

router.post('/logout', (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) deleteSession(token);
  res.json({ success: true });
});

router.get('/me', (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const session = token ? getSession(token) : null;
  if (!session) {
    return res.status(401).json({ error: 'الجلسة غير صالحة' });
  }
  const user = getUserByEmail(session.email);
  if (!user) {
    return res.status(401).json({ error: 'المستخدم غير موجود' });
  }
  res.json({ user: buildUserResponse(user) });
});

module.exports = router;
