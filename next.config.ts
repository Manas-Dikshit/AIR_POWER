import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin the workspace root; a stray lockfile in the home dir confuses root inference.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
