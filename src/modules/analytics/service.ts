import { randomUUID } from 'node:crypto';
import { dbService } from '../../database/db.ts';

export class AnalyticsService {
  public trackEvent(eventType: string, userId?: string, metadata?: Record<string, any>) {
    const id = randomUUID();
    const now = new Date().toISOString();
    dbService.run(`
      INSERT INTO analytics_events (id, event_type, user_id, meta_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `, [id, eventType, userId || null, JSON.stringify(metadata || {}), now]);
    return { recorded: true };
  }

  public getEventSummary() {
    return dbService.all(`
      SELECT event_type, COUNT(*) as count 
      FROM analytics_events 
      GROUP BY event_type 
      ORDER BY count DESC
    `);
  }
}

export const analyticsService = new AnalyticsService();
