import { type Locator, type Page } from "@playwright/test";
import { expect, test } from "./fixtures/question-bank";

test.use({ serviceWorkers: "block" });

test("switching to edit preserves an unsaved draft until explicitly discarded", async ({ page, questionBank }) => {
  await visitLoadedBankA(page);
  await openNewQuestionForm(page);
  const prompt = page.locator("#question-bank-prompt");
  await expect(prompt).toBeFocused();
  await prompt.fill("Bản nháp cần giữ lại");
  const edit = page.locator(".question-bank-item-edit").first();
  page.once("dialog", dialog => dialog.dismiss());
  await edit.click();
  await expect(prompt).toHaveValue("Bản nháp cần giữ lại");
  expect(questionBank.posts).toEqual([]);
  page.once("dialog", dialog => dialog.accept());
  await edit.click();
  await expect(prompt).toHaveValue("Câu hỏi thuộc ngân hàng A");
  await expect(prompt).toBeFocused();
  await prompt.fill("Bản sửa đang viết");
  await edit.click();
  await expect(prompt).toHaveValue("Bản sửa đang viết");
  await expect(prompt).toBeFocused();
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Đóng form câu hỏi", exact: true }).click();
  await expect(prompt).toHaveValue("Bản sửa đang viết");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Đóng form câu hỏi", exact: true }).click();
  await expect(prompt).toHaveCount(0);
  await expect(edit).toBeFocused();
  expect(questionBank.posts).toEqual([]);
});

test("question preview opens as a read-only dialog and restores focus", async ({ page }) => {
  await visitLoadedBankA(page);
  const trigger = page.locator(".question-bank-item-preview").first();
  await trigger.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("CÃ¢u há»i thuá»™c ngÃ¢n hÃ ng A");
  await expect(dialog.locator(".question-bank-preview-option.is-correct")).toContainText("ÄÃºng");
  await expect(dialog.getByRole("button", { name: "ÄÃ³ng xem trÆ°á»›c", exact: true })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("invalid image URL opens advanced fields and successful save restores focus", async ({ page, questionBank }) => {
  await visitLoadedBankA(page);
  await openNewQuestionForm(page);
  await page.locator("#question-bank-prompt").fill("Câu có hình minh họa");
  await page.locator(".question-bank-advanced summary").click();
  const media = page.locator("#question-bank-media-url");
  await media.fill("invalid-image-url");
  await page.locator("#question-bank-options").fill("A | Đúng\nB | Sai");
  await page.locator(".question-bank-advanced summary").click();
  await page.getByRole("button", { name: "Lưu câu hỏi", exact: true }).click();
  await expect(page.locator(".question-bank-advanced")).toHaveAttribute("open", "");
  await expect(media).toBeFocused();
  await expect(media).toHaveAttribute("aria-invalid", "true");
  expect(questionBank.posts).toHaveLength(0);
  await media.fill("/images/example.png");
  await page.locator("#question-bank-options").fill("A | Đúng\nB | Sai");
  await page.getByRole("button", { name: "Lưu câu hỏi", exact: true }).click();
  await expect.poll(() => questionBank.posts.length).toBe(1);
  await expect(page.getByRole("status").filter({ hasText: "Đã thêm câu hỏi phiên bản 1." })).toBeVisible();
  await expect(page.locator(".question-bank-actions-row").getByRole("button", { name: "Thêm câu hỏi" })).toBeFocused();
});

test("new bank draft survives a cancelled close and warns before changing banks", async ({ page, questionBank }) => {
  await visitLoadedBankA(page);
  await page.getByRole("button", { name: "Tạo ngân hàng", exact: true }).click();
  const name = page.locator(".question-bank-create-form input").first();
  await name.fill("Ngân hàng bản nháp");
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Đóng form tạo ngân hàng", exact: true }).click();
  await expect(name).toHaveValue("Ngân hàng bản nháp");
  page.once("dialog", dialog => dialog.dismiss());
  await page.locator(".question-bank-list").getByRole("button", { name: /Ngân hàng B/ }).click();
  await expect(name).toHaveValue("Ngân hàng bản nháp");
  await expect(page.locator(".question-bank-stage-heading h2")).toHaveText("Ngân hàng A");
  page.once("dialog", dialog => dialog.accept());
  await page.locator(".question-bank-list").getByRole("button", { name: /Ngân hàng B/ }).click();
  await expect(page.locator(".question-bank-stage-heading h2")).toHaveText("Ngân hàng B");
  await expect(page.locator(".question-bank-create-form")).toHaveCount(0);
  expect(questionBank.posts).toEqual([]);
});

test("sidebar navigation keeps a dirty question draft when leaving is cancelled", async ({ page, questionBank }) => {
  await visitLoadedBankA(page);
  const form = await openNewQuestionForm(page);
  const prompt = form.locator("#question-bank-prompt");
  await prompt.fill("Bản nháp phải còn nguyên khi hủy điều hướng");
  let confirmation = "";
  page.once("dialog", async dialog => {
    confirmation = dialog.message();
    await dialog.dismiss();
  });
  await clickAdminSidebarLink(page, "Đề thi");

  expect(confirmation).toMatch(/bản nháp|chưa lưu|rời trang/i);
  await expect(page).toHaveURL(/\/admin\/question-bank$/);
  await expect(prompt).toHaveValue("Bản nháp phải còn nguyên khi hủy điều hướng");
  expect(questionBank.posts).toEqual([]);
});

test("browser Back keeps a dirty question draft when leaving is cancelled", async ({ page, questionBank }, testInfo) => {
  test.skip(testInfo.project.name.startsWith("mobile-"), "The narrow protected exam route does not expose a bank sidebar link for real-history setup.");
  await page.goto("/admin/exams");
  await clickAdminSidebarLink(page, "Ngân hàng câu hỏi");
  await waitForBankA(page);
  const form = await openNewQuestionForm(page);
  const prompt = form.locator("#question-bank-prompt");
  await prompt.fill("Bản nháp phải còn nguyên khi hủy nút quay lại");
  await expect(prompt).toHaveValue("Bản nháp phải còn nguyên khi hủy nút quay lại");
  const dialogPromise = page.waitForEvent("dialog");
  await page.evaluate(() => window.history.back());
  const dialog = await dialogPromise;
  expect(dialog.type()).toBe("confirm");
  expect(dialog.message()).toMatch(/bản nháp|chưa lưu|rời trang/i);
  await dialog.dismiss();
  await expect(page).toHaveURL(/\/admin\/question-bank$/);
  await expect(prompt).toHaveValue("Bản nháp phải còn nguyên khi hủy nút quay lại");
  // Next may restore route state asynchronously after the popstate handler returns.
  await page.waitForTimeout(1_000);
  await expect(page).toHaveURL(/\/admin\/question-bank$/);
  await expect(prompt).toHaveValue("Bản nháp phải còn nguyên khi hủy nút quay lại");
  expect(questionBank.posts).toEqual([]);

  const acceptedDialogPromise = page.waitForEvent("dialog");
  await page.evaluate(() => window.history.back());
  const acceptedDialog = await acceptedDialogPromise;
  expect(acceptedDialog.type()).toBe("confirm");
  await acceptedDialog.accept();
  await expect(page).toHaveURL(/\/admin\/exams$/);
  await expect(page.locator(".question-bank-workspace")).toHaveCount(0);
});

test("sidebar remains navigable after cancelling browser Back", async ({ page, questionBank }, testInfo) => {
  test.skip(testInfo.project.name.startsWith("mobile-"), "The narrow protected exam route does not expose a bank sidebar link for real-history setup.");
  await page.goto("/admin/exams");
  await clickAdminSidebarLink(page, "Ngân hàng câu hỏi");
  await waitForBankA(page);
  const form = await openNewQuestionForm(page);
  const prompt = form.locator("#question-bank-prompt");
  await prompt.fill("Bản nháp trước khi chọn một liên kết khác");

  const backDialogPromise = page.waitForEvent("dialog");
  await page.evaluate(() => window.history.back());
  await (await backDialogPromise).dismiss();
  await page.waitForTimeout(1_000);
  await expect(page).toHaveURL(/\/admin\/question-bank$/);
  await expect(prompt).toHaveValue("Bản nháp trước khi chọn một liên kết khác");

  let confirmations = 0;
  page.once("dialog", async dialog => {
    confirmations += 1;
    await dialog.accept();
  });
  await clickAdminSidebarLink(page, "Đề thi");
  expect(confirmations).toBe(1);
  await expect(page).toHaveURL(/\/admin\/exams$/);
  await expect(page.locator(".question-bank-workspace")).toHaveCount(0);
  expect(questionBank.posts).toEqual([]);
});

test("question bank navigation guard allows an accepted product-navigation event", async ({ page }) => {
  await visitLoadedBankA(page);
  const form = await openNewQuestionForm(page);
  await form.locator("#question-bank-prompt").fill("Bản nháp cho phép rời trang sau khi xác nhận");

  let confirmation = "";
  page.once("dialog", async dialog => {
    confirmation = dialog.message();
    await dialog.accept();
  });
  const allowed = await page.evaluate(() => window.dispatchEvent(new CustomEvent("remix:before-product-navigation", {
    cancelable: true,
    detail: { path: "/admin/exams", source: "link" },
  })));

  expect(confirmation).toMatch(/bản nháp|chưa lưu|rời trang/i);
  expect(allowed).toBe(true);
});

test("pending question save blocks sidebar navigation until the write completes", async ({ page, questionBank }) => {
  await visitLoadedBankA(page);
  questionBank.pausePost("create_item");
  const form = await openNewQuestionForm(page);
  const prompt = form.locator("#question-bank-prompt");
  try {
    await prompt.fill("Câu hỏi đang lưu không được rời trang giữa chừng");
    await form.locator("#question-bank-options").fill("A | Đúng\nB | Sai");
    await form.locator("#question-bank-correct-answer").fill("A");
    await form.getByRole("button", { name: "Lưu câu hỏi", exact: true }).click();
    await expect.poll(() => questionBank.posts.length).toBe(1);

    await clickAdminSidebarLink(page, "Đề thi");
    await expect(page).toHaveURL(/\/admin\/question-bank$/);
    await expect(page.getByRole("status").filter({ hasText: "Đang lưu dữ liệu. Hãy đợi hoàn tất trước khi rời trang." })).toBeVisible();
    await expect(prompt).toBeDisabled();
  } finally {
    questionBank.releasePost("create_item");
  }

  await expect(form).toHaveCount(0);
});

test("create bank form focuses its name field and restores focus when closed", async ({ page }) => {
  await visitLoadedBankA(page);
  const createButton = page.getByRole("button", { name: "Tạo ngân hàng", exact: true });
  await createButton.click();
  const form = page.locator(".question-bank-create-form");
  await expect(form.getByRole("textbox", { name: "Tên ngân hàng" })).toBeFocused();
  await form.getByRole("button", { name: "Đóng form tạo ngân hàng" }).click();
  await expect(form).toHaveCount(0);
  await expect(createButton).toBeFocused();
});

test("topic and LaTeX panels open and close with keyboard focus restored", async ({ page }) => {
  await visitLoadedBankA(page);
  const actions = page.locator(".question-bank-actions-row");
  const topicTrigger = actions.getByRole("button", { name: "Chủ đề", exact: true });
  await topicTrigger.focus();
  await topicTrigger.press("Enter");
  const topicForm = page.locator("form.question-bank-inline-form").filter({ hasText: "Tạo cấu trúc chủ đề" });
  await expect(topicForm.locator("input").first()).toBeFocused();
  await topicForm.getByRole("button", { name: "Đóng form chủ đề", exact: true }).click();
  await expect(topicTrigger).toBeFocused();

  const importTrigger = actions.getByRole("button", { name: "Nạp câu hỏi", exact: true });
  await importTrigger.focus();
  await importTrigger.press("Enter");
  const importPanel = page.locator(".question-bank-import-panel");
  await expect(importPanel.locator("#question-bank-latex-file")).toBeFocused();
  await importPanel.getByRole("button", { name: "Đóng form nạp câu hỏi", exact: true }).click();
  await expect(importTrigger).toBeFocused();
});

test("pending create bank keeps its draft and disables close controls", async ({ page, questionBank }) => {
  await visitLoadedBankA(page);
  questionBank.pauseCreateBank();
  const createButton = page.getByRole("button", { name: "Tạo ngân hàng", exact: true });
  const form = page.locator(".question-bank-create-form");
  const questionSelection = page.locator(".question-bank-item-select input").first();
  try {
    await createButton.click();
    const name = form.getByRole("textbox", { name: "Tên ngân hàng" });
    await expect(name).toBeFocused();
    await name.fill("Ngân hàng đang tạo");
    await form.getByRole("button", { name: "Lưu ngân hàng" }).click();
    await expect.poll(() => questionBank.posts.length).toBe(1);
    await expect(form).toBeVisible();
    await expect(name).toHaveValue("Ngân hàng đang tạo");
    await expect(name).toBeDisabled();
    await expect(createButton).toBeDisabled();
    await expect(form.getByRole("button", { name: "Đóng form tạo ngân hàng" })).toBeDisabled();
    await expect(questionSelection).toBeDisabled();
    await expect(questionSelection).not.toBeChecked();
    await expect(page.locator(".question-bank-header-actions .outline-btn")).not.toHaveAttribute("href", /./);
  } finally {
    questionBank.releaseCreateBank();
  }
  await expect(form).toHaveCount(0);
  await expect(page.locator(".question-bank-stage-heading h2")).toHaveText("Ngân hàng đang tạo");
  await expect(createButton).toBeFocused();
});

test("creating a bank keeps an existing question selection in its original bank", async ({ page, questionBank }) => {
  await visitLoadedBankA(page);
  const selection = page.locator(".question-bank-item-select input").first();
  await selection.check();
  await page.getByRole("button", { name: "Tạo ngân hàng", exact: true }).click();
  const form = page.locator(".question-bank-create-form");
  await form.getByRole("textbox", { name: "Tên ngân hàng" }).fill("Ngân hàng mới giữ lựa chọn");
  await form.getByRole("button", { name: "Lưu ngân hàng" }).click();

  await expect.poll(() => questionBank.posts.length).toBe(1);
  await expect(form).toHaveCount(0);
  await expect(page.locator(".question-bank-stage-heading h2")).toHaveText("Ngân hàng A");
  await expect(selection).toBeChecked();
  await expect(page.getByRole("status").filter({ hasText: "Chọn ngân hàng mới trong danh sách để tiếp tục." })).toBeVisible();
  await expect(page.locator(".question-bank-list").getByRole("button", { name: /Ngân hàng mới giữ lựa chọn/ })).toBeVisible();
});

test("creating a bank selects it and restores focus after the form closes", async ({ page, questionBank }) => {
  await visitLoadedBankA(page);
  const createButton = page.getByRole("button", { name: "Tạo ngân hàng", exact: true });
  await createButton.click();
  const form = page.locator(".question-bank-create-form");
  await form.getByRole("textbox", { name: "Tên ngân hàng" }).fill("Ngân hàng mới");
  await form.getByRole("textbox", { name: "Môn học" }).fill("TOAN");
  await form.getByRole("button", { name: "Lưu ngân hàng" }).click();

  await expect.poll(() => questionBank.posts.length).toBe(1);
  expect(questionBank.posts[0]?.body).toMatchObject({ action: "create_bank", name: "Ngân hàng mới", subjectCode: "TOAN" });
  await expect(form).toHaveCount(0);
  await expect(page.locator(".question-bank-stage-heading h2")).toHaveText("Ngân hàng mới");
  await expect(page.locator(".question-bank-list").getByRole("button", { name: /Ngân hàng mới/ })).toHaveAttribute("aria-pressed", "true");
  await expect(createButton).toBeFocused();
  await expect(page.getByRole("status").filter({ hasText: "Đã tạo ngân hàng câu hỏi." })).toBeVisible();
});

test("pending question save locks its draft until the write completes", async ({ page, questionBank }) => {
  await visitLoadedBankA(page);
  questionBank.pausePost("create_item");
  const form = await openNewQuestionForm(page);
  const prompt = form.locator("#question-bank-prompt");
  const options = form.locator("#question-bank-options");
  const answer = form.locator("#question-bank-correct-answer");
  const addQuestion = page.locator(".question-bank-actions-row").getByRole("button", { name: "Thêm câu hỏi" });
  const close = form.getByRole("button", { name: "Đóng form câu hỏi" });

  try {
    await prompt.fill("Câu hỏi đang lưu không được mất bản nháp");
    await options.fill("A | Đúng\nB | Sai");
    await answer.fill("A");
    await form.getByRole("button", { name: "Lưu câu hỏi", exact: true }).click();
    await expect.poll(() => questionBank.posts.length).toBe(1);
    expect(questionBank.posts[0]?.body).toMatchObject({
      action: "create_item",
      bankId: "qbank-a",
      content: { prompt: "Câu hỏi đang lưu không được mất bản nháp" },
    });
    await expect(form).toBeVisible();
    await expect(prompt).toHaveValue("Câu hỏi đang lưu không được mất bản nháp");
    await expect(prompt).toBeDisabled();
    await expect(options).toBeDisabled();
    await expect(answer).toBeDisabled();
    await expect(close).toBeDisabled();
    await expect(addQuestion).toBeDisabled();
  } finally {
    questionBank.releasePost("create_item");
  }

  await expect(form).toHaveCount(0);
  await expect(page.locator(".question-bank-item-card")).toHaveCount(2);
  await expect(page.locator(".question-bank-item-card").last()).toContainText("Câu hỏi đang lưu không được mất bản nháp");
  await expect(page.getByRole("status").filter({ hasText: "Đã thêm câu hỏi phiên bản 1." })).toBeVisible();
  await expect(addQuestion).toBeFocused();
});

test("successful question save survives a failed detail refresh and retries without a second POST", async ({ page, questionBank }) => {
  await visitLoadedBankA(page);
  questionBank.failNextDetailLoad("qbank-a", "Không thể tải lại chi tiết ngân hàng synthetic.");
  const form = await openNewQuestionForm(page);
  const prompt = form.locator("#question-bank-prompt");
  await prompt.fill("Câu hỏi đã lưu dù tải lại thất bại");
  await form.locator("#question-bank-options").fill("A | Đúng\nB | Sai");
  await form.locator("#question-bank-correct-answer").fill("A");
  await form.getByRole("button", { name: "Lưu câu hỏi", exact: true }).click();

  await expect.poll(() => questionBank.posts.length).toBe(1);
  await expect(form).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Đã thêm câu hỏi phiên bản 1." })).toBeVisible();
  const retry = page.getByRole("button", { name: "Tải lại ngân hàng", exact: true });
  await expect(retry).toBeVisible();
  expect(questionBank.detailRequestCount("qbank-a")).toBe(2);

  const postsBeforeRetry = questionBank.posts.length;
  const detailsBeforeRetry = questionBank.detailRequestCount("qbank-a");
  await retry.click();
  await waitForBankA(page);
  await expect(page.locator(".question-bank-item-card")).toHaveCount(2);
  await expect(page.locator(".question-bank-stage")).toContainText("Câu hỏi đã lưu dù tải lại thất bại");
  expect(questionBank.detailRequestCount("qbank-a")).toBe(detailsBeforeRetry + 1);
  expect(questionBank.posts).toHaveLength(postsBeforeRetry);
});

test("pending LaTeX import locks its preview and file selection until completion", async ({ page, questionBank }) => {
  await visitLoadedBankA(page);
  questionBank.pausePost("import_latex");
  const importToggle = page.locator(".question-bank-actions-row").getByRole("button", { name: "Nạp câu hỏi", exact: true });
  await importToggle.click();
  const panel = page.locator(".question-bank-import-panel");
  const file = panel.locator("#question-bank-latex-file");
  const node = panel.locator("#question-bank-latex-node");
  const close = panel.getByRole("button", { name: "Đóng form nạp câu hỏi" });
  const source = String.raw`\begin{ex}
Giá trị của $1+1$ là bao nhiêu?
\choice{\True $2$}{$3$}
\end{ex}`;

  try {
    await file.setInputFiles({ name: "pending.tex", mimeType: "text/x-tex", buffer: Buffer.from(source) });
    await expect(panel.locator(".question-bank-latex-preview-item")).toHaveCount(1);
    const selection = panel.getByRole("checkbox", { name: "Chọn câu 1" });
    await expect(selection).toBeChecked();
    await node.selectOption("qbank-node-a");
    await panel.getByRole("button", { name: "Lưu 1 câu đã chọn" }).click();
    await expect.poll(() => questionBank.posts.length).toBe(1);
    expect(questionBank.posts[0]?.body).toMatchObject({
      action: "import_latex",
      bankId: "qbank-a",
      parentId: "qbank-node-a",
      importIndexes: [0],
      latexSource: source,
    });
    await expect(panel).toBeVisible();
    await expect(panel.getByText("pending.tex")).toBeVisible();
    await expect(file).toBeDisabled();
    await expect(node).toBeDisabled();
    await expect(selection).toBeDisabled();
    await expect(close).toBeDisabled();
    await expect(importToggle).toBeDisabled();
  } finally {
    questionBank.releasePost("import_latex");
  }

  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Đã lưu 1 câu hỏi từ pending.tex." })).toBeVisible();
  await expect(importToggle).toBeEnabled();
});

test("pending section import locks both import methods until completion", async ({ page, questionBank }) => {
  await visitLoadedBankA(page);
  questionBank.pausePost("seed_from_section");
  const importToggle = page.locator(".question-bank-actions-row").getByRole("button", { name: "Nạp câu hỏi", exact: true });
  await importToggle.click();
  const panel = page.locator(".question-bank-import-panel");
  const file = panel.locator("#question-bank-latex-file");
  const latexNode = panel.locator("#question-bank-latex-node");
  const section = panel.locator("#question-bank-source-section");
  const seedNode = panel.locator("#question-bank-seed-node");
  const close = panel.getByRole("button", { name: "Đóng form nạp câu hỏi" });

  try {
    await section.selectOption("qbank-section-draft");
    await seedNode.selectOption("qbank-node-a");
    await panel.getByRole("button", { name: "Nạp từ đề vào ngân hàng" }).click();
    await expect.poll(() => questionBank.posts.length).toBe(1);
    expect(questionBank.posts[0]?.body).toEqual({
      action: "seed_from_section",
      bankId: "qbank-a",
      sectionId: "qbank-section-draft",
      parentId: "qbank-node-a",
    });
    await expect(panel).toBeVisible();
    await expect(section).toHaveValue("qbank-section-draft");
    await expect(seedNode).toHaveValue("qbank-node-a");
    await expect(file).toBeDisabled();
    await expect(latexNode).toBeDisabled();
    await expect(section).toBeDisabled();
    await expect(seedNode).toBeDisabled();
    await expect(close).toBeDisabled();
    await expect(importToggle).toBeDisabled();
  } finally {
    questionBank.releasePost("seed_from_section");
  }

  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Đã nạp 0 câu hỏi vào ngân hàng." })).toBeVisible();
  await expect(importToggle).toBeFocused();
});

test("section import requires confirmation before discarding a LaTeX preview", async ({ page, questionBank }) => {
  await visitLoadedBankA(page);
  await page.locator(".question-bank-actions-row").getByRole("button", { name: "Nạp câu hỏi", exact: true }).click();
  const panel = page.locator(".question-bank-import-panel");
  const file = panel.locator("#question-bank-latex-file");
  const section = panel.locator("#question-bank-source-section");
  const seed = panel.getByRole("button", { name: "Nạp từ đề vào ngân hàng" });
  const source = String.raw`\begin{ex}
Giá trị của $1+1$ là bao nhiêu?
\choice{\True $2$}{$3$}
\end{ex}`;
  await file.setInputFiles({ name: "unsaved-preview.tex", mimeType: "text/x-tex", buffer: Buffer.from(source) });
  await expect(panel.locator(".question-bank-latex-preview-item")).toHaveCount(1);
  await section.selectOption("qbank-section-draft");

  let confirmation = "";
  page.once("dialog", async dialog => {
    confirmation = dialog.message();
    await dialog.dismiss();
  });
  await seed.click();
  expect(confirmation).toMatch(/LaTeX|xem trước/i);
  expect(questionBank.posts).toHaveLength(0);
  await expect(panel.locator(".question-bank-latex-preview-item")).toHaveCount(1);
  await expect(panel.getByText("unsaved-preview.tex")).toBeVisible();
  await expect(section).toHaveValue("qbank-section-draft");

  page.once("dialog", dialog => dialog.accept());
  await seed.click();
  await expect.poll(() => questionBank.posts.length).toBe(1);
  expect(questionBank.posts[0]?.body).toMatchObject({ action: "seed_from_section", sectionId: "qbank-section-draft" });
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Đã nạp 0 câu hỏi vào ngân hàng." })).toBeVisible();
});

test("LaTeX import requires confirmation before discarding section selections", async ({ page, questionBank }) => {
  await visitLoadedBankA(page);
  await page.locator(".question-bank-actions-row").getByRole("button", { name: "Nạp câu hỏi", exact: true }).click();
  const panel = page.locator(".question-bank-import-panel");
  const file = panel.locator("#question-bank-latex-file");
  const latexNode = panel.locator("#question-bank-latex-node");
  const section = panel.locator("#question-bank-source-section");
  const seedNode = panel.locator("#question-bank-seed-node");
  const saveLatex = panel.getByRole("button", { name: "Lưu 1 câu đã chọn" });
  const source = String.raw`\begin{ex}
Giá trị của $1+1$ là bao nhiêu?
\choice{\True $2$}{$3$}
\end{ex}`;

  await section.selectOption("qbank-section-draft");
  await seedNode.selectOption("qbank-node-a");
  await latexNode.selectOption("qbank-node-a");
  await file.setInputFiles({ name: "section-selection.tex", mimeType: "text/x-tex", buffer: Buffer.from(source) });
  await expect(panel.locator(".question-bank-latex-preview-item")).toHaveCount(1);

  let confirmation = "";
  page.once("dialog", async dialog => {
    confirmation = dialog.message();
    await dialog.dismiss();
  });
  await saveLatex.click();
  expect(confirmation).toMatch(/nạp từ đề|lựa chọn/i);
  expect(questionBank.posts).toHaveLength(0);
  await expect(panel.locator(".question-bank-latex-preview-item")).toHaveCount(1);
  await expect(panel.getByText("section-selection.tex")).toBeVisible();
  await expect(section).toHaveValue("qbank-section-draft");
  await expect(seedNode).toHaveValue("qbank-node-a");
  await expect(latexNode).toHaveValue("qbank-node-a");

  page.once("dialog", dialog => dialog.accept());
  await saveLatex.click();
  await expect.poll(() => questionBank.posts.length).toBe(1);
  expect(questionBank.posts[0]?.body).toMatchObject({
    action: "import_latex",
    bankId: "qbank-a",
    parentId: "qbank-node-a",
    importIndexes: [0],
    latexSource: source,
  });
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Đã lưu 1 câu hỏi từ section-selection.tex." })).toBeVisible();
});

test("pending topic creation locks its form and restores focus after success", async ({ page, questionBank }) => {
  await visitLoadedBankA(page);
  questionBank.pausePost("create_node");
  const toggle = page.locator(".question-bank-actions-row").getByRole("button", { name: "Chủ đề", exact: true });
  await toggle.click();
  const form = page.locator("form.question-bank-inline-form");
  const title = form.getByRole("textbox", { name: "Tên chủ đề" });
  const parent = form.getByRole("combobox", { name: "Chủ đề cha" });
  const nodeType = form.getByRole("combobox", { name: "Kiểu cấu trúc" });
  const close = form.getByRole("button", { name: "Đóng form chủ đề" });

  try {
    await title.fill("Đơn vị kiến thức đang tạo");
    await parent.selectOption("qbank-node-a");
    await nodeType.selectOption("unit");
    await form.getByRole("button", { name: "Lưu chủ đề" }).click();
    await expect.poll(() => questionBank.posts.length).toBe(1);
    expect(questionBank.posts[0]?.body).toEqual({
      action: "create_node",
      bankId: "qbank-a",
      title: "Đơn vị kiến thức đang tạo",
      parentId: "qbank-node-a",
      nodeType: "unit",
    });
    await expect(form).toBeVisible();
    await expect(title).toHaveValue("Đơn vị kiến thức đang tạo");
    await expect(title).toBeDisabled();
    await expect(parent).toBeDisabled();
    await expect(nodeType).toBeDisabled();
    await expect(close).toBeDisabled();
    await expect(toggle).toBeDisabled();
  } finally {
    questionBank.releasePost("create_node");
  }

  await expect(form).toHaveCount(0);
  await expect(page.locator(".question-bank-node-panel")).toContainText("Đơn vị kiến thức đang tạo");
  await expect(page.getByRole("status").filter({ hasText: "Đã thêm chủ đề." })).toBeVisible();
  await expect(toggle).toBeFocused();
});

test("pending exam attachment locks target and question selection until success", async ({ page, questionBank }) => {
  await visitLoadedBankA(page);
  questionBank.pausePost("attach_to_exam");
  const selection = page.locator(".question-bank-item-select input").first();
  await selection.check();
  await page.locator(".question-bank-toolbar").getByRole("button", { name: "Đưa 1 câu vào đề", exact: true }).click();
  const toggle = page.locator(".question-bank-toolbar").getByRole("button", { name: "Hủy đưa vào đề", exact: true });
  const form = page.locator(".question-bank-attach-form");
  const exam = form.getByRole("combobox", { name: "Đề thi", exact: true });
  const section = form.getByRole("combobox", { name: "Phần thi", exact: true });
  const refresh = page.locator(".question-bank-items-heading").getByRole("button", { name: "Làm mới" });

  try {
    await exam.selectOption("qbank-exam-draft");
    await section.selectOption("qbank-section-draft");
    await form.getByRole("button", { name: "Thêm vào đề nháp" }).click();
    await expect.poll(() => questionBank.posts.length).toBe(1);
    expect(questionBank.posts[0]?.body).toEqual({
      action: "attach_to_exam",
      bankId: "qbank-a",
      examId: "qbank-exam-draft",
      sectionId: "qbank-section-draft",
      itemIds: ["qbank-item-a"],
    });
    await expect(form).toBeVisible();
    await expect(exam).toHaveValue("qbank-exam-draft");
    await expect(section).toHaveValue("qbank-section-draft");
    await expect(exam).toBeDisabled();
    await expect(section).toBeDisabled();
    await expect(selection).toBeDisabled();
    await expect(selection).toBeChecked();
    await expect(toggle).toBeDisabled();
    await expect(refresh).toBeDisabled();
  } finally {
    questionBank.releasePost("attach_to_exam");
  }

  await expect(form).toHaveCount(0);
  await expect(selection).not.toBeChecked();
  await expect(toggle).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Đã thêm 1 câu vào đề." })).toBeVisible();
  await expect(refresh).toBeFocused();
});

test("attaching filtered-out selected questions requires explicit confirmation", async ({ page, questionBank }) => {
  await visitLoadedBankA(page);
  const selection = page.locator(".question-bank-item-select input").first();
  await selection.check();
  await page.getByRole("searchbox", { name: "Tìm câu hỏi", exact: true }).fill("không khớp câu đã chọn");
  await expect(page.locator(".question-bank-item-card")).toHaveCount(0);
  const warning = page.getByRole("status").filter({ hasText: "1 câu đang bị bộ lọc ẩn" });
  await expect(warning).toBeVisible();

  await page.locator(".question-bank-toolbar").getByRole("button", { name: "Đưa 1 câu vào đề", exact: true }).click();
  const form = page.locator(".question-bank-attach-form");
  await form.getByRole("combobox", { name: "Đề thi", exact: true }).selectOption("qbank-exam-draft");
  await form.getByRole("combobox", { name: "Phần thi", exact: true }).selectOption("qbank-section-draft");
  const submit = form.getByRole("button", { name: "Thêm vào đề nháp", exact: true });

  let confirmation = "";
  page.once("dialog", async dialog => {
    confirmation = dialog.message();
    await dialog.dismiss();
  });
  await submit.click();
  expect(confirmation).toMatch(/1 câu.*bộ lọc ẩn.*thêm vào đề nháp/i);
  expect(questionBank.posts).toHaveLength(0);
  await expect(warning).toBeVisible();

  page.once("dialog", dialog => dialog.accept());
  await submit.click();
  await expect.poll(() => questionBank.posts.length).toBe(1);
  expect(questionBank.posts[0]?.body).toEqual({
    action: "attach_to_exam",
    bankId: "qbank-a",
    examId: "qbank-exam-draft",
    sectionId: "qbank-section-draft",
    itemIds: ["qbank-item-a"],
  });
  await expect(page.getByRole("status").filter({ hasText: "Đã thêm 1 câu vào đề." })).toBeVisible();
});

test("question bank workspace visual states", async ({ page }, testInfo) => {
  await visitLoadedBankA(page);
  await assertWorkspaceFits(page);
  await expect(page.locator(".question-bank-sidebar")).toHaveCSS("backdrop-filter", "none");
  await expect(page.locator(".question-bank-workspace .primary-btn").first()).toHaveCSS("background-color", "rgb(205, 22, 39)");
  await page.screenshot({ path: testInfo.outputPath("question-bank-library.png"), fullPage: true });
  await openNewQuestionForm(page);
  await expect(page.getByRole("group", { name: "Phân loại câu hỏi" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Nội dung và đáp án" })).toBeVisible();
  await page.locator(".question-bank-advanced summary").click();
  await assertWorkspaceFits(page);
  await page.screenshot({ path: testInfo.outputPath("question-bank-editor.png"), fullPage: true });
  await page.getByRole("button", { name: "Đóng form câu hỏi", exact: true }).click();
  await page.getByRole("button", { name: "Nạp câu hỏi", exact: true }).click();
  await assertWorkspaceFits(page);
  await page.screenshot({ path: testInfo.outputPath("question-bank-import.png"), fullPage: true });
});

async function assertWorkspaceFits(page: Page) {
  const result = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const elements = [...document.querySelectorAll<HTMLElement>(".question-bank-workspace :is(h1,h2,h3,h4,p,legend,label,button,b,em,.question-bank-options span,.question-bank-item-footer span)")];
    const clipped = elements.filter(element => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height || element.classList.contains("sr-only")) return false;
      return rect.left < -1 || rect.right > viewport + 1 || (element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 2);
    }).map(element => ({ tag: element.tagName, className: element.className, text: element.textContent?.slice(0, 90), width: element.clientWidth, scroll: element.scrollWidth, children: [...element.children].map(child => ({ tag: child.tagName, width: child.getBoundingClientRect().width, minWidth: getComputedStyle(child).minWidth, appearance: getComputedStyle(child).appearance })) }));
    const shell = document.querySelector(".app-shell")!;
    const rail = shell.querySelector(":scope > .sidebar")!.getBoundingClientRect();
    const content = document.querySelector(".question-bank-workspace")!.getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth > viewport + 1,
      clipped,
      railOverlaps: viewport >= 768 && rail.right > content.left + 1,
    };
  });
  expect(result).toEqual({ overflow: false, clipped: [], railOverlaps: false });
}

async function clickAdminSidebarLink(page: Page, name: string) {
  const menu = page.getByRole("button", { name: "Mở menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  const link = page.locator("#main-sidebar").getByRole("link", { name, exact: true });
  await expect(link).toBeVisible();
  await link.click();
}

test("bank filters and exam selection remain keyboard operable", async ({ page, questionBank }, testInfo) => {
  await visitLoadedBankA(page);
  const search = page.getByRole("searchbox", { name: "Tìm câu hỏi", exact: true });
  await search.fill("không khớp câu nào");
  await expect(page.getByRole("heading", { name: "Chưa có câu hỏi phù hợp" })).toBeVisible();
  const reset = page.getByRole("button", { name: "Xóa bộ lọc", exact: true });
  await reset.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".question-bank-item-card")).toHaveCount(1);
  await page.getByRole("combobox", { name: "Lọc độ khó" }).selectOption("VDC");
  await expect(page.locator(".question-bank-item-card")).toHaveCount(0);
  await reset.click();
  const select = page.locator(".question-bank-item-select input");
  await select.focus();
  await page.keyboard.press("Space");
  await expect(select).toBeChecked();
  await page.getByRole("button", { name: "Đưa 1 câu vào đề", exact: true }).click();
  const form = page.locator(".question-bank-attach-form");
  await form.getByRole("combobox", { name: "Đề thi", exact: true }).selectOption("qbank-exam-draft");
  await form.getByRole("combobox", { name: "Phần thi", exact: true }).selectOption("qbank-section-draft");
  await expect(form.getByRole("combobox", { name: "Đề thi", exact: true }).locator('option[value="qbank-exam-published"]')).toHaveCount(0);
  await assertWorkspaceFits(page);
  await page.screenshot({ path: testInfo.outputPath("question-bank-reuse.png"), fullPage: true });
  await form.getByRole("button", { name: "Thêm vào đề nháp", exact: true }).click();
  await expect.poll(() => questionBank.posts.length).toBe(1);
  expect(questionBank.posts[0]?.body).toEqual({ action: "attach_to_exam", bankId: "qbank-a", examId: "qbank-exam-draft", sectionId: "qbank-section-draft", itemIds: ["qbank-item-a"] });
});

test.describe("question bank text stress", () => {
  test.use({ questionBankOptions: { permissions: ["question-bank", "exams"], longContent: true } });
  test("long Vietnamese English and unbroken content wraps in library and editor", async ({ page }, testInfo) => {
    await openQuestionBank(page);
    await expect(page.locator(".question-bank-item-card")).toHaveCount(1);
    await assertWorkspaceFits(page);
    await page.screenshot({ path: testInfo.outputPath("question-bank-long-content.png"), fullPage: true });
    await page.locator(".question-bank-item-edit").click();
    await expect(page.locator("#question-bank-prompt")).toHaveValue(/Advanced mathematics/);
    await assertWorkspaceFits(page);
    await page.getByRole("button", { name: "Đóng form câu hỏi", exact: true }).click();
    await page.getByRole("button", { name: "Nạp câu hỏi", exact: true }).click();
    await assertWorkspaceFits(page);
  });
});

async function openQuestionBank(page: Page) {
  await page.goto("/admin/question-bank");
}

async function waitForBankA(page: Page) {
  await expect(page.getByRole("heading", { name: "Ngân hàng câu hỏi", exact: true })).toBeVisible();
  await expect(page.locator(".question-bank-stage-heading h2")).toHaveText("Ngân hàng A");
  await expect(page.locator(".question-bank-stage")).toContainText("Câu hỏi thuộc ngân hàng A");
}

async function visitLoadedBankA(page: Page) {
  await openQuestionBank(page);
  await waitForBankA(page);
}

async function openNewQuestionForm(page: Page): Promise<Locator> {
  await page.locator(".question-bank-actions-row")
    .getByRole("button", { name: "Thêm câu hỏi", exact: true })
    .click();
  const form = page.locator("form.question-bank-form");
  await expect(form).toBeVisible();
  return form;
}

test("retries a selected bank detail after its initial load fails", async ({ page, questionBank }) => {
  questionBank.failNextDetailLoad("qbank-a", "Không thể tải chi tiết ngân hàng synthetic.");

  await openQuestionBank(page);
  const retry = page.getByRole("button", { name: "Tải lại ngân hàng", exact: true });
  await expect(retry).toBeVisible();
  expect(questionBank.detailRequestCount("qbank-a")).toBe(1);

  await retry.click();
  await waitForBankA(page);
  expect(questionBank.detailRequestCount("qbank-a")).toBe(2);
});

test("successful bank creation survives a failed catalog refresh and retries with GET only", async ({ page, questionBank }) => {
  await visitLoadedBankA(page);
  const catalogRequestCount = () => questionBank.apiRequests.filter(request =>
    request.method === "GET" && request.pathname === "/api/admin/question-banks" && request.search === "",
  ).length;
  const catalogRequestsBefore = catalogRequestCount();
  questionBank.failNextCatalogLoad("Không thể tải lại danh sách ngân hàng synthetic.");

  const createButton = page.getByRole("button", { name: "Tạo ngân hàng", exact: true });
  await createButton.click();
  const form = page.locator(".question-bank-create-form");
  await form.getByRole("textbox", { name: "Tên ngân hàng" }).fill("Ngân hàng sau lỗi tải lại");
  await form.getByRole("button", { name: "Lưu ngân hàng", exact: true }).click();

  await expect.poll(() => questionBank.posts.length).toBe(1);
  expect(questionBank.posts[0]?.body).toMatchObject({ action: "create_bank", name: "Ngân hàng sau lỗi tải lại" });
  await expect(form).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Đã tạo ngân hàng câu hỏi." })).toBeVisible();
  const refreshAlert = page.getByRole("alert").filter({ hasText: "Đã lưu, nhưng chưa thể tải lại danh sách ngân hàng." });
  await expect(refreshAlert).toBeVisible();
  const retry = refreshAlert.getByRole("button", { name: "Thử tải lại", exact: true });
  await expect(retry).toBeVisible();
  await expect.poll(() => catalogRequestCount()).toBe(catalogRequestsBefore + 1);

  const postsBeforeRetry = questionBank.posts.length;
  const catalogRequestsBeforeRetry = catalogRequestCount();
  await retry.click();
  await expect(page.locator(".question-bank-list").getByRole("button", { name: /Ngân hàng sau lỗi tải lại/ })).toBeVisible();
  await expect.poll(() => catalogRequestCount()).toBe(catalogRequestsBeforeRetry + 1);
  expect(questionBank.posts).toHaveLength(postsBeforeRetry);
});

test("switching banks clears prior content while the target detail is loading", async ({ page, questionBank }) => {
  await visitLoadedBankA(page);
  questionBank.pauseDetail("qbank-b");

  await page.locator(".question-bank-list")
    .getByRole("button", { name: /Ngân hàng B/ })
    .click();

  const stage = page.locator(".question-bank-stage");
  await expect(stage.locator(".question-bank-stage-loading[aria-busy='true']")).toBeVisible();
  await expect(stage).not.toContainText("Câu hỏi thuộc ngân hàng A");
  await expect(stage.locator(".question-bank-stage-heading h2")).toHaveCount(0);

  questionBank.releaseDetail("qbank-b");
  await expect(stage.locator(".question-bank-stage-heading h2")).toHaveText("Ngân hàng B");
  await expect(stage).toContainText("Câu hỏi thuộc ngân hàng B");
  await expect(stage).not.toContainText("Câu hỏi thuộc ngân hàng A");
});

test("an empty question submit focuses the prompt and does not write", async ({ page, questionBank }) => {
  await visitLoadedBankA(page);
  const form = await openNewQuestionForm(page);
  const prompt = page.locator("#question-bank-prompt");

  await form.getByRole("button", { name: "Lưu câu hỏi", exact: true }).click();

  await expect(prompt).toBeFocused();
  await expect(prompt).toHaveAttribute("aria-invalid", "true");
  await expect(prompt).toHaveAttribute("aria-describedby", "question-bank-prompt-error");
  await expect(page.locator("#question-bank-prompt-error")).toContainText("Nhập nội dung câu hỏi trước khi lưu.");
  expect(questionBank.posts).toEqual([]);
});

test("an inline decimal-comma answer is written as one answer", async ({ page, questionBank }) => {
  await visitLoadedBankA(page);
  const form = await openNewQuestionForm(page);

  await page.locator("#question-bank-question-type").selectOption("inline");
  await page.locator("#question-bank-prompt").fill("Điền giá trị gần đúng ____.");
  await page.locator("#question-bank-correct-answer").fill("3,14");
  await form.getByRole("button", { name: "Lưu câu hỏi", exact: true }).click();

  await expect.poll(() => questionBank.posts.length).toBe(1);
  expect(questionBank.posts[0]?.body).toMatchObject({
    action: "create_item",
    bankId: "qbank-a",
    parentId: null,
    content: {
      prompt: "Điền giá trị gần đúng ____.",
      question_type: "inline",
      options: [],
      correct_answer: ["3,14"],
    },
  });
  await expect(page.locator(".question-bank-stage")).toContainText("Điền giá trị gần đúng ____.");
});

test("an exam-capable admin sees the approved exam reuse surfaces", async ({ page }) => {
  await visitLoadedBankA(page);

  await expect(page.getByRole("link", { name: "Mở đề thi", exact: true })).toHaveAttribute("href", "/admin/exams");
  await expect(page.locator(".question-bank-item-select input")).toHaveCount(1);

  await page.locator(".question-bank-actions-row")
    .getByRole("button", { name: "Nạp câu hỏi", exact: true })
    .click();
  const sourceSection = page.locator("#question-bank-source-section");
  const seed = page.getByRole("button", { name: "Nạp từ đề vào ngân hàng", exact: true });
  await expect(sourceSection).toBeVisible();
  await expect(seed).toBeDisabled();
  await sourceSection.selectOption("qbank-section-draft");
  await expect(seed).toBeEnabled();
});

test.describe("question-bank-only admin", () => {
  test.use({ questionBankOptions: { permissions: ["question-bank"] } });

  test("does not receive exam reuse controls or exam source data", async ({ page }) => {
    await visitLoadedBankA(page);

    await expect(page.getByRole("link", { name: "Mở đề thi", exact: true })).toHaveCount(0);
    await expect(page.locator(".question-bank-item-select input")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Đưa \d+ câu vào đề/ })).toHaveCount(0);

    await page.locator(".question-bank-actions-row")
      .getByRole("button", { name: "Nạp câu hỏi", exact: true })
      .click();
    await expect(page.getByText("Nạp từ đề và đưa câu vào đề chỉ hiển thị với quyền quản lý đề thi.", { exact: true })).toBeVisible();
    await expect(page.locator("#question-bank-source-section")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Nạp từ đề vào ngân hàng", exact: true })).toHaveCount(0);
  });
});
