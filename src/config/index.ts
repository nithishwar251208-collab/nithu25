import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Parse .env file only in development (not when env vars are already injected by host)
function loadEnv() {
  const envPath = resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    try {
      const content = readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim();
          // Never overwrite values already set by the environment (allows host-injected vars to win)
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    } catch {
      // Ignore .env read errors
    }
  }
}

loadEnv();

const isProduction = process.env.NODE_ENV === 'production';
const DEV_JWT_DEFAULT = 'dev-jwt-secret-key-nithu25-production-ready-2026';
const jwtSecret = process.env.JWT_SECRET || DEV_JWT_DEFAULT;
const corsOrigin = process.env.CORS_ORIGIN || (isProduction ? '' : '*');
const aiProvider = process.env.AI_PROVIDER || 'mock_safe_dev';
const aiApiKey = process.env.AI_API_KEY || '';

// Production safety checks (logged at startup, not thrown so server still starts)
if (isProduction) {
  if (jwtSecret === DEV_JWT_DEFAULT) {
    console.warn('[SECURITY WARNING] JWT_SECRET is using the default development value in production. Set a strong random secret.');
  }
  if (!corsOrigin || corsOrigin === '*') {
    console.warn('[SECURITY WARNING] CORS_ORIGIN is not set or is "*" in production. Set specific allowed origins.');
  }
  if (aiProvider !== 'mock_safe_dev' && !aiApiKey) {
    console.warn('[CONFIG WARNING] AI_PROVIDER is set but AI_API_KEY is empty. AI endpoints will return configuration errors.');
  }
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  // Bind to 0.0.0.0 so Railway, cloud containers, and external interfaces accept incoming requests
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction,
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  corsOrigin: corsOrigin || '*',

  database: {
    url: process.env.DATABASE_URL || 'file:./nithu25.db',
    // Detect whether we are using embedded SQLite vs external PostgreSQL
    isPostgres: (process.env.DATABASE_URL || '').startsWith('postgresql') || (process.env.DATABASE_URL || '').startsWith('postgres'),
  },

  jwt: {
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  redis: {
    url: process.env.REDIS_URL || '',
    // Redis is optional; features degrade gracefully when not configured
    isConfigured: !!(process.env.REDIS_URL && process.env.REDIS_URL !== 'redis://localhost:6379'),
  },

  ai: {
    provider: aiProvider,
    apiKey: aiApiKey,
    baseUrl: process.env.AI_API_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.AI_MODEL || 'gpt-4o-mini',
    embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    embeddingDimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '1536', 10),
    // isConfigured means a real AI provider with a key is ready
    isConfigured: aiProvider !== 'mock_safe_dev' && aiApiKey.length > 0,
  },

  storage: {
    driver: process.env.STORAGE_DRIVER || 'local',
    url: process.env.STORAGE_URL || 'http://localhost:3000/uploads',
    bucket: process.env.STORAGE_BUCKET || 'nithu25-pyqs',
    localDir: resolve(process.cwd(), 'uploads'),
  },

  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX || '200', 10),
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  },
} as const;
