// The app runs React against the DOM lib, so @cloudflare/workers-types must not
// be referenced globally: its Body/Fetcher globals shadow the DOM ones and break
// browser code such as document.body.append. Pull the binding types in by
// scoped import instead.
declare module "cloudflare:workers" {
  import type { D1Database } from "@cloudflare/workers-types";

  export const env: { DB?: D1Database };
}
