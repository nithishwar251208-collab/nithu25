import type { UserRole, AuthTokenPayload } from '../types/index.ts';
import { verifyJwt } from '../utils/crypto.ts';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  isGuest: boolean;
}

export function extractAuthUser(authHeader?: string): AuthenticatedUser | null {
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  const token = parts[1];
  const payload = verifyJwt(token);
  if (!payload) return null;

  return {
    id: payload.userId,
    email: payload.email,
    role: payload.role,
    isGuest: payload.role === 'GUEST',
  };
}

export function requireAuth(user: AuthenticatedUser | null): AuthenticatedUser {
  if (!user) {
    const error: any = new Error('Authentication required. Missing or invalid Bearer token.');
    error.statusCode = 401;
    error.code = 'UNAUTHORIZED';
    throw error;
  }
  return user;
}

export function requireRoles(user: AuthenticatedUser | null, allowedRoles: UserRole[]): AuthenticatedUser {
  const authUser = requireAuth(user);
  if (!allowedRoles.includes(authUser.role)) {
    const error: any = new Error(`Forbidden: Insufficient privileges. Required role: ${allowedRoles.join(' or ')}`);
    error.statusCode = 403;
    error.code = 'FORBIDDEN';
    throw error;
  }
  return authUser;
}

export function requireAdmin(user: AuthenticatedUser | null): AuthenticatedUser {
  return requireRoles(user, ['ADMIN', 'SUPER_ADMIN']);
}

export function requireSuperAdmin(user: AuthenticatedUser | null): AuthenticatedUser {
  return requireRoles(user, ['SUPER_ADMIN']);
}
