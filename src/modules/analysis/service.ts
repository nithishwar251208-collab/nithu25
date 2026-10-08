import { dbService } from '../../database/db.ts';

export class AnalysisService {
  /**
   * Retrieves subject-level analytics, mark distributions, unit frequencies, and important topics
   */
  public getSubjectAnalysis(subjectId: string) {
    const subject = dbService.get(`SELECT id, code, name FROM subjects WHERE id = ?`, [subjectId]);
    if (!subject) return null;

    const papers = dbService.all(`
      SELECT id, academic_year, exam_type, exam_date 
      FROM question_papers 
      WHERE subject_id = ?
    `, [subjectId]);

    const questions = dbService.all(`
      SELECT q.id, q.marks, q.bloom_level, q.difficulty, q.unit_id, q.topic_id,
             qp.academic_year, qp.exam_type
      FROM questions q
      JOIN question_papers qp ON q.question_paper_id = qp.id
      WHERE q.subject_id = ?
    `, [subjectId]);

    // Marks distribution
    const marksDistribution: Record<string, number> = {};
    for (const q of questions) {
      const key = `${q.marks} Mark${q.marks === 1 ? '' : 's'}`;
      marksDistribution[key] = (marksDistribution[key] || 0) + 1;
    }

    // Units frequency
    const units = dbService.all(`
      SELECT u.id, u.number, u.name,
             (SELECT COUNT(*) FROM questions q WHERE q.unit_id = u.id) as question_count,
             (SELECT COALESCE(SUM(q.marks), 0) FROM questions q WHERE q.unit_id = u.id) as total_marks
      FROM units u
      WHERE u.subject_id = ?
      ORDER BY u.number ASC
    `, [subjectId]);

    // Exam coverage breakdown
    const examCoverage: Record<string, number> = {};
    for (const p of papers) {
      examCoverage[p.exam_type] = (examCoverage[p.exam_type] || 0) + 1;
    }

    // Important topics in this subject
    const importantTopics = dbService.all(`
      SELECT t.id, t.name, u.number as unit_number, u.name as unit_name,
             ta.importance_score, ta.historical_freq, ta.recent_freq,
             ta.year_coverage, ta.marks_weight, ta.trend, ta.explanation_json
      FROM topic_analyses ta
      JOIN topics t ON ta.topic_id = t.id
      JOIN units u ON t.unit_id = u.id
      WHERE u.subject_id = ?
      ORDER BY ta.importance_score DESC
      LIMIT 10
    `, [subjectId]).map(t => ({
      ...t,
      explanation: JSON.parse(t.explanation_json || '[]'),
      guidanceNote: 'Historical frequency indicator. Not an exam prediction guarantee.',
    }));

    return {
      subject,
      totalPapers: papers.length,
      totalQuestions: questions.length,
      examCoverage,
      marksDistribution,
      unitBreakdown: units,
      topImportantTopics: importantTopics,
    };
  }

  /**
   * Retrieves specific topic analysis with historical questions and trend
   */
  public getTopicAnalysis(topicId: string) {
    const topic = dbService.get(`
      SELECT t.*, u.name as unit_name, u.number as unit_number, s.id as subject_id, s.name as subject_name
      FROM topics t
      JOIN units u ON t.unit_id = u.id
      JOIN subjects s ON u.subject_id = s.id
      WHERE t.id = ?
    `, [topicId]);

    if (!topic) return null;

    const analysis = dbService.get(`SELECT * FROM topic_analyses WHERE topic_id = ?`, [topicId]);

    const pastQuestions = dbService.all(`
      SELECT q.id, q.question_number, q.question_text, q.marks, q.difficulty, q.bloom_level,
             qp.academic_year, qp.exam_type
      FROM questions q
      JOIN question_papers qp ON q.question_paper_id = qp.id
      WHERE q.topic_id = ?
      ORDER BY qp.academic_year DESC
    `, [topicId]);

    return {
      topic,
      importanceScore: analysis?.importance_score || 0,
      historicalFreq: analysis?.historical_freq || pastQuestions.length,
      recentFreq: analysis?.recent_freq || 0,
      yearCoverage: analysis?.year_coverage || 0,
      marksWeight: analysis?.marks_weight || 0,
      trend: analysis?.trend || 'STABLE',
      explanation: analysis ? JSON.parse(analysis.explanation_json || '[]') : [],
      disclaimer: 'Analysis is strictly derived from past examination archives. Historical importance does not guarantee appearance in upcoming tests.',
      pastQuestions,
    };
  }

  /**
   * Retrieves overall top important topics across subjects or filtered by subject
   */
  public listImportantTopics(subjectId?: string, limit: number = 15) {
    let sql = `
      SELECT t.id, t.name, u.number as unit_number, u.name as unit_name,
             s.id as subject_id, s.name as subject_name, s.code as subject_code,
             ta.importance_score, ta.historical_freq, ta.recent_freq,
             ta.year_coverage, ta.marks_weight, ta.trend, ta.explanation_json
      FROM topic_analyses ta
      JOIN topics t ON ta.topic_id = t.id
      JOIN units u ON t.unit_id = u.id
      JOIN subjects s ON u.subject_id = s.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (subjectId) {
      sql += ` AND s.id = ?`;
      params.push(subjectId);
    }

    sql += ` ORDER BY ta.importance_score DESC LIMIT ?`;
    params.push(limit);

    return dbService.all(sql, params).map(t => ({
      ...t,
      explanation: JSON.parse(t.explanation_json || '[]'),
      recommendationLabel: t.importance_score >= 80 ? 'High historical importance' : 'Frequently appearing topic',
    }));
  }
}

export const analysisService = new AnalysisService();
