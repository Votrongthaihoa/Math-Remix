import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("alpha reference portal CSS is scoped and keeps the protected exam boundary", async () => {
  const css = await readFile(new URL("../app/alpha-reference-portal.css", import.meta.url), "utf8");

  assert.ok(css.includes(".ui-shell.student-app.product-shell.alpha-reference-surface"));
  assert.ok(css.includes(".ui-shell.admin-app.product-shell.alpha-reference-surface"));
  assert.ok(css.includes("--alpha-green: #158a39"));
  assert.ok(css.includes(".alpha-dashboard-summary"));
  assert.ok(css.includes(".alpha-dashboard-resource-grid"));
  assert.ok(css.includes("@media (max-width: 767px)"));
  assert.ok(!css.includes(".exam-shell"));
  assert.ok(!css.includes(".exam-room"));
});

test("collapsed alpha rail keeps the sidebar toggle beside the compact rail", async () => {
  const css = await readFile(new URL("../app/alpha-reference-portal.css", import.meta.url), "utf8");
  const compactCss = css.replace(/\s+/g, " ");

  assert.match(compactCss, /\.ui-shell\.student-app\.product-shell\.alpha-reference-surface:not\(\.sidebar-expanded\) \.header-sidebar-toggle, \.ui-shell\.admin-app\.product-shell\.alpha-reference-surface:not\(\.sidebar-expanded\) \.header-sidebar-toggle \{[^}]*inset-inline-start: 92px/);
});

test("admin alpha rail has a project-owned compact logo variant", async () => {
  const platform = await readFile(new URL("../app/platform.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/alpha-reference-portal.css", import.meta.url), "utf8");

  assert.match(platform, /className="mobile-sidebar-logo[^\"]*mobile-sidebar-logo-full"[\s\S]*src="\/logo_aeck\.svg"/);
  assert.match(platform, /className="mobile-sidebar-logo[^\"]*mobile-sidebar-logo-compact"[\s\S]*src="\/logo_aeck_compact\.svg"/);
  assert.match(css, /\.ui-shell\.student-app\.product-shell\.alpha-reference-surface \.mobile-sidebar-logo-compact,[\s\S]*?\.ui-shell\.admin-app\.product-shell\.alpha-reference-surface \.mobile-sidebar-logo-compact\s*\{[\s\S]*?display:\s*none/);
  assert.match(css, /\.ui-shell\.admin-app\.product-shell\.alpha-reference-surface:not\(\.sidebar-expanded\)[\s\S]*?\.mobile-sidebar-logo-compact/);
});

test("alpha topbar remains a full-bleed shell while content honors the rail", async () => {
  const css = await readFile(new URL("../app/alpha-reference-portal.css", import.meta.url), "utf8");
  const compactCss = css.replace(/\s+/g, " ");

  assert.match(compactCss, /\.ui-shell\.student-app\.product-shell\.alpha-reference-surface:not\(\.sidebar-expanded\) > \.topbar, \.ui-shell\.admin-app\.product-shell\.alpha-reference-surface:not\(\.sidebar-expanded\) > \.topbar \{[^}]*margin-inline-start: 0 !important[^}]*width: 100%/);
  assert.match(compactCss, /\.ui-shell\.student-app\.product-shell\.alpha-reference-surface:not\(\.sidebar-expanded\) > \.main-content, \.ui-shell\.admin-app\.product-shell\.alpha-reference-surface:not\(\.sidebar-expanded\) > \.main-content \{[^}]*margin-inline-start: 80px/);
});

test("mobile alpha header preserves the full project logo beside its actions", async () => {
  const css = await readFile(new URL("../app/alpha-reference-portal.css", import.meta.url), "utf8");
  const compactCss = css.replace(/\s+/g, " ");

  assert.match(compactCss, /\.ui-shell\.student-app\.product-shell\.alpha-reference-surface \.header-brand, \.ui-shell\.admin-app\.product-shell\.alpha-reference-surface \.header-brand \{[^}]*flex: 1 1 auto[^}]*min-width: 0/);
  assert.match(compactCss, /\.ui-shell\.student-app\.product-shell\.alpha-reference-surface \.header-brand-logo-full, \.ui-shell\.admin-app\.product-shell\.alpha-reference-surface \.header-brand-logo-full \{[^}]*object-fit: contain/);
});

test("alpha reference layer is the single semantic token contract for optimized product routes", async () => {
  const css = await readFile(new URL("../app/alpha-reference-portal.css", import.meta.url), "utf8");

  assert.match(css, /--alpha-accent:\s*#158a39/);
  assert.match(css, /--alpha-control-height:\s*40px/);
  assert.match(css, /--alpha-field-height:\s*44px/);
  assert.match(css, /--alpha-card-radius:\s*16px/);
  assert.match(css, /--aeck-primary:\s*var\(--alpha-accent\)/);
  assert.match(css, /--admin-primary:\s*var\(--alpha-accent\)/);
  assert.match(css, /--product-blue:\s*var\(--alpha-accent\)/);
  assert.match(css, /--reference-accent:\s*var\(--alpha-accent\)/);
  assert.match(css, /--ui-info:\s*var\(--alpha-accent\)/);
});

test("legacy token aliases cannot leak from optimized content into chrome-only exam catalogs", async () => {
  const css = await readFile(new URL("../app/alpha-reference-portal.css", import.meta.url), "utf8");
  const aliasBlock = css.match(/\/\* Compatibility bridge:[\s\S]*?\n\}/)?.[0] ?? "";

  assert.ok(aliasBlock);
  assert.match(css, /\.alpha-reference-surface\.ui-optimized-surface\s*\{\s*\/\* Compatibility bridge:/);
  assert.doesNotMatch(aliasBlock, /exam-|question-|answer-|result-|review-|solution-/i);
});

test("the shared product design system is loaded last and stays outside protected UI", async () => {
  const [platform, css] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/product-design-system.css", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /import "\.\/alpha-reference-portal\.css";\s*import "\.\/product-design-system\.css";/);
  assert.match(css, /\.ui-shell\.student-app\.product-shell\.alpha-reference-surface/);
  assert.match(css, /\.ui-shell\.admin-app\.product-shell\.alpha-reference-surface/);
  assert.match(css, /--alpha-control-height/);
  assert.match(css, /:focus-visible/);
  assert.doesNotMatch(css, /\.exam-shell|\.exam-room|\.question-bank|\.admin-exam-|\.guest-exam/);
  assert.doesNotMatch(css, /(^|\n)\s*(?:button|input|textarea|select|svg|body|h1)\s*[{,]/m);
});

test("DESIGN.md documents the same Alpha contract enforced by CSS", async () => {
  const design = await readFile(new URL("../DESIGN.md", import.meta.url), "utf8");

  assert.match(design, /version:\s*"alpha-portal-1"/);
  assert.match(design, /primary:\s*"#158A39"/);
  assert.match(design, /primary-soft:\s*"#EFFBF2"/);
  assert.match(design, /controlHeight:\s*40px/);
  assert.match(design, /fieldHeight:\s*44px/);
  assert.match(design, /card:\s*16px/);
  assert.match(design, /contentMax:\s*1516px/);
  assert.match(design, /publicAuth:[\s\S]*?source:\s*"https:\/\/account\.aeck\.vn\/login"/);
  assert.match(design, /publicAuth:[\s\S]*?accent:\s*"#CD1627"/);
  assert.match(design, /publicAuth:[\s\S]*?cardWidth:\s*448px/);
  assert.match(design, /Protected assignment, question, answer, result, review, and authoring surfaces remain outside this contract/);
});

test("account authentication has one final isolated visual source", async () => {
  const [platform, productCss, accountCss] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/product-design-system.css", import.meta.url), "utf8"),
    readFile(new URL("../app/account-auth-reference.css", import.meta.url), "utf8"),
  ]);

  assert.ok((platform.match(/className="login-project-logo"/g) ?? []).length >= 3);
  assert.ok((platform.match(/src="\/logo_aeck(?:_full)?\.svg"/g) ?? []).length >= 6);
  assert.doesNotMatch(platform, /<span>R<\/span>/);
  assert.doesNotMatch(platform, /import "\.\/auth-ui-v2\.css"/);
  assert.doesNotMatch(productCss, /\.login-page\.ui-auth-surface/);
  assert.match(accountCss, /\.login-page\.ui-auth-surface\.account-auth-reference \.login-project-logo/);
  assert.match(accountCss, /\.login-page\.ui-auth-surface\.account-auth-reference \.primary-btn/);
});

test("public login follows the measured account.aeck.vn composition without changing auth behavior", async () => {
  const [platform, css] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/account-auth-reference.css", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /import "\.\/product-design-system\.css";\s*import "\.\/account-auth-reference\.css";/);
  assert.match(platform, /className="login-page ui-auth-surface auth-public-refresh account-auth-reference"/);
  assert.match(platform, /src="\/logo_aeck_full\.svg"/);
  assert.match(platform, /Bạn chưa có tài khoản\?/);
  assert.match(platform, /href="https:\/\/account\.aeck\.vn\/signup"/);
  assert.match(platform, /<TurnstileChallenge action="login"/);
  assert.doesNotMatch(platform, /function AuthAside/);

  assert.match(css, /--account-accent:\s*#cd1627/);
  assert.match(css, /url\("\/thi-tsa-bg\.jpg"\)/);
  assert.match(css, /width:\s*min\(448px, calc\(100% - 32px\)\)/);
  assert.match(css, /padding:\s*40px 32px 32px/);
  assert.match(css, /border-radius:\s*12px/);
  assert.match(css, /min-height:\s*50px/);
  assert.match(css, /\.login-signup-link\s*\{[\s\S]*?text-decoration:\s*underline/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.doesNotMatch(css, /\.exam-shell|\.exam-room|\.question-bank|\.guest-exam/);
});

test("the explicit login route resolves to the same account reference surface", async () => {
  const [catchAll, routeMode] = await Promise.all([
    readFile(new URL("../app/[...slug]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui-route-mode.ts", import.meta.url), "utf8"),
  ]);

  assert.match(catchAll, /staticRoutes = new Set\(\[[^\]]*"login"/);
  assert.match(routeMode, /OPTIMIZED_CONTENT_ROUTES = new Set\(\[[^\]]*"\/login"/);
});

test("auth route changes never leave the password visibly exposed", async () => {
  const platform = await readFile(new URL("../app/platform.tsx", import.meta.url), "utf8");

  assert.match(platform, /useEffect\(\(\) => \{[\s\S]*?setShowPassword\(false\);[\s\S]*?setAuthMode\(pathname === "\/forgot-password"/);
});
