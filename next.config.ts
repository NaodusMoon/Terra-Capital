import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
const scriptSrc = isProd
  ? "script-src 'self' 'unsafe-inline'"
  : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "font-src 'self' https://fonts.gstatic.com data:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'self' https://albedo.link https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: data:",
  "object-src 'none'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "connect-src 'self' https://horizon-testnet.stellar.org https://horizon.stellar.org https://albedo.link https://relay.walletconnect.org https://rpc.walletconnect.org https://pulse.walletconnect.org https://api.web3modal.org https://secure.walletconnect.org https://secure-mobile.walletconnect.com https://secure-mobile.walletconnect.org https://*.walletconnect.com https://*.walletconnect.org https://*.web3modal.org https://*.web3modal.com https://*.reown.com wss://relay.walletconnect.org wss://*.walletconnect.com wss://*.walletconnect.org",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: csp,
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "off",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
