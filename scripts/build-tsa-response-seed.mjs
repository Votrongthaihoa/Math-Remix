import { readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const sourceDir = resolve(process.argv[2] || "C:/Users/LENOVO/Desktop/Trial/Test");
const output = resolve(process.argv[3] || "supabase/migrations/008_seed_tsa_response_exam.sql");
const files = ["Toán.txt", "Đọc.txt", "Khoa học.txt"];
const roomId = "6acfa66b-b199-48c9-9c85-e41dc8b39cc4";
const examIds = {
  "Toán.txt": "10000000-0000-4000-8000-000000000001",
  "Đọc.txt": "10000000-0000-4000-8000-000000000002",
  "Khoa học.txt": "10000000-0000-4000-8000-000000000003",
};
const sectionIds = {
  "Toán.txt": "20000000-0000-4000-8000-000000000001",
  "Đọc.txt": "20000000-0000-4000-8000-000000000002",
  "Khoa học.txt": "20000000-0000-4000-8000-000000000003",
};

const sqlString = value => `'${String(value ?? "").replaceAll("'", "''")}'`;
const sqlJson = value => `${sqlString(JSON.stringify(value))}::jsonb`;
const imagePattern = /\$\/image_\{(https?:\/\/[^}]+)\}_\{[^}]*\}_\{[^}]*\}_\{[^}]*\}\$/g;

function strings(items) {
  return (items ?? []).map((item, index) => ({
    value: String.fromCharCode(65 + index),
    label: typeof item === "string" ? item : item?.content ?? "",
  }));
}

function normalizeQuestion(question, passage, index, sectionId) {
  const data = question.data_questions ?? {};
  const blanks = [...String(question.content ?? "").matchAll(/___+/g)].length;
  const type = ({
    single_choice: "single",
    multiple_choice: "multiple",
    fill_in_blank: blanks > 1 ? "inline" : "text",
    true_false: "true_false",
    drag_and_drop: "drag_drop",
    matching: "ordering",
  })[question.type] ?? "single";
  let options = [];
  if (["single", "multiple"].includes(type)) options = strings(data.answers);
  if (type === "true_false") options = strings(data.items);
  if (type === "drag_drop") options = strings(data.items);
  if (type === "ordering") options = strings(data.left_items);
  const media = [...String(question.content ?? "").matchAll(imagePattern)].map(match => match[1]);
  const prompt = String(question.content ?? "").replace(imagePattern, "").trim();
  const instruction = ({ multiple: "Chọn tất cả đáp án đúng", true_false: "Lựa chọn đúng hoặc sai cho từng phát biểu", drag_drop: "Kéo các đáp án vào vị trí phù hợp", ordering: "Sắp xếp các ý theo đúng thứ tự" })[type] ?? null;
  return { id: question.id, sectionId, prompt, type, options, passage, mediaUrl: media[0] ?? null, instruction, index };
}

const exams = files.map((file, examIndex) => {
  const parsed = JSON.parse(readFileSync(join(sourceDir, file), "utf8")).data;
  const questions = [];
  for (const item of parsed.questions ?? []) {
    if (item.type === "reading_comprehension") {
      const passage = String(item.content ?? "").trim();
      for (const child of item.questions ?? []) questions.push(normalizeQuestion(child, passage, questions.length, sectionIds[file]));
    } else questions.push(normalizeQuestion(item, null, questions.length, sectionIds[file]));
  }
  return { file, examIndex, id: examIds[file], sectionId: sectionIds[file], title: parsed.title, duration: Number(parsed.time_take) || 60, questions };
});

const lines = [
  "-- Generated from user-supplied visible exam responses.",
  "-- Contains prompts/options only; no hidden answer keys, credentials or session data.",
  "insert into public.exam_rooms (id,title,description,exam_type,access_mode,published,sort_order)",
  `values (${sqlString(roomId)},${sqlString("Luyện thi TSA — đề tham chiếu")},${sqlString("Bộ ba phần Toán, Đọc hiểu và Khoa học dựng từ response do người dùng cung cấp.")},'TSA','open',true,0)`,
  "on conflict (id) do update set title=excluded.title, description=excluded.description, published=true;",
];

for (const exam of exams) {
  lines.push(
    "insert into public.exams (id,room_id,title,description,exam_type,mode,duration_minutes,published,sort_order)",
    `values (${sqlString(exam.id)},${sqlString(roomId)},${sqlString(exam.title)},${sqlString(`Nguồn dữ liệu: ${basename(exam.file)}`)},'TSA','free',${exam.duration},true,${exam.examIndex})`,
    "on conflict (id) do update set title=excluded.title, duration_minutes=excluded.duration_minutes, published=true;",
    "insert into public.exam_sections (id,exam_id,title,duration_minutes,sort_order)",
    `values (${sqlString(exam.sectionId)},${sqlString(exam.id)},${sqlString(exam.title)},${exam.duration},0)`,
    "on conflict (id) do update set title=excluded.title, duration_minutes=excluded.duration_minutes;",
  );
  for (const question of exam.questions) {
    lines.push(
      "insert into public.exam_questions (id,section_id,prompt,question_type,options,points,sort_order,passage,media_url,instruction)",
      `values (${sqlString(question.id)},${sqlString(question.sectionId)},${sqlString(question.prompt)},${sqlString(question.type)},${sqlJson(question.options)},1,${question.index},${question.passage ? sqlString(question.passage) : "null"},${question.mediaUrl ? sqlString(question.mediaUrl) : "null"},${question.instruction ? sqlString(question.instruction) : "null"})`,
      "on conflict (id) do update set prompt=excluded.prompt, question_type=excluded.question_type, options=excluded.options, sort_order=excluded.sort_order, passage=excluded.passage, media_url=excluded.media_url, instruction=excluded.instruction;",
    );
  }
}

writeFileSync(output, `${lines.join("\n")}\n`, "utf8");
console.log(JSON.stringify({ output, exams: exams.map(exam => ({ title: exam.title, questions: exam.questions.length })) }, null, 2));
