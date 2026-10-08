import { dbService } from '../../database/db.ts';
import { jobQueue } from '../../jobs/queue.ts';
import type { VerificationStatus } from '../../types/index.ts';

export class AdminService {
  /**
   * Retrieves pending questions for manual review (low OCR confidence, AI classified, unverified)
   */
  public getReviewQueue(limit: number = 20) {
    const questions = dbService.all(`
      SELECT q.*, s.name as subject_name, qp.academic_year, qp.exam_type
      FROM questions q
      JOIN subjects s ON q.subject_id = s.id
      JOIN question_papers qp ON q.question_paper_id = qp.id
      WHERE q.verification_status IN ('UNVERIFIED', 'MACHINE_PROCESSED')
      ORDER BY q.created_at ASC
      LIMIT ?
    `, [limit]);

    const countRow = dbService.get<{ count: number }>(`
      SELECT COUNT(*) as count FROM questions 
      WHERE verification_status IN ('UNVERIFIED', 'MACHINE_PROCESSED')
    `);

    return {
      pendingCount: countRow?.count || 0,
      items: questions.map(q => ({
        ...q,
        options: q.options_json ? JSON.parse(q.options_json) : null,
      })),
    };
  }

  /**
   * Approve an extracted question
   */
  public approveQuestion(questionId: string, updates?: {
    topicId?: string;
    unitId?: string;
    marks?: number;
    difficulty?: string;
    bloomLevel?: string;
  }) {
    const q = dbService.get(`SELECT * FROM questions WHERE id = ?`, [questionId]);
    if (!q) throw new Error('Question not found');

    const topicId = updates?.topicId || q.topic_id;
    const unitId = updates?.unitId || q.unit_id;
    const marks = updates?.marks !== undefined ? updates.marks : q.marks;
    const difficulty = updates?.difficulty || q.difficulty;
    const bloomLevel = updates?.bloomLevel || q.bloom_level;
    const now = new Date().toISOString();

    dbService.run(`
      UPDATE questions
      SET topic_id = ?, unit_id = ?, marks = ?, difficulty = ?, bloom_level = ?,
          verification_status = 'ADMIN_REVIEWED', updated_at = ?
      WHERE id = ?
    `, [topicId, unitId, marks, difficulty, bloomLevel, now, questionId]);

    return dbService.get(`SELECT * FROM questions WHERE id = ?`, [questionId]);
  }

  /**
   * Reject an extracted question
   */
  public rejectQuestion(questionId: string, reason?: string) {
    const now = new Date().toISOString();
    dbService.run(`
      UPDATE questions
      SET verification_status = 'REJECTED', updated_at = ?
      WHERE id = ?
    `, [now, questionId]);

    return { id: questionId, status: 'REJECTED', reason };
  }

  /**
   * Retrieves Ingestion Jobs
   */
  public getIngestionJobs(limit: number = 50) {
    return jobQueue.listJobs(limit);
  }

  /**
   * Duplicate Groups Management
   */
  public listDuplicateGroups() {
    return dbService.all(`
      SELECT dg.*, 
             (SELECT COUNT(*) FROM questions q WHERE q.duplicate_group_id = dg.id) as question_count
      FROM duplicate_groups dg
      ORDER BY dg.created_at DESC
    `);
  }
}

export const adminService = new AdminService();
