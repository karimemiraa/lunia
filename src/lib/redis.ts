import Redis from "ioredis";
import { getEnv } from "@/lib/env";

let client: Redis | null = null;
export function getRedis(): Redis {
  if (!client) client = new Redis(getEnv().REDIS_URL);
  return client;
}
