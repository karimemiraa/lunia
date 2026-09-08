import type { MetadataRoute } from "next";
import { getEnv } from "@/lib/env";

function baseUrl(): string {
  try {
    return getEnv().APP_URL.replace(/\/$/, "");
  } catch {
    return "http://localhost:3000";
  }
}

export default function robots(): MetadataRoute.Robots {
  const base = baseUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
