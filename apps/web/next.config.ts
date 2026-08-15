import type { NextConfig } from 'next';
import { securityHeaders } from './src/lib/security/csp';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@zm/core', '@zm/storage', '@zm/ipc', '@zm/adapters-local'],

  async headers() {
    const mode =
      process.env.NODE_ENV === 'production' ? 'production' : 'development';
    return [
      {
        // 모든 페이지/API 응답에 보안 헤더 적용.
        //
        // Content-Security-Policy는 여기서 싣지 않는다 — 요청마다 nonce가 달라지므로
        // `src/proxy.ts`가 소유한다. 여기서도 실으면 두 값이 충돌한다.
        source: '/:path*',
        headers: securityHeaders(mode, { includeCsp: false }).map((h) => ({
          key: h.key,
          value: h.value,
        })),
      },
    ];
  },
};

export default nextConfig;
