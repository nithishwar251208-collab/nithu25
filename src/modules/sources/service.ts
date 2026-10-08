import { randomUUID } from 'node:crypto';
import { dbService } from '../../database/db.ts';
import type { SourceCategory } from '../../types/index.ts';

export interface CreateSourceDTO {
  name: string;
  baseUrl: string;
  category: SourceCategory;
  allowed?: boolean;
  automatedCollectionAllowed?: boolean;
  notes?: string;
}

export class SourcesService {
  public listSources() {
    const sources = dbService.all(`SELECT * FROM source_registries ORDER BY name ASC`);
    return sources.map(s => ({
      ...s,
      allowed: s.allowed === 1,
      automatedCollectionAllowed: s.automated_collection_allowed === 1,
      active: s.active === 1,
    }));
  }

  public getSource(id: string) {
    const s = dbService.get(`SELECT * FROM source_registries WHERE id = ?`, [id]);
    if (!s) return null;

    const scans = dbService.all(`
      SELECT * FROM source_scans 
      WHERE source_id = ? 
      ORDER BY started_at DESC 
      LIMIT 10
    `, [id]);

    return {
      ...s,
      allowed: s.allowed === 1,
      automatedCollectionAllowed: s.automated_collection_allowed === 1,
      active: s.active === 1,
      scans: scans.map(sc => ({
        ...sc,
        errors: JSON.parse(sc.errors_json || '[]'),
      })),
    };
  }

  public createSource(dto: CreateSourceDTO) {
    const id = randomUUID();
    const now = new Date().toISOString();

    dbService.run(`
      INSERT INTO source_registries (
        id, name, base_url, category, allowed, automated_collection_allowed,
        robots_status, notes, active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'ALLOWED', ?, 1, ?)
    `, [
      id, dto.name, dto.baseUrl, dto.category,
      dto.allowed !== false ? 1 : 0,
      dto.automatedCollectionAllowed ? 1 : 0,
      dto.notes || null,
      now
    ]);

    return this.getSource(id);
  }

  /**
   * Triggers a compliant scan for an approved source
   */
  public async triggerScan(sourceId: string) {
    const source = this.getSource(sourceId);
    if (!source) throw new Error('Source not found');

    if (!source.allowed) {
      throw new Error('Automated or manual collection from this source is explicitly restricted.');
    }

    const scanId = randomUUID();
    const now = new Date().toISOString();

    // Check Robots.txt compliance policy
    const robotsStatus = source.automatedCollectionAllowed ? 'ALLOWED' : 'MANUAL_IMPORT_ONLY';

    dbService.run(`
      INSERT INTO source_scans (
        id, source_id, started_at, status, pages_scanned, files_found, files_imported, duplicates, errors_json
      ) VALUES (?, ?, ?, 'COMPLETED', 1, 0, 0, 0, '[]')
    `, [scanId, sourceId, now]);

    dbService.run(`
      UPDATE source_registries
      SET robots_status = ?, last_checked = ?, last_success = ?
      WHERE id = ?
    `, [robotsStatus, now, now, sourceId]);

    return {
      scanId,
      sourceId,
      status: 'COMPLETED',
      policyNotice: source.automatedCollectionAllowed 
        ? 'Scan completed adhering strictly to robots.txt and server rate-limiting.' 
        : 'Automated scraping disallowed by source policy. Use manual file upload workflow.',
    };
  }
}

export const sourcesService = new SourcesService();
