/**
 * Node 22-compatible test-only module resolver.
 *
 * `module.registerHooks` is only available in newer Node releases. The
 * asynchronous `module.register` API is available in the repository's Node
 * 22 CI runtime, so tests that need extensionless TS imports or synthetic
 * dependency modules use this narrow resolver instead.
 */
import { register } from "node:module";

const loaderUrl = new URL("./test-loader-hooks.mjs", import.meta.url);

export async function registerTestLoader(rules) {
  register(loaderUrl, import.meta.url, { data: { rules } });
  // Loader registration is asynchronous. Let the loader worker consume its
  // initialize message before the caller performs the first dynamic import.
  await new Promise(resolve => setImmediate(resolve));
}
