import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  define: {
    __AECK_PREVIEW_DATA__: JSON.stringify(
      process.env.CLOUDFLARE_ENV === "preview",
    ),
  },
  plugins: [
    react(),
    tailwindcss(),
    cloudflare({ configPath: "./wrangler.jsonc" }),
  ],
});
