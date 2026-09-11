# امتحنلي — Imtihanly

Adaptive, Arabic-dialect-aware assessment generator for the GenAI for Education
Hackathon 2026 (EUI / MCIT). Paste a lesson or topic, get open-ended
diagnostic questions, get graded with an explanation of the *specific*
misunderstanding (not just right/wrong), and get an easier follow-up
question automatically when you get something wrong.

## Architecture

```
imtihanly/
├── server/
│   ├── index.js         App entry point — serves API + static frontend
│   ├── .env.example     Copy to .env and add your free Groq key
│   ├── data/store.json  Lightweight file-based mastery database (auto-created)
│   ├── package.json
│   └── src/
│       ├── routes/
│       │   ├── quizRoutes.js      Generate / evaluate / follow-up
│       │   └── studentRoutes.js   Mastery profile + weakness ranking
│       ├── services/
│       │   ├── aiService.js       All Groq prompts (generation, grading, adaptive follow-up)
│       │   └── db.js              Mastery scoring + persistence
│       └── utils/jsonExtractor.js Safe JSON parsing from model output
└── client/
    ├── index.html, style.css, app.js, api.js
```

### The adaptive assessment loop

```
Student answers a question
        ↓
AI grades it + classifies the mistake type
        ↓
Mastery score updates for that concept (persisted per student)
        ↓
Next question on that concept (or next quiz on that subject)
adjusts difficulty based on current mastery
```

**Mastery scoring:** each concept has a 0-100 mastery score per student,
stored in `server/data/store.json` (a simple JSON file — no database server
needed for a hackathon). Every attempt updates it with a weighted average:
`newMastery = 0.5 × previousMastery + 0.5 × thisAttemptScore` (correct=100,
partial=60, incorrect=20). This means one bad attempt after a good streak
nudges the score down without erasing prior progress, and vice versa.

**Mistake classification:** every wrong/partial answer is tagged with a
`mistake_type` — `conceptual_misunderstanding`, `careless_mistake`,
`incomplete_answer`, or `calculation_error` — instead of just "wrong."

**Difficulty adaptation:** mastery above 85% → harder questions next time;
60-85% → medium; below 60% → easier, more scaffolded questions. This
applies both to follow-up questions within a quiz and to future quizzes on
topics the student has attempted before.

**Student identity:** each browser gets a random `studentId` stored in
`localStorage` on first visit — no login/auth system, appropriate for a
hackathon demo. This ID is sent with every API call so mastery persists
across quiz sessions.

**Why a backend at all?** The frontend never touches your API key. Every AI
call (question generation, grading, follow-up questions) goes through your
Express server, which is the only place the key lives. This is required
for anything beyond a local demo — an API key embedded in frontend JS is
visible to anyone who opens dev tools.

**Model provider:** this uses **Google Gemini's free tier** — no credit
card required, generous rate limits, 1M token context, and strong Arabic
(including dialect) handling. Good fit for a hackathon budget.

## Setup

### 1. Install dependencies

```bash
cd server
npm install
```

### 2. Get a free Gemini API key

Go to **https://aistudio.google.com/apikey**, sign in with a Google
account, click "Create API key." No credit card, no billing setup. Takes
under a minute.

### 3. Add your key

```bash
cp .env.example .env
```

Edit `.env`:

```
GEMINI_API_KEY=your-real-key-here
GEMINI_MODEL=gemini-2.5-flash
PORT=3001
```

`gemini-2.5-flash` is the best free-tier balance of quality and rate
limits. `gemini-2.5-pro` gives higher-quality grading but has a lower free
rate limit (5 requests/minute) — fine for solo testing, tight for a live
demo with judges typing answers back-to-back.

### 4. Run it

```bash
npm start
```

Or for auto-reload while developing:

```bash
npm run dev
```

Open **http://localhost:3001** — the same server serves both the API
(`/api/*`) and the frontend, so there's nothing else to configure locally.

## API Endpoints

| Method | Path                     | Body / Params                                                        | Returns                                                |
|--------|--------------------------|-----------------------------------------------------------------------|---------------------------------------------------------|
| POST   | `/api/quiz/generate`     | `{ studentId, subject, grade, topic, dialect }`                       | `{ questions: [...] }` — difficulty adapts to mastery    |
| POST   | `/api/quiz/evaluate`     | `{ studentId, subject, question, concept, studentAnswer, dialect }`   | `{ verdict, mistake_type, feedback, explanation, mastery }` |
| POST   | `/api/quiz/follow-up`    | `{ studentId, subject, concept, originalPrompt, dialect }`            | `{ type, prompt }` — difficulty adapts to mastery        |
| GET    | `/api/students/:id/mastery`    | —                                                                | `{ studentId, subjects: { subject: { concept: {...} } } }` |
| GET    | `/api/students/:id/weaknesses` | —                                                                | `{ studentId, weaknesses: [...] }` — sorted lowest mastery first |
| GET    | `/api/health`            | —                                                                       | `{ status: "ok", model }`                                |

`studentId` is optional on quiz routes — omit it and the app still works
statelessly (no mastery tracking), which is useful for quick testing.
`dialect` is `"egyptian"` or `"msa"`.

## Deploying for Demo Day

Cheapest/fastest options that support a persistent Node server:

- **Render.com** (free tier) — connect your GitHub repo, set the root
  directory to `server`, add `ANTHROPIC_API_KEY` as an environment variable
  in their dashboard, and it deploys automatically on push.
- **Railway.app** — similar flow, also has a free trial tier.

Either way:
1. Push this whole folder to a GitHub repo.
2. Connect the repo to Render/Railway.
3. Set the **root/start directory** to `server`.
4. Add environment variables `GEMINI_API_KEY` and `GEMINI_MODEL` in their
   dashboard (never commit `.env` to git).
5. Build command: `npm install`. Start command: `npm start`.

**Free tier rate limits to plan around:** Gemini 2.5 Flash's free tier
allows roughly 10-15 requests per minute and up to 1,000 requests per day —
comfortably enough for a live judge demo (each quiz round uses 4-8 calls
total), but don't hammer it in a tight loop during testing or you'll hit a
temporary 429 rate-limit error. If that happens the app shows a friendly
retry message rather than crashing.

The static frontend is served by the same Express app, so you get one URL
for everything — no separate frontend hosting needed.

## Notes on the adaptive logic

- Each quiz has exactly 4 questions, each targeting a distinct sub-concept.
- If a student answers incorrectly or partially on the first try, the
  backend generates one easier follow-up question on the *same* concept
  and inserts it right after the current question.
- If the follow-up is also wrong, that concept is marked "broken" (needs
  review) in the final summary — otherwise it's marked "mastered."
- This adaptive behavior is just conditional prompting based on the
  previous verdict — no separate ML model or decision tree required.

## What changed in the adaptive upgrade (summary)

**Problems found in the original version:** no persistence at all (every
quiz reset on page reload), no mistake classification (just right/wrong),
no difficulty adaptation (every quiz started from zero regardless of prior
performance), no way to see progress across sessions.

**Files created:**
- `server/src/services/db.js` — mastery scoring + file-based persistence
- `server/src/routes/studentRoutes.js` — mastery/weakness endpoints
- `server/data/store.json` — auto-created on first run, gitignored

**Files changed:**
- `server/src/services/aiService.js` (renamed from `geminiService.js`) —
  added mistake classification to grading, added mastery-aware difficulty
  instructions to question/follow-up generation, added a lightweight
  question validation filter (drops malformed/duplicate questions)
- `server/src/routes/quizRoutes.js` — now reads/writes mastery via `db.js`,
  accepts `studentId`/`subject` on every route
- `server/index.js` — mounts the new student routes
- `client/app.js` — generates and persists a `studentId` in `localStorage`,
  shows mistake-type and live mastery percentage after each answer, adds a
  "تقدمي" (My Progress) screen showing all concepts ranked weakest-first
- `client/api.js` — passes `studentId` through every call, adds
  `getMastery` / `getWeaknesses`

**Deliberately not built** (per the "don't overengineer" hackathon
principle): no RAG/vector database (no uploaded course materials pipeline
exists to ground it in), no user authentication (a random per-browser ID is
sufficient for a demo), no multi-day trend charts (not achievable
credibly before a hackathon deadline), no question-regeneration retry loop
(the validation filter drops bad questions instead of costing an extra API
call to regenerate them).

## Testing checklist before Demo Day

- [ ] Generate a quiz on a fresh topic — confirm 4 distinct concepts appear
- [ ] Answer one question wrong on purpose — confirm a follow-up question
      appears on the *same* concept, and it feels easier than the original
- [ ] Answer that follow-up correctly — confirm the concept shows as
      "mastered" (teal) in the understanding thread, not "broken"
- [ ] Click "تقدمي" (My Progress) — confirm the concept and mastery % show
      up correctly, sorted weakest-first
- [ ] Close the browser tab, reopen the app — confirm progress persisted
      (same `studentId` in localStorage, same mastery data from the server)
- [ ] Retake a quiz on a topic you've already attempted — confirm question
      difficulty feels different for concepts you already mastered

## Demo flow for judges

1. Pick a topic chip (e.g. "الدورة الدموية"), generate a quiz
2. Answer one question wrong on purpose — show the mistake-type tag and
   the auto-generated easier follow-up question
3. Answer the follow-up correctly — point out the understanding thread
   node turning teal, and the live mastery percentage shown
4. Click "تقدمي" to show the persistent weakness dashboard
5. Say the line that matters: *"This isn't just an AI that generates
   questions — it's a system that builds a live picture of what a student
   actually understands, and adapts every future question to it."*

## New features (second upgrade round)

**Curriculum-aware stages:** university-level was removed entirely.
Subjects and example topics are now specific to each Egyptian pre-university
stage:
- المرحلة الإعدادية: العلوم، الرياضيات، الدراسات الاجتماعية، اللغة العربية، الحاسب الآلي
- المرحلة الثانوية: الأحياء، الفيزياء، الكيمياء، الرياضيات، تاريخ، تكنولوجيا المعلومات

Changing the grade dropdown automatically swaps both the subject list and
the example topic chips to match that stage.

**Configurable question count:** a number input (2-8) on the setup screen
controls how many questions are generated per quiz.

**Topic relevance validation:** before generating questions, the model is
asked to check whether the topic actually matches the selected subject and
is appropriate for the selected grade. If not, it returns a distinct
`IRRELEVANT_TOPIC` error with a plain-language reason, shown to the student
as a warning (not a generic error) - e.g. typing "football" under Chemistry
will be rejected with an explanation, instead of generating nonsense questions.

**PDF upload:** students/teachers can upload a lesson PDF instead of pasting
text. The backend extracts text server-side using `pdfjs-dist` (Mozilla's
own PDF.js library) and fills the topic field automatically. Long PDFs are
capped at 6000 characters to stay within the model's context budget.

**PDF report export:** after finishing a quiz, "تحميل التقرير (PDF)"
builds a full printable report (every question, the student's answer, the
verdict, and mistake type) using the browser's native print-to-PDF, which
handles Arabic/RTL text correctly without needing font-embedding workarounds
that client-side PDF libraries like jsPDF struggle with.

**Personal statistical analysis ("التحليل الإحصائي"):** a new screen
showing overall accuracy, a breakdown of mistake types across every attempt
ever made, a plain-language recommendation based on the most common mistake
type, and average mastery per subject.

**Teacher dashboard ("لوحة المعلم"):** a subject picker aggregates data
across ALL students who have used the app for that subject: class-wide
accuracy, class-wide mistake-type breakdown, the weakest concepts ranked by
average mastery across students, and generated teaching tips (e.g. "most
common mistake is calculation errors - the concept is understood, the
execution needs more practice" or "concept X is the weakest across the
class, re-teach it before moving on").

### New/changed files (this round)

- `server/src/routes/uploadRoutes.js` (new) - PDF upload/extraction
- `server/src/routes/teacherRoutes.js` (new) - class-wide aggregation
- `server/src/services/db.js` - added `attemptLog`, `getAggregateStats`,
  `getSubjectsWithData`, `getSubjectWideStats`
- `server/src/services/aiService.js` - added topic-relevance validation and
  configurable `questionCount`
- `server/src/routes/quizRoutes.js` - passes `questionCount`, returns a
  distinct 400 + `IRRELEVANT_TOPIC` code for off-topic input
- `server/src/routes/studentRoutes.js` - added `/stats` endpoint
- `client/app.js` / `client/api.js` / `client/style.css` - curriculum-aware
  dropdowns, question count input, PDF upload UI, print-based PDF export,
  stats screen, teacher dashboard screen, new nav bar

### A note on the PDF library choice

The initial implementation used `pdf-parse`, which failed with a "bad XRef
entry" error on valid, independently-verified PDFs (confirmed via `qpdf
--check` and `pdftotext`) when tested against Node 22 - it's an older,
less-maintained package. It was replaced with `pdfjs-dist`, Mozilla's own
actively-maintained PDF.js library, which was tested and confirmed working
against the same files.

## Real authentication (third upgrade round)

**Signup/login with domain-based roles:** the role isn't a dropdown the
user picks - it's derived from the email domain at signup:
- `@gmail.com` → student account
- `@imtihanly.com` → teacher account
- Any other domain is rejected with a clear error.

**Passwords are hashed** with bcrypt before storage (never stored in plain
text). Sessions are random tokens (`crypto.randomUUID()`) stored
server-side and sent as `Authorization: Bearer <token>` on every request.

**Teacher dashboard access is enforced server-side, not just hidden in the
UI.** Every `/api/teacher/*` route sits behind `requireAuth` +
`requireTeacher` middleware. I tested this directly: a valid, logged-in
student token gets a genuine `403 Forbidden` calling a teacher endpoint
directly via curl - not just "the button isn't shown." Same in reverse for
teacher tokens hitting student/quiz routes.

**Student data is bound to the session, not a client-supplied ID.** The old
`studentId` field sent in request bodies is gone entirely - every route now
derives identity from `req.user.email` (set by the auth middleware from the
verified token). A student can no longer even theoretically request another
student's mastery data by editing an ID, because there's no ID parameter to
edit anymore - routes are `/api/students/me/*`, not `/api/students/:id/*`.

**"تبديل الدور" (switch role) button removed**, replaced with a real
"تسجيل خروج" (logout) button that invalidates the session token
server-side, not just a client-side state reset.

**What's still a hackathon-scoped simplification, not production-grade:**
- Sessions never expire (no TTL) - fine for a demo, not for production.
- No password reset / email verification flow.
- No rate-limiting on login attempts.
- This is NOT Supabase Auth or Row-Level Security - it's a lightweight
  file-based equivalent that enforces the same *shape* of security (role
  checks happen server-side, identity comes from a verified token) without
  the infrastructure of a real auth provider. If this becomes a real
  product post-hackathon, migrating to Supabase Auth (or similar) plus
  proper RLS policies is the natural next step - genuinely worth a line on
  your pitch deck's "what's next" slide.

### New/changed files (this round)

- `server/src/middleware/auth.js` (new) - `requireAuth`, `requireTeacher`, `requireStudent`
- `server/src/routes/authRoutes.js` (new) - signup, login, logout, `/me`
- `server/src/services/db.js` - added `createUser`, `getUserByEmail`, `createSession`, `getSession`, `deleteSession`
- `server/src/routes/quizRoutes.js`, `studentRoutes.js`, `teacherRoutes.js` - all now require auth; identity comes from `req.user`, not the request body
- `server/index.js` - mounts `/api/auth`, protects `/api/upload`
- `client/app.js` - login/signup screens replace the old role-picker; session restored on page load via `/api/auth/me`; logout replaces "تبديل الدور"
- `client/api.js` - `signup()`, `login()`, `logout()`, `getMe()`, automatic 401 handling that bounces back to login

## Multi-subject class codes

Each teacher's class code is scoped to their own subject+grade. A student
can join a different teacher's class for each subject they study, all at
signup, all optional:

- Signup shows one class-code input per subject available in the student's
  chosen grade (e.g. 6 optional fields for المرحلة الثانوية).
- Leaving all of them blank is fine - the student account is still created
  normally, just not linked to any class yet.
- Each non-empty code is validated individually: it must exist, AND it must
  belong to a teacher whose own subject+grade matches the field it was
  entered under. A physics teacher's code typed into the chemistry field is
  rejected with a clear error naming which subject's code was wrong.

Data model: a student's `joinedClasses` field is `{ subjectName:
teacherEmail }` - not a single link. `getStudentsForTeacher` and
`getClassStats` check membership by seeing if a teacher's email appears
anywhere in that map, so a teacher's dashboard only ever aggregates
students who specifically joined their class for their specific subject.

## Joining a class after signup

Students aren't locked into only entering class codes at signup — a new
"الفصول الدراسية" (My Classes) tab lets them join a teacher's class for any
subject at any time afterward. Each subject shows either a green "joined"
badge with the teacher's name, or an inline code input if not yet joined.
Same validation rules apply as at signup (code must exist, must match the
subject+grade it's entered under).

New endpoints:
- `GET /api/students/me/classes` - list currently joined classes
- `POST /api/students/me/join-class` - `{ subject, classCode }`, join or
  switch teachers for one subject

## Automatic rate-limit handling

Groq's free tier enforces a tokens-per-minute (TPM) budget that varies a
lot by model - large models like `openai/gpt-oss-120b` get a much smaller
TPM allowance than smaller ones. If you hit a `429` rate-limit error, two
things now happen automatically instead of requiring a manual retry click:

1. The server parses Groq's suggested wait time from the error message
   (e.g. "try again in 34.9s") and automatically waits that long, then
   retries the exact same request once - the student never has to click
   "generate" a second time. Verified with a mocked 429-then-success test:
   the retry fires with the correct delay and returns the right result.
2. The frontend shows a reassuring "still working" note if a request takes
   longer than 6 seconds, so a rate-limit retry reads as "the server is
   busy" rather than "this looks frozen."

**If you're hitting rate limits often**, the real fix is switching to a
smaller model with a bigger free-tier budget - `llama-3.1-8b-instant`
(the default in `.env.example`) has a much higher TPM allowance than large
models like `openai/gpt-oss-120b`. Check `GROQ_MODEL` in your `.env`.

## Question numbering fix

Two related things were confusing when a student's set question limit
appeared to be exceeded:

1. **Clarified upfront**: the question-count field now explains that the
   number sets how many core concepts are covered - a wrong answer adds a
   review question on that same concept, which doesn't count against the
   limit.
2. **Fixed the on-screen numbering**: original questions are now labeled by
   their concept index ("السؤال 2 من 4"), which always stays within the set
   limit. Follow-up review questions are labeled separately ("مراجعة على
   السؤال 1") instead of continuing the sequential count - previously a
   review question after Q1 would display as "السؤال 2", making the next
   real question show as "السؤال 3" even though only 2 of 4 concepts had
   been reached. The understanding-thread visualization and the final score
   were never affected by this - both already counted only original
   concepts, not review questions.

## DeepSeek as a second AI provider

DeepSeek is now integrated for three purposes, all optional - the app works
fine with just Groq if `DEEPSEEK_API_KEY` isn't set:

**1. Fallback if Groq fails entirely.** Every AI call now goes through
`callAIJSON()`, which tries Groq first (including Groq's own internal
retry-on-rate-limit). If Groq fails completely, it transparently falls
back to DeepSeek instead of surfacing an error to the student. Verified
with a mocked test: Groq failing twice (its own retry) correctly triggered
a DeepSeek fallback that returned a valid result.

**2. Deepens explanations on wrong/partial answers.** After Groq grades an
answer, if it's not marked "correct," DeepSeek is asked to independently
review it and provide a richer explanation with a concrete example. The
student sees a small "🧠 شرح معزز" badge when this happened.

**3. Double-checks Groq's grading, student-favorable only.** DeepSeek can
upgrade a verdict if it thinks Groq was too strict (e.g., partial → correct)
but can never downgrade one - verified with two separate mocked tests: one
where DeepSeek disagreed favorably (verdict correctly upgraded, mistake_type
reset), and one where DeepSeek disagreed unfavorably (verdict correctly
stayed at Groq's original, more generous, value). A disagreement between
models never costs the student points.

This step is wrapped in its own try/catch - if DeepSeek's review call fails
for any reason, Groq's original result is used unchanged rather than
failing the whole request.

### Setup

Add to `.env`:
```
DEEPSEEK_API_KEY=your-deepseek-key-here
DEEPSEEK_MODEL=deepseek-chat
```
Get a key at https://platform.deepseek.com/api_keys
