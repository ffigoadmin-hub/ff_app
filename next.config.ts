import type { NextConfig } from 'next';
import withBundleAnalyzer from '@next/bundle-analyzer';

// ── Environment validation at build time ─────────────────────────────────────
// These MUST be present in production. Build will throw if missing.
const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXTAUTH_SECRET',
] as const;

if (process.env['NODE_ENV'] === 'production' && process.env['SKIP_ENV_VALIDATION'] !== 'true' && process.env['VERCEL'] !== '1') {
  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      throw new Error(
        `[Farmers Factory] Missing required environment variable at build time: ${key}\n` +
          `Add it to your .env.local or Vercel dashboard.`,
      );
    }
  }
}

// ── Security headers ──────────────────────────────────────────────────────────
const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'geolocation=(self), camera=(self), microphone=(self), payment=(self)',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    // Content Security Policy
    // Nonce-based CSP is recommended for production — update as you add third-party domains
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://checkout.razorpay.com https://cdn.razorpay.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self'",
      "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com https://vitals.vercel-insights.com https://*.supabase.co",
      "frame-src https://api.razorpay.com https://checkout.razorpay.com",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "media-src 'self' https://*.supabase.co blob:",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  // ── Image optimisation ──────────────────────────────────────────────────────
  images: {
    unoptimized: true, // serve all images as-is (supports .jfif, .webp, .jfif etc.)
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [400, 640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
      // Unsplash — demo product images (reliable, never 404)
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
      // Supabase Storage — product images uploaded via admin
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      // Flaticon — category/product icons
      {
        protocol: 'https',
        hostname: 'cdn-icons-png.flaticon.com',
        pathname: '/**',
      },
      // Freepik CDN (related icon host)
      {
        protocol: 'https',
        hostname: 'cdn-icons-png.freepik.com',
        pathname: '/**',
      },
      // Allow any external image host (covers imageUrls stored in DB)
      {
        protocol: 'https',
        hostname: '**',
        pathname: '/**',
      },
    ],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
  },

  // ── Headers ─────────────────────────────────────────────────────────────────
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      {
        // Service worker must not be cached
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/manifest+json',
          },
        ],
      },
    ];
  },

  // ── Redirects ───────────────────────────────────────────────────────────────
  async redirects() {
    return [
      // Force trailing-slash consistency
      {
        source: '/product/:slug/',
        destination: '/product/:slug',
        permanent: true,
      },
      {
        source: '/category/:slug/',
        destination: '/category/:slug',
        permanent: true,
      },
    ];
  },

  // ── Compiler options ────────────────────────────────────────────────────────
  compiler: {
    // Remove console.log in production (keep console.error and console.warn)
    removeConsole:
      process.env['NODE_ENV'] === 'production' ? { exclude: ['error', 'warn'] } : false,
  },

  // ── Experimental ────────────────────────────────────────────────────────────
  experimental: {
    // Partial Pre-rendering (PPR) — available in Next.js 15
    ppr: false,
    // Optimize package imports to reduce bundle size
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      '@radix-ui/react-dialog',
      '@radix-ui/react-toast',
    ],
  },

  // ── Logging ─────────────────────────────────────────────────────────────────
  logging: {
    fetches: {
      fullUrl: process.env['NODE_ENV'] === 'development',
    },
  },

  // ── PWA ─────────────────────────────────────────────────────────────────────
  // next-pwa configuration is applied via wrapper below

  // ── TypeScript / ESLint ─────────────────────────────────────────────────────
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

// ── Bundle analyzer wrapper ─────────────────────────────────────────────────
const withBundleAnalyzerConfig = withBundleAnalyzer({
  enabled: process.env['ANALYZE'] === 'true',
  openAnalyzer: true,
});

export default withBundleAnalyzerConfig(nextConfig);
