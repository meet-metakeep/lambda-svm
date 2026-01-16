import type { NextConfig } from "next";

/**
 * Next.js configuration for Solana Lambda Test
 * Using Turbopack (Next.js 16 default) with webpack fallback configuration
 */
const nextConfig: NextConfig = {
  // Empty turbopack config to acknowledge Turbopack usage and silence warnings
  turbopack: {},
  
  webpack: (config, { isServer }) => {
    // Add fallbacks for Node.js modules not available in browser
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      };
    }
    
    return config;
  },
};

export default nextConfig;
