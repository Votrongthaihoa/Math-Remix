import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const RECON = 'RECON';
const TARGET = join(RECON, 'target');
mkdirSync(TARGET, { recursive: true });
mkdirSync(join(RECON, 'dom'), { recursive: true });

const browser = await chromium.launch({ headless: true });

// --- PUBLIC SITE RECON ---
console.log('=== PUBLIC SITE RECON ===');
const publicPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

const publicRequests = [];
publicPage.on('request', r => {
  if (['fetch','xhr'].includes(r.resourceType())) {
    publicRequests.push({ method: r.method(), url: r.url(), type: r.resourceType() });
  }
});

await publicPage.goto('https://aeck.vn/', { waitUntil: 'networkidle', timeout: 60000 });
await publicPage.waitForTimeout(2000);

await publicPage.screenshot({ path: join(TARGET, 'public-home-1920.png'), fullPage: true });
console.log('Screenshot: public-home-1920.png');

const links = await publicPage.evaluate(() => {
  return Array.from(document.querySelectorAll('a[href]')).map(a => ({
    href: a.getAttribute('href'),
    text: (a.textContent || '').trim().substring(0, 80),
    inNav: !!a.closest('nav, header, footer'),
  }));
});
console.log('Links found:', links.length);

const publicDesign = await publicPage.evaluate(() => {
  function cs(el) { return el ? window.getComputedStyle(el) : null; }
  function measure(el) {
    if (!el) return null;
    var r = el.getBoundingClientRect();
    var s = cs(el);
    return {
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      bg: s.backgroundColor, color: s.color, font: (s.fontFamily || '').substring(0, 60),
      fontSize: s.fontSize, fontWeight: s.fontWeight, lineHeight: s.lineHeight,
      padding: s.padding, borderRadius: s.borderRadius,
      position: s.position, zIndex: s.zIndex,
    };
  }
  var header = document.querySelector('header') || document.querySelector('[class*=header]');
  var footer = document.querySelector('footer') || document.querySelector('[class*=footer]');
  var hero = document.querySelector('[class*=hero]') || document.querySelector('section:first-of-type');
  var body = document.body;
  return {
    header: measure(header),
    footer: measure(footer),
    hero: measure(hero),
    body: { bg: cs(body).backgroundColor, color: cs(body).color, font: (cs(body).fontFamily || '').substring(0, 60) },
    scrollHeight: document.documentElement.scrollHeight,
    title: document.title,
    h1: Array.from(document.querySelectorAll('h1')).map(function(h) { return (h.textContent || '').trim().substring(0, 100); }),
    h2: Array.from(document.querySelectorAll('h2')).map(function(h) { return (h.textContent || '').trim().substring(0, 100); }),
    sections: Array.from(document.querySelectorAll('section')).length,
  };
});

// Mobile
await publicPage.setViewportSize({ width: 390, height: 844 });
await publicPage.waitForTimeout(1000);
await publicPage.screenshot({ path: join(TARGET, 'public-home-390.png'), fullPage: true });
console.log('Screenshot: public-home-390.png');

// Tablet
await publicPage.setViewportSize({ width: 768, height: 1024 });
await publicPage.waitForTimeout(1000);
await publicPage.screenshot({ path: join(TARGET, 'public-home-768.png'), fullPage: true });
console.log('Screenshot: public-home-768.png');

await publicPage.close();

var publicRecon = {
  timestamp: new Date().toISOString(),
  design: publicDesign,
  links: links,
  networkRequests: publicRequests.map(function(r) { return { method: r.method, url: r.url }; }),
};
writeFileSync(join(RECON, 'dom', 'public-home-recon.json'), JSON.stringify(publicRecon, null, 2));
console.log('Saved public recon data');

// --- APP SITE RECON ---
console.log('\n=== APP SITE RECON ===');
var appPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

var appRequests = [];
appPage.on('request', function(r) {
  if (['fetch','xhr'].includes(r.resourceType())) {
    appRequests.push({ method: r.method(), url: r.url(), type: r.resourceType() });
  }
});

try {
  await appPage.goto('https://alpha.aeck.vn/', { waitUntil: 'networkidle', timeout: 60000 });
  await appPage.waitForTimeout(3000);

  console.log('App title:', await appPage.title());
  console.log('App URL:', appPage.url());

  await appPage.screenshot({ path: join(TARGET, 'app-landing-1920.png'), fullPage: true });
  console.log('Screenshot: app-landing-1920.png');

  var pageState = await appPage.evaluate(function() {
    var hasLogin = !!document.querySelector('form[action*=login], input[type=password], [class*=login], [class*=auth]');
    var hasSidebar = !!document.querySelector('[class*=sidebar], aside, nav[aria-label]');
    var hasTopbar = !!document.querySelector('[class*=topbar], header');
    return { hasLogin: hasLogin, hasSidebar: hasSidebar, hasTopbar: hasTopbar, url: location.href };
  });
  console.log('App state:', JSON.stringify(pageState));

  // Navigate to key routes
  var appRoutes = ['/dashboard', '/courses', '/exam-room', '/exam-history', '/tkb', '/profile'];
  for (var route of appRoutes) {
    try {
      await appPage.goto('https://alpha.aeck.vn' + route, { waitUntil: 'networkidle', timeout: 20000 });
      await appPage.waitForTimeout(2000);
      var routeName = route.replace(/\//g, '-').replace(/^-/, '') || 'root';
      await appPage.screenshot({ path: join(TARGET, 'app-' + routeName + '-1920.png'), fullPage: true });
      console.log('Screenshot: app-' + routeName + '-1920.png');
      var summary = await appPage.evaluate(function() {
        return {
          url: location.href,
          title: document.title,
          h1: (document.querySelector('h1') || {}).textContent || '',
        };
      });
      console.log('  ' + route + ': ' + summary.url);
    } catch(e) {
      console.log('  ' + route + ' failed: ' + (e.message || '').substring(0, 100));
    }
  }

  // App shell geometry at /courses or /dashboard
  try {
    await appPage.goto('https://alpha.aeck.vn/courses', { waitUntil: 'networkidle', timeout: 20000 });
    await appPage.waitForTimeout(2000);

    var shellGeometry = await appPage.evaluate(function() {
      function cs(el) { return el ? window.getComputedStyle(el) : null; }
      function measure(el) {
        if (!el) return null;
        var r = el.getBoundingClientRect();
        var s = cs(el);
        return {
          x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
          bg: s.backgroundColor, position: s.position, zIndex: s.zIndex,
          overflow: s.overflow, overflowY: s.overflowY,
          backdropFilter: s.backdropFilter || s.webkitBackdropFilter || '',
          borderBottom: s.borderBottom,
        };
      }
      var sidebar = document.querySelector('[class*=sidebar], aside');
      var topbar = document.querySelector('[class*=topbar], header');
      var main = document.querySelector('[class*=main-content], main');
      return {
        sidebar: measure(sidebar),
        topbar: measure(topbar),
        main: measure(main),
      };
    });
    console.log('Shell geometry:', JSON.stringify(shellGeometry, null, 2));

    writeFileSync(join(RECON, 'dom', 'app-shell-recon.json'), JSON.stringify({
      timestamp: new Date().toISOString(),
      shellGeometry: shellGeometry,
    }, null, 2));
  } catch(e) {
    console.log('Shell recon error:', (e.message || '').substring(0, 100));
  }

  // Mobile app
  await appPage.setViewportSize({ width: 390, height: 844 });
  await appPage.waitForTimeout(1000);
  await appPage.screenshot({ path: join(TARGET, 'app-mobile-390.png'), fullPage: true });
  console.log('Screenshot: app-mobile-390.png');

} catch(e) {
  console.log('App recon error:', (e.message || '').substring(0, 200));
}

await appPage.close();
await browser.close();
console.log('\n=== RECON COMPLETE ===');