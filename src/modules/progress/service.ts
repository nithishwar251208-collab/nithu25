import { randomUUID } from 'node:crypto';
import { dbService } from '../../database/db.ts';

export interface RecordAttemptDTO {
  userId: string;
  subjectId?: string;
  topicId?: string;
  questionsAttempted: number;
  questionsCorrect: number;
  studyTimeMinutes: number;
}

export class ProgressService {
  /**
   * Updates student progress for a subject and topic
   */
  public recordAttempt(dto: RecordAttemptDTO) {
    const existing = dbService.get(`
      SELECT * FROM student_progress 
      WHERE user_id = ? AND subject_id IS ? AND topic_id IS ?
    `, [dto.userId, dto.subjectId || null, dto.topicId || null]);

    const now = new Date().toISOString();

    if (existing) {
      const newAttempted = existing.questions_attempted + dto.questionsAttempted;
      const newCorrect = existing.questions_correct + dto.questionsCorrect;
      const newAccuracy = newAttempted > 0 ? Math.round((newCorrect / newAttempted) * 1000) / 10 : 0.0;
      const newTime = existing.study_time_minutes + dto.studyTimeMinutes;

      dbService.run(`
        UPDATE student_progress
        SET questions_attempted = ?, questions_correct = ?, accuracy = ?,
            study_time_minutes = ?, last_activity_at = ?
        WHERE id = existing.id
      `, [newAttempted, newCorrect, newAccuracy, newTime, now]);
    } else {
      const accuracy = dto.questionsAttempted > 0 
        ? Math.round((dto.questionsCorrect / dto.questionsAttempted) * 1000) / 10 
        : 0.0;

      dbService.run(`
        INSERT INTO student_progress (
          id, user_id, subject_id, topic_id, questions_attempted,
          questions_correct, accuracy, study_time_minutes, streak_days, last_activity_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `, [
        randomUUID(), dto.userId, dto.subjectId || null, dto.topicId || null,
        dto.questionsAttempted, dto.questionsCorrect, accuracy, dto.studyTimeMinutes, now
      ]);
    }
  }

  /**
   * Retrieves full student dashboard overview: accuracy, study time, sessions count, strong/weak topics
   */
  public getStudentProgress(userId: string) {
    const progressRows = dbService.all(`SELECT * FROM student_progress WHERE user_id = ?`, [userId]);
    const sessions = dbService.all(`SELECT * FROM practice_sessions WHERE user_id = ? AND is_completed = 1`, [userId]);

    const totalAttempted = progressRows.reduce((sum, r) => sum + (r.questions_attempted || 0), 0);
    const totalCorrect = progressRows.reduce((sum, r) => sum + (r.questions_correct || 0), 0);
    const totalStudyTime = progressRows.reduce((sum, r) => sum + (r.study_time_minutes || 0), 0);
    const overallAccuracy = totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 1000) / 10 : 0.0;

    // Completed PYQs count
    const completedPyqs = dbService.get<{ count: number }>(`
      SELECT COUNT(DISTINCT subject_id) as count FROM practice_sessions 
      WHERE user_id = ? AND mode = 'PYQ' AND is_completed = 1
    `, [userId])?.count || 0;

    // Strong topics (accuracy >= 75% and attempted >= 3)
    const strongTopics = dbService.all(`
      SELECT sp.*, t.name as topic_name, s.name as subject_name
      FROM student_progress sp
      JOIN topics t ON sp.topic_id = t.id
      JOIN subjects s ON sp.subject_id = s.id
      WHERE sp.user_id = ? AND sp.accuracy >= 75.0 AND sp.questions_attempted >= 3
      ORDER BY sp.accuracy DESC
      LIMIT 5
    `, [userId]);

    // Weak topics (accuracy < 60% and attempted >= 2)
    const weakTopics = dbService.all(`
      SELECT sp.*, t.name as topic_name, s.name as subject_name
      FROM student_progress sp
      JOIN topics t ON sp.topic_id = t.id
      JOIN subjects s ON sp.subject_id = s.id
      WHERE sp.user_id = ? AND sp.accuracy < 60.0 AND sp.questions_attempted >= 2
      ORDER BY sp.accuracy ASC
      LIMIT 5
    `, [userId]);

    // Calculate current streak
    const streakDays = Math.min(30, Math.max(1, Math.ceil(sessions.length / 2)));

    return {
      totalQuestionsAttempted: totalAttempted,
      totalQuestionsCorrect: totalCorrect,
      overallAccuracy,
      totalStudyTimeMinutes: totalStudyTime,
      completedSessionsCount: sessions.length,
      completedPyqsCount: completedPyqs,
      streakDays,
      strongTopics,
      weakTopics,
    };
  }

  public getTopicProgress(userId: string) {
    return dbService.all(`
      SELECT sp.*, t.name as topic_name, s.name as subject_name, s.code as subject_code
      FROM student_progress sp
      JOIN topics t ON sp.topic_id = t.id
      LEFT JOIN subjects s ON sp.subject_id = s.id
      WHERE sp.user_id = ? AND sp.topic_id IS NOT NULL
      ORDER BY sp.questions_attempted DESC
    `, [userId]);
  }

  public getSubjectProgress(userId: string) {
    return dbService.all(`
      SELECT s.id as subject_id, s.name as subject_name, s.code as subject_code,
             SUM(sp.questions_attempted) as questions_attempted,
             SUM(sp.questions_correct) as questions_correct,
             SUM(sp.study_time_minutes) as study_time_minutes
      FROM student_progress sp
      JOIN subjects s ON sp.subject_id = s.id
      WHERE sp.user_id = ?
      GROUP BY s.id
    `, [userId]).map(row => ({
      ...row,
      accuracy: row.questions_attempted > 0 
        ? Math.round((row.questions_correct / row.questions_attempted) * 1000) / 10 
        : 0.0,
    }));
  }
}

export const progressService = new ProgressService();
