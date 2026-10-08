import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { config } from '../config/index.ts';
import { logger } from '../utils/logger.ts';

export class DatabaseService {
  private db: DatabaseSync;
  private static instance: DatabaseService;

  private constructor() {
    let dbPath = resolve(process.cwd(), 'nithu25.db');

    if (config.database.url.startsWith('file:')) {
      const filePath = config.database.url.replace('file:', '');
      const fullPath = resolve(process.cwd(), filePath);
      const dir = resolve(fullPath, '..');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      dbPath = fullPath;
    } else if (config.database.url === ':memory:') {
      dbPath = ':memory:';
    }

    logger.info(`Initializing Database Service with target: ${dbPath}`);
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public getRawDb(): DatabaseSync {
    return this.db;
  }

  private initSchema() {
    this.db.exec(`
      PRAGMA foreign_keys = ON;

      -- 1. Users & Profiles
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        auth_provider TEXT DEFAULT 'local',
        role TEXT DEFAULT 'STUDENT',
        is_verified INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_login_at TEXT
      );

      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        university_id TEXT,
        campus_id TEXT,
        department_id TEXT,
        program_id TEXT,
        regulation_id TEXT,
        semester_id TEXT,
        preferences TEXT DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      -- 2. Academic Hierarchy
      CREATE TABLE IF NOT EXISTS universities (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        country TEXT DEFAULT 'India',
        active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS campuses (
        id TEXT PRIMARY KEY,
        university_id TEXT NOT NULL,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(university_id) REFERENCES universities(id) ON DELETE CASCADE,
        UNIQUE(university_id, code)
      );

      CREATE TABLE IF NOT EXISTS departments (
        id TEXT PRIMARY KEY,
        campus_id TEXT NOT NULL,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(campus_id) REFERENCES campuses(id) ON DELETE CASCADE,
        UNIQUE(campus_id, code)
      );

      CREATE TABLE IF NOT EXISTS programs (
        id TEXT PRIMARY KEY,
        department_id TEXT NOT NULL,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        degree TEXT DEFAULT 'B.Tech',
        created_at TEXT NOT NULL,
        FOREIGN KEY(department_id) REFERENCES departments(id) ON DELETE CASCADE,
        UNIQUE(department_id, code)
      );

      CREATE TABLE IF NOT EXISTS regulations (
        id TEXT PRIMARY KEY,
        university_id TEXT NOT NULL,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        year INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(university_id) REFERENCES universities(id) ON DELETE CASCADE,
        UNIQUE(university_id, code)
      );

      CREATE TABLE IF NOT EXISTS semesters (
        id TEXT PRIMARY KEY,
        program_id TEXT NOT NULL,
        name TEXT NOT NULL,
        number INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(program_id) REFERENCES programs(id) ON DELETE CASCADE,
        UNIQUE(program_id, number)
      );

      CREATE TABLE IF NOT EXISTS courses (
        id TEXT PRIMARY KEY,
        semester_id TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(semester_id) REFERENCES semesters(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS subjects (
        id TEXT PRIMARY KEY,
        course_id TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        credits INTEGER DEFAULT 3,
        created_at TEXT NOT NULL,
        FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS units (
        id TEXT PRIMARY KEY,
        subject_id TEXT NOT NULL,
        number INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
        UNIQUE(subject_id, number)
      );

      CREATE TABLE IF NOT EXISTS topics (
        id TEXT PRIMARY KEY,
        unit_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(unit_id) REFERENCES units(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS subtopics (
        id TEXT PRIMARY KEY,
        topic_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS concepts (
        id TEXT PRIMARY KEY,
        subtopic_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(subtopic_id) REFERENCES subtopics(id) ON DELETE CASCADE
      );

      -- 3. PYQs & Question Papers
      CREATE TABLE IF NOT EXISTS question_papers (
        id TEXT PRIMARY KEY,
        university_id TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        regulation_id TEXT,
        semester_id TEXT,
        exam_type TEXT DEFAULT 'OTHER',
        academic_year TEXT NOT NULL,
        exam_date TEXT,
        exam_slot TEXT,
        source_id TEXT,
        original_file_url TEXT NOT NULL,
        file_hash TEXT NOT NULL,
        processing_status TEXT DEFAULT 'QUEUED',
        verification_status TEXT DEFAULT 'UNVERIFIED',
        metadata_json TEXT DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(university_id) REFERENCES universities(id),
        FOREIGN KEY(subject_id) REFERENCES subjects(id)
      );

      -- 4. Duplicate Groups & Questions
      CREATE TABLE IF NOT EXISTS duplicate_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        match_type TEXT DEFAULT 'SIMILAR_QUESTION',
        notes TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS questions (
        id TEXT PRIMARY KEY,
        question_paper_id TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        unit_id TEXT,
        topic_id TEXT,
        subtopic_id TEXT,
        concept_id TEXT,
        question_number TEXT NOT NULL,
        question_text TEXT NOT NULL,
        normalized_text TEXT NOT NULL,
        marks REAL DEFAULT 2.0,
        section TEXT,
        question_type TEXT DEFAULT 'DESCRIPTIVE',
        parent_question_id TEXT,
        options_json TEXT,
        correct_answer TEXT,
        source_page INTEGER,
        ocr_confidence TEXT DEFAULT 'HIGH_CONFIDENCE',
        difficulty TEXT DEFAULT 'MEDIUM',
        bloom_level TEXT DEFAULT 'UNDERSTAND',
        is_ai_classified INTEGER DEFAULT 1,
        duplicate_group_id TEXT,
        verification_status TEXT DEFAULT 'UNVERIFIED',
        embedding_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(question_paper_id) REFERENCES question_papers(id) ON DELETE CASCADE,
        FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
        FOREIGN KEY(unit_id) REFERENCES units(id),
        FOREIGN KEY(topic_id) REFERENCES topics(id),
        FOREIGN KEY(subtopic_id) REFERENCES subtopics(id),
        FOREIGN KEY(concept_id) REFERENCES concepts(id),
        FOREIGN KEY(duplicate_group_id) REFERENCES duplicate_groups(id)
      );

      -- 5. Analytics & Topic Importance
      CREATE TABLE IF NOT EXISTS topic_analyses (
        id TEXT PRIMARY KEY,
        topic_id TEXT UNIQUE NOT NULL,
        importance_score REAL DEFAULT 0.0,
        historical_freq INTEGER DEFAULT 0,
        recent_freq INTEGER DEFAULT 0,
        year_coverage INTEGER DEFAULT 0,
        exam_coverage_json TEXT DEFAULT '[]',
        marks_weight REAL DEFAULT 0.0,
        concept_freq INTEGER DEFAULT 0,
        trend TEXT DEFAULT 'STABLE',
        explanation_json TEXT DEFAULT '[]',
        updated_at TEXT NOT NULL,
        FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE
      );

      -- 6. Practice Engine
      CREATE TABLE IF NOT EXISTS practice_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        mode TEXT DEFAULT 'RANDOM',
        subject_id TEXT,
        unit_id TEXT,
        topic_id TEXT,
        total_questions INTEGER DEFAULT 0,
        score REAL DEFAULT 0.0,
        total_marks REAL DEFAULT 0.0,
        accuracy REAL DEFAULT 0.0,
        time_taken_sec INTEGER DEFAULT 0,
        is_completed INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS practice_session_questions (
        id TEXT PRIMARY KEY,
        practice_session_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        user_answer TEXT,
        is_correct INTEGER,
        score_awarded REAL,
        time_taken_sec INTEGER DEFAULT 0,
        answered_at TEXT,
        FOREIGN KEY(practice_session_id) REFERENCES practice_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS student_progress (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        subject_id TEXT,
        topic_id TEXT,
        questions_attempted INTEGER DEFAULT 0,
        questions_correct INTEGER DEFAULT 0,
        accuracy REAL DEFAULT 0.0,
        study_time_minutes INTEGER DEFAULT 0,
        streak_days INTEGER DEFAULT 0,
        last_activity_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, subject_id, topic_id)
      );

      -- 7. Revision System
      CREATE TABLE IF NOT EXISTS revision_items (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        status TEXT DEFAULT 'NEW',
        is_bookmarked INTEGER DEFAULT 0,
        is_important INTEGER DEFAULT 0,
        is_incorrect INTEGER DEFAULT 0,
        repetitions INTEGER DEFAULT 0,
        interval_days REAL DEFAULT 1.0,
        ease_factor REAL DEFAULT 2.5,
        next_revision_date TEXT NOT NULL,
        last_revised_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE CASCADE,
        UNIQUE(user_id, question_id)
      );

      -- 8. Study Plans
      CREATE TABLE IF NOT EXISTS study_plans (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        plan_type TEXT DEFAULT 'DAILY',
        subject_id TEXT,
        exam_date TEXT,
        target_hours_per_day REAL DEFAULT 2.0,
        schedule_json TEXT DEFAULT '[]',
        status TEXT DEFAULT 'ACTIVE',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      -- 9. Nithu AI & Conversations
      CREATE TABLE IF NOT EXISTS ai_conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT DEFAULT 'New Chat',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS ai_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        intent TEXT,
        sources_json TEXT DEFAULT '[]',
        citations_json TEXT DEFAULT '[]',
        created_at TEXT NOT NULL,
        FOREIGN KEY(conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
      );

      -- 10. Educational Resources
      CREATE TABLE IF NOT EXISTS educational_resources (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        url TEXT UNIQUE NOT NULL,
        description TEXT,
        source_domain TEXT NOT NULL,
        resource_type TEXT DEFAULT 'DOC',
        relevance REAL DEFAULT 0.9,
        is_verified INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      );

      -- 11. Source Registry & Scans
      CREATE TABLE IF NOT EXISTS source_registries (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        base_url TEXT UNIQUE NOT NULL,
        category TEXT DEFAULT 'OFFICIAL',
        allowed INTEGER DEFAULT 1,
        automated_collection_allowed INTEGER DEFAULT 0,
        robots_status TEXT DEFAULT 'ALLOWED',
        last_checked TEXT,
        last_success TEXT,
        last_failure TEXT,
        notes TEXT,
        active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS source_scans (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        status TEXT DEFAULT 'IN_PROGRESS',
        pages_scanned INTEGER DEFAULT 0,
        files_found INTEGER DEFAULT 0,
        files_imported INTEGER DEFAULT 0,
        duplicates INTEGER DEFAULT 0,
        errors_json TEXT DEFAULT '[]',
        FOREIGN KEY(source_id) REFERENCES source_registries(id) ON DELETE CASCADE
      );

      -- 12. Ingestion Jobs
      CREATE TABLE IF NOT EXISTS ingestion_jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        status TEXT DEFAULT 'QUEUED',
        progress INTEGER DEFAULT 0,
        payload_json TEXT DEFAULT '{}',
        result_json TEXT DEFAULT '{}',
        error TEXT,
        retry_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT
      );

      -- 13. Offline Sync, Notifications, Analytics
      CREATE TABLE IF NOT EXISTS sync_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        client_version INTEGER NOT NULL,
        server_version INTEGER NOT NULL,
        sync_action TEXT NOT NULL,
        had_conflict INTEGER DEFAULT 0,
        synced_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT DEFAULT 'INFO',
        is_read INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS analytics_events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        user_id TEXT,
        meta_json TEXT DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      -- Indexes for High Performance
      CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject_id);
      CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions(topic_id);
      CREATE INDEX IF NOT EXISTS idx_questions_normalized ON questions(normalized_text);
      CREATE INDEX IF NOT EXISTS idx_question_papers_subject ON question_papers(subject_id);
      CREATE INDEX IF NOT EXISTS idx_student_progress_user ON student_progress(user_id);
      CREATE INDEX IF NOT EXISTS idx_revision_user_date ON revision_items(user_id, next_revision_date);
    `);
    logger.info('Database schema successfully initialized with full relational integrity and performance indexes.');
  }

  // Prepared Query Helpers
  public all<T = any>(sql: string, params: any[] = []): T[] {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as T[];
  }

  public get<T = any>(sql: string, params: any[] = []): T | undefined {
    const stmt = this.db.prepare(sql);
    return stmt.get(...params) as T | undefined;
  }

  public run(sql: string, params: any[] = []): { changes: number | bigint; lastInsertRowid: number | bigint } {
    const stmt = this.db.prepare(sql);
    return stmt.run(...params);
  }

  public exec(sql: string): void {
    this.db.exec(sql);
  }
}

export const dbService = DatabaseService.getInstance();
