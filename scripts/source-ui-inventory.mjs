import { chromium } from "playwright";
import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const sourceRoot = process.argv[2] ?? "D:/fbbbbbbbbbbbbb";
const outputPath = process.argv[3] ?? "audit/source-ui-inventory.json";

const directoryEntries = await readdir(sourceRoot);
const sourceFiles = [];

for (const directory of directoryEntries) {
  const directoryPath = path.join(sourceRoot, directory);
  if (!(await stat(directoryPath)).isDirectory()) continue;
  for (const name of await readdir(directoryPath)) {
    if (name.toLowerCase().endsWith(".htm")) sourceFiles.push(path.join(directoryPath, name));
  }
}

sourceFiles.sort();

const browser = await chromium.launch({ headless: true });
const pages = [];

for (const sourceFile of sourceFiles) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`file:///${sourceFile.replaceAll("\\", "/")}`, { waitUntil: "domcontentloaded" });
  const pageInventory = await page.evaluate(() => {
    const normalize = (value) => (value ?? "").replace(/\s+/g, " ").trim();
    const text = (element) => normalize(element?.innerText).slice(0, 500);
    const describe = (element) => element
      ? {
          tag: element.tagName.toLowerCase(),
          className: normalize(typeof element.className === "string" ? element.className : ""),
          text: text(element).slice(0, 160),
        }
      : null;
    const imageSources = [...document.images].map((image) => image.getAttribute("src")).filter(Boolean);
    const css = [...document.querySelectorAll("style")].map((style) => style.textContent ?? "").join("\n");
    const breakpoints = [...css.matchAll(/@media\s*\((?:min|max)-width:\s*([^)]+)\)/g)].map((match) => match[0]);
    const colorValues = [...new Set([...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((match) => match[0].toLowerCase()))];
    const fontFamilies = [...new Set([...css.matchAll(/font-family:\s*([^;}]+)/g)].map((match) => normalize(match[1])))];

    return {
      title: document.title,
      body: describe(document.body),
      root: describe(document.querySelector("#root")?.firstElementChild),
      shell: describe(document.querySelector("#root .min-h-screen, #root .min-h-dvh, #root .App")),
      sidebar: describe(document.querySelector("aside")),
      topbar: describe(document.querySelector("header")),
      main: describe(document.querySelector("main")),
      headings: [...document.querySelectorAll("h1,h2,h3")].map(text).filter(Boolean).slice(0, 30),
      navigation: [...document.querySelectorAll("nav a, nav button")].map(text).filter(Boolean).slice(0, 50),
      buttons: [...document.querySelectorAll("button")].map(text).filter(Boolean).slice(0, 40),
      landmarks: {
        aside: document.querySelectorAll("aside").length,
        header: document.querySelectorAll("header").length,
        main: document.querySelectorAll("main").length,
        nav: document.querySelectorAll("nav").length,
        dialog: document.querySelectorAll('[role="dialog"],dialog,.ant-modal').length,
        table: document.querySelectorAll("table").length,
        form: document.querySelectorAll("form").length,
      },
      styles: {
        count: document.querySelectorAll("style").length,
        characters: css.length,
        breakpoints: [...new Set(breakpoints)].sort(),
        colors: colorValues.slice(0, 160),
        fontFamilies: fontFamilies.slice(0, 40),
      },
      scripts: [...document.scripts].map((script) => ({
        src: script.src,
        type: script.type,
        characters: script.textContent?.length ?? 0,
      })),
      images: {
        count: imageSources.length,
        embeddedCount: imageSources.filter((source) => source.startsWith("data:")).length,
        external: imageSources.filter((source) => !source.startsWith("data:")).slice(0, 30),
      },
      classNames: [...new Set([...document.querySelectorAll("[class]")]
        .flatMap((element) => [...element.classList]))].sort(),
    };
  });
  pages.push({
    relativePath: path.relative(sourceRoot, sourceFile).replaceAll("\\", "/"),
    ...pageInventory,
  });
  await page.close();
}

await browser.close();

const inventory = {
  sourceRoot,
  generatedAt: new Date().toISOString(),
  pageCount: pages.length,
  pages,
};

await writeFile(outputPath, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
console.log(`Wrote ${pages.length} source pages to ${outputPath}`);
