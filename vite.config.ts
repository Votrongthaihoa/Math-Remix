import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  // The custom Worker entry uses these bindings for vinext's image route.
  // Keep them available in local Miniflare as well as in the deployed Worker;
  // R2 uploads are configured separately through the S3-compatible env vars.
  assets: {
    directory: "dist/client",
    not_found_handling: "none" as const,
    binding: "ASSETS",
  },
  images: {
    binding: "IMAGES",
  },
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async ({ command }) => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  // The local Workerd runner cannot make outbound Supabase calls in this
  // sandbox, while vinext's Node dev server can. Keep the Worker runtime for
  // production builds and allow it explicitly for local Worker debugging.
  const useCloudflareRuntime = command === "build"
    || process.env.NODE_ENV === "production"
    || process.env.VINEXT_CLOUDFLARE_DEV === "1";
  const plugins = [vinext(), sites()];
  if (useCloudflareRuntime) {
    const { cloudflare } = await import("@cloudflare/vite-plugin");
    plugins.push(cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      config: localBindingConfig,
    }));
  }

  return {
    envPrefix: ["VITE_", "NEXT_PUBLIC_"],
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins,
  };
});
