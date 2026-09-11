const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'store.json');

function ensureStore() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ students: {}, users: {}, sessions: {} }, null, 2));
  }
}

function readStore() {
  ensureStore();
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function writeStore(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

/**
 * Returns { masteryScore, attempts, lastVerdict } for a concept, or null if
 * this student has never attempted it before.
 */
function getConceptMastery(studentId, subject, concept) {
  const store = readStore();
  const student = store.students[studentId];
  if (!student) return null;
  const subj = student.subjects?.[subject];
  if (!subj) return null;
  return subj.concepts?.[concept] || null;
}

/**
 * Returns the full mastery profile for a student: { subject: { concept: {...} } }
 */
function getStudentProfile(studentId) {
  const store = readStore();
  return store.students[studentId]?.subjects || {};
}

/**
 * Updates mastery for one concept using a simple, explainable weighted-average
 * formula: new mastery leans 50% on history, 50% on the latest attempt. This
 * means one bad attempt after a long streak of good ones nudges mastery down
 * without wiping it out, and one good attempt after a rocky start pulls
 * mastery up without instantly declaring "mastered."
 *
 * verdict -> point value: correct=100, partial=60, incorrect=20
 *
 * Also appends to a flat attemptLog, which is what the statistical analysis
 * feature reduces over to compute overall accuracy and mistake-type
 * breakdowns - kept separate from the per-concept mastery object so historical
 * counts aren't lost as mastery scores get overwritten.
 */
function updateMastery({ studentId, subject, grade, concept, verdict, mistakeType }) {
  const store = readStore();
  if (!store.students[studentId]) store.students[studentId] = { subjects: {}, attemptLog: [] };
  if (!store.students[studentId].attemptLog) store.students[studentId].attemptLog = [];
  if (!store.students[studentId].subjects[subject]) {
    store.students[studentId].subjects[subject] = { concepts: {} };
  }
  const concepts = store.students[studentId].subjects[subject].concepts;

  const pointValue = verdict === 'correct' ? 100 : verdict === 'partial' ? 60 : 20;
  const existing = concepts[concept];

  const newMastery = existing
    ? Math.round(existing.masteryScore * 0.5 + pointValue * 0.5)
    : pointValue;

  const mistakeTypeCounts = existing?.mistakeTypeCounts || {};
  if (mistakeType && mistakeType !== 'not_applicable') {
    mistakeTypeCounts[mistakeType] = (mistakeTypeCounts[mistakeType] || 0) + 1;
  }

  concepts[concept] = {
    masteryScore: newMastery,
    attempts: (existing?.attempts || 0) + 1,
    lastVerdict: verdict,
    lastMistakeType: mistakeType || null,
    lastAttempt: new Date().toISOString(),
    mistakeTypeCounts,
    grade: grade || existing?.grade || null,
  };

  store.students[studentId].attemptLog.push({
    subject,
    grade: grade || null,
    concept,
    verdict,
    mistakeType: mistakeType || 'not_applicable',
    timestamp: new Date().toISOString(),
  });

  writeStore(store);
  return concepts[concept];
}

const MISTAKE_RECOMMENDATIONS = {
  conceptual_misunderstanding:
    'أكتر خطأ متكرر عندك هو سوء فهم للمفاهيم الأساسية. ينصح بمراجعة تعريفات المفاهيم قبل حل تمارين جديدة، مش بس حفظ الخطوات.',
  careless_mistake:
    'أكتر خطأ متكرر عندك هو أخطاء بسيطة أو سهو. جرب تقرأ السؤال مرتين قبل ما تجاوب، والمشكلة غالبًا مش في الفهم.',
  incomplete_answer:
    'أكتر خطأ متكرر عندك هو إجابات ناقصة. حاول تكمل شرح إجابتك بالكامل بدل ما تدي إجابة مختصرة جدًا.',
  calculation_error:
    'أكتر خطأ متكرر عندك هو أخطاء حسابية. راجع خطوات الحل بالتفصيل قبل ما توصل للإجابة النهائية.',
};

/**
 * Reduces a student's full attempt log into an overall picture: accuracy,
 * mistake-type breakdown, a plain-language recommendation based on the most
 * common mistake type, and average mastery per subject.
 */
function getAggregateStats(studentId) {
  const store = readStore();
  const student = store.students[studentId];
  const log = student?.attemptLog || [];

  if (log.length === 0) {
    return { totalAttempts: 0, accuracy: 0, mistakeBreakdown: [], recommendation: null, bySubject: [] };
  }

  const correct = log.filter((a) => a.verdict === 'correct').length;
  const partial = log.filter((a) => a.verdict === 'partial').length;
  const incorrect = log.filter((a) => a.verdict === 'incorrect').length;
  const accuracy = Math.round(((correct + partial * 0.5) / log.length) * 100);

  const mistakeCounts = {};
  log.forEach((a) => {
    if (a.mistakeType && a.mistakeType !== 'not_applicable') {
      mistakeCounts[a.mistakeType] = (mistakeCounts[a.mistakeType] || 0) + 1;
    }
  });
  const totalMistakes = Object.values(mistakeCounts).reduce((a, b) => a + b, 0);
  const mistakeBreakdown = Object.entries(mistakeCounts)
    .map(([type, count]) => ({ type, count, percent: Math.round((count / totalMistakes) * 100) }))
    .sort((a, b) => b.count - a.count);

  const dominantType = mistakeBreakdown[0]?.type;
  const recommendation = dominantType ? MISTAKE_RECOMMENDATIONS[dominantType] : null;

  const subjects = student?.subjects || {};
  const bySubject = Object.entries(subjects).map(([subject, data]) => {
    const scores = Object.values(data.concepts || {}).map((c) => c.masteryScore);
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    return { subject, averageMastery: avg, conceptCount: scores.length };
  });

  return {
    totalAttempts: log.length,
    correct,
    partial,
    incorrect,
    accuracy,
    mistakeBreakdown,
    recommendation,
    bySubject,
  };
}

const TEACHER_MISTAKE_TIPS = {
  conceptual_misunderstanding:
    'أكتر نوع خطأ متكرر بين الطلاب هو سوء فهم للمفاهيم الأساسية. ينصح بتخصيص وقت في الحصة لمراجعة التعريفات والمبادئ الأساسية قبل الانتقال لتمارين تطبيقية جديدة، بدل التركيز على حل تمارين إضافية بس.',
  careless_mistake:
    'أكتر نوع خطأ متكرر بين الطلاب هو أخطاء بسيطة أو سهو، مش سوء فهم حقيقي. جرب تدرب الطلاب على قراءة السؤال مرتين والتأكد من المطلوب قبل الحل، وممكن تدي وقت أطول في الاختبارات بدل تقليله.',
  incomplete_answer:
    'أكتر نوع خطأ متكرر بين الطلاب هو إجابات ناقصة. الطلاب بيوصلوا لجزء من الإجابة الصح لكن مش بيكملوا الشرح بالكامل. ينصح بتدريبهم على الإجابة الكاملة والمنظمة، مش بس النتيجة النهائية.',
  calculation_error:
    'أكتر نوع خطأ متكرر بين الطلاب هو أخطاء حسابية أثناء التطبيق. المفهوم النظري غالبًا مفهوم، لكن التنفيذ فيه أخطاء. ينصح بمزيد من التمارين التطبيقية مع مراجعة خطوات الحل خطوة بخطوة.',
};

/**
 * Aggregates data for ONLY the students who joined this teacher's class via
 * their class code - not every student in the app who happens to study the
 * same subject. This is the real "my class" view, not a global scan.
 */
function getClassStats(teacherEmail) {
  const store = readStore();
  const teacher = store.users?.[teacherEmail];
  const empty = {
    classCode: null,
    subject: null,
    grade: null,
    studentCount: 0,
    totalAttempts: 0,
    classAccuracy: 0,
    mistakeBreakdown: [],
    weakestConcepts: [],
    tips: [],
  };
  if (!teacher || teacher.role !== 'teacher') return empty;

  const { subject, grade, classCode } = teacher;
  const studentEmails = Object.values(store.users || {})
    .filter((u) => u.role === 'student' && Object.values(u.joinedClasses || {}).includes(teacherEmail))
    .map((u) => u.email);

  const matchesFilter = (a) => a.subject === subject && (!grade || a.grade === grade);

  let allAttempts = [];
  const conceptAggregates = {};

  studentEmails.forEach((email) => {
    const student = store.students?.[email];
    if (!student) return;

    const subjectAttempts = (student.attemptLog || []).filter(matchesFilter);
    allAttempts = allAttempts.concat(subjectAttempts);

    const subjectData = student.subjects?.[subject];
    if (subjectData) {
      Object.entries(subjectData.concepts || {}).forEach(([concept, data]) => {
        if (grade && data.grade && data.grade !== grade) return;
        if (!conceptAggregates[concept]) {
          conceptAggregates[concept] = { totalMastery: 0, studentCount: 0, mistakeCounts: {} };
        }
        conceptAggregates[concept].totalMastery += data.masteryScore;
        conceptAggregates[concept].studentCount += 1;
        Object.entries(data.mistakeTypeCounts || {}).forEach(([type, count]) => {
          conceptAggregates[concept].mistakeCounts[type] =
            (conceptAggregates[concept].mistakeCounts[type] || 0) + count;
        });
      });
    }
  });

  if (allAttempts.length === 0) {
    return { ...empty, classCode, subject, grade, studentCount: studentEmails.length };
  }

  const correct = allAttempts.filter((a) => a.verdict === 'correct').length;
  const partial = allAttempts.filter((a) => a.verdict === 'partial').length;
  const classAccuracy = Math.round(((correct + partial * 0.5) / allAttempts.length) * 100);

  const mistakeCounts = {};
  allAttempts.forEach((a) => {
    if (a.mistakeType && a.mistakeType !== 'not_applicable') {
      mistakeCounts[a.mistakeType] = (mistakeCounts[a.mistakeType] || 0) + 1;
    }
  });
  const totalMistakes = Object.values(mistakeCounts).reduce((a, b) => a + b, 0) || 1;
  const mistakeBreakdown = Object.entries(mistakeCounts)
    .map(([type, count]) => ({ type, count, percent: Math.round((count / totalMistakes) * 100) }))
    .sort((a, b) => b.count - a.count);

  const weakestConcepts = Object.entries(conceptAggregates)
    .map(([concept, data]) => ({
      concept,
      averageMastery: Math.round(data.totalMastery / data.studentCount),
      studentCount: data.studentCount,
      dominantMistakeType:
        Object.entries(data.mistakeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    }))
    .sort((a, b) => a.averageMastery - b.averageMastery)
    .slice(0, 8);

  const tips = [];
  const dominantType = mistakeBreakdown[0]?.type;
  if (dominantType && TEACHER_MISTAKE_TIPS[dominantType]) {
    tips.push(TEACHER_MISTAKE_TIPS[dominantType]);
  }
  weakestConcepts.slice(0, 3).forEach((c) => {
    if (c.averageMastery < 60) {
      tips.push(
        `مفهوم "${c.concept}" هو الأضعف بين الطلاب (متوسط إتقان ${c.averageMastery}% بين ${c.studentCount} طالب). ينصح بإعادة شرحه في الحصة القادمة قبل الانتقال لموضوع جديد.`
      );
    }
  });

  return {
    classCode,
    subject,
    grade,
    studentCount: studentEmails.length,
    totalAttempts: allAttempts.length,
    classAccuracy,
    mistakeBreakdown,
    weakestConcepts,
    tips,
  };
}

/* ========================= AUTH: USERS & SESSIONS =========================
   Lightweight file-based auth suitable for a hackathon demo - NOT a
   production auth system. Passwords are hashed with bcrypt before storage.
   Sessions are simple random tokens with no expiry, stored server-side.
   ========================================================================= */

// Excludes visually ambiguous characters (0/O, 1/I) since codes are meant
// to be read aloud or copied down by hand in a classroom.
const CLASS_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateUniqueClassCode(store) {
  const existingCodes = new Set(
    Object.values(store.users || {})
      .filter((u) => u.classCode)
      .map((u) => u.classCode)
  );
  let code;
  do {
    code = Array.from({ length: 6 }, () => CLASS_CODE_CHARS[Math.floor(Math.random() * CLASS_CODE_CHARS.length)]).join('');
  } while (existingCodes.has(code));
  return code;
}

function getUserByClassCode(code) {
  const store = readStore();
  const normalized = code.toUpperCase().trim();
  return Object.values(store.users || {}).find((u) => u.role === 'teacher' && u.classCode === normalized) || null;
}

function getStudentsForTeacher(teacherEmail) {
  const store = readStore();
  return Object.values(store.users || {})
    .filter((u) => u.role === 'student' && Object.values(u.joinedClasses || {}).includes(teacherEmail))
    .map((u) => u.email);
}

/**
 * Returns a student's joined classes as a display-friendly array, resolving
 * each teacher's email into their name. Shared between the signup/login/me
 * response builder and the "join a class later" endpoint so both stay
 * consistent.
 */
function getJoinedClassesFormatted(studentEmail) {
  const store = readStore();
  const student = store.users?.[studentEmail];
  if (!student) return [];
  return Object.entries(student.joinedClasses || {}).map(([subject, teacherEmail]) => {
    const teacher = store.users?.[teacherEmail];
    return { subject, teacherName: teacher ? teacher.name : null };
  });
}

/**
 * Links a student to a teacher's class for one subject after their account
 * already exists (as opposed to at signup). Overwrites any previous link
 * for that subject, so a student can switch teachers for a subject if needed.
 */
function joinClass(studentEmail, subject, teacherEmail) {
  const store = readStore();
  const student = store.users?.[studentEmail];
  if (!student) throw new Error('Student not found');
  if (!student.joinedClasses) student.joinedClasses = {};
  student.joinedClasses[subject] = teacherEmail;
  writeStore(store);
  return getJoinedClassesFormatted(studentEmail);
}

/**
 * joinedClasses is an already-validated { subjectName: teacherEmail } map -
 * validation (does the code exist, does it match this subject/grade) happens
 * in the auth route before this is called, so this function just persists
 * the result.
 */
function createUser({ email, passwordHash, name, role, subject, grade, joinedClasses }) {
  const store = readStore();
  if (!store.users) store.users = {};
  const normalizedEmail = email.toLowerCase().trim();

  const teacherClassCode = role === 'teacher' ? generateUniqueClassCode(store) : null;

  store.users[normalizedEmail] = {
    email: normalizedEmail,
    passwordHash,
    name,
    role,
    subject: subject || null,
    grade: grade || null,
    classCode: teacherClassCode,
    joinedClasses: role === 'student' ? joinedClasses || {} : {},
    createdAt: new Date().toISOString(),
  };
  writeStore(store);
  return store.users[normalizedEmail];
}

function getUserByEmail(email) {
  const store = readStore();
  return store.users?.[email.toLowerCase().trim()] || null;
}

function createSession(email, role) {
  const store = readStore();
  if (!store.sessions) store.sessions = {};
  const token = crypto.randomUUID();
  store.sessions[token] = { email, role, createdAt: new Date().toISOString() };
  writeStore(store);
  return token;
}

function getSession(token) {
  const store = readStore();
  return store.sessions?.[token] || null;
}

function deleteSession(token) {
  const store = readStore();
  if (store.sessions) delete store.sessions[token];
  writeStore(store);
}

module.exports = {
  getConceptMastery,
  getStudentProfile,
  updateMastery,
  getAggregateStats,
  getClassStats,
  createUser,
  getUserByEmail,
  getUserByClassCode,
  getStudentsForTeacher,
  getJoinedClassesFormatted,
  joinClass,
  createSession,
  getSession,
  deleteSession,
};
