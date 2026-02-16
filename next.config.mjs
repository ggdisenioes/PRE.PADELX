/** @type {import('next').NextConfig} */
const nextConfig = {
  // Mantenemos la optimización de imágenes
  images: {
    unoptimized: true,
  },

  // Mantenemos ignorar errores de TypeScript (esto sí suele permitirse)
  typescript: {
    ignoreBuildErrors: true,
  },

  // 🔒 SECURITY HARDENING
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // HTTPS Enforcement
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          // Prevent clickjacking
          { key: 'X-Frame-Options', value: 'DENY' },
          // Prevent MIME sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // XSS Protection
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          // Referrer policy
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // ✅ IMPROVED CSP: Removed 'unsafe-eval', kept 'unsafe-inline' for Next.js compatibility
          // Note: For production with nonces, use middleware-based CSP (requires more setup)
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https: https://*.supabase.co",
              "font-src 'self' data: https://fonts.googleapis.com",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
              "frame-ancestors 'self'",
              "base-uri 'self'",
              "form-action 'self'",
              "upgrade-insecure-requests",
            ].join('; ')
          },
          // Permissions policy
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(), microphone=(), camera=(), payment=()'
          },
        ],
      },
    ];
  },
};

export default nextConfig;