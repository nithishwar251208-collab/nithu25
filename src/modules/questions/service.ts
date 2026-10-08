import { dbService } from '../../database/db.ts';
import type { QuestionRecord } from '../../types/index.ts';
import { cosineSimilarity } from '../../utils/vectors.ts';

export interface QuestionFilters {
  subjectId?: string;
  unitId?: string;
  topicId?: string;
  conceptId?: string;
  examType?: string;
  academicYear?: string;
  difficulty?: string;
  bloomLevel?: string;
  marks?: number;
  search?: string;
  limit?: number;
  offset?: number;
}

export class QuestionsService {
  public listQuestions(filters?: QuestionFilters) {
    let sql = `SELECT q.*, s.name as subject_name, s.code as subject_code,
                      u.name as unit_name, u.number as unit_number,
                      t.name as topic_name, qp.exam_type, qp.academic_year
               FROM questions q
               JOIN subjects s ON q.subject_id = s.id
               LEFT JOIN units u ON q.unit_id = u.id
               LEFT JOIN topics t ON q.topic_id = t.id
               LEFT JOIN question_papers qp ON q.question_paper_id = qp.id
               WHERE 1=1`;
    const params: any[] = [];

    if (filters?.subjectId) {
      sql += ` AND q.subject_id = ?`;
      params.push(filters.subjectId);
    }
    if (filters?.unitId) {
      sql += ` AND q.unit_id = ?`;
      params.push(filters.unitId);
    }
    if (filters?.topicId) {
      sql += ` AND q.topic_id = ?`;
      params.push(filters.topicId);
    }
    if (filters?.conceptId) {
      sql += ` AND q.concept_id = ?`;
      params.push(filters.conceptId);
    }
    if (filters?.examType) {
      sql += ` AND qp.exam_type = ?`;
      params.push(filters.examType);
    }
    if (filters?.academicYear) {
      sql += ` AND qp.academic_year = ?`;
      params.push(filters.academicYear);
    }
    if (filters?.difficulty) {
      sql += ` AND q.difficulty = ?`;
      params.push(filters.difficulty);
    }
    if (filters?.bloomLevel) {
      sql += ` AND q.bloom_level = ?`;
      params.push(filters.bloomLevel);
    }
    if (filters?.marks !== undefined) {
      sql += ` AND q.marks = ?`;
      params.push(filters.marks);
    }
    if (filters?.search) {
      sql += ` AND (q.question_text LIKE ? OR q.normalized_text LIKE ?)`;
      params.push(`%${filters.search}%`, `%${filters.search.toLowerCase()}%`);
    }

    sql += ` ORDER BY q.created_at DESC`;

    const limit = filters?.limit || 20;
    const offset = filters?.offset || 0;
    sql += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const items = dbService.all(sql, params);
    const countRow = dbService.get<{ count: number }>(`SELECT COUNT(*) as count FROM questions`);

    return {
      items: items.map(q => ({
        ...q,
        options: q.options_json ? JSON.parse(q.options_json) : null,
      })),
      total: countRow?.count || 0,
      limit,
      offset,
    };
  }

  public getQuestion(id: string) {
    const q = dbService.get(
      `SELECT q.*, s.name as subject_name, s.code as subject_code,
              u.name as unit_name, u.number as unit_number,
              t.name as topic_name, c.name as concept_name,
              qp.exam_type, qp.academic_year, qp.original_file_url
       FROM questions q
       JOIN subjects s ON q.subject_id = s.id
       LEFT JOIN units u ON q.unit_id = u.id
       LEFT JOIN topics t ON q.topic_id = t.id
       LEFT JOIN concepts c ON q.concept_id = c.id
       LEFT JOIN question_papers qp ON q.question_paper_id = qp.id
       WHERE q.id = ?`,
      [id]
    );
    if (!q) return null;

    const subQuestions = dbService.all(`SELECT * FROM questions WHERE parent_question_id = ?`, [id]);

    return {
      ...q,
      options: q.options_json ? JSON.parse(q.options_json) : null,
      subQuestions,
    };
  }

  public getSimilarQuestions(questionId: string, limit: number = 5) {
    const target = dbService.get<QuestionRecord>(`SELECT * FROM questions WHERE id = ?`, [questionId]);
    if (!target) return [];

    let targetVec: number[] | null = null;
    if (target.embedding_json) {
      try {
        targetVec = JSON.parse(target.embedding_json);
      } catch {
        targetVec = null;
      }
    }

    // Retrieve candidate questions in the same subject or same topic
    const candidates = dbService.all<QuestionRecord>(
      `SELECT q.*, s.name as subject_name, t.name as topic_name, qp.academic_year, qp.exam_type
       FROM questions q
       JOIN subjects s ON q.subject_id = s.id
       LEFT JOIN topics t ON q.topic_id = t.id
       LEFT JOIN question_papers qp ON q.question_paper_id = qp.id
       WHERE q.id != ? AND q.subject_id = ?`,
      [questionId, target.subject_id]
    );

    const scored = candidates.map(c => {
      let score = 0;

      // 1. If duplicate group matches
      if (target.duplicate_group_id && target.duplicate_group_id === c.duplicate_group_id) {
        score = 0.99;
      } else if (targetVec && c.embedding_json) {
        // 2. Vector cosine similarity
        try {
          const cVec: number[] = JSON.parse(c.embedding_json);
          score = cosineSimilarity(targetVec, cVec);
        } catch {
          score = 0;
        }
      } else {
        // 3. Fallback normalized token overlap
        if (target.topic_id && target.topic_id === c.topic_id) {
          score += 0.3;
        }
      }

      return {
        ...c,
        options: c.options_json ? JSON.parse(c.options_json) : null,
        similarityScore: Math.round(score * 100) / 100,
      };
    });

    return scored
      .filter(s => s.similarityScore > 0.4)
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, limit);
  }
}

export const questionsService = new QuestionsService();
