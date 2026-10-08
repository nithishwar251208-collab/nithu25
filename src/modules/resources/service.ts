import { randomUUID } from 'node:crypto';
import { dbService } from '../../database/db.ts';

export interface EducationalResourceDTO {
  title: string;
  url: string;
  description?: string;
  sourceDomain: string;
  resourceType: 'SYLLABUS' | 'TEXTBOOK' | 'LECTURE' | 'OFFICIAL_SITE' | 'REPOSITORY';
  relevance?: number;
  isVerified?: boolean;
}

export class ResourcesService {
  /**
   * Searches verified educational resources matching keywords
   */
  public searchResources(query?: string, limit: number = 20) {
    let sql = `SELECT * FROM educational_resources WHERE is_verified = 1`;
    const params: any[] = [];

    if (query) {
      sql += ` AND (title LIKE ? OR description LIKE ? OR source_domain LIKE ?)`;
      params.push(`%${query}%`, `%${query}%`, `%${query}%`);
    }

    sql += ` ORDER BY relevance DESC, created_at DESC LIMIT ?`;
    params.push(limit);

    return dbService.all(sql, params);
  }

  /**
   * Register a verified educational resource (Official / Educational domains only)
   */
  public registerResource(dto: EducationalResourceDTO) {
    // Validate domain credibility
    const approvedDomains = ['.edu', '.ac.in', '.org', 'vit.ac.in', 'nptel.ac.in', 'swayam.gov.in'];
    const isDomainApproved = approvedDomains.some(d => dto.sourceDomain.toLowerCase().includes(d));

    const id = randomUUID();
    const now = new Date().toISOString();

    dbService.run(`
      INSERT INTO educational_resources (
        id, title, url, description, source_domain, resource_type, relevance, is_verified, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, dto.title, dto.url, dto.description || null,
      dto.sourceDomain, dto.resourceType,
      dto.relevance || (isDomainApproved ? 0.95 : 0.8),
      dto.isVerified !== undefined ? (dto.isVerified ? 1 : 0) : (isDomainApproved ? 1 : 0),
      now
    ]);

    return dbService.get(`SELECT * FROM educational_resources WHERE id = ?`, [id]);
  }
}

export const resourcesService = new ResourcesService();
