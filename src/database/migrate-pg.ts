/**
 * PostgreSQL Production Migration Script for Nithu25 Backend
 * Creates complete PostgreSQL database schema with pgvector extension,
 * tables, indexes, and constraints matching prisma/schema.prisma.
 */

export const postgresSchemaSql = `
-- Enable pgvector extension for semantic similarity
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users & Profiles
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT,
  auth_provider VARCHAR(50) DEFAULT 'local',
  role VARCHAR(30) DEFAULT 'STUDENT',
  is_verified BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  university_id UUID,
  campus_id UUID,
  department_id UUID,
  program_id UUID,
  regulation_id UUID,
  semester_id UUID,
  preferences JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Academic Hierarchy
CREATE TABLE IF NOT EXISTS universities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(100) UNIQUE NOT NULL,
  country VARCHAR(100) DEFAULT 'India',
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campuses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(university_id, code)
);

CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campus_id UUID NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(campus_id, code)
);

CREATE TABLE IF NOT EXISTS programs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(100) NOT NULL,
  degree VARCHAR(50) DEFAULT 'B.Tech',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(department_id, code)
);

CREATE TABLE IF NOT EXISTS regulations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(100) NOT NULL,
  year INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(university_id, code)
);

CREATE TABLE IF NOT EXISTS semesters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  number INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(program_id, number)
);

CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  semester_id UUID NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  code VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  code VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  credits INT DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  number INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(subject_id, number)
);

CREATE TABLE IF NOT EXISTS topics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subtopics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS concepts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subtopic_id UUID NOT NULL REFERENCES subtopics(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. PYQs & Question Papers
CREATE TABLE IF NOT EXISTS question_papers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  university_id UUID NOT NULL REFERENCES universities(id),
  subject_id UUID NOT NULL REFERENCES subjects(id),
  regulation_id UUID REFERENCES regulations(id),
  semester_id UUID REFERENCES semesters(id),
  exam_type VARCHAR(50) DEFAULT 'OTHER',
  academic_year VARCHAR(50) NOT NULL,
  exam_date DATE,
  exam_slot VARCHAR(50),
  source_id UUID,
  original_file_url TEXT NOT NULL,
  file_hash VARCHAR(255) NOT NULL,
  processing_status VARCHAR(50) DEFAULT 'QUEUED',
  verification_status VARCHAR(50) DEFAULT 'UNVERIFIED',
  metadata_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Questions & Deduplication
CREATE TABLE IF NOT EXISTS duplicate_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  match_type VARCHAR(50) DEFAULT 'SIMILAR_QUESTION',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_paper_id UUID NOT NULL REFERENCES question_papers(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES units(id),
  topic_id UUID REFERENCES topics(id),
  subtopic_id UUID REFERENCES subtopics(id),
  concept_id UUID REFERENCES concepts(id),
  question_number VARCHAR(50) NOT NULL,
  question_text TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  marks NUMERIC(5,2) DEFAULT 2.0,
  section VARCHAR(50),
  question_type VARCHAR(50) DEFAULT 'DESCRIPTIVE',
  parent_question_id UUID REFERENCES questions(id),
  options_json JSONB,
  correct_answer TEXT,
  source_page INT,
  ocr_confidence VARCHAR(50) DEFAULT 'HIGH_CONFIDENCE',
  difficulty VARCHAR(50) DEFAULT 'MEDIUM',
  bloom_level VARCHAR(50) DEFAULT 'UNDERSTAND',
  is_ai_classified BOOLEAN DEFAULT TRUE,
  duplicate_group_id UUID REFERENCES duplicate_groups(id),
  verification_status VARCHAR(50) DEFAULT 'UNVERIFIED',
  embedding_json TEXT,
  embedding_vector vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Analytics & Topic Importance
CREATE TABLE IF NOT EXISTS topic_analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic_id UUID UNIQUE NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  importance_score NUMERIC(5,2) DEFAULT 0.0,
  historical_freq INT DEFAULT 0,
  recent_freq INT DEFAULT 0,
  year_coverage INT DEFAULT 0,
  exam_coverage_json JSONB DEFAULT '[]'::jsonb,
  marks_weight NUMERIC(7,2) DEFAULT 0.0,
  concept_freq INT DEFAULT 0,
  trend VARCHAR(50) DEFAULT 'STABLE',
  explanation_json JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Practice Engine
CREATE TABLE IF NOT EXISTS practice_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode VARCHAR(50) DEFAULT 'RANDOM',
  subject_id UUID,
  unit_id UUID,
  topic_id UUID,
  total_questions INT DEFAULT 0,
  score NUMERIC(7,2) DEFAULT 0.0,
  total_marks NUMERIC(7,2) DEFAULT 0.0,
  accuracy NUMERIC(5,2) DEFAULT 0.0,
  time_taken_sec INT DEFAULT 0,
  is_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS practice_session_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  practice_session_id UUID NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  user_answer TEXT,
  is_correct BOOLEAN,
  score_awarded NUMERIC(5,2),
  time_taken_sec INT DEFAULT 0,
  answered_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS student_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id UUID,
  topic_id UUID,
  questions_attempted INT DEFAULT 0,
  questions_correct INT DEFAULT 0,
  accuracy NUMERIC(5,2) DEFAULT 0.0,
  study_time_minutes INT DEFAULT 0,
  streak_days INT DEFAULT 0,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, subject_id, topic_id)
);

-- 7. Revision System
CREATE TABLE IF NOT EXISTS revision_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'NEW',
  is_bookmarked BOOLEAN DEFAULT FALSE,
  is_important BOOLEAN DEFAULT FALSE,
  is_incorrect BOOLEAN DEFAULT FALSE,
  repetitions INT DEFAULT 0,
  interval_days NUMERIC(7,2) DEFAULT 1.0,
  ease_factor NUMERIC(5,2) DEFAULT 2.5,
  next_revision_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_revised_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, question_id)
);

-- 8. Study Plans
CREATE TABLE IF NOT EXISTS study_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  plan_type VARCHAR(50) DEFAULT 'DAILY',
  subject_id UUID,
  exam_date DATE,
  target_hours_per_day NUMERIC(4,2) DEFAULT 2.0,
  schedule_json JSONB DEFAULT '[]'::jsonb,
  status VARCHAR(50) DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. AI Conversations
CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) DEFAULT 'New Chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  intent VARCHAR(100),
  sources_json JSONB DEFAULT '[]'::jsonb,
  citations_json JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Educational Resources
CREATE TABLE IF NOT EXISTS educational_resources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  url TEXT UNIQUE NOT NULL,
  description TEXT,
  source_domain VARCHAR(255) NOT NULL,
  resource_type VARCHAR(50) DEFAULT 'DOC',
  relevance NUMERIC(4,2) DEFAULT 0.9,
  is_verified BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Source Registry & Scans
CREATE TABLE IF NOT EXISTS source_registries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  base_url TEXT UNIQUE NOT NULL,
  category VARCHAR(50) DEFAULT 'OFFICIAL',
  allowed BOOLEAN DEFAULT TRUE,
  automated_collection_allowed BOOLEAN DEFAULT FALSE,
  robots_status VARCHAR(50) DEFAULT 'ALLOWED',
  last_checked TIMESTAMPTZ,
  last_success TIMESTAMPTZ,
  last_failure TIMESTAMPTZ,
  notes TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS source_scans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id UUID NOT NULL REFERENCES source_registries(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status VARCHAR(50) DEFAULT 'IN_PROGRESS',
  pages_scanned INT DEFAULT 0,
  files_found INT DEFAULT 0,
  files_imported INT DEFAULT 0,
  duplicates INT DEFAULT 0,
  errors_json JSONB DEFAULT '[]'::jsonb
);

-- 12. Ingestion Jobs
CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type VARCHAR(100) NOT NULL,
  status VARCHAR(50) DEFAULT 'QUEUED',
  progress INT DEFAULT 0,
  payload_json JSONB DEFAULT '{}'::jsonb,
  result_json JSONB DEFAULT '{}'::jsonb,
  error TEXT,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- 13. Offline Sync & Notifications
CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID NOT NULL,
  client_version INT NOT NULL,
  server_version INT NOT NULL,
  sync_action VARCHAR(50) NOT NULL,
  had_conflict BOOLEAN DEFAULT FALSE,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'INFO',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type VARCHAR(100) NOT NULL,
  user_id UUID,
  meta_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject_id);
CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions(topic_id);
CREATE INDEX IF NOT EXISTS idx_questions_normalized ON questions(normalized_text);
CREATE INDEX IF NOT EXISTS idx_question_papers_subject ON question_papers(subject_id);
CREATE INDEX IF NOT EXISTS idx_student_progress_user ON student_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_revision_user_date ON revision_items(user_id, next_revision_date);
`;

console.log('PostgreSQL migration schema generated successfully.');
console.log('To execute against your PostgreSQL cloud instance (Railway / Supabase / Neon / Render):');
console.log('1. Set DATABASE_URL in environment');
console.log('2. Run: npx prisma db push (or apply schema DDL directly)');
