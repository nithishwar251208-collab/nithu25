import { randomUUID } from 'node:crypto';
import { dbService } from '../../database/db.ts';

export class AcademicService {
  // Universities
  public listUniversities() {
    return dbService.all(`SELECT * FROM universities WHERE active = 1 ORDER BY name ASC`);
  }

  public getUniversity(id: string) {
    return dbService.get(`SELECT * FROM universities WHERE id = ?`, [id]);
  }

  public createUniversity(data: { name: string; code: string; country?: string }) {
    const id = randomUUID();
    const now = new Date().toISOString();
    dbService.run(
      `INSERT INTO universities (id, name, code, country, active, created_at) VALUES (?, ?, ?, ?, 1, ?)`,
      [id, data.name, data.code.toUpperCase(), data.country || 'India', now]
    );
    return this.getUniversity(id);
  }

  // Campuses
  public listCampuses(universityId?: string) {
    if (universityId) {
      return dbService.all(`SELECT * FROM campuses WHERE university_id = ? ORDER BY name ASC`, [universityId]);
    }
    return dbService.all(`SELECT * FROM campuses ORDER BY name ASC`);
  }

  // Programs
  public listPrograms(departmentId?: string) {
    if (departmentId) {
      return dbService.all(`SELECT * FROM programs WHERE department_id = ? ORDER BY name ASC`, [departmentId]);
    }
    return dbService.all(`SELECT * FROM programs ORDER BY name ASC`);
  }

  // Semesters
  public listSemesters(programId?: string) {
    if (programId) {
      return dbService.all(`SELECT * FROM semesters WHERE program_id = ? ORDER BY number ASC`, [programId]);
    }
    return dbService.all(`SELECT * FROM semesters ORDER BY number ASC`);
  }

  // Subjects
  public listSubjects(query?: { courseId?: string; search?: string }) {
    let sql = `SELECT s.*, c.code as course_code, c.name as course_name 
               FROM subjects s 
               LEFT JOIN courses c ON s.course_id = c.id 
               WHERE 1=1`;
    const params: any[] = [];

    if (query?.courseId) {
      sql += ` AND s.course_id = ?`;
      params.push(query.courseId);
    }

    if (query?.search) {
      sql += ` AND (s.name LIKE ? OR s.code LIKE ?)`;
      params.push(`%${query.search}%`, `%${query.search}%`);
    }

    sql += ` ORDER BY s.name ASC`;
    return dbService.all(sql, params);
  }

  public getSubject(id: string) {
    const subject = dbService.get(`SELECT * FROM subjects WHERE id = ?`, [id]);
    if (!subject) return null;

    const units = dbService.all(`SELECT * FROM units WHERE subject_id = ? ORDER BY number ASC`, [id]);
    return {
      ...subject,
      units,
    };
  }

  // Units
  public listUnits(subjectId: string) {
    return dbService.all(`SELECT * FROM units WHERE subject_id = ? ORDER BY number ASC`, [subjectId]);
  }

  public getUnit(id: string) {
    const unit = dbService.get(`SELECT * FROM units WHERE id = ?`, [id]);
    if (!unit) return null;

    const topics = dbService.all(`SELECT * FROM topics WHERE unit_id = ? ORDER BY name ASC`, [id]);
    return {
      ...unit,
      topics,
    };
  }

  // Topics
  public listTopics(unitId?: string) {
    if (unitId) {
      return dbService.all(`SELECT * FROM topics WHERE unit_id = ? ORDER BY name ASC`, [unitId]);
    }
    return dbService.all(`SELECT * FROM topics ORDER BY name ASC`);
  }

  public getTopic(id: string) {
    const topic = dbService.get(
      `SELECT t.*, u.name as unit_name, u.number as unit_number, u.subject_id 
       FROM topics t 
       LEFT JOIN units u ON t.unit_id = u.id 
       WHERE t.id = ?`,
      [id]
    );
    if (!topic) return null;

    const subtopics = dbService.all(`SELECT * FROM subtopics WHERE topic_id = ? ORDER BY name ASC`, [id]);
    const analysis = dbService.get(`SELECT * FROM topic_analyses WHERE topic_id = ?`, [id]);

    return {
      ...topic,
      subtopics,
      analysis: analysis ? {
        ...analysis,
        examCoverage: JSON.parse(analysis.exam_coverage_json || '[]'),
        explanation: JSON.parse(analysis.explanation_json || '[]'),
      } : null,
    };
  }

  // Subtopics & Concepts
  public listSubtopics(topicId: string) {
    return dbService.all(`SELECT * FROM subtopics WHERE topic_id = ? ORDER BY name ASC`, [topicId]);
  }

  public listConcepts(subtopicId: string) {
    return dbService.all(`SELECT * FROM concepts WHERE subtopic_id = ? ORDER BY name ASC`, [subtopicId]);
  }
}

export const academicService = new AcademicService();
