import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedQuestionBankMediaUrl, normalizeQuestionBankContent, validateQuestionBankContent } from "../lib/question-bank.ts";

const options = (...values) => values.map(value => ({ value, label: `Phương án ${value}` }));

function expectValid(label, content) {
  const result = validateQuestionBankContent(content);
  assert.equal(result.valid, true, `${label}: ${JSON.stringify(result.fieldErrors)}`);
  assert.deepEqual(result.fieldErrors, {}, `${label}: không nên trả về lỗi trường`);
}

function expectInvalid(label, content, fields) {
  const result = validateQuestionBankContent(content);
  assert.equal(result.valid, false, `${label}: phải bị từ chối`);
  for (const field of fields) {
    assert.equal(typeof result.fieldErrors[field], "string", `${label}: thiếu lỗi cho ${field}`);
  }
  return result;
}

test("question-bank content accepts every supported persistable question format", () => {
  const cases = [
    ["single", {
      prompt: "Kết quả của 1 + 1 là gì?",
      question_type: "single",
      options: options("A", "B"),
      correct_answer: "A",
    }],
    ["multiple", {
      prompt: "Chọn các mệnh đề đúng.",
      question_type: "multiple",
      options: options("A", "B", "C"),
      correct_answer: ["A", "C"],
    }],
    ["text with its blank in instruction", {
      instruction: "Điền kết quả vào ____.",
      prompt: "Tính 2 + 2.",
      question_type: "text",
      correct_answer: "4",
    }],
    ["inline with blanks in prompt", {
      instruction: "Hoàn thành theo thứ tự.",
      passage: "Dữ kiện bổ sung.",
      prompt: "Điền ____ vào chỗ trống thứ nhất và ____ vào chỗ trống thứ hai.",
      question_type: "inline",
      correct_answer: ["x", "y"],
    }],
    ["true_false", {
      prompt: "Đánh dấu đúng hoặc sai cho từng phát biểu.",
      question_type: "true_false",
      options: options("A", "B"),
      correct_answer: ["true", "false"],
    }],
    ["drag_drop with blanks in prompt", {
      instruction: "Dùng mỗi phương án tối đa một lần.",
      passage: "Đọc dữ kiện trước khi kéo thả.",
      prompt: "Kéo ____ vào vị trí thứ nhất, rồi kéo ____ vào vị trí thứ hai.",
      question_type: "drag_drop",
      options: options("A", "B", "C"),
      correct_answer: ["A", "B"],
    }],
  ];

  for (const [label, content] of cases) expectValid(label, content);
});

test("question-bank content preserves a decimal-comma short answer", () => {
  const content = {
    prompt: "Điền giá trị gần đúng ____.",
    question_type: "text",
    correct_answer: "3,14",
  };
  assert.equal(normalizeQuestionBankContent(content).correct_answer, "3,14");
  expectValid("decimal-comma text answer", content);
});

test("question-bank inline answers preserve decimal commas as one answer per line", () => {
  const content = {
    prompt: "Giá trị gần đúng của π là ____. ",
    question_type: "inline",
    correct_answer: ["3,14"],
  };
  expectValid("decimal-comma inline answer", content);
  expectInvalid("split decimal-comma inline answer", {
    ...content,
    correct_answer: ["3", "14"],
  }, ["correctAnswer"]);
});

test("question-bank media URLs are constrained before learner-facing persistence", () => {
  for (const mediaUrl of [null, "https://cdn.example.test/diagram.png", "http://localhost:3000/image.svg", "/media/diagram.png?version=2"]) {
    assert.equal(isAllowedQuestionBankMediaUrl(mediaUrl), true, `should allow ${mediaUrl}`);
  }
  for (const mediaUrl of ["//cdn.example.test/diagram.png", "javascript:alert(1)", "data:image/svg+xml,<svg/>", "blob:https://example.test/id", "https://user:password@example.test/image.png", "not a URL", "/\\evil.example/image.png"]) {
    assert.equal(isAllowedQuestionBankMediaUrl(mediaUrl), false, `should reject ${mediaUrl}`);
  }
  expectInvalid("invalid media URL is surfaced on its own field", {
    prompt: "Câu hỏi có ảnh.",
    question_type: "single",
    options: options("A", "B"),
    correct_answer: "A",
    media_url: "javascript:alert(1)",
  }, ["mediaUrl"]);
});

test("question-bank content rejects unknown raw types and unsupported ordering", () => {
  const unknown = expectInvalid("unknown raw type", {
    prompt: "Nội dung hợp lệ nhưng dạng không tồn tại.",
    question_type: "essay",
    options: options("A", "B"),
    correct_answer: "A",
  }, ["questionType"]);
  assert.match(unknown.fieldErrors.questionType ?? "", /dạng câu hỏi|hỗ trợ/i);

  const ordering = expectInvalid("ordering", {
    prompt: "Ghép cặp hai vế.",
    question_type: "ordering",
    options: options("A", "B"),
    correct_answer: ["A", "B"],
  }, ["questionType"]);
  assert.match(ordering.fieldErrors.questionType ?? "", /ghép nối|trình soạn đề/i);
});

test("question-bank content requires a prompt, usable option codes, and valid answer keys", () => {
  expectInvalid("missing prompt", {
    question_type: "single",
    options: options("A", "B"),
    correct_answer: "A",
  }, ["prompt"]);

  expectInvalid("missing options", {
    prompt: "Câu một đáp án.",
    question_type: "single",
    options: [],
    correct_answer: "A",
  }, ["options", "correctAnswer"]);

  expectInvalid("blank option code", {
    prompt: "Câu một đáp án.",
    question_type: "single",
    options: [{ value: " ", label: "Phương án A" }, { value: "B", label: "Phương án B" }],
    correct_answer: "B",
  }, ["options"]);

  expectInvalid("duplicate option codes", {
    prompt: "Câu một đáp án.",
    question_type: "single",
    options: [{ value: "A", label: "Phương án A" }, { value: "a", label: "Phương án B" }],
    correct_answer: "A",
  }, ["options"]);

  const privateAnswerKey = "private-answer-key-8742";
  const unknownAnswer = expectInvalid("answer key outside options", {
    prompt: "Câu một đáp án.",
    question_type: "single",
    options: options("A", "B"),
    correct_answer: privateAnswerKey,
  }, ["correctAnswer"]);
  assert.doesNotMatch(JSON.stringify(unknownAnswer.fieldErrors), new RegExp(privateAnswerKey));

  expectInvalid("single cannot receive an answer array", {
    prompt: "Câu một đáp án.",
    question_type: "single",
    options: options("A", "B"),
    correct_answer: ["A"],
  }, ["correctAnswer"]);

  expectInvalid("multiple requires distinct option-code array", {
    prompt: "Câu nhiều đáp án.",
    question_type: "multiple",
    options: options("A", "B", "C"),
    correct_answer: ["A", "A"],
  }, ["correctAnswer"]);
});

test("question-bank content enforces blank and answer-shape contracts", () => {
  expectInvalid("text supports only one blank across all text fields", {
    instruction: "Điền ____.",
    passage: "Và điền tiếp ____.",
    prompt: "Tính kết quả.",
    question_type: "text",
    correct_answer: "4",
  }, ["prompt"]);

  expectInvalid("inline requires one answer per blank", {
    instruction: "Điền ____.",
    passage: "Điền tiếp ____.",
    prompt: "Hoàn thành.",
    question_type: "inline",
    correct_answer: ["x"],
  }, ["correctAnswer"]);

  expectInvalid("inline needs a blank", {
    prompt: "Không có ô trống.",
    question_type: "inline",
    correct_answer: ["x"],
  }, ["prompt", "correctAnswer"]);

  expectInvalid("inline blanks only in instruction or passage are not renderer-visible", {
    instruction: "Điền ____ vào chỗ trống thứ nhất.",
    passage: "Tiếp tục điền ____ vào chỗ trống thứ hai.",
    prompt: "Hoàn thành hai chỗ trống theo thứ tự.",
    question_type: "inline",
    correct_answer: ["x", "y"],
  }, ["prompt"]);

  expectInvalid("true_false only accepts lowercase literals in matching quantity", {
    prompt: "Đánh dấu đúng hoặc sai.",
    question_type: "true_false",
    options: options("A", "B"),
    correct_answer: ["true", "TRUE"],
  }, ["correctAnswer"]);

  expectInvalid("drag_drop requires distinct option codes for every blank", {
    instruction: "Kéo ____.",
    passage: "Rồi kéo ____.",
    prompt: "Hoàn thành.",
    question_type: "drag_drop",
    options: options("A", "B"),
    correct_answer: ["A", "A"],
  }, ["correctAnswer"]);

  expectInvalid("drag_drop needs at least one blank", {
    prompt: "Không có vị trí thả.",
    question_type: "drag_drop",
    options: options("A"),
    correct_answer: ["A"],
  }, ["prompt", "correctAnswer"]);

  expectInvalid("drag_drop blanks only in instruction or passage are not renderer-visible", {
    instruction: "Kéo ____ vào vị trí thứ nhất.",
    passage: "Sau đó kéo ____ vào vị trí thứ hai.",
    prompt: "Hoàn thành câu hỏi.",
    question_type: "drag_drop",
    options: options("A", "B"),
    correct_answer: ["A", "B"],
  }, ["prompt"]);
});
