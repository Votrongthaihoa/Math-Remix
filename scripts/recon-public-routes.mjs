import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const targetOrigin = "https://aeck.vn";
const reconRoot = "RECON";
const targetDir = join(reconRoot, "target", "public-routes");
const domPath = join(reconRoot, "dom", "public-routes-recon.json");
const networkPath = join(reconRoot, "network", "public-routes-network.json");

await mkdir(targetDir, { recursive: true });
await mkdir(join(reconRoot, "dom"), { recursive: true });
await mkdir(join(reconRoot, "network"), { recursive: true });

function normalizeInternalUrl(href, base = targetOrigin) {
  if (!href || href.startsWith("#") || /^(mailto:|tel:|javascript:)/i.test(href)) return null;
  let url;
  try {
    url = new URL(href, base);
  } catch {
    return null;
  }
  if (url.hostname !== "aeck.vn" || !/^https?:$/.test(url.protocol)) return null;
  url.hash = "";
  return `${url.pathname || "/"}${url.search}`;
}

function routeSlug(route) {
  return (route === "/" ? "home" : route)
    .replace(/^\//, "")
    .replace(/[?&=]/g, "-")
    .replace(/[^a-z0-9-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "home";
}

function sanitizedRequest(request) {
  const url = new URL(request.url());
  return {
    method: request.method(),
    resourceType: request.resourceType(),
    origin: url.origin,
    path: `${url.pathname}${url.search ? "?<query>" : ""}`,
  };
}

async function inspectPage(page, route, response) {
  return page.evaluate(({ route: expectedRoute, status }) => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
    };
    const text = (element) => (element.innerText || element.textContent || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 180);
    const measure = (element) => {
      if (!element || !visible(element)) return null;
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
        position: style.position,
        zIndex: style.zIndex,
        overflow: style.overflow,
        backgroundColor: style.backgroundColor,
        color: style.color,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        borderRadius: style.borderRadius,
      };
    };
    const toLink = (element) => ({
      href: element.getAttribute("href"),
      text: text(element),
      aria: element.getAttribute("aria-label"),
      external: element.target === "_blank",
    });
    const heading = (element) => ({ level: element.tagName.toLowerCase(), text: text(element) });
    const root = document.documentElement;
    const body = document.body;
    const header = document.querySelector("header") || document.querySelector('[class*="header"]');
    const footer = document.querySelector("footer") || document.querySelector('[class*="footer"]');
    const main = document.querySelector("main") || document.querySelector('[role="main"]');
    const links = [...document.querySelectorAll("a[href]")].filter(visible).slice(0, 120).map(toLink);
    const buttons = [...document.querySelectorAll("button,[role=button]")].filter(visible).slice(0, 80).map((element) => ({
      text: text(element),
      aria: element.getAttribute("aria-label"),
      type: element.getAttribute("type"),
      disabled: element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true",
    }));
    const controls = [...document.querySelectorAll("input,textarea,select")].filter(visible).slice(0, 40).map((element) => ({
      tag: element.tagName.toLowerCase(),
      type: element.getAttribute("type"),
      name: element.getAttribute("name"),
      placeholder: element.getAttribute("placeholder"),
      aria: element.getAttribute("aria-label"),
    }));
    return {
      expectedRoute,
      finalUrl: location.href,
      title: document.title,
      status,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      scroll: { documentHeight: root.scrollHeight, bodyHeight: body.scrollHeight, y: scrollY },
      overflow: { html: getComputedStyle(root).overflow, body: getComputedStyle(body).overflow },
      geometry: {
        header: measure(header),
        main: measure(main),
        footer: measure(footer),
        firstSection: measure(document.querySelector("section")),
      },
      headings: [...document.querySelectorAll("h1,h2,h3,h4")].filter(visible).slice(0, 60).map(heading),
      links,
      buttons,
      controls,
      bodyTextSample: text(body).slice(0, 600),
    };
  }, { route, status: response?.status() ?? null });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const requests = [];
page.on("request", (request) => {
  if (["document", "fetch", "xhr", "stylesheet", "script", "font"].includes(request.resourceType())) {
    requests.push({ route: page.url(), ...sanitizedRequest(request) });
  }
});

const homeResponse = await page.goto(`${targetOrigin}/`, { waitUntil: "domcontentloaded", timeout: 45_000 });
await page.waitForTimeout(1500);
const homepageLinks = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((element) => ({
  href: element.getAttribute("href"),
  text: (element.innerText || element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 180),
  inNav: Boolean(element.closest("header,nav,footer")),
})));

const discoveredRoutes = [...new Set(homepageLinks.map(({ href }) => normalizeInternalUrl(href)).filter(Boolean))];
if (!discoveredRoutes.includes("/")) discoveredRoutes.unshift("/");
const records = [];
const screenshots = [];

for (const route of discoveredRoutes) {
  let response = null;
  let error = null;
  try {
    response = await page.goto(new URL(route, targetOrigin).toString(), {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await page.waitForTimeout(700);
    const record = await inspectPage(page, route, response);
    records.push(record);
    const screenshotPath = join(targetDir, `${routeSlug(route)}-1440.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    screenshots.push({ route, path: screenshotPath });
  } catch (caught) {
    error = String(caught?.message || caught).slice(0, 240);
    records.push({ route, finalUrl: page.url(), error });
  }
}

await page.close();
await browser.close();

await writeFile(domPath, JSON.stringify({
  capturedAt: new Date().toISOString(),
  origin: targetOrigin,
  source: "homepage-visible-links",
  homepageLinks,
  discoveredRoutes,
  records,
  screenshots,
}, null, 2), "utf8");

const uniqueRequests = [...new Map(requests.map((request) => [
  `${request.method} ${request.origin}${request.path} ${request.resourceType}`,
  request,
])).values()];
await writeFile(networkPath, JSON.stringify({
  capturedAt: new Date().toISOString(),
  source: "public-visible-route-crawl",
  requests: uniqueRequests,
}, null, 2), "utf8");

console.log(JSON.stringify({
  discoveredRoutes,
  successfulRecords: records.filter((record) => !record.error).length,
  failedRecords: records.filter((record) => record.error).length,
  screenshots: screenshots.length,
  requestCount: uniqueRequests.length,
}, null, 2));
