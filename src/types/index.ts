export type UserRole = 'GUEST' | 'STUDENT' | 'ADMIN' | 'SUPER_ADMIN';

export type ExamType = 'CAT1' | 'CAT2' | 'FAT' | 'MIDTERM' | 'ENDSEM' | 'INTERNAL' | 'OTHER';

export type ProcessingStatus = 
  | 'QUEUED' 
  | 'PROCESSING' 
  | 'EXTRACTED' 
  | 'CLASSIFIED' 
  | 'ANALYZED' 
  | 'COMPLETED' 
  | 'FAILED';

export type VerificationStatus = 
  | 'UNVERIFIED' 
  | 'MACHINE_PROCESSED' 
  | 'ADMIN_REVIEWED' 
  | 'VERIFIED' 
  | 'REJECTED';

export type OcrConfidenceLevel = 'HIGH_CONFIDENCE' | 'MEDIUM_CONFIDENCE' | 'LOW_CONFIDENCE';

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

export type BloomLevel = 
  | 'REMEMBER' 
  | 'UNDERSTAND' 
  | 'APPLY' 
  | 'ANALYZE' 
  | 'EVALUATE' 
  | 'CREATE';

export type DuplicateMatchType = 
  | 'EXACT_DUPLICATE' 
  | 'NEAR_DUPLICATE' 
  | 'SIMILAR_QUESTION' 
  | 'SAME_CONCEPT_DIFFERENT_WORDING';

export type TopicTrend = 'INCREASING' | 'STABLE' | 'DECREASING' | 'NEW' | 'RETURNING';

export type PracticeMode = 
  | 'RANDOM' 
  | 'TOPIC' 
  | 'UNIT' 
  | 'SUBJECT' 
  | 'PYQ' 
  | 'IMPORTANT_TOPICS' 
  | 'WEAK_TOPICS' 
  | 'INCORRECT_QUESTIONS' 
  | 'TIMED_PRACTICE' 
  | 'MOCK_EXAM';

export type RevisionState = 'NEW' | 'LEARNING' | 'NEEDS_REVISION' | 'MASTERED';

export type SourceCategory = 
  | 'OFFICIAL' 
  | 'INSTITUTIONAL' 
  | 'STUDENT_COMMUNITY' 
  | 'EDUCATIONAL' 
  | 'UNKNOWN';

export type JobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

// Consistent API Response formats
export interface ApiResponse<T = any> {
  success: true;
  data: T;
  meta?: Record<string, any>;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export interface UserRecord {
  id: string;
  email: string;
  password_hash?: string | null;
  auth_provider: string;
  role: UserRole;
  is_verified: number | boolean;
  is_active: number | boolean;
  created_at: string;
  updated_at: string;
  last_login_at?: string | null;
}

export interface ProfileRecord {
  id: string;
  user_id: string;
  name: string;
  university_id?: string | null;
  campus_id?: string | null;
  department_id?: string | null;
  program_id?: string | null;
  regulation_id?: string | null;
  semester_id?: string | null;
  preferences?: string | Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface QuestionRecord {
  id: string;
  question_paper_id: string;
  subject_id: string;
  unit_id?: string | null;
  topic_id?: string | null;
  subtopic_id?: string | null;
  concept_id?: string | null;
  question_number: string;
  question_text: string;
  normalized_text: string;
  marks: number;
  section?: string | null;
  question_type: string;
  parent_question_id?: string | null;
  options_json?: string | any[] | null;
  correct_answer?: string | null;
  source_page?: number | null;
  ocr_confidence: OcrConfidenceLevel;
  difficulty: Difficulty;
  bloom_level: BloomLevel;
  is_ai_classified: number | boolean;
  duplicate_group_id?: string | null;
  verification_status: VerificationStatus;
  embedding_json?: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuestionPaperRecord {
  id: string;
  university_id: string;
  subject_id: string;
  regulation_id?: string | null;
  semester_id?: string | null;
  exam_type: ExamType;
  academic_year: string;
  exam_date?: string | null;
  exam_slot?: string | null;
  source_id?: string | null;
  original_file_url: string;
  file_hash: string;
  processing_status: ProcessingStatus;
  verification_status: VerificationStatus;
  metadata_json?: string | Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface TopicAnalysisRecord {
  id: string;
  topic_id: string;
  importance_score: number;
  historical_freq: number;
  recent_freq: number;
  year_coverage: number;
  exam_coverage_json: string | any[];
  marks_weight: number;
  concept_freq: number;
  trend: TopicTrend;
  explanation_json: string | any[];
  updated_at: string;
}

export interface PracticeSessionRecord {
  id: string;
  user_id: string;
  mode: PracticeMode;
  subject_id?: string | null;
  unit_id?: string | null;
  topic_id?: string | null;
  total_questions: number;
  score: number;
  total_marks: number;
  accuracy: number;
  time_taken_sec: number;
  is_completed: number | boolean;
  created_at: string;
  completed_at?: string | null;
}

export interface RevisionItemRecord {
  id: string;
  user_id: string;
  question_id: string;
  status: RevisionState;
  is_bookmarked: number | boolean;
  is_important: number | boolean;
  is_incorrect: number | boolean;
  repetitions: number;
  interval_days: number;
  ease_factor: number;
  next_revision_date: string;
  last_revised_at?: string | null;
  created_at: string;
}

export interface AIResponseWithSources {
  content: string;
  intent: string;
  confidence: number;
  sources: Array<{
    title: string;
    type: 'PYQ' | 'SYLLABUS' | 'ONLINE_RESOURCE';
    reference: string;
    verified: boolean;
  }>;
  disclaimer: string;
}
