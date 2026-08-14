import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // ESLint isn't part of this project's toolchain (we rely on `tsc --noEmit`).
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;