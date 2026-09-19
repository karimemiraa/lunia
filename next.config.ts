import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // Media uploads (uploadMedia server action) accept up to 25MB; Server
    // Actions otherwise cap the request body at 1MB, which made every real
    // photo/video upload fail with "a server error occurred". 30MB leaves
    // headroom above the app's 25MB cap for multipart overhead.
    serverActions: {
      bodySizeLimit: "30mb",
    },
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
