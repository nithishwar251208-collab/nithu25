import { dbService } from '../../database/db.ts';
import type { ProfileRecord, UserRecord } from '../../types/index.ts';

export interface UpdateProfileDTO {
  name?: string;
  universityId?: string;
  campusId?: string;
  departmentId?: string;
  programId?: string;
  regulationId?: string;
  semesterId?: string;
  preferences?: Record<string, any>;
}

export class UsersService {
  public updateProfile(userId: string, dto: UpdateProfileDTO) {
    const existing = dbService.get<ProfileRecord>(`SELECT * FROM profiles WHERE user_id = ?`, [userId]);
    const now = new Date().toISOString();

    if (!existing) {
      const err: any = new Error('Profile not found.');
      err.statusCode = 404;
      err.code = 'PROFILE_NOT_FOUND';
      throw err;
    }

    const name = dto.name !== undefined ? dto.name : existing.name;
    const universityId = dto.universityId !== undefined ? dto.universityId : existing.university_id;
    const campusId = dto.campusId !== undefined ? dto.campusId : existing.campus_id;
    const departmentId = dto.departmentId !== undefined ? dto.departmentId : existing.department_id;
    const programId = dto.programId !== undefined ? dto.programId : existing.program_id;
    const regulationId = dto.regulationId !== undefined ? dto.regulationId : existing.regulation_id;
    const semesterId = dto.semesterId !== undefined ? dto.semesterId : existing.semester_id;
    const preferences = dto.preferences !== undefined ? JSON.stringify(dto.preferences) : existing.preferences;

    dbService.run(
      `UPDATE profiles
       SET name = ?, university_id = ?, campus_id = ?, department_id = ?, program_id = ?, regulation_id = ?, semester_id = ?, preferences = ?, updated_at = ?
       WHERE user_id = ?`,
      [name, universityId, campusId, departmentId, programId, regulationId, semesterId, preferences, now, userId]
    );

    return dbService.get<ProfileRecord>(`SELECT * FROM profiles WHERE user_id = ?`, [userId]);
  }

  public listUsers(limit: number = 50, offset: number = 0) {
    const users = dbService.all<UserRecord>(
      `SELECT u.id, u.email, u.role, u.is_verified, u.is_active, u.created_at, u.last_login_at, p.name
       FROM users u
       LEFT JOIN profiles p ON u.id = p.user_id
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    const countRow = dbService.get<{ count: number }>(`SELECT COUNT(*) as count FROM users`);
    return {
      items: users,
      total: countRow?.count || 0,
      limit,
      offset,
    };
  }
}

export const usersService = new UsersService();
