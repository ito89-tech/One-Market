import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bundled xlsx must be available when an empty Neon DB auto-imports on first request.
  outputFileTracingIncludes: {
    "/api/admin/yield-master/**/*": ["./data/yield-sheet.xlsx"],
    "/api/master/**/*": ["./data/yield-sheet.xlsx"],
    "/api/diagnosis/**/*": ["./data/yield-sheet.xlsx"],
  },
};

export default nextConfig;
