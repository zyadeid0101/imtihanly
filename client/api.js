// All requests go to OUR backend (same origin, /api/*).
// The backend holds the API key and enforces auth/role checks - the
// browser never trusts itself for security, only for UI convenience.

function getToken() {
  return localStorage.getItem('imtihanly_token');
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function post(path, body, useAuth = true) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(useAuth ? authHeaders() : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401 && useAuth && onUnauthorized) onUnauthorized();
    const err = new Error(data.error || 'Request failed');
    err.code = data.code;
    err.status = res.status;
    throw err;
  }
  return data;
}

async function get(path, useAuth = true) {
  const res = await fetch(path, { headers: useAuth ? authHeaders() : {} });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401 && useAuth && onUnauthorized) onUnauthorized();
    const err = new Error(data.error || 'Request failed');
    err.code = data.code;
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ---------- auth ---------- */

export async function signup({ name, email, password, subject, grade, classCodes }) {
  const data = await post('/api/auth/signup', { name, email, password, subject, grade, classCodes }, false);
  localStorage.setItem('imtihanly_token', data.token);
  return data.user;
}

export async function login({ email, password }) {
  const data = await post('/api/auth/login', { email, password }, false);
  localStorage.setItem('imtihanly_token', data.token);
  return data.user;
}

export async function logout() {
  try {
    await post('/api/auth/logout', {}, true);
  } catch (e) {
    // ignore - we're clearing the token locally regardless
  }
  localStorage.removeItem('imtihanly_token');
}

export async function getMe() {
  const data = await get('/api/auth/me', true);
  return data.user;
}

/* ---------- quiz ---------- */

export function generateQuiz({ subject, grade, topic, dialect, questionCount }) {
  return post('/api/quiz/generate', { subject, grade, topic, dialect, questionCount });
}

export function evaluateAnswer({ subject, grade, question, concept, studentAnswer, dialect }) {
  return post('/api/quiz/evaluate', { subject, grade, question, concept, studentAnswer, dialect });
}

export function generateFollowUp({ subject, concept, originalPrompt, dialect }) {
  return post('/api/quiz/follow-up', { subject, concept, originalPrompt, dialect });
}

/* ---------- student profile ---------- */

export function getWeaknesses() {
  return get('/api/students/me/weaknesses');
}

export function getStats() {
  return get('/api/students/me/stats');
}

export function getMyClasses() {
  return get('/api/students/me/classes');
}

export function joinClass(subject, classCode) {
  return post('/api/students/me/join-class', { subject, classCode });
}

/* ---------- pdf upload ---------- */

export async function uploadPdf(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/upload/pdf', {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    throw new Error(data.error || 'Upload failed');
  }
  return data;
}

/* ---------- teacher ---------- */

export function getTeacherStats() {
  return get('/api/teacher/stats');
}
