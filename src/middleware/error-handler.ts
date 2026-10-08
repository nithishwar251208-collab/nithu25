import type { ApiErrorResponse } from '../types/index.ts';
import { logger } from '../utils/logger.ts';
import { config } from '../config/index.ts';

export function formatErrorResponse(error: any, requestId?: string): { statusCode: number; body: ApiErrorResponse } {
  const statusCode = error.statusCode || (error.status ? Number(error.status) : 500);
  const code = error.code || (statusCode === 404 ? 'NOT_FOUND' : statusCode === 401 ? 'UNAUTHORIZED' : statusCode === 403 ? 'FORBIDDEN' : 'INTERNAL_SERVER_ERROR');
  
  // Mask internal database/system stack trace in production
  let message = error.message || 'An unexpected error occurred';
  if (statusCode === 500 && config.isProduction) {
    message = 'An internal server error occurred. Please try again later.';
  }

  logger.error(`Request failed: ${message}`, error, { requestId, statusCode, code });

  return {
    statusCode,
    body: {
      success: false,
      error: {
        code,
        message,
        details: error.details || undefined,
      },
    },
  };
}
