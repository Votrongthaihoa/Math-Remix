export type ExamRoomType = "TSA" | "HSA" | "VSAT" | "THPTQG" | "OTHER";

export const DEFAULT_EXAM_ROOM_TYPE = "TSA";

export const EXAM_ROOM_TYPE_OPTIONS = [
  { value: "TSA", label: "TSA", description: "Đánh giá tư duy" },
  { value: "HSA", label: "HSA", description: "Đánh giá năng lực" },
  { value: "VSAT", label: "V-SAT", description: "Đánh giá đầu vào đại học" },
  { value: "THPTQG", label: "THPTQG", description: "Tốt nghiệp THPT" },
  { value: "OTHER", label: "Khác", description: "Loại phòng tùy chỉnh" },
] as const;

export type QuestionType = "single" | "multiple" | "text" | "inline" | "true_false" | "ordering" | "drag_drop";

export type ThptqgSubjectCode = "nguvan" | "toan" | "vatly" | "hoahoc" | "tienganh" | "tinhoc" | "lichsu" | "dialy";

export const THPTQG_SUBJECT_TEMPLATES: Array<{
  code: ThptqgSubjectCode;
  title: string;
  duration_minutes: number;
  question_count: number | null;
  structure: string;
}> = [
  { code: "nguvan", title: "Ngữ văn", duration_minutes: 120, question_count: null, structure: "Tự luận: Đọc hiểu 4 điểm và Viết 6 điểm" },
  { code: "toan", title: "Toán", duration_minutes: 90, question_count: 22, structure: "12 câu nhiều lựa chọn; 4 câu Đúng/Sai; 6 câu trả lời ngắn" },
  { code: "vatly", title: "Vật lí", duration_minutes: 50, question_count: 28, structure: "18 câu nhiều lựa chọn; 4 câu Đúng/Sai; 6 câu trả lời ngắn" },
  { code: "hoahoc", title: "Hóa học", duration_minutes: 50, question_count: 28, structure: "18 câu nhiều lựa chọn; 4 câu Đúng/Sai; 6 câu trả lời ngắn" },
  { code: "tienganh", title: "Tiếng Anh", duration_minutes: 50, question_count: 40, structure: "40 câu trắc nghiệm nhiều lựa chọn" },
  { code: "tinhoc", title: "Tin học", duration_minutes: 50, question_count: 28, structure: "24 câu nhiều lựa chọn; 4 câu Đúng/Sai" },
  { code: "lichsu", title: "Lịch sử", duration_minutes: 50, question_count: 28, structure: "24 câu nhiều lựa chọn; 4 câu Đúng/Sai" },
  { code: "dialy", title: "Địa lí", duration_minutes: 50, question_count: 28, structure: "18 câu nhiều lựa chọn; 4 câu Đúng/Sai; 6 câu trả lời ngắn" },
] as const;

export const HSA_SECTION_TEMPLATES = [
  { title: "Toán học và xử lý số liệu", duration_minutes: 75, question_count: 50, structure: "35 câu trắc nghiệm khách quan + 15 câu điền đáp án" },
  { title: "Văn học - Ngôn ngữ", duration_minutes: 60, question_count: 50, structure: "50 câu trắc nghiệm khách quan 4 lựa chọn" },
  { title: "Khoa học hoặc Tiếng Anh (tự chọn)", duration_minutes: 60, question_count: null, structure: "Khoa học: chọn 3/5 chủ đề · 51 câu (3×17); hoặc Tiếng Anh HSA-F · 50 câu" },
] as const;

export type HsaStructureVersion = "HSA-2026" | "HSA-2027" | "CUSTOM";
export const HSA_SCIENCE_SUBJECTS = [
  { code: "vatly", title: "Vật lí" },
  { code: "hoahoc", title: "Hóa học" },
  { code: "sinhhoc", title: "Sinh học" },
  { code: "lichsu", title: "Lịch sử" },
  { code: "dialy", title: "Địa lí" },
] as const;
export type HsaScienceSubjectCode = typeof HSA_SCIENCE_SUBJECTS[number]["code"];
export type HsaSelectionMode = "science" | "english" | "custom";
export type HsaSelectionConfig = {
  mode: HsaSelectionMode;
  subjects: HsaScienceSubjectCode[];
  label: string;
};
export type HsaStructureSection = {
  title: string;
  duration_minutes: number;
  question_count: number | null;
  structure: string;
};
export type HsaStructureConfig = {
  version: HsaStructureVersion;
  label: string;
  official: boolean;
  note: string;
  max_points: number;
  selection: HsaSelectionConfig;
  sections: HsaStructureSection[];
};

const DEFAULT_HSA_SCIENCE_SUBJECTS: HsaScienceSubjectCode[] = ["vatly", "hoahoc", "sinhhoc"];
const HSA_2026_NOTE = "Mốc chính thức HSA 2026: 3 phần, 150 điểm, 195 phút; phần 1 gồm 35 câu trắc nghiệm và 15 câu điền đáp án, phần 2 gồm 50 câu trắc nghiệm, phần 3 chọn Khoa học (3 trong 5 chủ đề Vật lí, Hóa học, Sinh học, Lịch sử, Địa lí) hoặc Tiếng Anh theo mã HSA-F. Có thể có câu hỏi thử nghiệm không tính điểm theo hướng dẫn từng đợt.";
const HSA_2027_NOTE = "HSA 2027 hiện mới là phương án đề xuất/tham khảo, chưa dùng như quy chế chính thức. Có thể chỉnh lại tên phần, thời lượng và số câu.";

function defaultHsaSelection(): HsaSelectionConfig {
  return {
    mode: "science",
    subjects: [...DEFAULT_HSA_SCIENCE_SUBJECTS],
    label: "Khoa học · chọn 3/5 chủ đề",
  };
}

export function normalizeHsaSelection(value: unknown): HsaSelectionConfig {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const mode = raw.mode === "english" || raw.mode === "custom" ? raw.mode : "science";
  const subjects = Array.isArray(raw.subjects)
    ? raw.subjects.filter((subject): subject is HsaScienceSubjectCode => HSA_SCIENCE_SUBJECTS.some(item => item.code === subject)).slice(0, 3)
    : [];
  if (mode === "science" && subjects.length !== 3) return defaultHsaSelection();
  return {
    mode,
    subjects,
    label: String(raw.label ?? (mode === "english" ? "Tiếng Anh · mã HSA-F" : mode === "custom" ? "Lựa chọn tùy chỉnh" : "Khoa học · chọn 3/5 chủ đề")).trim().slice(0, 160),
  };
}

export const HSA_STRUCTURE_PROFILES: Record<Exclude<HsaStructureVersion, "CUSTOM">, HsaStructureConfig> = {
  "HSA-2026": {
    version: "HSA-2026",
    label: "HSA 2026 · chính thức",
    official: true,
    note: HSA_2026_NOTE,
    max_points: 150,
    selection: defaultHsaSelection(),
    sections: HSA_SECTION_TEMPLATES.map(section => ({ ...section })),
  },
  "HSA-2027": {
    version: "HSA-2027",
    label: "HSA 2027 · đề xuất",
    official: false,
    note: HSA_2027_NOTE,
    max_points: 150,
    selection: defaultHsaSelection(),
    // Until VNU publishes a final 2027 regulation, start from the 2026
    // baseline and make every value editable in the workspace.
    sections: HSA_SECTION_TEMPLATES.map(section => ({ ...section })),
  },
};

export function defaultHsaStructureConfig(version: HsaStructureVersion = "HSA-2026"): HsaStructureConfig {
  const profile = HSA_STRUCTURE_PROFILES[version === "CUSTOM" ? "HSA-2026" : version];
  return {
    ...profile,
    version,
    label: version === "CUSTOM" ? "HSA tùy chỉnh" : profile.label,
    official: version === "CUSTOM" ? false : profile.official,
    note: version === "CUSTOM" ? "Cấu trúc HSA tùy chỉnh theo các phần bạn đã soạn." : profile.note,
    max_points: profile.max_points,
    selection: { ...profile.selection, subjects: [...profile.selection.subjects] },
    sections: profile.sections.map(section => ({ ...section })),
  };
}

export function normalizeHsaStructureConfig(value: unknown): HsaStructureConfig {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const rawVersion = raw.version === "HSA-2027" || raw.version === "CUSTOM" ? raw.version : "HSA-2026";
  const profile = rawVersion === "CUSTOM" ? null : HSA_STRUCTURE_PROFILES[rawVersion];
  const source = Array.isArray(raw.sections) ? raw.sections : profile?.sections ?? HSA_SECTION_TEMPLATES;
  const sections = source.slice(0, 12).map((value, index) => {
    const item = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const fallback = (profile?.sections ?? HSA_SECTION_TEMPLATES)[index % HSA_SECTION_TEMPLATES.length];
    const duration = Number(item.duration_minutes ?? fallback.duration_minutes);
    const count = item.question_count == null ? fallback.question_count : Number(item.question_count);
    return {
      title: String(item.title ?? fallback.title).trim().slice(0, 120) || fallback.title,
      duration_minutes: Number.isFinite(duration) ? Math.min(600, Math.max(1, Math.round(duration))) : fallback.duration_minutes,
      question_count: count == null || !Number.isFinite(count) ? null : Math.min(1000, Math.max(0, Math.round(count))),
      structure: String(item.structure ?? fallback.structure).trim().slice(0, 240) || fallback.structure,
    };
  });
  const resolvedSections = sections.length ? sections : HSA_SECTION_TEMPLATES.map(section => ({ ...section }));
  return {
    version: rawVersion,
    label: profile?.label ?? "HSA tùy chỉnh",
    official: Boolean(profile?.official),
    note: String(raw.note ?? profile?.note ?? "Cấu trúc HSA tùy chỉnh theo đề thi.").trim().slice(0, 500),
    max_points: Number.isFinite(Number(raw.max_points)) ? Math.min(1000, Math.max(1, Math.round(Number(raw.max_points)))) : profile?.max_points ?? 150,
    selection: normalizeHsaSelection(raw.selection ?? profile?.selection),
    sections: resolvedSections,
  };
}

export function hsaTotalDuration(config: HsaStructureConfig) {
  return config.sections.reduce((total, section) => total + Math.max(1, section.duration_minutes), 0);
}

export const VSAT_SUBJECT_TEMPLATES = [
  { title: "Toán", code: "toan", duration_minutes: 90, question_count: 25, structure: "9 Đúng/Sai · 6 MCQ theo nhóm · 5 ghép hợp · 5 trả lời ngắn · tối đa 150 điểm" },
  { title: "Vật lí", code: "vatly", duration_minutes: 60, question_count: 25, structure: "9 Đúng/Sai · 6 MCQ theo nhóm · 5 ghép hợp · 5 trả lời ngắn · tối đa 150 điểm" },
  { title: "Hóa học", code: "hoahoc", duration_minutes: 60, question_count: 25, structure: "9 Đúng/Sai · 6 MCQ theo nhóm · 5 ghép hợp · 5 trả lời ngắn · tối đa 150 điểm" },
  { title: "Sinh học", code: "sinhhoc", duration_minutes: 60, question_count: 25, structure: "9 Đúng/Sai · 6 MCQ theo nhóm · 5 ghép hợp · 5 trả lời ngắn · tối đa 150 điểm" },
  { title: "Lịch sử", code: "lichsu", duration_minutes: 60, question_count: 25, structure: "9 Đúng/Sai · 6 MCQ theo nhóm · 5 ghép hợp · 5 trả lời ngắn · tối đa 150 điểm" },
  { title: "Địa lí", code: "dialy", duration_minutes: 60, question_count: 25, structure: "9 Đúng/Sai · 6 MCQ theo nhóm · 5 ghép hợp · 5 trả lời ngắn · tối đa 150 điểm" },
  { title: "Tiếng Anh", code: "tienganh", duration_minutes: 60, question_count: 25, structure: "9 Đúng/Sai · 6 MCQ theo nhóm · 5 ghép hợp · 5 trả lời ngắn · tối đa 150 điểm" },
  { title: "Ngữ văn", code: "nguvan", duration_minutes: 90, question_count: 25, structure: "9 Đúng/Sai · 6 MCQ theo nhóm · 5 ghép hợp · 5 viết luận · tối đa 150 điểm" },
] as const;

export const QUESTION_FORMATS: Array<{
  value: QuestionType;
  label: string;
  guide: string;
  syntax: string;
  answerHint: string;
}> = [
  {
    value: "single",
    label: "Trắc nghiệm 4 lựa chọn",
    guide: "Chọn một đáp án đúng; tương ứng với \\choice và \\True trong mẫu LaTeX.",
    syntax: "\\choice {A} {B} {C} {\\True D}",
    answerHint: "A",
  },
  {
    value: "multiple",
    label: "Chọn nhiều đáp án",
    guide: "Dùng cho câu cần chọn nhiều phương án đúng; nhập các mã đáp án cách nhau bằng dấu phẩy.",
    syntax: "\\choice {\\True A} {B} {\\True C} {D}",
    answerHint: "A, C",
  },
  {
    value: "text",
    label: "Điền câu trả lời ngắn",
    guide: "Tương ứng với \\cham{đáp án}; nội dung có thể chứa công thức KaTeX.",
    syntax: "Kết quả là \\cham{42}.",
    answerHint: "Nhập đáp án, ví dụ: 42",
  },
  {
    value: "inline",
    label: "Nhiều ô trống trong câu",
    guide: "Mỗi chuỗi ____ trong đề tạo một ô nhập; đáp án nhập theo đúng thứ tự các ô.",
    syntax: "Miền xác định là ____ và tập giá trị là ____.",
    answerHint: "Giá trị 1, Giá trị 2",
  },
  {
    value: "true_false",
    label: "Đúng / Sai",
    guide: "Tương ứng với \\choiceTF; mỗi phát biểu nhận một giá trị true hoặc false.",
    syntax: "\\choiceTF {\\True Phát biểu đúng} {Phát biểu sai}",
    answerHint: "true, false",
  },
  {
    value: "ordering",
    label: "Ghép nối",
    guide: "Dùng trực tiếp \\match và \\with; mỗi [chỉ mục] trong \\with trỏ đến một ý ở cột trái.",
    syntax: "\\match\n    {Nội dung cột I - 1}\n    {Nội dung cột I - 2}\n\\with\n    [2]{Mô tả ghép với ý 2}\n    [1]{Mô tả ghép với ý 1}",
    answerHint: "Ví dụ: 1-B, 2-A",
  },
  {
    value: "drag_drop",
    label: "Kéo và thả",
    guide: "Tương ứng với listKT và \\choiceKT; dùng ____ làm vị trí thả.",
    syntax: "listKT + \\choiceKT ... ____ ...",
    answerHint: "Mã phương án theo thứ tự ô",
  },
];

export const TSA_SECTION_TEMPLATES = [
  { title: "Tư duy Toán học", duration_minutes: 60 },
  { title: "Tư duy Đọc hiểu", duration_minutes: 30 },
  { title: "Tư duy Khoa học", duration_minutes: 60 },
] as const;

export const GENERIC_SECTION_TEMPLATES = [
  { title: "Phần 1", duration_minutes: null },
  { title: "Phần 2", duration_minutes: null },
  { title: "Phần 3", duration_minutes: null },
] as const;

export function normalizeExamType(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "SVAT" || normalized === "V-SAT" || normalized === "V SAT") return "VSAT";
  return normalized || DEFAULT_EXAM_ROOM_TYPE;
}

export function isPresetExamType(value: string | null | undefined) {
  return EXAM_ROOM_TYPE_OPTIONS.some(option => option.value !== "OTHER" && option.value === normalizeExamType(value));
}

export function roomTypeLabel(value: string | null | undefined) {
  const normalized = normalizeExamType(value);
  return EXAM_ROOM_TYPE_OPTIONS.find(option => option.value === normalized)?.label ?? normalized;
}

export function sectionTemplatesForExamType(examType: string | null | undefined) {
  const normalized = normalizeExamType(examType);
  if (normalized === "TSA") return TSA_SECTION_TEMPLATES;
  if (normalized === "HSA") return HSA_SECTION_TEMPLATES;
  if (normalized === "VSAT") return VSAT_SUBJECT_TEMPLATES;
  if (normalized === "THPTQG") return THPTQG_SUBJECT_TEMPLATES;
  return GENERIC_SECTION_TEMPLATES;
}

export function isIndependentSubjectExamType(value: string | null | undefined) {
  const normalized = normalizeExamType(value);
  return normalized === "THPTQG" || normalized === "VSAT";
}

export function thptqgSubjectForSection(subjectCode: string | null | undefined, title: string | null | undefined) {
  const normalizedCode = subjectCode?.trim().toLocaleLowerCase("vi-VN");
  const normalizedTitle = title?.trim().toLocaleLowerCase("vi-VN") ?? "";
  return THPTQG_SUBJECT_TEMPLATES.find(subject => subject.code === normalizedCode || subject.title.toLocaleLowerCase("vi-VN") === normalizedTitle) ?? null;
}

/**
 * The standard TSA source files use one `ex` environment per question.
 * Keep these targets in the editor config so progress can be shown without
 * adding a database-only field to `exam_sections`.
 */
export function expectedQuestionCountForSection(examType: string | null | undefined, sectionTitle: string | null | undefined) {
  const normalizedExamType = normalizeExamType(examType);
  if (normalizedExamType === "HSA") {
    const title = sectionTitle?.trim().toLocaleLowerCase("vi-VN") ?? "";
    return /khoa|science|tiếng anh|tieng anh|english/.test(title) ? null : 50;
  }
  if (normalizedExamType === "VSAT") return 25;
  if (normalizedExamType === "THPTQG") return thptqgSubjectForSection(null, sectionTitle)?.question_count ?? null;
  if (normalizedExamType !== "TSA") return null;
  const title = sectionTitle?.trim().toLocaleLowerCase("vi-VN") ?? "";
  if (title.includes("toán") || title.includes("math")) return 40;
  if (title.includes("đọc") || title.includes("reading")) return 20;
  if (title.includes("khoa") || title.includes("science")) return 40;
  return null;
}

export function isPassageSection(sectionTitle: string | null | undefined, examType?: string | null) {
  const title = sectionTitle?.trim().toLocaleLowerCase("vi-VN") ?? "";
  if (title.includes("khoa học hoặc tiếng anh") || title.includes("hsa-f")) return false;
  if (normalizeExamType(examType) === "HSA") {
    return title.includes("đọc") || title.includes("văn học") || title.includes("ngữ văn") || title.includes("ngôn ngữ") || title.includes("reading");
  }
  return title.includes("đọc") || title.includes("ngữ văn") || title.includes("reading") || title.includes("khoa") || title.includes("science");
}

export function questionTypeLabel(value: QuestionType) {
  return QUESTION_FORMATS.find(format => format.value === value)?.label ?? value;
}
