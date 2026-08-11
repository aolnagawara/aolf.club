import { z } from 'zod';

const EnvSchema = z.object({
  VITE_APP_MODE: z.enum(['mock', 'api']).default('mock'),
  VITE_API_BASE_URL: z.string().optional()
});

export const env = EnvSchema.parse({
  VITE_APP_MODE: import.meta.env.VITE_APP_MODE,
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL
});
