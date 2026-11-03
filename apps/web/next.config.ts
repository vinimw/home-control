import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@home-control/shared'],
  // Self-contained server output for the Docker image.
  output: 'standalone',
  // Trace files from the monorepo root so workspace packages are included.
  outputFileTracingRoot: new URL('../..', import.meta.url).pathname,
};

export default nextConfig;
