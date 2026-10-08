import { config } from '../config/index.ts';

function matchesPattern(pattern: string, origin: string): boolean {
  if (pattern === '*' || pattern === origin) return true;
  if (pattern.includes('*')) {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`, 'i').test(origin);
  }
  return false;
}

export function getCorsHeaders(requestOrigin?: string): Record<string, string> {
  let origin = '*';
  
  if (config.corsOrigin !== '*') {
    const allowedPatterns = config.corsOrigin.split(',').map(s => s.trim());
    if (requestOrigin && allowedPatterns.some(p => matchesPattern(p, requestOrigin))) {
      origin = requestOrigin;
    } else {
      origin = allowedPatterns[0] || '*';
    }
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Range',
    'Access-Control-Expose-Headers': 'Content-Range, X-Total-Count',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

