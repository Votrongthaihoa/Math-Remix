import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("upload proxy focus and thumbnails keep visible geometry", async () => {
  const [component, styles] = await Promise.all([
    readFile(new URL("../app/admin-upload.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-upload.css", import.meta.url), "utf8"),
  ]);

  assert.match(component, /className="admin-upload-private-thumb"[^>]*width=\{640\} height=\{360\}/);
  assert.match(component, /<img src=\{image\.url\}[^>]*width=\{640\} height=\{360\}/);
  assert.match(styles, /\.admin-upload-dropzone:focus-within/);
});

test("public image library keeps load failures separate from the empty state", async () => {
  const component = await readFile(new URL("../app/admin-upload.tsx", import.meta.url), "utf8");

  assert.match(component, /const \[libraryError, setLibraryError\] = useState\(""\);/);
  assert.match(component, /setLibraryError\(""\);/);
  assert.match(component, /setLibraryError\(value instanceof Error \? value\.message/);
  assert.match(component, /libraryError \? [\s\S]*?Thử lại/);
  assert.match(component, /!images\.length \? \(libraryError \? null : <div className="admin-upload-empty">/);
});

test("private image deletion uses the accessible AECK confirmation", async () => {
  const component = await readFile(new URL("../app/admin-upload.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(component, /window\.confirm/);
  assert.match(component, /const \[pendingExamImage, setPendingExamImage\] = useState<ExamUploadedImage \| null>\(null\);/);
  assert.match(component, /pendingExamImage \? <AeckConfirmDialog/);
  assert.match(component, /removeExamImage\(pendingExamImage\)/);
  assert.match(component, /onClick=\{\(\) => requestExamImageRemoval\(image\)\}/);
});

test("private image library is permission-scoped and exposes an honest retry state", async () => {
  const [component, platform, styles] = await Promise.all([
    readFile(new URL("../app/admin-upload.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-upload.css", import.meta.url), "utf8"),
  ]);

  assert.match(component, /export default function AdminUploadPage\(\{ canManageExamImages \}: \{ canManageExamImages: boolean \}\)/);
  assert.match(component, /canManageExamImages \? loadExamImages\(\) : Promise\.resolve\(\)/);
  assert.match(component, /canManageExamImages && <button id="admin-upload-library-tab-private"/);
  assert.match(component, /canManageExamImages && activeLibrary === "private"/);
  assert.match(component, /admin-upload-stats\$\{canManageExamImages \? "" : " admin-upload-stats-public-only"\}/);
  assert.match(component, /examError \? <><Info \/> Không thể đồng bộ kho ảnh đề thi/);
  assert.match(component, /admin-upload-private-load-error/);
  assert.match(component, /onClick=\{\(\) => void loadExamImages\(\)\}/);
  assert.match(platform, /<AdminUploadManager canManageExamImages=\{canAccessAdminPermission\(permissionUser, "exams"\)\}/);
  assert.match(styles, /\.admin-upload-library-status\.is-error/);
  assert.match(styles, /\.admin-upload-stats-public-only\s*\{\s*grid-template-columns:\s*repeat\(3,/);
});

test("image deletion dialogs retain context while requests run or fail", async () => {
  const component = await readFile(new URL("../app/admin-upload.tsx", import.meta.url), "utf8");

  assert.match(component, /async function removeImage\(image: UploadedImage\) \{\s*if \(deletingAsset\) return;/);
  assert.match(component, /setNotice\("Đã xóa ảnh khỏi kho công khai\."\);\s*setPendingImage\(null\);/);
  assert.match(component, /async function removeExamImage\(image: ExamUploadedImage\) \{\s*if \(image\.used \|\| deletingExamAsset\) return;/);
  assert.match(component, /setNotice\("Đã xoá ảnh đề thi không còn được sử dụng khỏi R2\."\);\s*setPendingExamImage\(null\);/);
  assert.match(component, /secondaryAction=\{\{ label: "Hủy", onClick: closeImageRemoval, disabled: Boolean\(deletingAsset\) \}\}/);
  assert.match(component, /primaryAction=\{\{ label: deletingAsset \? "Đang xóa…" : "Xóa ảnh", onClick: \(\) => void removeImage\(pendingImage\), disabled: Boolean\(deletingAsset\) \}\}/);
  assert.match(component, /secondaryAction=\{\{ label: "Hủy", onClick: closeExamImageRemoval, disabled: Boolean\(deletingExamAsset\) \}\}/);
  assert.match(component, /primaryAction=\{\{ label: deletingExamAsset \? "Đang xoá…" : "Xóa ảnh", onClick: \(\) => void removeExamImage\(pendingExamImage\), disabled: Boolean\(deletingExamAsset\) \}\}/);
});

test("upload controls and metadata formatting stay accessible and date-safe", async () => {
  const [component, formatter] = await Promise.all([
    readFile(new URL("../app/admin-upload.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui-format.ts", import.meta.url), "utf8"),
  ]);

  assert.match(component, /aria-label="Chọn ảnh để tải lên"/);
  assert.match(component, /<button type="submit" className="primary-btn admin-upload-submit"/);
  assert.match(component, /formatUiDate\(/);
  assert.match(formatter, /Number\.isFinite\(date\.getTime\(\)\)/);
});

test("image libraries use URL-driven tabs, search, pagination, and namespaced copy state", async () => {
  const component = await readFile(new URL("../app/admin-upload.tsx", import.meta.url), "utf8");

  assert.match(component, /type LibraryTab = "public" \| "private"/);
  assert.match(component, /url\.searchParams\.set\("library", canManageExamImages \? activeLibrary : "public"\)/);
  assert.match(component, /url\.searchParams\.set\("publicQ", searchTerm\)/);
  assert.match(component, /url\.searchParams\.set\("privateQ", examSearchTerm\)/);
  assert.match(component, /url\.searchParams\.set\("publicPage", String\(publicPage\)\)/);
  assert.match(component, /url\.searchParams\.set\("privatePage", String\(privatePage\)\)/);
  assert.match(component, /`public:\$\{image\.assetName\}`/);
  assert.match(component, /`private:\$\{key\}`/);
  assert.match(component, /className="admin-upload-live-region" role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(component, /Number\.isFinite\(parsed\)/);
  assert.match(component, /setPublicPage\(page => Math\.min\(page, publicPageCount\)\)/);
  assert.match(component, /setPrivatePage\(page => Math\.min\(page, privatePageCount\)\)/);
});

test("image library tabs follow the keyboard-accessible tabs pattern", async () => {
  const component = await readFile(new URL("../app/admin-upload.tsx", import.meta.url), "utf8");

  assert.match(component, /role="tablist" aria-label="Chọn thư viện ảnh"/);
  assert.match(component, /id="admin-upload-library-tab-public" role="tab"[\s\S]*?aria-controls="admin-upload-library-panel-public"[\s\S]*?tabIndex=\{activeLibrary === "public" \? 0 : -1\}/);
  assert.match(component, /id="admin-upload-library-tab-private" role="tab"[\s\S]*?aria-controls="admin-upload-library-panel-private"[\s\S]*?tabIndex=\{activeLibrary === "private" \? 0 : -1\}/);
  assert.match(component, /function handleLibraryTabKeyDown\(event: KeyboardEvent<HTMLButtonElement>\)/);
  assert.match(component, /\["ArrowLeft", "ArrowRight", "Home", "End"\]\.includes\(event\.key\)/);
  assert.match(component, /role="tabpanel" id="admin-upload-library-panel-public" aria-labelledby="admin-upload-library-tab-public"/);
  assert.match(component, /role="tabpanel" id="admin-upload-library-panel-private" aria-labelledby="admin-upload-library-tab-private"/);
});

test("copy confirmations use a dedicated repeatable live announcement", async () => {
  const component = await readFile(new URL("../app/admin-upload.tsx", import.meta.url), "utf8");

  assert.match(component, /const \[copyAnnouncement, setCopyAnnouncement\] = useState\(""\);/);
  assert.match(component, /setCopyAnnouncement\(""\);[\s\S]*?requestAnimationFrame\([\s\S]*?setCopyAnnouncement\(`Đã sao chép URL ảnh \$\{image\.assetName\}\.`\)/);
  assert.match(component, /className="admin-upload-live-region" role="status" aria-live="polite" aria-atomic="true">\{copyAnnouncement\}/);
  assert.match(component, /\{notice \|\| \(activeLibrary === "public"/);
});

test("copy feedback cancels stale reset timers", async () => {
  const component = await readFile(new URL("../app/admin-upload.tsx", import.meta.url), "utf8");

  assert.match(component, /const copyResetTimeoutRef = useRef<number \| null>\(null\);/);
  assert.match(component, /if \(copyResetTimeoutRef\.current !== null\) \{[\s\S]*?window\.clearTimeout\(copyResetTimeoutRef\.current\);/);
  assert.match(component, /copyResetTimeoutRef\.current = window\.setTimeout\(/);
});

test("lesson PDF upload validates course ownership and binds confirmation path", async () => {
  const route = await readFile(new URL("../app/api/admin/lesson-files/route.ts", import.meta.url), "utf8");

  assert.match(route, /select\("id,chapters\(course_id\)"\)/);
  assert.match(route, /chapter\?\.course_id !== courseId/);
  assert.match(route, /path\.startsWith\(`\$\{courseId\}\/\$\{lessonId\}\//);
  assert.match(route, /consumeRequestBudget/);
});

test("lesson PDF deletion is bound to the canonical resource and lesson prefix", async () => {
  const [route, platform] = await Promise.all([
    readFile(new URL("../app/api/admin/lesson-files/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(route, /resourceId\?: string; courseId\?: string; lessonId\?: string/);
  assert.match(route, /deleteCanonicalLessonFile\(authorization\.admin, resourceId, courseId, lessonId\)/);
  assert.match(route, /row\.resource_type !== "storage_pdf"/);
  assert.match(route, /chapter\?\.course_id !== courseId/);
  assert.match(route, /scopedUploadPath\(key, courseId, lessonId\)/);
  assert.match(route, /scopedUploadPath\(path, courseId, lessonId\)/);
  assert.match(platform, /storedResource\.id, course\.id, storedResource\.lesson_id/);
  assert.match(platform, /let resourceSaved = false/);
  assert.match(route, /storage\?: "r2" \| "legacy"/);
  assert.ok(route.includes('body.storage === "r2" || reference.startsWith("r2://")'));
  assert.match(route, /const cleanupKey = body\.storage === "r2" \? suppliedPath : key/);
  assert.match(platform, /if \(uploadedPath && !resourceSaved\) await deleteStoredLessonFile\(url, uploadedPath, undefined, course\.id, targetLessonId, "r2"\)/);
  assert.match(platform, /body: JSON\.stringify\(\{ reference, path, resourceId, courseId, lessonId, storage \}\)/);
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
  assert.match(route, /ensureAdminPermission\(request, "courses"\)/);
  assert.doesNotMatch(route, /profile\.role !== "admin"/);
  assert.match(route, /consumeRequestBudget/);
  assert.match(route, /inspectMicrosoftGraphVideo/);
  assert.match(route, /resource_type: "onedrive_video"/);
  assert.match(route, /provider_drive_id: metadata\.driveId/);
  assert.match(connectRoute, /ensureAdminPermission\(request, "courses"\)/);
  assert.match(connectRoute, /createMicrosoftAuthorizationUrl/);
  assert.doesNotMatch(platform, /NEXT_PUBLIC_MICROSOFT|MICROSOFT_CLIENT_SECRET/);
  assert.doesNotMatch(route, /MICROSOFT_TENANT_ID|MICROSOFT_CLIENT_ID|MICROSOFT_CLIENT_SECRET|authorization: `Bearer/);
  assert.match(player, /<iframe/);
  assert.doesNotMatch(player, /Mở video trên Microsoft|playbackMode === "external"/);
  assert.match(player, /setResolutionNonce\(value => value \+ 1\)/);
  assert.match(player, /MEDIA_VIEWER_ORIGIN\}\/viewer\/video\?mode=native/);
  assert.match(player, /remix:set-video-source/);
  assert.match(player, /event\.origin !== MEDIA_VIEWER_ORIGIN/);
  assert.match(sharedVideoPlayer, /\["native", "hls"\]/);
  assert.match(sharedVideoPlayer, /remix:video-player-ready/);
  assert.match(sharedVideoPlayer, /allowedMicrosoftHostSuffixes/);
  assert.match(sharedVideoPlayer, /player\.src = \{ src: source, type:/);
  assert.doesNotMatch(player, /playbackUrl\}\&|playbackUrl\}\?/);
});
