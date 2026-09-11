require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const quizRoutes = require('./src/routes/quizRoutes');
const studentRoutes = require('./src/routes/studentRoutes');
const uploadRoutes = require('./src/routes/uploadRoutes');
const teacherRoutes = require('./src/routes/teacherRoutes');
const authRoutes = require('./src/routes/authRoutes');
const { requireAuth, requireStudent } = require('./src/middleware/auth');

const app = express();
const PORT = process.env.PORT || 3001;

if (!process.env.GROQ_API_KEY) {
  console.warn(
    '\n⚠️  GROQ_API_KEY is not set. Copy .env.example to .env and add your free key from https://console.groq.com/keys\n'
  );
}

app.use(cors());
app.use(express.json());

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/quiz', quizRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/upload', requireAuth, requireStudent, uploadRoutes);
app.use('/api/teacher', teacherRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant' });
});

// Serve the frontend (static files) from ../client
const clientPath = path.join(__dirname, '..', 'client');
app.use(express.static(clientPath));

// Fallback to index.html for any non-API route (simple single-page app)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(clientPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n✅ Imtihanly server running at http://localhost:${PORT}\n`);
});
