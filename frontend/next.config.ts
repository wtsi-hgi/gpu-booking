import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  distDir: process.env.GPU_BOOKING_NEXT_DIST_DIR ?? process.env.NEXT_DIST_DIR ?? '.next',
  // Enable React strict mode for better development experience
  reactStrictMode: true,
}

export default nextConfig
