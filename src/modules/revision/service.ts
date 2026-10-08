import { randomUUID } from 'node:crypto';
import { dbService } from '../../database/db.ts';
import type { RevisionState, RevisionItemRecord } from '../../types/index.ts';

export interface CreateRevisionItemDTO {
  userId: string;
  questionId: string;
  isBookmarked?: boolean;
  isImportant?: boolean;
  isIncorrect?: boolean;
}

export interface ReviewAnswerDTO {
  userId: string;
  questionId: string;
  quality: number; // 0 to 5 (SM-2 rating)
}

export class RevisionService {
  /**
   * Adds or updates a question in the student's revision queue
   */
  public addOrUpdate(dto: CreateRevisionItemDTO) {
    const existing = dbService.get<RevisionItemRecord>(
      `SELECT * FROM revision_items WHERE user_id = ? AND question_id = ?`,
      [dto.userId, dto.questionId]
    );

    const now = new Date().toISOString();

    if (existing) {
      const isBookmarked = dto.isBookmarked !== undefined ? (dto.isBookmarked ? 1 : 0) : existing.is_bookmarked;
      const isImportant = dto.isImportant !== undefined ? (dto.isImportant ? 1 : 0) : existing.is_important;
      const isIncorrect = dto.isIncorrect !== undefined ? (dto.isIncorrect ? 1 : 0) : existing.is_incorrect;

      dbService.run(`
        UPDATE revision_items
        SET is_bookmarked = ?, is_important = ?, is_incorrect = ?
        WHERE id = ?
      `, [isBookmarked, isImportant, isIncorrect, existing.id]);

      return dbService.get<RevisionItemRecord>(`SELECT * FROM revision_items WHERE id = ?`, [existing.id]);
    } else {
      const id = randomUUID();
      dbService.run(`
        INSERT INTO revision_items (
          id, user_id, question_id, status, is_bookmarked, is_important, is_incorrect,
          repetitions, interval_days, ease_factor, next_revision_date, created_at
        ) VALUES (
          ?, ?, ?, 'NEW', ?, ?, ?,
          0, 1.0, 2.5, ?, ?
        )
      `, [
        id, dto.userId, dto.questionId,
        dto.isBookmarked ? 1 : 0, dto.isImportant ? 1 : 0, dto.isIncorrect ? 1 : 0,
        now, now
      ]);

      return dbService.get<RevisionItemRecord>(`SELECT * FROM revision_items WHERE id = ?`, [id]);
    }
  }

  /**
   * Evaluates student's review response using SM-2 Spaced Repetition Algorithm
   * Quality: 0 (blackout) to 5 (perfect recall)
   */
  public recordReview(dto: ReviewAnswerDTO) {
    const item = dbService.get<RevisionItemRecord>(
      `SELECT * FROM revision_items WHERE user_id = ? AND question_id = ?`,
      [dto.userId, dto.questionId]
    );

    if (!item) {
      throw new Error('Revision item not found');
    }

    const q = Math.max(0, Math.min(5, dto.quality));
    let { repetitions, interval_days, ease_factor } = item;

    if (q >= 3) {
      if (repetitions === 0) {
        interval_days = 1;
      } else if (repetitions === 1) {
        interval_days = 6;
      } else {
        interval_days = Math.round(interval_days * ease_factor);
      }
      repetitions++;
    } else {
      repetitions = 0;
      interval_days = 1;
    }

    // Update ease factor: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    ease_factor = ease_factor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (ease_factor < 1.3) ease_factor = 1.3;

    // Status transition
    let status: RevisionState = 'LEARNING';
    if (repetitions >= 4 && ease_factor >= 2.0) {
      status = 'MASTERED';
    } else if (q < 3) {
      status = 'NEEDS_REVISION';
    }

    const now = new Date();
    const nextDate = new Date(now.getTime() + interval_days * 24 * 60 * 60 * 1000).toISOString();

    dbService.run(`
      UPDATE revision_items
      SET repetitions = ?, interval_days = ?, ease_factor = ?, status = ?,
          next_revision_date = ?, last_revised_at = ?
      WHERE id = ?
    `, [repetitions, interval_days, ease_factor, status, nextDate, now.toISOString(), item.id]);

    return dbService.get<RevisionItemRecord>(`SELECT * FROM revision_items WHERE id = ?`, [item.id]);
  }

  /**
   * Retrieves the due revision queue and recommendations
   */
  public getRevisionQueue(userId: string, limit: number = 20) {
    const now = new Date().toISOString();

    const items = dbService.all(`
      SELECT r.*, q.question_number, q.question_text, q.marks, q.difficulty, q.bloom_level,
             s.name as subject_name, t.name as topic_name
      FROM revision_items r
      JOIN questions q ON r.question_id = q.id
      JOIN subjects s ON q.subject_id = s.id
      LEFT JOIN topics t ON q.topic_id = t.id
      WHERE r.user_id = ? AND r.next_revision_date <= ?
      ORDER BY r.next_revision_date ASC
      LIMIT ?
    `, [userId, now, limit]);

    const summary = dbService.all(`
      SELECT status, COUNT(*) as count 
      FROM revision_items 
      WHERE user_id = ? 
      GROUP BY status
    `, [userId]);

    return {
      dueCount: items.length,
      items,
      statusBreakdown: summary,
    };
  }

  /**
   * Retrieves list of all bookmarked questions
   */
  public getBookmarks(userId: string) {
    return dbService.all(`
      SELECT r.*, q.question_number, q.question_text, q.marks, q.difficulty,
             s.name as subject_name, t.name as topic_name
      FROM revision_items r
      JOIN questions q ON r.question_id = q.id
      JOIN subjects s ON q.subject_id = s.id
      LEFT JOIN topics t ON q.topic_id = t.id
      WHERE r.user_id = ? AND r.is_bookmarked = 1
      ORDER BY r.created_at DESC
    `, [userId]);
  }
}

export const revisionService = new RevisionService();
