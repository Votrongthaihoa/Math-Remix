import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;
const marker = process.env.E2E_TEST_MARKER ?? `E2E RELEASE GATE ${Date.now()}`;
const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function stagingAdmin(): SupabaseClient {
  if (!dbUrl || !serviceRoleKey) throw new Error("E2E database setup requires staging Supabase credentials");
  return createClient(dbUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function login(page: Page) {
  page.on("pageerror", error => console.log(`[e2e pageerror] ${error.message}`));
  await page.goto("/admin");
  await page.waitForTimeout(5_000);
  await page.locator("#admin-login-email").fill(adminEmail ?? "");
  await page.locator("#admin-login-password").fill(adminPassword ?? "");
  await page.getByRole("button", { name: /Vào trang quản trị|Đăng nhập/ }).click();
  await expect(page).toHaveURL(/\/admin/);
  await page.waitForTimeout(10_000);
  if (await page.locator("main.login-page").count()) {
    throw new Error(`Authenticated login did not leave the admin form: ${await page.locator("body").innerText()}`);
  }
}

async function seedQuestions(examId: string) {
  const db = stagingAdmin();
  const section = await db.from("exam_sections").insert({ exam_id: examId, title: "E2E Section", duration_minutes: 30, sort_order: 0 }).select("id").single();
  expect(section.error).toBeNull();
  if (!section.data?.id) throw new Error("E2E section was not created");
  const rows = Array.from({ length: 5 }, (_, index) => ({
    section_id: section.data.id,
    prompt: `${marker} Question ${index + 1}`,
    question_type: "single",
    options: [
      { value: "A", label: `${marker} A${index + 1}` },
      { value: "B", label: `${marker} B${index + 1}` },
      { value: "C", label: `${marker} C${index + 1}` },
      { value: "D", label: `${marker} D${index + 1}` },
    ],
    points: 1,
    sort_order: index,
    latex_source: "",
    solution_source: "",
  }));
  const questions = await db.from("exam_questions").insert(rows).select("id");
  expect(questions.error).toBeNull();
  if (!questions.data?.length) throw new Error("E2E questions were not created");
  const keys = await db.from("exam_question_keys").insert(questions.data.map(question => ({ question_id: question.id, correct_answer: "A", explanation: "E2E explanation" })));
  expect(keys.error).toBeNull();
  return { sectionId: section.data.id, questionIds: questions.data.map(question => question.id) };
}

async function guestAttempt(slotId: string, fullName: string) {
  const db = stagingAdmin();
  const result = await db.from("guest_exam_attempts").select("id,question_order,option_order,answers,flagged_questions,exam_code,policy_version,score,correct_answers,total_questions,scoring_version,time_extension_seconds,monitor_events,status").eq("slot_id", slotId).contains("guest_identity", { full_name: fullName }).order("started_at", { ascending: false }).limit(1).maybeSingle();
  expect(result.error).toBeNull();
  if (!result.data) throw new Error("E2E guest attempt was not persisted");
  return result.data;
}

function localDateInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

async function sha256Hex(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

test.describe.configure({ mode: "serial" });

test("authenticated admin surface works on desktop and mobile viewports", async ({ page }) => {
  test.skip(!adminEmail || !adminPassword, "Authenticated E2E credentials are not configured");
  page.setDefaultTimeout(15_000);
  await login(page);
  await page.goto("/admin/exams");
  await expect(page.locator("body")).toContainText(/Phòng khảo thí|Đề thi/, { timeout: 30_000 });
});

test("protected HSA preview has no page errors or horizontal viewport overflow", async ({ page }, testInfo) => {
  test.skip(!adminEmail || !adminPassword || !dbUrl || !serviceRoleKey, "Authenticated staging credentials are not configured");
  const db = stagingAdmin();
  const hsaExam = await db.from("exams").select("id").eq("exam_type", "HSA").order("created_at", { ascending: false }).limit(1).maybeSingle();
  expect(hsaExam.error).toBeNull();
  test.skip(!hsaExam.data?.id, "Staging has no HSA fixture available for protected preview QA");

  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.setDefaultTimeout(20_000);
  await login(page);
  await page.goto(`/admin/exams/${hsaExam.data!.id}/preview`);
  await expect(page.locator(".hsa-exam-page")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("body")).not.toContainText(/Application error|Internal Server Error/i);

  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const runner = document.querySelector<HTMLElement>(".hsa-exam-page");
    return {
      documentPixels: Math.max(0, root.scrollWidth - root.clientWidth),
      runnerPixels: runner ? Math.max(0, runner.scrollWidth - runner.clientWidth) : -1,
    };
  });
  expect(overflow.documentPixels).toBeLessThanOrEqual(1);
  expect(overflow.runnerPixels).toBeLessThanOrEqual(1);
  expect(pageErrors).toEqual([]);

  const viewport = page.viewportSize();
  const screenshot = join(tmpdir(), `aeck-hsa-preview-${testInfo.project.name}-${viewport?.width ?? "auto"}.png`);
  await page.screenshot({ path: screenshot, fullPage: false });
  console.log(`[HSA QA] ${testInfo.project.name}: ${JSON.stringify(overflow)} screenshot=${screenshot}`);
});

test("staging release gate runs create, candidate, monitoring, regrade and export flow", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  test.skip(testInfo.project.name !== "chromium", "The destructive staging flow runs once in Chromium; mobile projects run the authenticated surface smoke.");
  test.skip(!adminEmail || !adminPassword, "Authenticated E2E credentials are not configured");
  page.setDefaultTimeout(15_000);

  await login(page);
  await page.goto("/admin/exams");
  await page.getByRole("link", { name: /Tạo phòng thi/ }).click();
  await page.getByPlaceholder("Phòng TSA").fill(marker);
  await page.locator("label").filter({ hasText: "Loại phòng" }).locator("select").selectOption("OTHER");
  await page.locator("label").filter({ hasText: "Xuất bản phòng" }).locator("input[type=checkbox]").check();
  await page.getByRole("button", { name: /Tạo phòng và mở workspace/ }).click();
  await expect(page).toHaveURL(/\/admin\/exams\/rooms\/[0-9a-f-]{36}$/);
  const roomId = new URL(page.url()).pathname.split("/").pop()!;

  await page.getByRole("button", { name: /Tạo phiên bản đề/ }).click();
  await page.getByPlaceholder("Đề Số 01").fill(`${marker} Exam`);
  await page.getByRole("button", { name: /^Tạo đề$/ }).click();
  await expect(page).toHaveURL(/\/admin\/exams\/[0-9a-f-]{36}$/);
  const examId = new URL(page.url()).pathname.split("/").pop()!;
  await seedQuestions(examId);
  await page.reload();
  await expect(page.locator("body")).toContainText(/5 câu hỏi/);

  await page.getByRole("button", { name: /Quy tắc làm bài/ }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/exams/${examId}/policy`));
  await page.locator("label").filter({ hasText: "Mẫu cấu hình" }).locator("select").selectOption("mock-exam");
  await page.locator("label").filter({ hasText: "Cách xáo trộn" }).locator("select").selectOption("exam_code");
  await page.locator("label").filter({ hasText: "Số mã đề" }).locator("input").fill("4");
  await page.getByRole("button", { name: /Lưu quy tắc/ }).click();
  await expect(page.locator("body")).toContainText(/Đã lưu Exam Policy snapshot/);
  await page.getByRole("button", { name: /Kiểm tra trước khi xuất bản/ }).click();
  await expect(page.locator(".policy-preflight")).toContainText(/Có thể publish|PASS|WARNING/i);

  await page.getByRole("button", { name: /Quay lại soạn đề/ }).click();
  await page.getByRole("button", { name: /Cấu hình đề/ }).click();
  await page.locator("label").filter({ hasText: "Đề đang ở bản nháp" }).locator("input[type=checkbox]").check();
  await page.getByRole("button", { name: /Lưu cấu hình/ }).click();
  await expect(page.locator("body")).toContainText(/Đã xuất bản|Đã lưu cấu hình/);

  await page.goto(`/admin/exams/${examId}/access`);
  await page.locator("label").filter({ hasText: "Cho phép thi bằng link" }).locator("input[type=checkbox]").check();
  await page.locator("label").filter({ hasText: "Đảo câu hỏi" }).locator("input[type=checkbox]").check();
  await page.locator("label").filter({ hasText: "Đảo đáp án" }).locator("input[type=checkbox]").check();
  await page.locator("label").filter({ hasText: "Giám sát" }).locator("select").selectOption("advanced");
  await page.getByRole("button", { name: /Lưu quy tắc/ }).click();

  await page.goto(`/admin/sessions/new?roomId=${roomId}&examId=${examId}`);
  await expect(page.getByRole("listbox", { name: "Chọn phòng thi" }).getByRole("option", { name: new RegExp(marker) })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("listbox", { name: "Chọn đề thi" }).getByRole("option", { name: new RegExp(`${marker} Exam`) })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: /^Tiếp tục$/ }).click();
  await page.getByRole("button", { name: /Link \/ QR không cần tài khoản/ }).click();
  await page.getByRole("button", { name: /^Tiếp tục$/ }).click();
  await page.getByLabel("Thời điểm mở").fill(localDateInput(new Date(Date.now() - 60_000)));
  await page.getByLabel("Thời điểm kết thúc nhận bài").fill(localDateInput(new Date(Date.now() + 10_800_000)));
  await page.getByLabel("Tên kíp thi").fill(`${marker} Slot`);
  await page.getByLabel("Giám sát kỹ thuật").selectOption("advanced");
  await page.getByLabel("Công bố điểm").selectOption("after_submit");
  await page.getByRole("button", { name: /^Tiếp tục$/ }).click();
  await page.getByRole("button", { name: /Tạo kíp & sinh link/ }).click();
  await expect(page.locator(".admin-session-result-copy code")).toBeVisible();
  const oldShareUrl = await page.locator(".admin-session-result-copy code").innerText();
  await page.getByRole("button", { name: /Quản lý kíp thi/ }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/exams/${examId}/access`));
  const slotCard = page.locator(".slot-card").filter({ hasText: `${marker} Slot` });
  const rotateResponse = page.waitForResponse(response => response.url().includes("/api/admin/exam-access") && response.request().method() === "POST");
  await page.once("dialog", dialog => dialog.accept());
  await slotCard.getByRole("button", { name: /Đổi link/ }).click();
  await rotateResponse;
  await expect(page.locator(".share-url-box code")).not.toHaveText(oldShareUrl, { timeout: 15_000 });
  const shareUrl = await page.locator(".share-url-box code").innerText();
  expect(shareUrl).toMatch(/\/guest\/exam\/[A-Za-z0-9_-]+/);
  const db = stagingAdmin();
  const slotRow = await db.from("exam_access_slots").select("id").eq("exam_id", examId).eq("name", `${marker} Slot`).single();
  if (slotRow.error || !slotRow.data?.id) throw new Error(slotRow.error?.message ?? "E2E slot was not created");
  const slotId = slotRow.data.id;
  const newToken = new URL(shareUrl).pathname.split("/").pop() ?? "";
  const persistedSlot = await db.from("exam_access_slots").select("token_hash,enabled,starts_at,ends_at").eq("id", slotId).single();
  expect(persistedSlot.error).toBeNull();
  expect(await sha256Hex(newToken)).toBe(persistedSlot.data?.token_hash);
  expect(persistedSlot.data?.enabled).toBe(true);

  const candidateContext = await page.context().browser()!.newContext({ viewport: { width: 1280, height: 900 } });
  await candidateContext.addInitScript(() => {
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, get: () => true });
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => document.documentElement });
    if (!Element.prototype.requestFullscreen) Element.prototype.requestFullscreen = async () => undefined;
  });
  const candidate = await candidateContext.newPage();
  await candidate.goto(oldShareUrl);
  await expect(candidate.locator("body")).toContainText(/Không thể mở link thi|không tìm thấy|không hợp lệ/i);
  await candidate.goto(shareUrl);
  await expect(candidate.locator(".guest-identity-fields")).toBeVisible({ timeout: 15_000 });
  await candidate.locator(".guest-identity-fields input").nth(0).fill(`${marker} Candidate`);
  await candidate.locator(".guest-identity-fields input").nth(1).fill("12E2E");
  await candidate.getByRole("button", { name: /Bắt đầu làm bài/ }).click();
  await expect(candidate.locator(".math-exam-page")).toBeVisible();
  await expect.poll(async () => (await guestAttempt(slotId, `${marker} Candidate`)).question_order.length).toBe(5);
  const started = await guestAttempt(slotId, `${marker} Candidate`);
  expect(new Set(started.question_order).size).toBe(5);
  expect(Object.values(started.option_order).every(order => Array.isArray(order) && order.length === 4)).toBe(true);
  expect(started.exam_code).toMatch(/^\d+$/);

  await candidate.locator(".math-choice-option").first().click();
  await candidate.getByRole("button", { name: /Đánh dấu câu hỏi/ }).click();
  await expect.poll(async () => {
    const saved = await guestAttempt(slotId, `${marker} Candidate`);
    return { answers: Object.keys(saved.answers ?? {}).length, flags: (saved.flagged_questions ?? []).length };
  }, { timeout: 20_000 }).toEqual({ answers: 1, flags: 1 });
  await candidate.reload();
  await expect(candidate.locator(".math-exam-page")).toBeVisible();
  await expect(candidate.locator(".math-choice-option.selected")).toHaveCount(1);
  await expect(candidate.getByRole("button", { name: /Bỏ đánh dấu câu hỏi/ })).toBeVisible();
  await candidate.getByRole("button", { name: "Nộp bài" }).click();
  await candidate.getByRole("button", { name: "Nộp bài thi" }).click();
  await expect(candidate.locator("body")).toContainText(/Kết quả|Điểm|hoàn thành/i);
  await expect.poll(async () => (await guestAttempt(slotId, marker + " Candidate")).status, { timeout: 20_000 }).toBe("submitted");
  const submitted = await guestAttempt(slotId, marker + " Candidate");
  expect(submitted.status).toBe("submitted");
  expect(submitted.exam_code).toBe(started.exam_code);
  expect(submitted.question_order).toEqual(started.question_order);
  expect(submitted.policy_version).toBe(started.policy_version);
  await expect(candidate.locator("body")).toContainText(String(submitted.score));
  await candidateContext.close();

  await page.bringToFront();
  await expect(page.locator(".access-operations-panel")).toContainText(/GIÁM SÁT TRỰC TIẾP|Đã nộp/);
  await expect(page.locator(".operation-qr img[alt*='QR']")).toBeVisible();
  await page.locator(".operation-import textarea").fill(`candidate_code,full_name,class_name,school\n${marker}-C,Import Candidate,12E2E,Remix School`);
  await page.getByRole("button", { name: /Kiểm tra/ }).click();
  await expect(page.locator(".operation-import")).toContainText(/Hợp lệ: 1/);
  await page.getByRole("button", { name: /^Nhập dữ liệu$/ }).click();
  await expect(page.locator(".access-operations-panel")).toContainText(/Đã import 1/);

  await page.goto(`/admin/exams/${examId}/policy`);
  await page.getByLabel("Lý do thao tác").fill("E2E release-gate regrade");
  await page.getByRole("button", { name: /Thêm thay đổi/ }).click();
  await page.getByRole("button", { name: /Xem tác động/ }).click();
  await expect(page.locator(".regrade-impact")).toContainText(/Đã kiểm tra/);
  await page.once("dialog", dialog => dialog.accept());
  await page.locator(".regrade-history").first().getByRole("button", { name: /Áp dụng/ }).click();
  await expect(page.locator("body")).toContainText(/Đã regrade/);

  await page.goto(`/admin/exams/${examId}/access`);
  const liveSlotCard = page.locator(".slot-card").filter({ hasText: `${marker} Slot` });
  await liveSlotCard.getByRole("button", { name: /Công bố kết quả/ }).click();
  await expect(liveSlotCard).toContainText(/Đã công bố kết quả/);
  const downloadPromise = page.waitForEvent("download");
  await liveSlotCard.getByRole("button", { name: /Tải Excel/ }).click();
  const download = await downloadPromise;
  const file = await download.path();
  expect(file).toBeTruthy();
  const workbook = XLSX.read(await readFile(file!), { type: "buffer" });
  expect(workbook.SheetNames).toEqual(expect.arrayContaining([expect.stringMatching(/Tổng hợp|Input|Câu hỏi/i)]));
  const allRows = workbook.SheetNames.flatMap(name => XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[name]));
  expect(allRows.some(row => Object.values(row).some(value => String(value).includes(`${marker} Candidate`)))).toBe(true);
  const persisted = await guestAttempt(slotId, `${marker} Candidate`);
  const scoreValues = allRows.flatMap(row => Object.entries(row).filter(([key]) => /Điểm|score/i.test(key)).map(([, value]) => value)).filter(value => value !== "");
  expect(scoreValues.some(value => Number(value) === Number(persisted.score))).toBe(true);
  expect(persisted.status).toBe("submitted");

  const summaryName = workbook.SheetNames.find(name => /Tổng hợp/i.test(name));
  const answerName = workbook.SheetNames.find(name => /Đáp án từng câu/i.test(name));
  const monitorName = workbook.SheetNames.find(name => /Giám sát/i.test(name));
  const configName = workbook.SheetNames.find(name => /Cấu hình kíp/i.test(name));
  expect(summaryName && answerName && monitorName && configName).toBeTruthy();
  const summaryRow = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[summaryName!]).find(row => Object.values(row).some(value => String(value).includes(marker + " Candidate")));
  expect(summaryRow).toBeTruthy();
  const summaryValue = (pattern: RegExp) => Object.entries(summaryRow ?? {}).find(([key]) => pattern.test(key))?.[1];
  expect(summaryValue(/Mã đề/i)).toBe(persisted.exam_code);
  expect(Number(summaryValue(/Phiên bản chấm/i))).toBe(Number(persisted.scoring_version));
  expect(Number(summaryValue(/Số cảnh báo giám sát/i))).toBe((persisted.monitor_events ?? []).length);
  expect(summaryValue(/Trạng thái/i)).toBe(persisted.status);
  expect(Number(summaryValue(/^Điểm$/i))).toBe(Number(persisted.score));

  const answerRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[answerName!]).filter(row => Object.values(row).some(value => String(value).includes(marker + " Candidate")));
  const questionIdKey = Object.keys(answerRows[0] ?? {}).find(key => /Mã câu hỏi/i.test(key));
  expect(questionIdKey).toBeTruthy();
  expect(answerRows.map(row => String(row[questionIdKey!]))).toEqual(persisted.question_order);
  const answeredQuestionId = Object.keys(persisted.answers ?? {})[0];
  const answeredRow = answerRows.find(row => String(row[questionIdKey!]) === answeredQuestionId);
  const answerJsonKey = Object.keys(answeredRow ?? {}).find(key => /(Học sinh trả lời|Câu trả lời).*\(JSON\)/i.test(key));
  expect(answerJsonKey).toBeTruthy();
  expect(JSON.parse(String(answeredRow?.[answerJsonKey!] ?? "null"))).toEqual((persisted.answers ?? {})[answeredQuestionId]);

  const monitorRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[monitorName!]).filter(row => Object.values(row).some(value => String(value).includes(marker + " Candidate")));
  expect(monitorRows.length).toBeGreaterThan(0);
  const monitorCountKey = Object.keys(monitorRows[0] ?? {}).find(key => /Số sự kiện/i.test(key));
  expect(Number(monitorRows[0]?.[monitorCountKey!])).toBe((persisted.monitor_events ?? []).length);
  const configRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[configName!]);
  const releaseKey = Object.keys(configRows[0] ?? {}).find(key => /Kết quả đã mở/i.test(key));
  expect(configRows[0]?.[releaseKey!]).toBe("Có");
});
