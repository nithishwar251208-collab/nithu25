# Nithu25 — Production Backend

Production-ready backend for **Nithu25**, an AI-powered college examination preparation platform centered around Previous Year Question (PYQ) intelligence, personalized practice, spaced revision, and grounded AI assistance.

> **Lovable Frontend Notice**: This backend is built specifically to power the Lovable frontend application. It exposes standard REST endpoints formatted as `{ success: true, data: {}, meta: {} }` and conforms to the OpenAPI specification hosted at `/api/docs`.

---

## 🚀 Key Features

* **Complete Academic Hierarchy**: Scalable entity structure starting with Vellore Institute of Technology (VIT) as initial launch university, easily extensible to any university globally.
* **12-Stage PYQ Processing Pipeline**:
  `UPLOAD` → `VALIDATE` → `STORE` → `OCR (if required)` → `EXTRACT QUESTIONS` → `NORMALIZE` → `CLASSIFY` → `DETECT DUPLICATES` → `EMBEDDINGS` → `GROUP` → `CALCULATE STATS` → `REVIEW` → `PUBLISH`.
* **Real Analytics Engine**: Computes historical topic frequency, recent appearance weight, year coverage, arbitrary mark distributions, and trend classifications (`INCREASING`, `STABLE`, `DECREASING`, `NEW`, `RETURNING`).
* **Explainable Importance Score (0–100)**: Honest historical importance metric based on appearance patterns and mark weight. Strictly avoids false claims such as "this question will appear in the next exam".
* **Multi-Mode Practice Engine**: 10 practice modes (`RANDOM`, `TOPIC`, `UNIT`, `SUBJECT`, `PYQ`, `IMPORTANT_TOPICS`, `WEAK_TOPICS`, `INCORRECT_QUESTIONS`, `TIMED_PRACTICE`, `MOCK_EXAM`) with real-time scoring and accuracy tracking.
* **Spaced Repetition Revision System**: SuperMemo SM-2 algorithm tracking repetitions, ease factors, and next review dates across memory states (`NEW`, `LEARNING`, `NEEDS_REVISION`, `MASTERED`).
* **Personalized Study Plans**: Daily, weekly, subject, and exam sprint plans generated from weak areas, topic priorities, syllabus requirements, and verified exam schedules.
* **Nithu AI (RAG Assistant)**: Intent classification, retrieval grounding on verified past papers, prompt injection protection, educational resource citation, and non-guarantee transparency.
* **VIT Source Registry & Ingestion**: Strict robots.txt compliance, category tracking (`OFFICIAL`, `INSTITUTIONAL`, `STUDENT_COMMUNITY`, `EDUCATIONAL`, `UNKNOWN`), access rate limits, and administrative review queue.
* **Offline PWA Synchronization**: Versioned conflict detection for bookmarks, attempts, and study items with timestamp resolution.
* **Zero-Dependency Native Execution**: Built using modern TypeScript running natively on Node 24 with native SQLite / PostgreSQL pgvector support.

---

## 📡 API Overview for Lovable Frontend

Base URL: `http://localhost:3000` (or your deployed cloud backend URL)

Interactive Documentation: `http://localhost:3000/api/docs`  
OpenAPI JSON Specification: `http://localhost:3000/api/docs/openapi.json`

### Authentication & Users
| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Register student user (`email`, `password`, `name`) | Public |
| `POST` | `/api/auth/login` | Login user and obtain JWT token | Public |
| `POST` | `/api/auth/guest` | Instant guest session for immediate practice | Public |
| `POST` | `/api/auth/logout` | Terminate session | Public |
| `GET` | `/api/users/me` | Fetch authenticated user profile and academic preferences | Bearer Token |
| `PATCH` | `/api/users/profile` | Update profile (campus, school, department, semester) | Bearer Token |

### Academic Content & Questions
| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/universities` | List active universities | Public |
| `GET` | `/api/subjects` | List subjects (filter by course, keyword search) | Public |
| `GET` | `/api/subjects/:id` | Get subject details with units | Public |
| `GET` | `/api/subjects/:id/units` | List units in subject | Public |
| `GET` | `/api/units/:id/topics` | List topics in unit | Public |
| `GET` | `/api/topics/:id` | Get topic details with subtopics & analysis | Public |
| `GET` | `/api/questions` | Filter questions (by subject, unit, topic, marks, difficulty) | Public |
| `GET` | `/api/questions/:id` | Get question with paper metadata and sub-questions | Public |
| `GET` | `/api/questions/:id/similar` | Semantic vector & duplicate matching | Public |

### PYQs & Analytics
| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/pyqs` | List question papers by year and exam type (CAT1, CAT2, FAT) | Public |
| `GET` | `/api/pyqs/:id` | Get paper details and extracted questions | Public |
| `GET` | `/api/pyqs/:id/analysis` | Mark distribution and Bloom taxonomy spread for paper | Public |
| `GET` | `/api/analysis/subjects/:id` | Subject-wide PYQ frequency and unit breakdown | Public |
| `GET` | `/api/analysis/topics/:id` | Topic frequency, trend (`INCREASING`/`STABLE`), and history | Public |
| `GET` | `/api/topics/important` | Explainable top important topics (Score: 0–100) | Public |

### Practice & Performance
| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/practice/start` | Start practice session with chosen mode and question count | Student / Guest |
| `POST` | `/api/practice/:id/answer` | Submit answer for immediate scoring | Student / Guest |
| `POST` | `/api/practice/:id/finish` | Finalize session, calculate accuracy, update progress | Student / Guest |
| `GET` | `/api/practice/:id` | Get current session details and questions | Student / Guest |
| `GET` | `/api/practice/history` | List student practice history | Student / Guest |
| `GET` | `/api/progress` | Overall dashboard (attempted, correct, study time, streak) | Student |
| `GET` | `/api/progress/topics` | Topic-by-topic accuracy and attempt breakdown | Student |

### Revision & Study Plans
| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/revision` | Get questions currently due in Spaced Repetition queue | Student |
| `POST` | `/api/revision` | Bookmark or flag question for revision | Student |
| `PATCH` | `/api/revision/:id` | Rate recall quality (0–5) to advance SM-2 interval | Student |
| `GET` | `/api/revision/bookmarks` | List all bookmarked questions | Student |
| `GET` | `/api/study-plans` | List personalized study plans | Student |
| `POST` | `/api/study-plans` | Generate daily, weekly, or exam sprint study plan | Student |
| `GET` | `/api/study-plans/:id` | Get day-by-day actionable task schedule | Student |

### Nithu AI Assistant
| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/ai/chat` | Send question to Nithu AI with RAG retrieval and citations | Student / Guest |
| `GET` | `/api/ai/conversations` | List conversation threads | Student |
| `GET` | `/api/ai/conversations/:id` | Get conversation message history with sources | Student |

### Offline Synchronization (PWA)
| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/sync` | Batch sync offline client changes with conflict detection | Student |

### Administration (Role: `ADMIN` / `SUPER_ADMIN`)
| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/users` | List registered users | Admin |
| `GET` | `/api/admin/review` | Question extraction review queue | Admin |
| `POST` | `/api/admin/review/:id/approve` | Approve extracted question & classifications | Admin |
| `POST` | `/api/admin/review/:id/reject` | Reject extracted question | Admin |
| `POST` | `/api/admin/pyqs/upload` | Upload paper and run automated 12-stage ingestion | Admin |
| `GET` | `/api/admin/sources` | List approved PYQ source repositories | Admin |
| `POST` | `/api/admin/sources/:id/scan` | Trigger robots.txt-compliant source scan | Admin |
| `GET` | `/api/admin/ingestion/jobs` | Monitor background ingestion jobs and progress | Admin |

---

## 🛠️ Setup & Running

### Option 1: Native Node 24 (Zero-Dependency)

```bash
# 1. Clone repository and navigate to backend directory
cd nithu25-backend

# 2. Configure environment (pre-configured development defaults provided)
cp .env.example .env

# 3. Seed demo data (verified demo dataset, strictly labeled DEMO DATA)
node --experimental-strip-types src/seed/seed.ts

# 4. Run automated test suite
npm test

# 5. Start development server
npm start
```

Server starts at `http://localhost:3000`.

### Option 2: Docker & Docker Compose (Production Stack)

```bash
# Starts API Backend + PostgreSQL (with pgvector) + Redis
docker-compose up --build -d
```

---

## 🔒 Security & Data Provenance Rules

1. **No Fabricated Official Data**: Sample records in development are explicitly designated as `DEMO DATA`. Official archives require verified administrative ingestion.
2. **Explainable AI & Responsible Language**: Nithu AI cites retrieved questions and resources. It explicitly notifies users that past frequency indicates study priority and does not guarantee future test questions.
3. **Respectful Retrieval Policy**: Automated source scans strictly evaluate and respect `robots.txt`, terms of service, and rate limits. If automated collection is not permitted, the system requires verified manual imports.
4. **RBAC Authorization**: Students cannot access administrative queues or ingestion job controls.
