/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly NEXT_PUBLIC_SUPABASE_URL?: string;
  readonly NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_USE_MOCK_SESSION?: string;
  readonly VITE_PREVIEW_ROLE?: "student" | "admin" | "ctv";
  readonly VITE_LEGACY_APP_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __AECK_PREVIEW_DATA__: boolean;
