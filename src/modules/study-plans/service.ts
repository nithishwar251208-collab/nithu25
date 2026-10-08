import { randomUUID } from 'node:crypto';
import { dbService } from '../../database/db.ts';
import { progressService } from '../progress/service.ts';
import { analysisService } from '../analysis/service.ts';

export interface GeneratePlanDTO {
  userId: string;
  title: string;
  planType: 'DAILY' | 'WEEKLY' | 'SUBJECT' | 'EXAM_PREP' | 'REVISION';
  subjectId?: string;
  examDate?: string;
  targetHoursPerDay?: number;
}

export class StudyPlansService {
  /**
   * Generates an actionable personalized study plan
   */
  public generatePlan(dto: GeneratePlanDTO) {
    const hoursPerDay = dto.targetHoursPerDay || 2.0;
    const now = new Date();
    const startDate = now.toISOString().split('T')[0];

    // Fetch weak topics and important topics for syllabus optimization
    const studentProgress = progressService.getStudentProgress(dto.userId);
    const weakTopics = studentProgress.weakTopics || [];

    const importantTopics = dto.subjectId 
      ? analysisService.listImportantTopics(dto.subjectId, 8)
      : analysisService.listImportantTopics(undefined, 8);

    // Days calculation
    let planDays = 7;
    if (dto.planType === 'DAILY') planDays = 1;
    else if (dto.planType === 'WEEKLY') planDays = 7;
    else if (dto.examDate) {
      const examTime = new Date(dto.examDate).getTime();
      const diffDays = Math.max(1, Math.ceil((examTime - now.getTime()) / (1000 * 60 * 60 * 24)));
      planDays = Math.min(30, diffDays);
    }

    const schedule: Array<{
      day: number;
      date: string;
      focusType: 'WEAK_TOPIC' | 'IMPORTANT_TOPIC' | 'PYQ_PRACTICE' | 'REVISION';
      topicName: string;
      allocatedHours: number;
      actionableTasks: string[];
    }> = [];

    for (let day = 1; day <= planDays; day++) {
      const dayDate = new Date(now.getTime() + (day - 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Alternate between Weak Areas, High Priority PYQ Topics, and Revision
      if (day % 3 === 1 && weakTopics.length > 0) {
        const wt = weakTopics[(day - 1) % weakTopics.length];
        schedule.push({
          day,
          date: dayDate,
          focusType: 'WEAK_TOPIC',
          topicName: wt.topic_name,
          allocatedHours: hoursPerDay,
          actionableTasks: [
            `Review fundamental concepts for ${wt.topic_name}`,
            `Solve 5 practice problems from historical papers`,
            `Self-test accuracy to raise proficiency above 75%`,
          ],
        });
      } else if (importantTopics.length > 0) {
        const it = importantTopics[(day - 1) % importantTopics.length];
        schedule.push({
          day,
          date: dayDate,
          focusType: 'IMPORTANT_TOPIC',
          topicName: it.name,
          allocatedHours: hoursPerDay,
          actionableTasks: [
            `Study high-frequency topic: ${it.name} (Importance Score: ${it.importance_score})`,
            `Analyze past appearance patterns in FAT/CAT papers`,
            `Complete a 30-minute timed mock test`,
          ],
        });
      } else {
        schedule.push({
          day,
          date: dayDate,
          focusType: 'REVISION',
          topicName: 'Comprehensive Revision & PYQs',
          allocatedHours: hoursPerDay,
          actionableTasks: [
            `Clear pending items in your spaced repetition queue`,
            `Review bookmarked and previously incorrect questions`,
          ],
        });
      }
    }

    const planId = randomUUID();
    const createdAt = new Date().toISOString();

    dbService.run(`
      INSERT INTO study_plans (
        id, user_id, title, plan_type, subject_id, exam_date,
        target_hours_per_day, schedule_json, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
    `, [
      planId, dto.userId, dto.title, dto.planType, dto.subjectId || null, dto.examDate || null,
      hoursPerDay, JSON.stringify(schedule), createdAt, createdAt
    ]);

    return this.getPlan(planId);
  }

  public getPlan(id: string) {
    const plan = dbService.get(`SELECT * FROM study_plans WHERE id = ?`, [id]);
    if (!plan) return null;

    return {
      ...plan,
      schedule: JSON.parse(plan.schedule_json || '[]'),
    };
  }

  public listUserPlans(userId: string) {
    const plans = dbService.all(`
      SELECT * FROM study_plans 
      WHERE user_id = ? 
      ORDER BY created_at DESC
    `, [userId]);

    return plans.map(p => ({
      ...p,
      schedule: JSON.parse(p.schedule_json || '[]'),
    }));
  }
}

export const studyPlansService = new StudyPlansService();
