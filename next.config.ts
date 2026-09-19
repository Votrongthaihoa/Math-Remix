import type { NextConfig } from "next";

function configuredRealtimeConnectSource() {
  const value = process.env.NEXT_PUBLIC_REALTIME_URL?.trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    if (!["ws:", "wss:", "http:", "https:"].includes(url.protocol)) return "";
    if (url.hostname === "aeck.vn" || url.hostname.endsWith(".aeck.vn")) return "";
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

function configuredSupabaseConnectSource() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    // The normal hosted project is already covered by the wildcard below.
    // Keep an explicitly configured non-hosted origin available for local
    // synthetic/auth test builds without broadening the production policy.
    if (url.hostname === "supabase.co" || url.hostname.endsWith(".supabase.co")) return "";
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

const realtimeConnectSource = configuredRealtimeConnectSource();
const supabaseConnectSource = configuredSupabaseConnectSource();

const nextConfig: NextConfig = {
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://cdn.vidstack.io https://cdn.jsdelivr.net",
            "style-src 'self' 'unsafe-inline' https://cdn.vidstack.io",
            "font-src 'self' data:",
            "img-src 'self' data: blob: https:",
            "media-src 'self' blob: https:",
            "worker-src 'self' blob: https://cdn.jsdelivr.net",
            `connect-src 'self' https://*.supabase.co https://api.mathremix.pro.vn${supabaseConnectSource ? ` ${supabaseConnectSource}` : ""}${realtimeConnectSource ? ` ${realtimeConnectSource}` : ""}`,
            "frame-src 'self' https://challenges.cloudflare.com https://media.mathremix.pro.vn https://www.youtube-nocookie.com",
            "frame-ancestors 'self'",
          ].join("; "),
        },
      ],
    }];
  },
  turbopack: {
    rules: {
      "*.tex": {
        loaders: ["./loaders/raw-text-loader.cjs"],
        as: "*.js",
      },
    },
  },
  webpack(config) {
    config.module.rules.push({ test: /\.tex$/i, type: "asset/source" });
    return config;
  },
};

export default nextConfig;
