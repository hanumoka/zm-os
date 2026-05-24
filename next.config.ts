import type { NextConfig } from 'next';
import { securityHeaders } from './src/lib/security/csp';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  async headers() {
    const mode =
      process.env.NODE_ENV === 'production' ? 'production' : 'development';
    return [
      {
        // 모든 페이지/API 응답에 보안 헤더 적용
        source: '/:path*',
        headers: securityHeaders(mode).map((h) => ({
          key: h.key,
          value: h.value,
        })),
      },
    ];
  },
};

export default nextConfig;
