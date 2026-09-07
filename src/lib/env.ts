import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url().or(z.string().startsWith("postgres")),
  REDIS_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  APP_URL: z.string().url().or(z.string().startsWith("http")),
  NODE_ENV: z.string().default("development"),
});

export type Env = z.infer<typeof schema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  return schema.parse(source);
}

let cached: Env | null = null;
export function getEnv(): Env {
  if (!cached) cached = parseEnv(process.env as Record<string, string | undefined>);
  return cached;
}
