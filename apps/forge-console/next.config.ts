import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // No transpilePackages needed for library-based consumption
  transpilePackages: [],
  // output: 'standalone',
  reactStrictMode: true,
  allowedDevOrigins: ['127.0.0.1', 'localhost', '172.16.0.2'],
};

export default nextConfig;
