import { randomUUID, createHash } from 'node:crypto';
import { dbService } from '../../database/db.ts';
import type { QuestionPaperRecord, ExamType, VerificationStatus } from '../../types/index.ts';

export interface CreatePaperDTO {
  universityId: string;
  subjectId: string;
  regulationId?: string;
  semesterId?: string;
  examType: ExamType;
  academicYear: string;
  examDate?: string;
  examSlot?: string;
  sourceId?: string;
  originalFileUrl: string;
  fileBuffer?: Buffer;
  metadata?: Record<string, any>;
}

export class PyqService {
  public listQuestionPapers(filters?: {
    subjectId?: string;
    examType?: string;
    academicYear?: string;
    verificationStatus?: string;
    limit?: number;
    offset?: number;
  }) {
    let sql = `SELECT qp.*, s.name as subject_name, s.code as subject_code, u.name as university_name,
               (SELECT COUNT(*) FROM questions q WHERE q.question_paper_id = qp.id) as question_count
               FROM question_papers qp
               JOIN subjects s ON qp.subject_id = s.id
               JOIN universities u ON qp.university_id = u.id
               WHERE 1=1`;
    const params: any[] = [];

    if (filters?.subjectId) {
      sql += ` AND qp.subject_id = ?`;
      params.push(filters.subjectId);
    }
    if (filters?.examType) {
      sql += ` AND qp.exam_type = ?`;
      params.push(filters.examType);
    }
    if (filters?.academicYear) {
      sql += ` AND qp.academic_year = ?`;
      params.push(filters.academicYear);
    }
    if (filters?.verificationStatus) {
      sql += ` AND qp.verification_status = ?`;
      params.push(filters.verificationStatus);
    }

    sql += ` ORDER BY qp.academic_year DESC, qp.created_at DESC`;

    const limit = filters?.limit || 20;
    const offset = filters?.offset || 0;
    sql += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const items = dbService.all(sql, params);
    const countRow = dbService.get<{ count: number }>(`SELECT COUNT(*) as count FROM question_papers`);

    return {
      items,
      total: countRow?.count || 0,
      limit,
      offset,
    };
  }

  public getQuestionPaper(id: string) {
    const paper = dbService.get<QuestionPaperRecord>(
      `SELECT qp.*, s.name as subject_name, s.code as subject_code, u.name as university_name
       FROM question_papers qp
       JOIN subjects s ON qp.subject_id = s.id
       JOIN universities u ON qp.university_id = u.id
       WHERE qp.id = ?`,
      [id]
    );
    if (!paper) return null;

    const questions = dbService.all(
      `SELECT q.*, t.name as topic_name, u.name as unit_name
       FROM questions q
       LEFT JOIN topics t ON q.topic_id = t.id
       LEFT JOIN units u ON q.unit_id = u.id
       WHERE q.question_paper_id = ?
       ORDER BY q.question_number ASC`,
      [id]
    );

    return {
      ...paper,
      metadata: typeof paper.metadata_json === 'string' ? JSON.parse(paper.metadata_json) : paper.metadata_json,
      questions: questions.map(q => ({
        ...q,
        options: q.options_json ? JSON.parse(q.options_json) : null,
      })),
    };
  }

  public createQuestionPaper(dto: CreatePaperDTO): QuestionPaperRecord {
    const id = randomUUID();
    const now = new Date().toISOString();
    const fileHash = dto.fileBuffer 
      ? createHash('sha256').update(dto.fileBuffer).digest('hex')
      : createHash('sha256').update(dto.originalFileUrl + now).digest('hex');

    dbService.run(
      `INSERT INTO question_papers (
        id, university_id, subject_id, regulation_id, semester_id, exam_type, academic_year,
        exam_date, exam_slot, source_id, original_file_url, file_hash, processing_status,
        verification_status, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'QUEUED', 'UNVERIFIED', ?, ?, ?)`,
      [
        id,
        dto.universityId,
        dto.subjectId,
        dto.regulationId || null,
        dto.semesterId || null,
        dto.examType,
        dto.academicYear,
        dto.examDate || null,
        dto.examSlot || null,
        dto.sourceId || null,
        dto.originalFileUrl,
        fileHash,
        JSON.stringify(dto.metadata || {}),
        now,
        now,
      ]
    );

    return dbService.get<QuestionPaperRecord>(`SELECT * FROM question_papers WHERE id = ?`, [id])!;
  }

  public getPaperAnalysis(id: string) {
    const paper = this.getQuestionPaper(id);
    if (!paper) return null;

    const questions = paper.questions || [];
    const totalMarks = questions.reduce((sum: number, q: any) => sum + (q.marks || 0), 0);
    const marksDistribution: Record<string, number> = {};
    const bloomDistribution: Record<string, number> = {};
    const difficultyDistribution: Record<string, number> = {};

    for (const q of questions) {
      const markKey = `${q.marks} Marks`;
      marksDistribution[markKey] = (marksDistribution[markKey] || 0) + 1;

      bloomDistribution[q.bloom_level] = (bloomDistribution[q.bloom_level] || 0) + 1;
      difficultyDistribution[q.difficulty] = (difficultyDistribution[q.difficulty] || 0) + 1;
    }

    return {
      paperId: id,
      subjectName: paper.subject_name,
      academicYear: paper.academic_year,
      examType: paper.exam_type,
      totalQuestions: questions.length,
      totalMarks,
      marksDistribution,
      bloomDistribution,
      difficultyDistribution,
    };
  }
}

export const pyqService = new PyqService();
