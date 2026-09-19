import { type Locator, type Page } from "@playwright/test";
import { expect, test } from "./fixtures/question-bank";

test.use({ serviceWorkers: "block" });

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

  await expect(page.getByRole("button", { name: "Mở đề thi", exact: true })).toBeVisible();
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

    await expect(page.getByRole("button", { name: "Mở đề thi", exact: true })).toHaveCount(0);
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
