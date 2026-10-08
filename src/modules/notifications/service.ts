import { randomUUID } from 'node:crypto';
import { dbService } from '../../database/db.ts';

export class NotificationsService {
  public listNotifications(userId: string) {
    return dbService.all(`
      SELECT * FROM notifications 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT 50
    `, [userId]);
  }

  public createNotification(userId: string, title: string, message: string, type: string = 'INFO') {
    const id = randomUUID();
    const now = new Date().toISOString();
    dbService.run(`
      INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `, [id, userId, title, message, type, now]);

    return dbService.get(`SELECT * FROM notifications WHERE id = ?`, [id]);
  }

  public markAsRead(notificationId: string, userId: string) {
    dbService.run(`
      UPDATE notifications 
      SET is_read = 1 
      WHERE id = ? AND user_id = ?
    `, [notificationId, userId]);
    return { success: true };
  }
}

export const notificationsService = new NotificationsService();
