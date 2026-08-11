import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
