import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config();

/**
 * Environment configuration schema.
 * Enforces strict types and sensible production-grade defaults.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  // Plumware ERP upstream configuration (bounded to 8500ms for serverless platform compatibility)
  PLUMWARE_BASE_URL: z.string().url().default('https://www.imsnsit.org/imsnsit'),
  PLUMWARE_TIMEOUT_MS: z.coerce.number().int().positive().default(8500),
  PLUMWARE_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(1),
  UPSTREAM_PROXY_URL: z.string().optional(),

  // Session lifecycle parameters (strict 180s / 3-minute ephemeral TTL)
  SESSION_TTL_SECONDS: z.coerce.number().int().min(30).max(1800).default(180),
  SESSION_STORE_TYPE: z.enum(['memory', 'redis']).default('memory'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_TLS_REJECT_UNAUTHORIZED: z.string().optional().default('true'),

  // CORS and domain configuration
  CORS_ORIGIN: z.string().optional(),
  APP_URL: z.string().optional().default('https://nscognito.vercel.app'),
  VERCEL: z.string().optional(),

  // Logging and telemetry
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('FATAL: Environment configuration validation failed:');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const env = parsed.data;
export type Environment = z.infer<typeof envSchema>;
