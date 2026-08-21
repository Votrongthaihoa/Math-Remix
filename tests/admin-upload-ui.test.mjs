import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public image library keeps load failures separate from the empty state", async () => {
  const component = await readFile(new URL("../app/admin-upload.tsx", import.meta.url), "utf8");

  assert.match(component, /const \[libraryError, setLibraryError\] = useState\(""\);/);
  assert.match(component, /setLibraryError\(""\);/);
  assert.match(component, /setLibraryError\(value instanceof Error \? value\.message/);
  assert.match(component, /libraryError \? [\s\S]*?Thử lại/);
  assert.match(component, /!images\.length \? \(libraryError \? null : <div className="admin-upload-empty">/);
});

test("private image deletion uses the accessible MacAlert confirmation", async () => {
  const component = await readFile(new URL("../app/admin-upload.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(component, /window\.confirm/);
  assert.match(component, /const \[pendingExamImage, setPendingExamImage\] = useState<ExamUploadedImage \| null>\(null\);/);
  assert.match(component, /pendingExamImage \? <MacAlert/);
  assert.match(component, /removeExamImage\(pendingExamImage\)/);
  assert.match(component, /onClick=\{\(\) => requestExamImageRemoval\(image\)\}/);
});

test("upload controls and metadata formatting stay accessible and date-safe", async () => {
  const component = await readFile(new URL("../app/admin-upload.tsx", import.meta.url), "utf8");

  assert.match(component, /aria-label="Chọn ảnh để tải lên"/);
  assert.match(component, /<button type="submit" className="primary-btn admin-upload-submit"/);
  assert.match(component, /Number\.isNaN\(date\.getTime\(\)\)/);
});

test("lesson PDF upload validates course ownership and binds confirmation path", async () => {
  const route = await readFile(new URL("../app/api/admin/lesson-files/route.ts", import.meta.url), "utf8");

  assert.match(route, /select\("id,chapters\(course_id\)"\)/);
  assert.match(route, /chapter\?\.course_id !== courseId/);
  assert.match(route, /path\.startsWith\(`\$\{courseId\}\/\$\{lessonId\}\//);
  assert.match(route, /consumeRequestBudget/);
});

test("course builder separates content sources and reports R2 cleanup failures", async () => {
  const [platform, cors] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../cloudflare/r2-private-lessons-cors.json", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /name="resourceSource"/);
  assert.match(platform, /\['youtube','YouTube','Dán link video YouTube'\]/);
  assert.match(platform, /\['onedrive_video','Video Microsoft','Dán link OneDrive hoặc SharePoint'\]/);
  assert.match(platform, /\['hls_vault','OneDrive HLS Vault','Nhập mã video đã encode'\]/);
  assert.match(platform, /\['external_pdf','Link PDF','Dùng link PDF hoặc Google Drive'\]/);
  assert.match(platform, /\['storage_pdf','Tải PDF lên','Chọn file PDF từ máy tính'\]/);
  assert.match(platform, /headers: \{ "Content-Type": "application\/pdf" \}/);
  assert.match(platform, /if \(!response\.ok\) throw new Error\(payload\?\.error \|\| "Không thể xóa file khỏi kho PDF\."\)/);
  assert.match(platform, /Đã xóa tài liệu và file PDF khỏi kho\./);

  const config = JSON.parse(cors);
  const rule = config.rules[0];
  assert.deepEqual(rule.allowed.methods, ["PUT", "HEAD"]);
  assert.deepEqual(rule.allowed.headers, ["Content-Type"]);
  assert.ok(rule.allowed.origins.includes("https://www.mathremix.pro.vn"));
  assert.ok(rule.allowed.origins.includes("https://mathremix.pro.vn"));
});

test("Microsoft Graph lesson video creation stays behind the active admin server boundary", async () => {
  const [route, connectRoute, player, platform, sharedVideoPlayer] = await Promise.all([
    readFile(new URL("../app/api/admin/lesson-videos/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/microsoft/connect/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/video-player.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/yt-embed-player.html", import.meta.url), "utf8"),
  ]);
  assert.match(route, /ensureActiveAccount/);
  assert.match(route, /profile\.role !== "admin"/);
  assert.match(route, /consumeRequestBudget/);
  assert.match(route, /inspectMicrosoftGraphVideo/);
  assert.match(route, /resource_type: "onedrive_video"/);
  assert.match(route, /provider_drive_id: metadata\.driveId/);
  assert.match(connectRoute, /ensureActiveAccount/);
  assert.match(connectRoute, /createMicrosoftAuthorizationUrl/);
  assert.doesNotMatch(platform, /NEXT_PUBLIC_MICROSOFT|MICROSOFT_CLIENT_SECRET/);
  assert.doesNotMatch(route, /MICROSOFT_TENANT_ID|MICROSOFT_CLIENT_ID|MICROSOFT_CLIENT_SECRET|authorization: `Bearer/);
  assert.match(player, /<iframe/);
  assert.doesNotMatch(player, /Mở video trên Microsoft|playbackMode === "external"/);
  assert.match(player, /setResolutionNonce\(value => value \+ 1\)/);
  assert.match(player, /yt-embed-player\.html\?mode=native/);
  assert.match(player, /remix:set-video-source/);
  assert.match(player, /event\.origin !== window\.location\.origin/);
  assert.match(sharedVideoPlayer, /\["native", "hls"\]/);
  assert.match(sharedVideoPlayer, /remix:video-player-ready/);
  assert.match(sharedVideoPlayer, /allowedMicrosoftHostSuffixes/);
  assert.match(sharedVideoPlayer, /player\.src = \{ src: source, type:/);
  assert.doesNotMatch(player, /playbackUrl\}\&|playbackUrl\}\?/);
});
