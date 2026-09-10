import { chromium } from 'playwright';
console.log('Playwright chromium available');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('https://aeck.vn/', { waitUntil: 'domcontentloaded', timeout: 30000 });
console.log('Title:', await page.title());
await browser.close();
console.log('Done');
