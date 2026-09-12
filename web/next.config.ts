import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep bundled master files available to serverless admin sync routes on Vercel.
  outputFileTracingIncludes: {
    "/api/admin/yield-master/**/*": ["./data/yield-sheet.xlsx"],
  },
};

export default nextConfig;
