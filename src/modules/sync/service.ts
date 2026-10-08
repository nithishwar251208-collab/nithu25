import { randomUUID } from 'node:crypto';
import { dbService } from '../../database/db.ts';
import { revisionService } from '../revision/service.ts';
import { practiceService } from '../practice/service.ts';

export interface SyncEntityPayload {
  entityType: 'REVISION' | 'BOOKMARK' | 'PRACTICE_ATTEMPT' | 'STUDY_PLAN' | 'NOTE';
  entityId: string;
  clientVersion: number;
  data: Record<string, any>;
  updatedAt: string;
}

export interface SyncRequestDTO {
  userId: string;
  lastSyncTimestamp?: string;
  changes: SyncEntityPayload[];
}

export class SyncService {
  /**
   * Processes PWA offline batch synchronization with conflict resolution
   */
  public async syncOfflineData(dto: SyncRequestDTO) {
    const processed: any[] = [];
    const conflicts: any[] = [];
    const now = new Date().toISOString();

    for (const item of dto.changes) {
      const syncId = randomUUID();

      if (item.entityType === 'REVISION' || item.entityType === 'BOOKMARK') {
        const questionId = item.data.questionId || item.entityId;
        const existing = dbService.get(
          `SELECT * FROM revision_items WHERE user_id = ? AND question_id = ?`,
          [dto.userId, questionId]
        );

        if (existing) {
          // Check conflict based on timestamps
          const serverTime = new Date(existing.created_at).getTime();
          const clientTime = new Date(item.updatedAt).getTime();

          if (clientTime < serverTime) {
            // Client data is older than server data: conflict!
            conflicts.push({
              entityType: item.entityType,
              entityId: item.entityId,
              serverData: existing,
              resolution: 'SERVER_WINS',
            });
            continue;
          }
        }

        // Apply update
        revisionService.addOrUpdate({
          userId: dto.userId,
          questionId,
          isBookmarked: item.data.isBookmarked,
          isImportant: item.data.isImportant,
        });

        processed.push({
          entityType: item.entityType,
          entityId: item.entityId,
          status: 'APPLIED',
        });

        dbService.run(`
          INSERT INTO sync_logs (
            id, user_id, entity_type, entity_id, client_version,
            server_version, sync_action, had_conflict, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'UPSERT', 0, ?)
        `, [syncId, dto.userId, item.entityType, item.entityId, item.clientVersion, item.clientVersion + 1, now]);
      } else {
        processed.push({
          entityType: item.entityType,
          entityId: item.entityId,
          status: 'ACKNOWLEDGED',
        });
      }
    }

    return {
      syncedAt: now,
      appliedCount: processed.length,
      conflictsCount: conflicts.length,
      processed,
      conflicts,
    };
  }
}

export const syncService = new SyncService();
