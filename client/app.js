import {
  generateQuiz, evaluateAnswer, generateFollowUp,
  getWeaknesses, getStats, uploadPdf, getTeacherStats,
  getMyClasses, joinClass,
  signup, login, logout, getMe, setUnauthorizedHandler,
} from './api.js';

const GRADES = ['المرحلة الإعدادية', 'المرحلة الثانوية'];

const SUBJECTS_BY_GRADE = {
  'المرحلة الإعدادية': ['العلوم', 'الرياضيات', 'الدراسات الاجتماعية', 'اللغة العربية', 'الحاسب الآلي', 'اللغة الإنجليزية', 'اللغة الفرنسية', 'اللغة الألمانية'],
  'المرحلة الثانوية': ['الأحياء', 'الفيزياء', 'الكيمياء', 'الرياضيات', 'تاريخ', 'تكنولوجيا المعلومات', 'اللغة الإنجليزية', 'اللغة الفرنسية', 'اللغة الألمانية'],
};

const TOPICS_BY_GRADE_SUBJECT = {
  'المرحلة الإعدادية': {
    'العلوم': ['دورة الماء في الطبيعة', 'المجموعة الشمسية', 'الخلية ومكوناتها', 'حالات المادة الثلاث', 'القوى والحركة'],
    'الرياضيات': ['النسبة والتناسب', 'مقياس الرسم', 'المعادلات من الدرجة الأولى', 'المساحة والمحيط', 'الأعداد النسبية'],
    'الدراسات الاجتماعية': ['حضارة مصر القديمة', 'موقع مصر الجغرافي', 'الثورة العرابية', 'المناخ في مصر', 'السكان والتوزيع السكاني'],
    'اللغة العربية': ['النحو: الجملة الاسمية والفعلية', 'أنواع الخبر', 'تحليل نص أدبي', 'الإملاء وأنواع الهمزات'],
    'الحاسب الآلي': ['مكونات الحاسب الأساسية', 'نظام التشغيل وإدارة الملفات', 'أساسيات الإنترنت والتصفح الآمن', 'مقدمة في البرمجة بلغة سكراتش'],
    'اللغة الإنجليزية': ['Present Simple vs Present Continuous', 'Simple Past Tense', 'Reading Comprehension: Short Stories', 'Basic Vocabulary: Daily Routines', 'Writing a Paragraph'],
    'اللغة الفرنسية': ['Les articles définis et indéfinis', "Le présent de l'indicatif", 'Vocabulaire: la famille', 'Se présenter en français', 'Les nombres et les couleurs'],
    'اللغة الألمانية': ['Die Artikel: der, die, das', 'Präsens Verben', 'Wortschatz: Familie und Freunde', 'Sich vorstellen', 'Zahlen und Farben'],
  },
  'المرحلة الثانوية': {
    'الأحياء': ['الدورة الدموية', 'الجهاز العصبي', 'التمثيل الضوئي', 'الوراثة وقوانين مندل', 'المناعة وأنواعها'],
    'الفيزياء': ['قانون نيوتن الثاني', 'الحركة الدورية والاهتزازية', 'الكهرباء الساكنة', 'قوانين الديناميكا الحرارية', 'الموجات الكهرومغناطيسية'],
    'الكيمياء': ['التفاعلات الكيميائية والاتزان', 'الجدول الدوري والخواص الدورية', 'الروابط الكيميائية', 'الأحماض والقواعد', 'الكيمياء العضوية'],
    'الرياضيات': ['التفاضل والتكامل - المشتقة الأولى', 'الهندسة التحليلية', 'الاحتمالات والإحصاء', 'المتتابعات والمتسلسلات', 'حساب المثلثات'],
    'تاريخ': ['ثورة 1919 وسعد زغلول', 'محمد علي وبناء الدولة الحديثة', 'العدوان الثلاثي على مصر 1956', 'الحرب العالمية الثانية وتأثيرها على مصر', 'حركة الاستعمار الأوروبي في أفريقيا'],
    'تكنولوجيا المعلومات': ['خوارزميات الفرز الأساسية', 'أساسيات قواعد البيانات', 'مبادئ الذكاء الاصطناعي', 'أمن المعلومات والخصوصية الرقمية'],
    'اللغة الإنجليزية': ['Reported Speech', 'Conditional Sentences', 'Essay Writing: Argumentative Essays', 'Passive Voice', 'Reading Comprehension: Literature Texts'],
    'اللغة الفرنسية': ['Le passé composé', 'Les pronoms relatifs', 'Le futur simple', 'Compréhension de texte', "L'expression de l'opinion"],
    'اللغة الألمانية': ['Perfekt: die Vergangenheit', 'Nebensätze mit weil und dass', 'Modalverben', 'Textverständnis', 'Meinungen äußern'],
  },
};

const MISTAKE_LABELS = {
  conceptual_misunderstanding: 'سوء فهم للمفهوم',
  careless_mistake: 'خطأ بسيط / سهو',
  incomplete_answer: 'إجابة ناقصة',
  calculation_error: 'خطأ حسابي',
  not_applicable: '—',
};

const STATE = {
  authScreen: 'login', // 'login' | 'signup' - only used while auth is null
  auth: null,          // { email, name, role } once logged in
  authLoading: true,   // true while we check for an existing session on boot
  authError: null,
  authFields: { name: '', email: '', password: '', grade: GRADES[1], subject: SUBJECTS_BY_GRADE[GRADES[1]][0], classCodes: {} },

  screen: 'setup',
  dialect: 'egyptian',
  grade: GRADES[1],
  subject: SUBJECTS_BY_GRADE[GRADES[1]][0],
  questionCount: 4,
  topic: '',
  uploadedFileName: null,
  uploadingPdf: false,
  questions: [],
  pointer: 0,
  conceptStatus: {},
  conceptNames: [],
  loading: false,
  slowNotice: false, // shown if a request is taking longer than usual (e.g. auto-retrying a rate limit)
  error: null,
  warning: null,
  currentAnswer: '',
  currentVerdict: null,
  answerHistory: [],
  weaknesses: [],
  stats: null,
  teacherStats: null,
  myClasses: [],
  joinCodeInputs: {},   // subject -> currently typed code, for the "join later" screen
  joinError: null,
  joiningSubject: null, // which subject's join request is in flight
};

setUnauthorizedHandler(() => {
  // Session expired or was invalidated server-side mid-use - bounce back to login.
  STATE.auth = null;
  STATE.authScreen = 'login';
  STATE.authError = 'انتهت صلاحية الجلسة، سجل الدخول مرة أخرى.';
  render();
});

/* =========================================================================
   TOP-LEVEL DISPATCH
   ========================================================================= */
function render() {
  const app = document.getElementById('app');
  if (STATE.authLoading) {
    app.innerHTML = `<div class="landing-wrap"><div class="loading" style="justify-content:center;"><div class="spinner"></div> جارٍ التحقق من الجلسة...</div></div>`;
    return;
  }
  if (!STATE.auth) {
    app.innerHTML = STATE.authScreen === 'signup' ? signupHTML() : loginHTML();
    bindAuthEvents();
    return;
  }
  if (STATE.auth.role === 'teacher') {
    renderTeacherApp();
  } else {
    renderStudentApp();
  }
}

/* ========================= AUTH SCREENS ========================= */

function loginHTML() {
  return `
    <div class="landing-wrap">
      <div class="brand" style="justify-content:center; margin-bottom:6px;">
        <h1>امتحنلي</h1>
        <span class="tag">Imtihanly</span>
      </div>
      <div class="landing-sub">سجل الدخول لتكمل رحلتك</div>
      <div class="card auth-card">
        <div class="field">
          <label>البريد الإلكتروني</label>
          <input type="email" id="loginEmail" placeholder="you@gmail.com" value="${STATE.authFields.email}" />
        </div>
        <div class="field">
          <label>كلمة المرور</label>
          <input type="password" id="loginPassword" placeholder="••••••••" />
        </div>
        ${STATE.authError ? `<div class="error-box">${STATE.authError}</div>` : ''}
        ${STATE.loading
          ? `<div class="loading"><div class="spinner"></div> جارٍ تسجيل الدخول...</div>`
          : `<button class="btn" id="loginBtn">دخول</button>`}
        <div class="auth-switch">معندكش حساب؟ <a href="#" id="goSignup">إنشاء حساب جديد</a></div>
      </div>
    </div>
  `;
}

function signupHTML() {
  const isTeacherEmail = STATE.authFields.email.toLowerCase().trim().endsWith('@imtihanly.com');
  const subjectsForGrade = SUBJECTS_BY_GRADE[STATE.authFields.grade];
  return `
    <div class="landing-wrap">
      <div class="brand" style="justify-content:center; margin-bottom:6px;">
        <h1>امتحنلي</h1>
        <span class="tag">Imtihanly</span>
      </div>
      <div class="landing-sub">إنشاء حساب جديد</div>
      <div class="card auth-card">
        <div class="field">
          <label>الاسم</label>
          <input type="text" id="signupName" placeholder="اسمك" value="${STATE.authFields.name}" />
        </div>
        <div class="field">
          <label>البريد الإلكتروني</label>
          <input type="email" id="signupEmail" placeholder="you@gmail.com" value="${STATE.authFields.email}" />
          <div class="hint-note">
            📧 طالب؟ استخدم بريد ينتهي بـ <b>@gmail.com</b><br/>
            🧑‍🏫 معلم؟ استخدم بريد ينتهي بـ <b>@imtihanly.com</b>
          </div>
        </div>
        <div class="field">
          <label>كلمة المرور</label>
          <input type="password" id="signupPassword" placeholder="6 أحرف على الأقل" />
        </div>
        <div class="field">
          <label>المرحلة الدراسية</label>
          <div class="pill-row">
            ${GRADES.map((g) => `<button type="button" class="pill-btn ${g === STATE.authFields.grade ? 'active' : ''}" data-signup-grade="${g}">${g.replace('المرحلة ', '')}</button>`).join('')}
          </div>
        </div>
        ${isTeacherEmail ? `
        <div class="field">
          <label>المادة التي تدرّسها</label>
          <select id="signupSubject">${subjectsForGrade.map((s) => `<option ${s === STATE.authFields.subject ? 'selected' : ''}>${s}</option>`).join('')}</select>
        </div>
        ` : `
        <div class="field">
          <label>أكواد المعلمين <span style="font-weight:400; color:var(--ink-soft);">(اختياري لكل مادة)</span></label>
          <div class="hint-note" style="margin-bottom:10px;">لو معلمك في أي مادة ديك كود، اكتبه في الخانة الخاصة بيها عشان تنضم لفصله. مش لازم تملأ كل الخانات — تقدر تنضم لبعض المواد بس، أو تسيبها كلها فاضية وتنضم بعدين.</div>
          ${subjectsForGrade.map((s) => `
            <div class="subject-code-row">
              <span class="subject-code-label">${s}</span>
              <input type="text" class="subject-code-input" data-subject-code="${s}" placeholder="كود اختياري" value="${STATE.authFields.classCodes[s] || ''}" />
            </div>
          `).join('')}
        </div>
        `}
        ${STATE.authError ? `<div class="error-box">${STATE.authError}</div>` : ''}
        ${STATE.loading
          ? `<div class="loading"><div class="spinner"></div> جارٍ إنشاء الحساب...</div>`
          : `<button class="btn" id="signupBtn">إنشاء حساب</button>`}
        <div class="auth-switch">عندك حساب بالفعل؟ <a href="#" id="goLogin">تسجيل الدخول</a></div>
      </div>
    </div>
  `;
}

function bindAuthEvents() {
  const goSignup = document.getElementById('goSignup');
  if (goSignup) goSignup.onclick = (e) => { e.preventDefault(); STATE.authScreen = 'signup'; STATE.authError = null; render(); };
  const goLogin = document.getElementById('goLogin');
  if (goLogin) goLogin.onclick = (e) => { e.preventDefault(); STATE.authScreen = 'login'; STATE.authError = null; render(); };

  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn) loginBtn.onclick = handleLogin;
  const signupBtn = document.getElementById('signupBtn');
  if (signupBtn) signupBtn.onclick = handleSignup;

  const loginEmail = document.getElementById('loginEmail');
  if (loginEmail) loginEmail.oninput = (e) => (STATE.authFields.email = e.target.value);
  const signupName = document.getElementById('signupName');
  if (signupName) signupName.oninput = (e) => (STATE.authFields.name = e.target.value);
  const signupEmail = document.getElementById('signupEmail');
  if (signupEmail) signupEmail.oninput = (e) => {
    STATE.authFields.email = e.target.value;
    render(); // re-render so teacher-only fields appear/disappear as the domain is typed
    const el = document.getElementById('signupEmail');
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  };
  document.querySelectorAll('.pill-btn[data-signup-grade]').forEach((btn) => {
    btn.onclick = () => {
      STATE.authFields.grade = btn.dataset.signupGrade;
      STATE.authFields.subject = SUBJECTS_BY_GRADE[STATE.authFields.grade][0];
      STATE.authFields.classCodes = {}; // subject list changes with grade, so old codes no longer apply
      render();
    };
  });
  const signupSubject = document.getElementById('signupSubject');
  if (signupSubject) signupSubject.onchange = (e) => (STATE.authFields.subject = e.target.value);
  document.querySelectorAll('.subject-code-input').forEach((input) => {
    input.oninput = (e) => {
      STATE.authFields.classCodes[input.dataset.subjectCode] = e.target.value;
    };
  });
}

function applyStudentGradeFromAuth(user) {
  if (user.role === 'student' && user.grade) {
    STATE.grade = user.grade;
    STATE.subject = SUBJECTS_BY_GRADE[user.grade][0];
    STATE.myClasses = user.joinedClasses || [];
  }
}

async function handleLogin() {
  if (STATE.loading) return;
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!email || !password) {
    STATE.authError = 'اكتب البريد الإلكتروني وكلمة المرور.';
    render();
    return;
  }
  STATE.loading = true;
  STATE.authError = null;
  render();
  try {
    const user = await login({ email, password });
    STATE.auth = user;
    applyStudentGradeFromAuth(user);
    STATE.screen = user.role === 'teacher' ? 'teacher' : 'setup';
    render();
    if (user.role === 'teacher') handleShowTeacher();
  } catch (err) {
    STATE.authError = err.message;
    STATE.loading = false;
    render();
    return;
  }
  STATE.loading = false;
}

async function handleSignup() {
  if (STATE.loading) return;
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  if (!name || !email || !password) {
    STATE.authError = 'كل الحقول مطلوبة.';
    render();
    return;
  }
  const isTeacherEmail = email.toLowerCase().endsWith('@imtihanly.com');
  STATE.loading = true;
  STATE.authError = null;
  render();
  try {
    const user = await signup({
      name,
      email,
      password,
      grade: STATE.authFields.grade,
      subject: isTeacherEmail ? STATE.authFields.subject : undefined,
      classCodes: isTeacherEmail ? undefined : STATE.authFields.classCodes,
    });
    STATE.auth = user;
    applyStudentGradeFromAuth(user);
    STATE.screen = user.role === 'teacher' ? 'teacher' : 'setup';
    render();
    if (user.role === 'teacher') handleShowTeacher();
  } catch (err) {
    STATE.authError = err.message;
    STATE.loading = false;
    render();
    return;
  }
  STATE.loading = false;
}

async function handleLogout() {
  await logout();
  STATE.auth = null;
  STATE.authScreen = 'login';
  STATE.authFields = { name: '', email: '', password: '', grade: GRADES[1], subject: SUBJECTS_BY_GRADE[GRADES[1]][0], classCodes: {} };
  render();
}

/* ========================= STUDENT APP ========================= */

function renderStudentApp() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="topbar">
      <div class="brand">
        <h1>امتحنلي</h1>
        <span class="tag">Imtihanly</span>
      </div>
      <div class="user-cluster">
        <span class="user-name">👋 ${STATE.auth.name}</span>
        <button class="switch-role-btn" id="logoutBtn">تسجيل خروج</button>
      </div>
    </div>
    <div class="navrow">
      <button class="navbtn ${STATE.screen === 'setup' ? 'active' : ''}" id="navSetup">اختبار جديد</button>
      <button class="navbtn ${STATE.screen === 'progress' ? 'active' : ''}" id="navProgress">تقدمي</button>
      <button class="navbtn ${STATE.screen === 'stats' ? 'active' : ''}" id="navStats">التحليل الإحصائي</button>
      <button class="navbtn ${STATE.screen === 'classes' ? 'active' : ''}" id="navClasses">الفصول الدراسية</button>
    </div>
    ${STATE.screen === 'quiz' || STATE.screen === 'summary' ? threadHTML() : ''}
    <div id="screen"></div>
  `;
  document.getElementById('logoutBtn').onclick = handleLogout;
  document.getElementById('navSetup').onclick = handleRestart;
  document.getElementById('navProgress').onclick = handleShowProgress;
  document.getElementById('navStats').onclick = handleShowStats;
  document.getElementById('navClasses').onclick = handleShowClasses;

  const screenEl = document.getElementById('screen');
  if (STATE.screen === 'setup') screenEl.innerHTML = setupHTML();
  if (STATE.screen === 'quiz') screenEl.innerHTML = quizHTML();
  if (STATE.screen === 'summary') screenEl.innerHTML = summaryHTML();
  if (STATE.screen === 'progress') screenEl.innerHTML = progressHTML();
  if (STATE.screen === 'stats') screenEl.innerHTML = statsHTML();
  if (STATE.screen === 'classes') screenEl.innerHTML = classesHTML();
  bindStudentScreenEvents();
}

function threadHTML() {
  const n = STATE.conceptNames.length;
  if (n === 0) return '';
  let nodes = '';
  for (let i = 0; i < n; i++) {
    const status = STATE.conceptStatus[i] || 'pending';
    const isActive = getCurrentConceptIndex() === i && STATE.screen === 'quiz';
    const isLast = i === n - 1;
    const nextBroken = STATE.conceptStatus[i] === 'broken';
    nodes += `
      <div class="thread-node-wrap">
        <div class="thread-node ${status} ${isActive ? 'active' : ''}">${i + 1}</div>
        ${!isLast ? `<div class="thread-connector ${nextBroken ? 'broken' : ''}"></div>` : ''}
      </div>`;
  }
  return `
    <div class="thread-wrap">
      <div class="thread-label">خيط الفهم — Understanding Thread</div>
      <div class="thread-row">${nodes}</div>
    </div>`;
}

function getCurrentConceptIndex() {
  const q = STATE.questions[STATE.pointer];
  return q ? q.conceptIndex : -1;
}

function setupHTML() {
  const subjects = SUBJECTS_BY_GRADE[STATE.grade];
  const chips = TOPICS_BY_GRADE_SUBJECT[STATE.grade][STATE.subject] || [];
  return `
    <div class="card">
      <div class="field">
        <label>المرحلة الدراسية</label>
        <div class="grade-badge">${STATE.grade}</div>
      </div>
      <div class="field">
        <div class="row2">
          <div>
            <label>المادة الدراسية</label>
            <select id="subjectSel">${subjects.map((s) => `<option ${s === STATE.subject ? 'selected' : ''}>${s}</option>`).join('')}</select>
          </div>
          <div>
            <label>عدد الأسئلة</label>
            <input type="number" id="countInput" min="2" max="8" value="${STATE.questionCount}" />
            <div class="count-hint">ده عدد المفاهيم الأساسية. لو جاوبت غلط على أي سؤال، هيظهرلك سؤال مراجعة إضافي مش من ضمن العدد ده.</div>
          </div>
        </div>
      </div>
      <div class="field">
        <label>الصق محتوى الدرس، اكتب اسم الموضوع، أو ارفع ملف PDF</label>
        <textarea id="topicInput" placeholder="مثال: الدورة الدموية — تركيب القلب ووظيفته...">${STATE.topic}</textarea>
        <div class="upload-row">
          <label class="upload-btn">
            📄 ${STATE.uploadedFileName ? 'تغيير الملف' : 'ارفع ملف PDF'}
            <input type="file" id="pdfInput" accept="application/pdf" style="display:none;" />
          </label>
          ${STATE.uploadedFileName ? `
            <span class="file-chip">${STATE.uploadedFileName} <button id="clearFileBtn" class="clear-file-btn" title="إزالة الملف">✕</button></span>
          ` : ''}
          ${STATE.uploadingPdf ? `<span class="loading" style="padding:0;"><span class="spinner"></span> جارٍ استخراج النص...</span>` : ''}
        </div>
        <div class="chips-label">اقتراحات لمواضيع مرتبطة بـ "${STATE.subject}"</div>
        <div class="chips">
          ${chips.map((c) => `<div class="chip" data-chip="${c}">${c}</div>`).join('')}
        </div>
      </div>
      ${STATE.warning ? `<div class="warning-box">⚠️ ${STATE.warning}</div>` : ''}
      ${STATE.error ? `<div class="error-box">${STATE.error}</div>` : ''}
      ${STATE.loading
        ? `<div class="loading"><div class="spinner"></div> جارٍ تحضير الأسئلة بناءً على الموضوع...</div>${STATE.slowNotice ? '<div class="slow-note">السيرفر مزدحم شوية، بس لسه شغال... هيخلص خلال لحظات 🙏</div>' : ''}`
        : `<button class="btn" id="startBtn">ابدأ الاختبار</button>`}
      <div class="muted-note">الأسئلة تتكيف تلقائيًا مع مستوى إتقانك للمفاهيم بمرور الوقت</div>
    </div>
  `;
}

function quizHTML() {
  const q = STATE.questions[STATE.pointer];
  if (!q) return '';
  const typeLabel = q.type === 'short_answer' ? 'SHORT ANSWER' : q.type === 'fill_blank' ? 'FILL-IN-BLANK' : 'EXPLAIN WHY';
  const isLocked = STATE.loading || !!STATE.currentVerdict;
  return `
    <div class="card">
      <span class="eyebrow">${q.isFollowUp
        ? `مراجعة على السؤال ${toArabicDigits(q.conceptIndex + 1)}`
        : `السؤال ${toArabicDigits(q.conceptIndex + 1)} من ${toArabicDigits(STATE.conceptNames.length)}`} — ${q.concept}<span class="qtype">${typeLabel}${q.isFollowUp ? ' · REVIEW' : ''}</span></span>
      <div class="qtext">${q.prompt}</div>
      <div class="field">
        <textarea id="answerInput" placeholder="اكتب إجابتك هنا... (عربي، عامية، أو إنجليزي كله تمام)" ${isLocked ? 'readonly' : ''}>${STATE.currentAnswer}</textarea>
      </div>
      ${!STATE.currentVerdict
        ? `
        ${STATE.error ? `<div class="error-box">${STATE.error}</div>` : ''}
        ${STATE.loading
          ? `<div class="loading"><div class="spinner"></div> جارٍ تصحيح الإجابة...</div>${STATE.slowNotice ? '<div class="slow-note">السيرفر مزدحم شوية، بس لسه شغال... هيخلص خلال لحظات 🙏</div>' : ''}`
          : `<button class="btn" id="submitAnswerBtn">تأكيد الإجابة</button>`}
      `
        : `
        <div class="verdict ${STATE.currentVerdict.verdict}">
          <div class="verdict-title ${STATE.currentVerdict.verdict}">${verdictLabel(STATE.currentVerdict.verdict)}</div>
          ${STATE.currentVerdict.feedback}
          ${STATE.currentVerdict.explanation ? `<br><br><b>باختصار:</b> ${STATE.currentVerdict.explanation}${STATE.currentVerdict.enhanced ? ' <span class="enhanced-badge">🧠 شرح معزز</span>' : ''}` : ''}
          ${STATE.currentVerdict.mistake_type && STATE.currentVerdict.mistake_type !== 'not_applicable'
            ? `<br><br><span class="qtype" style="margin-inline-start:0">${MISTAKE_LABELS[STATE.currentVerdict.mistake_type] || STATE.currentVerdict.mistake_type}</span>`
            : ''}
          ${STATE.currentVerdict.mastery
            ? `<div class="mastery-note">مستوى إتقانك لـ "${q.concept}" الآن: <b>${STATE.currentVerdict.mastery.masteryScore}%</b></div>`
            : ''}
        </div>
        ${STATE.loading
          ? `<div class="loading" style="margin-top:14px"><div class="spinner"></div> جارٍ تحضير السؤال التالي...</div>${STATE.slowNotice ? '<div class="slow-note">السيرفر مزدحم شوية، بس لسه شغال... هيخلص خلال لحظات 🙏</div>' : ''}`
          : `<button class="btn" id="nextBtn" style="margin-top:16px">التالي</button>`}
      `}
    </div>
  `;
}

function verdictLabel(v) {
  if (v === 'correct') return '✓ إجابة صحيحة';
  if (v === 'partial') return '◐ إجابة قريبة — فيها نقطة ناقصة';
  return '✕ محتاج مراجعة';
}

function summaryHTML() {
  const total = STATE.conceptNames.length;
  const masteredCount = Object.values(STATE.conceptStatus).filter((s) => s === 'mastered').length;
  const scorePercent = total > 0 ? Math.round((masteredCount / total) * 100) : 0;
  const scoreColor = scorePercent >= 85 ? 'var(--teal)' : scorePercent >= 60 ? 'var(--gold)' : 'var(--coral)';

  const rows = STATE.conceptNames
    .map((name, i) => {
      const status = STATE.conceptStatus[i] || 'pending';
      const dotClass = status === 'mastered' ? 'mastered' : status === 'broken' ? 'broken' : 'progress';
      const note = status === 'mastered' ? 'الفهم تمام من أول محاولة أو بعد المراجعة'
        : status === 'broken' ? 'محتاج مراجعة إضافية — فيه سوء فهم في نقطة أساسية'
        : 'شغل جيد بشكل عام';
      return `<div class="summary-item"><div class="dot ${dotClass}"></div><div><div class="concept">${name}</div><div class="note">${note}</div></div></div>`;
    })
    .join('');
  return `
    <div class="card">
      <div class="eyebrow" style="color:var(--ink)">ملخص الأداء</div>
      <div class="score-display">
        <div class="score-num" style="color:${scoreColor}">${toArabicDigits(masteredCount)} <span class="score-of">من ${toArabicDigits(total)}</span></div>
        <div class="score-label">إجابات صحيحة (${scorePercent}%)</div>
      </div>
      <div class="qtext" style="font-size:17px">كده خلصنا خيط الفهم بتاعك للموضوع ده 👇</div>
      <div class="summary-list">${rows}</div>
      <div class="stepfoot">
        <button class="btn ghost" id="downloadPdfBtn">⬇️ تحميل التقرير (PDF)</button>
        <button class="btn ghost" id="restartBtn">اختبار جديد</button>
      </div>
    </div>
  `;
}

function progressHTML() {
  if (STATE.loading) {
    return `<div class="card"><div class="loading"><div class="spinner"></div> جارٍ تحميل سجل تقدمك...</div></div>`;
  }
  if (STATE.weaknesses.length === 0) {
    return `
      <div class="card">
        <div class="eyebrow" style="color:var(--ink)">سجل التقدم</div>
        <div class="qtext" style="font-size:16px">لسه معملتش أي اختبار. ابدأ اختبار الأول عشان نبني سجل تقدمك.</div>
        <button class="btn ghost" id="backToSetupBtn">ابدأ اختبار</button>
      </div>`;
  }
  const rows = STATE.weaknesses
    .map((w) => {
      const barColor = w.masteryScore > 85 ? 'var(--teal)' : w.masteryScore >= 60 ? 'var(--gold)' : 'var(--coral)';
      return `
      <div class="summary-item" style="flex-direction:column; align-items:stretch; gap:8px;">
        <div style="display:flex; justify-content:space-between; align-items:baseline;">
          <div class="concept">${w.concept}</div>
          <div class="note">${w.subject} · ${toArabicDigits(w.attempts)} محاولة</div>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${w.masteryScore}%; background:${barColor};"></div></div>
        <div class="note">إتقان: ${w.masteryScore}% ${w.lastMistakeType && w.lastMistakeType !== 'not_applicable' ? '· آخر خطأ: ' + (MISTAKE_LABELS[w.lastMistakeType] || w.lastMistakeType) : ''}</div>
      </div>`;
    })
    .join('');
  return `
    <div class="card">
      <div class="eyebrow" style="color:var(--ink)">سجل التقدم — كل المفاهيم مرتبة من الأضعف للأقوى</div>
      <div class="summary-list">${rows}</div>
      <div class="stepfoot"><button class="btn ghost" id="backToSetupBtn">اختبار جديد</button></div>
    </div>
  `;
}

function statsHTML() {
  if (STATE.loading) {
    return `<div class="card"><div class="loading"><div class="spinner"></div> جارٍ تحليل أدائك...</div></div>`;
  }
  const s = STATE.stats;
  if (!s || s.totalAttempts === 0) {
    return `
      <div class="card">
        <div class="eyebrow" style="color:var(--ink)">التحليل الإحصائي</div>
        <div class="qtext" style="font-size:16px">لسه معملتش أي اختبار. ابدأ اختبار الأول عشان نبني تحليلك الإحصائي.</div>
        <button class="btn ghost" id="backToSetupBtn">ابدأ اختبار</button>
      </div>`;
  }
  const accColor = s.accuracy > 85 ? 'var(--teal)' : s.accuracy >= 60 ? 'var(--gold)' : 'var(--coral)';
  const mistakeRows = s.mistakeBreakdown.map((m) => `
    <div class="stat-row">
      <div class="stat-label">${MISTAKE_LABELS[m.type] || m.type}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${m.percent}%; background:var(--coral);"></div></div>
      <div class="stat-value">${m.percent}%</div>
    </div>`).join('');
  const subjectRows = s.bySubject.map((b) => {
    const c = b.averageMastery > 85 ? 'var(--teal)' : b.averageMastery >= 60 ? 'var(--gold)' : 'var(--coral)';
    return `
    <div class="stat-row">
      <div class="stat-label">${b.subject}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${b.averageMastery}%; background:${c};"></div></div>
      <div class="stat-value">${b.averageMastery}%</div>
    </div>`;
  }).join('');
  return `
    <div class="card">
      <div class="eyebrow" style="color:var(--ink)">التحليل الإحصائي — ماذا فعلت خطأ وكيف تتحسن</div>
      <div class="big-stat-row">
        <div class="big-stat"><div class="big-stat-num" style="color:${accColor}">${s.accuracy}%</div><div class="big-stat-label">نسبة الدقة الكلية</div></div>
        <div class="big-stat"><div class="big-stat-num">${toArabicDigits(s.totalAttempts)}</div><div class="big-stat-label">إجمالي المحاولات</div></div>
      </div>
      <div class="stat-section-title">توزيع أنواع الأخطاء</div>
      ${mistakeRows || '<div class="note">لا توجد أخطاء مسجلة — أداء ممتاز!</div>'}
      ${s.recommendation ? `<div class="tip-box">💡 ${s.recommendation}</div>` : ''}
      <div class="stat-section-title">متوسط الإتقان لكل مادة</div>
      ${subjectRows}
      <div class="stepfoot"><button class="btn ghost" id="backToSetupBtn">اختبار جديد</button></div>
    </div>
  `;
}

function classesHTML() {
  if (STATE.loading) {
    return `<div class="card"><div class="loading"><div class="spinner"></div> جارٍ تحميل فصولك...</div></div>`;
  }
  const subjects = SUBJECTS_BY_GRADE[STATE.grade];
  const joinedMap = Object.fromEntries((STATE.myClasses || []).map((c) => [c.subject, c.teacherName]));

  const rows = subjects.map((subject) => {
    const teacherName = joinedMap[subject];
    if (teacherName) {
      return `
        <div class="class-row joined">
          <div class="class-row-subject">${subject}</div>
          <div class="class-row-status">✅ منضم — أ. ${teacherName}</div>
        </div>`;
    }
    const isJoining = STATE.joiningSubject === subject;
    return `
      <div class="class-row">
        <div class="class-row-subject">${subject}</div>
        <div class="class-row-join">
          <input type="text" class="join-code-input" data-join-subject="${subject}"
                 placeholder="كود المعلم" value="${STATE.joinCodeInputs[subject] || ''}" />
          ${isJoining
            ? `<div class="loading" style="padding:0 8px;"><div class="spinner"></div></div>`
            : `<button class="btn ghost join-btn" data-join-subject-btn="${subject}" style="width:auto; padding:8px 16px;">انضمام</button>`}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="card">
      <div class="eyebrow" style="color:var(--ink)">الفصول الدراسية</div>
      <div class="qtext" style="font-size:16px">انضم لفصل معلمك في أي مادة لسه ما انضمتش لها، عشان يقدر يشوف تقدمك.</div>
      ${STATE.joinError ? `<div class="error-box">${STATE.joinError}</div>` : ''}
      <div class="class-rows">${rows}</div>
    </div>
  `;
}

function toArabicDigits(n) {
  const map = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return String(n).split('').map((d) => (map[+d] !== undefined ? map[+d] : d)).join('');
}

function bindStudentScreenEvents() {
  const subjectSel = document.getElementById('subjectSel');
  if (subjectSel) subjectSel.onchange = (e) => { STATE.subject = e.target.value; render(); };
  const countInput = document.getElementById('countInput');
  if (countInput) countInput.onchange = (e) => {
    let v = parseInt(e.target.value, 10) || 4;
    STATE.questionCount = Math.min(Math.max(v, 2), 8);
  };
  const topicInput = document.getElementById('topicInput');
  if (topicInput) topicInput.oninput = (e) => (STATE.topic = e.target.value);
  const pdfInput = document.getElementById('pdfInput');
  if (pdfInput) pdfInput.onchange = handlePdfUpload;
  const clearFileBtn = document.getElementById('clearFileBtn');
  if (clearFileBtn) clearFileBtn.onclick = () => {
    STATE.uploadedFileName = null;
    STATE.topic = '';
    render();
  };
  document.querySelectorAll('.chip').forEach((c) => {
    c.onclick = () => { STATE.topic = c.dataset.chip; render(); };
  });
  const startBtn = document.getElementById('startBtn');
  if (startBtn) startBtn.onclick = handleStart;

  const answerInput = document.getElementById('answerInput');
  if (answerInput) answerInput.oninput = (e) => (STATE.currentAnswer = e.target.value);
  const submitAnswerBtn = document.getElementById('submitAnswerBtn');
  if (submitAnswerBtn) submitAnswerBtn.onclick = handleSubmitAnswer;
  const nextBtn = document.getElementById('nextBtn');
  if (nextBtn) nextBtn.onclick = handleNext;
  const restartBtn = document.getElementById('restartBtn');
  if (restartBtn) restartBtn.onclick = handleRestart;
  const backToSetupBtn = document.getElementById('backToSetupBtn');
  if (backToSetupBtn) backToSetupBtn.onclick = handleRestart;
  const downloadPdfBtn = document.getElementById('downloadPdfBtn');
  if (downloadPdfBtn) downloadPdfBtn.onclick = handleDownloadReport;
  document.querySelectorAll('.join-code-input').forEach((input) => {
    input.oninput = (e) => {
      STATE.joinCodeInputs[input.dataset.joinSubject] = e.target.value;
    };
  });
  document.querySelectorAll('[data-join-subject-btn]').forEach((btn) => {
    btn.onclick = () => handleJoinClass(btn.dataset.joinSubjectBtn);
  });
}

/* ---------- student flow handlers ---------- */

/**
 * Wraps an async call with a timer that flips STATE.slowNotice on if the
 * call is still running after 6 seconds - covers the case where the server
 * is silently waiting out a Groq rate limit before retrying, so it reads as
 * "still working" rather than "looks frozen."
 */
async function withSlowNotice(fn) {
  STATE.slowNotice = false;
  const timer = setTimeout(() => {
    STATE.slowNotice = true;
    render();
  }, 6000);
  try {
    return await fn();
  } finally {
    clearTimeout(timer);
    STATE.slowNotice = false;
  }
}

async function handleStart() {
  if (STATE.loading) return;
  if (!STATE.topic.trim()) {
    STATE.error = 'من فضلك اكتب موضوع الدرس أو الصق محتواه.';
    render();
    return;
  }
  STATE.loading = true;
  STATE.error = null;
  STATE.warning = null;
  render();
  try {
    const { questions } = await withSlowNotice(() => generateQuiz({
      subject: STATE.subject,
      grade: STATE.grade,
      topic: STATE.topic,
      dialect: STATE.dialect,
      questionCount: STATE.questionCount,
    }));
    STATE.questions = questions;
    STATE.conceptNames = questions.map((q) => q.concept);
    STATE.conceptStatus = {};
    STATE.pointer = 0;
    STATE.currentAnswer = '';
    STATE.currentVerdict = null;
    STATE.answerHistory = [];
    STATE.screen = 'quiz';
  } catch (err) {
    if (err.code === 'IRRELEVANT_TOPIC') {
      STATE.warning = err.message;
    } else {
      STATE.error = 'حصلت مشكلة: ' + err.message;
    }
    console.error(err);
  }
  STATE.loading = false;
  render();
}

async function handlePdfUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  STATE.uploadingPdf = true;
  STATE.error = null;
  render();
  try {
    const { text, truncated } = await uploadPdf(file);
    STATE.topic = text;
    STATE.uploadedFileName = file.name;
    if (truncated) {
      STATE.warning = 'الملف طويل، تم استخدام أول جزء منه فقط لتوليد الأسئلة.';
    }
  } catch (err) {
    STATE.error = 'حصلت مشكلة أثناء قراءة الملف: ' + err.message;
    console.error(err);
  }
  STATE.uploadingPdf = false;
  render();
}

async function handleSubmitAnswer() {
  if (STATE.loading) return;
  const q = STATE.questions[STATE.pointer];
  if (!STATE.currentAnswer.trim()) {
    STATE.error = 'اكتب إجابة الأول.';
    render();
    return;
  }
  STATE.loading = true;
  STATE.error = null;
  render();
  try {
    const verdict = await withSlowNotice(() => evaluateAnswer({
      subject: STATE.subject,
      grade: STATE.grade,
      question: q.prompt,
      concept: q.concept,
      studentAnswer: STATE.currentAnswer,
      dialect: STATE.dialect,
    }));
    STATE.currentVerdict = verdict;
    STATE.answerHistory.push({
      concept: q.concept,
      prompt: q.prompt,
      studentAnswer: STATE.currentAnswer,
      verdict: verdict.verdict,
      mistakeType: verdict.mistake_type,
      feedback: verdict.feedback,
      isFollowUp: q.isFollowUp,
    });

    if (verdict.verdict === 'correct') STATE.conceptStatus[q.conceptIndex] = 'mastered';
    else if (q.isFollowUp) STATE.conceptStatus[q.conceptIndex] = 'broken';
    else STATE.conceptStatus[q.conceptIndex] = 'progress';
  } catch (err) {
    STATE.error = 'حصلت مشكلة: ' + err.message;
    console.error(err);
  }
  STATE.loading = false;
  render();
}

async function handleNext() {
  if (STATE.loading) return;
  const q = STATE.questions[STATE.pointer];
  const needsFollowUp = STATE.currentVerdict.verdict !== 'correct' && !q.isFollowUp;

  STATE.currentAnswer = '';
  STATE.currentVerdict = null;
  STATE.error = null;

  if (needsFollowUp) {
    STATE.loading = true;
    render();
    try {
      const fu = await withSlowNotice(() => generateFollowUp({
        subject: STATE.subject,
        concept: q.concept,
        originalPrompt: q.prompt,
        dialect: STATE.dialect,
      }));
      STATE.questions.splice(STATE.pointer + 1, 0, {
        concept: q.concept, type: fu.type, prompt: fu.prompt,
        conceptIndex: q.conceptIndex, isFollowUp: true,
      });
    } catch (err) {
      console.error(err);
    }
    STATE.loading = false;
  }

  STATE.pointer += 1;
  if (STATE.pointer >= STATE.questions.length) STATE.screen = 'summary';
  render();
}

async function handleShowProgress() {
  STATE.screen = 'progress';
  STATE.loading = true;
  render();
  try {
    const { weaknesses } = await getWeaknesses();
    STATE.weaknesses = weaknesses;
  } catch (err) {
    console.error(err);
    STATE.weaknesses = [];
  }
  STATE.loading = false;
  render();
}

async function handleShowStats() {
  STATE.screen = 'stats';
  STATE.loading = true;
  render();
  try {
    STATE.stats = await getStats();
  } catch (err) {
    console.error(err);
    STATE.stats = null;
  }
  STATE.loading = false;
  render();
}

async function handleShowClasses() {
  STATE.screen = 'classes';
  STATE.loading = true;
  STATE.joinError = null;
  render();
  try {
    const { joinedClasses } = await getMyClasses();
    STATE.myClasses = joinedClasses;
  } catch (err) {
    console.error(err);
    STATE.myClasses = [];
  }
  STATE.loading = false;
  render();
}

async function handleJoinClass(subject) {
  const code = (STATE.joinCodeInputs[subject] || '').trim();
  if (!code) {
    STATE.joinError = 'اكتب الكود الأول.';
    render();
    return;
  }
  STATE.joiningSubject = subject;
  STATE.joinError = null;
  render();
  try {
    const { joinedClasses } = await joinClass(subject, code);
    STATE.myClasses = joinedClasses;
    delete STATE.joinCodeInputs[subject];
  } catch (err) {
    STATE.joinError = err.message;
    console.error(err);
  }
  STATE.joiningSubject = null;
  render();
}

function handleDownloadReport() {
  let existing = document.getElementById('printReport');
  if (existing) existing.remove();

  const report = document.createElement('div');
  report.id = 'printReport';
  report.className = 'print-only';

  const rows = STATE.answerHistory.map((a, i) => `
    <tr>
      <td>${toArabicDigits(i + 1)}</td>
      <td>${a.concept}${a.isFollowUp ? ' (مراجعة)' : ''}</td>
      <td>${a.prompt}</td>
      <td>${a.studentAnswer}</td>
      <td>${verdictLabel(a.verdict)}</td>
      <td>${MISTAKE_LABELS[a.mistakeType] || '—'}</td>
    </tr>`).join('');

  report.innerHTML = `
    <h1>تقرير امتحنلي — ${STATE.subject}</h1>
    <p>الطالب: ${STATE.auth.name} | المرحلة الدراسية: ${STATE.grade} | التاريخ: ${new Date().toLocaleDateString('ar-EG')}</p>
    <table>
      <thead><tr><th>#</th><th>المفهوم</th><th>السؤال</th><th>إجابة الطالب</th><th>النتيجة</th><th>نوع الخطأ</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  document.body.appendChild(report);
  window.print();
}

function handleRestart() {
  STATE.screen = 'setup';
  STATE.topic = '';
  STATE.uploadedFileName = null;
  STATE.questions = [];
  STATE.pointer = 0;
  STATE.conceptStatus = {};
  STATE.conceptNames = [];
  STATE.currentAnswer = '';
  STATE.currentVerdict = null;
  STATE.answerHistory = [];
  STATE.error = null;
  STATE.warning = null;
  render();
}

/* ========================= TEACHER APP =========================
   Completely separate render path. This screen is only ever reached when
   STATE.auth.role === 'teacher', which the server itself decided at
   signup/login based on the account's email domain - a student account can
   never end up here, and the backend independently rejects a student's
   token if it tries to call any /api/teacher/* route directly. */

function renderTeacherApp() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="topbar teacher-topbar">
      <div class="brand">
        <h1>لوحة المعلم</h1>
        <span class="tag">Imtihanly · Teacher</span>
      </div>
      <div class="user-cluster">
        <span class="user-name">👋 ${STATE.auth.name}</span>
        <button class="switch-role-btn" id="logoutBtn">تسجيل خروج</button>
      </div>
    </div>
    <div id="screen"></div>
  `;
  document.getElementById('logoutBtn').onclick = handleLogout;
  document.getElementById('screen').innerHTML = teacherHTML();
  const copyCodeBtn = document.getElementById('copyCodeBtn');
  if (copyCodeBtn) copyCodeBtn.onclick = () => {
    const code = STATE.auth.classCode || '';
    navigator.clipboard?.writeText(code);
    copyCodeBtn.textContent = '✅';
    setTimeout(() => { copyCodeBtn.textContent = '📋'; }, 1500);
  };
}

function teacherHTML() {
  if (STATE.loading) {
    return `<div class="card"><div class="loading"><div class="spinner"></div> جارٍ تحميل بيانات الفصل...</div></div>`;
  }
  const s = STATE.teacherStats;
  const greeting = `
    <div class="teacher-greeting">
      <div class="teacher-greeting-name">أهلاً، ${STATE.auth.name} 👋</div>
      <div class="teacher-greeting-sub">${STATE.auth.subject || ''} · ${STATE.auth.grade || ''}</div>
      <div class="class-code-box">
        <span class="class-code-label">كود الفصل — شاركه مع طلابك:</span>
        <span class="class-code-value" id="classCodeValue">${STATE.auth.classCode || '—'}</span>
        <button class="copy-code-btn" id="copyCodeBtn" title="نسخ الكود">📋</button>
      </div>
    </div>`;

  if (!s || s.totalAttempts === 0) {
    return `
      <div class="card">
        ${greeting}
        <div class="qtext" style="font-size:16px">لا توجد بيانات طلاب مسجلة بعد لمادة "${STATE.auth.subject}". لوحة المعلم هتظهر بيانات بمجرد ما طلاب هذه المادة والمرحلة يبدأوا يحلوا اختبارات.</div>
      </div>`;
  }

  const mistakeRows = (s?.mistakeBreakdown || []).map((m) => `
    <div class="stat-row">
      <div class="stat-label">${MISTAKE_LABELS[m.type] || m.type}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${m.percent}%; background:var(--coral);"></div></div>
      <div class="stat-value">${m.percent}%</div>
    </div>`).join('');
  const weakRows = (s?.weakestConcepts || []).map((w) => {
    const c = w.averageMastery > 85 ? 'var(--teal)' : w.averageMastery >= 60 ? 'var(--gold)' : 'var(--coral)';
    return `
    <div class="summary-item" style="flex-direction:column; align-items:stretch; gap:8px;">
      <div style="display:flex; justify-content:space-between; align-items:baseline;">
        <div class="concept">${w.concept}</div>
        <div class="note">${toArabicDigits(w.studentCount)} طالب</div>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${w.averageMastery}%; background:${c};"></div></div>
      <div class="note">متوسط الإتقان: ${w.averageMastery}%</div>
    </div>`;
  }).join('');
  const tipsHTML = (s?.tips || []).map((t) => `<div class="tip-box">💡 ${t}</div>`).join('');
  return `
    <div class="card">
      ${greeting}
      <div class="big-stat-row">
        <div class="big-stat"><div class="big-stat-num">${s.classAccuracy}%</div><div class="big-stat-label">دقة الفصل الكلية</div></div>
        <div class="big-stat"><div class="big-stat-num">${toArabicDigits(s.studentCount)}</div><div class="big-stat-label">عدد الطلاب</div></div>
        <div class="big-stat"><div class="big-stat-num">${toArabicDigits(s.totalAttempts)}</div><div class="big-stat-label">إجمالي المحاولات</div></div>
      </div>
      <div class="stat-section-title">توزيع أنواع الأخطاء في الفصل</div>
      ${mistakeRows || '<div class="note">لا توجد أخطاء مسجلة بعد.</div>'}
      <div class="stat-section-title">أضعف المفاهيم بين الطلاب</div>
      <div class="summary-list">${weakRows || '<div class="note">لا توجد بيانات كافية بعد.</div>'}</div>
      <div class="stat-section-title">نصائح لتحسين تفكير الطلاب</div>
      ${tipsHTML || '<div class="note">مفيش نصائح كافية لسه — محتاجين بيانات أكتر.</div>'}
    </div>
  `;
}

async function handleShowTeacher() {
  STATE.loading = true;
  renderTeacherApp();
  try {
    STATE.teacherStats = await getTeacherStats();
  } catch (err) {
    console.error(err);
    STATE.teacherStats = null;
  }
  STATE.loading = false;
  renderTeacherApp();
}

/* ========================= BOOT ========================= */

async function boot() {
  render();
  const token = localStorage.getItem('imtihanly_token');
  if (!token) {
    STATE.authLoading = false;
    render();
    return;
  }
  try {
    const user = await getMe();
    STATE.auth = user;
    applyStudentGradeFromAuth(user);
    STATE.screen = user.role === 'teacher' ? 'teacher' : 'setup';
  } catch (err) {
    localStorage.removeItem('imtihanly_token');
    STATE.auth = null;
  }
  STATE.authLoading = false;
  render();
  if (STATE.auth?.role === 'teacher') handleShowTeacher();
}

boot();
