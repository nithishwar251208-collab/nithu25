import { randomUUID } from 'node:crypto';
import { dbService } from '../../database/db.ts';
import type { PracticeMode, PracticeSessionRecord, QuestionRecord } from '../../types/index.ts';
import { progressService } from '../progress/service.ts';

export interface StartPracticeDTO {
  userId: string;
  mode: PracticeMode;
  subjectId?: string;
  unitId?: string;
  topicId?: string;
  questionCount?: number;
}

export interface SubmitAnswerDTO {
  sessionId: string;
  questionId: string;
  userAnswer: string;
  timeTakenSec?: number;
}

export class PracticeService {
  /**
   * Starts a new practice session according to chosen mode and criteria
   */
  public startSession(dto: StartPracticeDTO) {
    const limit = dto.questionCount || 10;
    let selectedQuestions: QuestionRecord[] = [];

    switch (dto.mode) {
      case 'TOPIC':
        if (dto.topicId) {
          selectedQuestions = dbService.all<QuestionRecord>(
            `SELECT * FROM questions WHERE topic_id = ? ORDER BY RANDOM() LIMIT ?`,
            [dto.topicId, limit]
          );
        }
        break;

      case 'UNIT':
        if (dto.unitId) {
          selectedQuestions = dbService.all<QuestionRecord>(
            `SELECT * FROM questions WHERE unit_id = ? ORDER BY RANDOM() LIMIT ?`,
            [dto.unitId, limit]
          );
        }
        break;

      case 'IMPORTANT_TOPICS':
        selectedQuestions = dbService.all<QuestionRecord>(`
          SELECT q.* 
          FROM questions q
          JOIN topic_analyses ta ON q.topic_id = ta.topic_id
          WHERE (? IS NULL OR q.subject_id = ?)
          ORDER BY ta.importance_score DESC, RANDOM()
          LIMIT ?
        `, [dto.subjectId || null, dto.subjectId || null, limit]);
        break;

      case 'INCORRECT_QUESTIONS':
        selectedQuestions = dbService.all<QuestionRecord>(`
          SELECT q.* 
          FROM questions q
          JOIN revision_items r ON q.id = r.question_id
          WHERE r.user_id = ? AND r.is_incorrect = 1
          ORDER BY RANDOM() LIMIT ?
        `, [dto.userId, limit]);
        break;

      case 'MOCK_EXAM':
      case 'TIMED_PRACTICE':
      case 'SUBJECT':
      case 'RANDOM':
      default:
        if (dto.subjectId) {
          selectedQuestions = dbService.all<QuestionRecord>(
            `SELECT * FROM questions WHERE subject_id = ? ORDER BY RANDOM() LIMIT ?`,
            [dto.subjectId, limit]
          );
        } else {
          selectedQuestions = dbService.all<QuestionRecord>(
            `SELECT * FROM questions ORDER BY RANDOM() LIMIT ?`,
            [limit]
          );
        }
        break;
    }

    if (selectedQuestions.length === 0) {
      // Fallback to any questions in subject or overall
      selectedQuestions = dbService.all<QuestionRecord>(
        `SELECT * FROM questions ORDER BY RANDOM() LIMIT ?`,
        [Math.min(5, limit)]
      );
    }

    const sessionId = randomUUID();
    const now = new Date().toISOString();
    const totalMarks = selectedQuestions.reduce((sum, q) => sum + (q.marks || 2.0), 0);

    dbService.run(`
      INSERT INTO practice_sessions (
        id, user_id, mode, subject_id, unit_id, topic_id,
        total_questions, score, total_marks, accuracy, time_taken_sec,
        is_completed, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0.0, ?, 0.0, 0, 0, ?)
    `, [
      sessionId, dto.userId, dto.mode, dto.subjectId || null, dto.unitId || null, dto.topicId || null,
      selectedQuestions.length, totalMarks, now
    ]);

    // Insert session questions
    for (const q of selectedQuestions) {
      dbService.run(`
        INSERT INTO practice_session_questions (
          id, practice_session_id, question_id, time_taken_sec
        ) VALUES (?, ?, ?, 0)
      `, [randomUUID(), sessionId, q.id]);
    }

    return this.getSession(sessionId);
  }

  /**
   * Submits an answer for a specific question in a practice session
   */
  public submitAnswer(dto: SubmitAnswerDTO) {
    const qRow = dbService.get<QuestionRecord>(`SELECT * FROM questions WHERE id = ?`, [dto.questionId]);
    if (!qRow) throw new Error('Question not found');

    const sessionItem = dbService.get(
      `SELECT * FROM practice_session_questions WHERE practice_session_id = ? AND question_id = ?`,
      [dto.sessionId, dto.questionId]
    );

    if (!sessionItem) throw new Error('Question is not part of this practice session');

    // Simple correctness calculation for MCQ or keyword match
    let isCorrect = false;
    let scoreAwarded = 0;

    if (qRow.correct_answer) {
      isCorrect = dto.userAnswer.trim().toLowerCase() === qRow.correct_answer.trim().toLowerCase();
      scoreAwarded = isCorrect ? qRow.marks : 0;
    } else {
      // Descriptive question self-assessment / completion awarded
      isCorrect = dto.userAnswer.length > 10;
      scoreAwarded = isCorrect ? qRow.marks * 0.8 : 0;
    }

    const now = new Date().toISOString();
    dbService.run(`
      UPDATE practice_session_questions
      SET user_answer = ?, is_correct = ?, score_awarded = ?, time_taken_sec = ?, answered_at = ?
      WHERE id = ?
    `, [dto.userAnswer, isCorrect ? 1 : 0, scoreAwarded, dto.timeTakenSec || 30, now, sessionItem.id]);

    return {
      questionId: dto.questionId,
      isCorrect,
      scoreAwarded,
      correctAnswer: qRow.correct_answer || null,
    };
  }

  /**
   * Finalizes the practice session, calculates accuracy, and updates student progress
   */
  public finishSession(sessionId: string) {
    const session = dbService.get<PracticeSessionRecord>(`SELECT * FROM practice_sessions WHERE id = ?`, [sessionId]);
    if (!session) throw new Error('Session not found');

    const items = dbService.all(`
      SELECT psq.*, q.marks, q.subject_id, q.topic_id 
      FROM practice_session_questions psq
      JOIN questions q ON psq.question_id = q.id
      WHERE psq.practice_session_id = ?
    `, [sessionId]);

    const totalQuestions = items.length;
    const answered = items.filter(i => i.user_answer !== null);
    const correctCount = items.filter(i => i.is_correct === 1).length;
    const totalScore = items.reduce((sum, i) => sum + (i.score_awarded || 0), 0);
    const totalTime = items.reduce((sum, i) => sum + (i.time_taken_sec || 0), 0);
    const accuracy = answered.length > 0 ? Math.round((correctCount / answered.length) * 1000) / 10 : 0.0;

    const now = new Date().toISOString();
    dbService.run(`
      UPDATE practice_sessions
      SET score = ?, accuracy = ?, time_taken_sec = ?, is_completed = 1, completed_at = ?
      WHERE id = ?
    `, [totalScore, accuracy, totalTime, now, sessionId]);

    // Update Student Progress
    const durationMinutes = Math.max(1, Math.ceil(totalTime / 60));
    progressService.recordAttempt({
      userId: session.user_id,
      subjectId: session.subject_id || undefined,
      topicId: session.topic_id || undefined,
      questionsAttempted: answered.length,
      questionsCorrect: correctCount,
      studyTimeMinutes: durationMinutes,
    });

    return this.getSession(sessionId);
  }

  public getSession(sessionId: string) {
    const session = dbService.get(`SELECT * FROM practice_sessions WHERE id = ?`, [sessionId]);
    if (!session) return null;

    const questions = dbService.all(`
      SELECT psq.id as session_question_id, psq.user_answer, psq.is_correct, psq.score_awarded, psq.time_taken_sec,
             q.id, q.question_number, q.question_text, q.marks, q.difficulty, q.bloom_level, q.options_json,
             t.name as topic_name, u.name as unit_name
      FROM practice_session_questions psq
      JOIN questions q ON psq.question_id = q.id
      LEFT JOIN topics t ON q.topic_id = t.id
      LEFT JOIN units u ON q.unit_id = u.id
      WHERE psq.practice_session_id = ?
    `, [sessionId]);

    return {
      ...session,
      questions: questions.map(q => ({
        ...q,
        options: q.options_json ? JSON.parse(q.options_json) : null,
      })),
    };
  }

  public getHistory(userId: string, limit: number = 20) {
    return dbService.all(`
      SELECT ps.*, s.name as subject_name 
      FROM practice_sessions ps
      LEFT JOIN subjects s ON ps.subject_id = s.id
      WHERE ps.user_id = ?
      ORDER BY ps.created_at DESC
      LIMIT ?
    `, [userId, limit]);
  }
}

export const practiceService = new PracticeService();
