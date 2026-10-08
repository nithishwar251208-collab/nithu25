import { randomUUID } from 'node:crypto';
import { dbService } from '../../database/db.ts';
import { hashPassword, verifyPassword, signJwt } from '../../utils/crypto.ts';
import type { UserRole, UserRecord, ProfileRecord } from '../../types/index.ts';

export interface RegisterDTO {
  email: string;
  password: string;
  name: string;
  universityId?: string;
  campusId?: string;
  departmentId?: string;
  programId?: string;
  regulationId?: string;
  semesterId?: string;
}

export interface LoginDTO {
  email: string;
  password: string;
}

export class AuthService {
  public register(dto: RegisterDTO) {
    const existing = dbService.get<UserRecord>(`SELECT * FROM users WHERE email = ?`, [dto.email.toLowerCase().trim()]);
    if (existing) {
      const err: any = new Error('A user with this email address already exists.');
      err.statusCode = 409;
      err.code = 'EMAIL_EXISTS';
      throw err;
    }

    const userId = randomUUID();
    const profileId = randomUUID();
    const now = new Date().toISOString();
    const passwordHash = hashPassword(dto.password);

    dbService.run(
      `INSERT INTO users (id, email, password_hash, auth_provider, role, is_verified, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 'local', 'STUDENT', 0, 1, ?, ?)`,
      [userId, dto.email.toLowerCase().trim(), passwordHash, now, now]
    );

    dbService.run(
      `INSERT INTO profiles (id, user_id, name, university_id, campus_id, department_id, program_id, regulation_id, semester_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        profileId,
        userId,
        dto.name.trim(),
        dto.universityId || null,
        dto.campusId || null,
        dto.departmentId || null,
        dto.programId || null,
        dto.regulationId || null,
        dto.semesterId || null,
        now,
        now,
      ]
    );

    const token = signJwt({
      userId,
      email: dto.email.toLowerCase().trim(),
      role: 'STUDENT',
    });

    return {
      token,
      user: {
        id: userId,
        email: dto.email.toLowerCase().trim(),
        role: 'STUDENT' as UserRole,
        name: dto.name.trim(),
      },
    };
  }

  public login(dto: LoginDTO) {
    const user = dbService.get<UserRecord>(`SELECT * FROM users WHERE email = ?`, [dto.email.toLowerCase().trim()]);
    if (!user || !user.password_hash) {
      const err: any = new Error('Invalid email or password.');
      err.statusCode = 401;
      err.code = 'INVALID_CREDENTIALS';
      throw err;
    }

    if (!user.is_active) {
      const err: any = new Error('Account is inactive. Please contact support.');
      err.statusCode = 403;
      err.code = 'ACCOUNT_INACTIVE';
      throw err;
    }

    const valid = verifyPassword(dto.password, user.password_hash);
    if (!valid) {
      const err: any = new Error('Invalid email or password.');
      err.statusCode = 401;
      err.code = 'INVALID_CREDENTIALS';
      throw err;
    }

    const now = new Date().toISOString();
    dbService.run(`UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?`, [now, now, user.id]);

    const profile = dbService.get<ProfileRecord>(`SELECT * FROM profiles WHERE user_id = ?`, [user.id]);

    const token = signJwt({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: profile?.name || user.email.split('@')[0],
      },
    };
  }

  public createGuestSession() {
    const guestId = randomUUID();
    const guestEmail = `guest_${guestId.slice(0, 8)}@nithu25.local`;
    const now = new Date().toISOString();

    dbService.run(
      `INSERT INTO users (id, email, password_hash, auth_provider, role, is_verified, is_active, created_at, updated_at)
       VALUES (?, ?, NULL, 'guest', 'GUEST', 1, 1, ?, ?)`,
      [guestId, guestEmail, now, now]
    );

    dbService.run(
      `INSERT INTO profiles (id, user_id, name, created_at, updated_at)
       VALUES (?, ?, 'Guest Student', ?, ?)`,
      [randomUUID(), guestId, now, now]
    );

    const token = signJwt({
      userId: guestId,
      email: guestEmail,
      role: 'GUEST',
    }, 24 * 3600); // 1 day session for guests

    return {
      token,
      user: {
        id: guestId,
        email: guestEmail,
        role: 'GUEST' as UserRole,
        name: 'Guest Student',
      },
    };
  }

  public getUserProfile(userId: string) {
    const user = dbService.get<UserRecord>(`SELECT id, email, role, is_verified, is_active, created_at FROM users WHERE id = ?`, [userId]);
    if (!user) {
      const err: any = new Error('User not found.');
      err.statusCode = 404;
      err.code = 'USER_NOT_FOUND';
      throw err;
    }

    const profile = dbService.get<ProfileRecord>(`SELECT * FROM profiles WHERE user_id = ?`, [userId]);
    return {
      ...user,
      profile: profile ? {
        ...profile,
        preferences: typeof profile.preferences === 'string' ? JSON.parse(profile.preferences) : profile.preferences,
      } : null,
    };
  }
}

export const authService = new AuthService();
