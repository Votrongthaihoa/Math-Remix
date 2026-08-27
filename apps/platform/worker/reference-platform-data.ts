import type {
  CourseDetail,
  PlatformCollection,
  PlatformRecord,
  PlatformResource,
  TimetableEntry,
  ExamDocument,
} from "@aeck/contracts";

const generatedAt = "2026-08-28T09:00:00.000Z";

function record(
  id: string,
  title: string,
  status: PlatformRecord["status"],
  options: Partial<Omit<PlatformRecord, "id" | "title" | "status">> = {},
): PlatformRecord {
  return {
    id,
    title,
    status,
    description: "",
    category: "",
    updatedAt: generatedAt,
    owner: "",
    tags: [],
    metrics: [],
    metadata: {},
    ...options,
  };
}

function collection(
  resource: PlatformResource,
  records: PlatformRecord[],
  summary: PlatformCollection["summary"] = [],
): PlatformCollection {
  return { generatedAt, source: "reference-fixture", resource, records, summary };
}

export const platformCollections: Record<PlatformResource, PlatformCollection> = {
  courses: collection(
    "courses",
    [
      record("course-tsa-2026", "Luyện thi TSA 2026", "active", {
        description: "Tư duy định lượng, tư duy định tính và khoa học theo cấu trúc TSA.",
        category: "TSA",
        owner: "Ban học thuật TSA",
        tags: ["TSA", "2026"],
        metrics: [{ label: "Bài học", value: 24 }, { label: "Tiến độ", value: "38%" }],
        metadata: { color: "#2f6fed", progress: 38, enrolled: true },
      }),
      record("course-hsa-2026", "Ôn luyện HSA toàn diện", "active", {
        description: "Lộ trình luyện tập ba phần thi HSA với ngân hàng bài tập chọn lọc.",
        category: "HSA",
        owner: "Ban học thuật HSA",
        tags: ["HSA", "ĐGNL"],
        metrics: [{ label: "Bài học", value: 18 }, { label: "Tiến độ", value: "12%" }],
        metadata: { color: "#8b5cf6", progress: 12, enrolled: true },
      }),
      record("course-thptqg-math", "Toán THPTQG trọng tâm", "scheduled", {
        description: "Hệ thống chuyên đề trọng tâm và đề luyện theo chương trình THPTQG.",
        category: "THPTQG",
        owner: "Tổ Toán",
        tags: ["THPTQG", "Toán"],
        metrics: [{ label: "Bài học", value: 30 }, { label: "Khai giảng", value: "05/09" }],
        metadata: { color: "#cd1627", progress: 0, enrolled: true },
      }),
    ],
    [
      { label: "Khóa đang học", value: 3, tone: "primary" },
      { label: "Bài đã hoàn thành", value: 11, tone: "success" },
      { label: "Tổng bài học", value: 72, tone: "info" },
    ],
  ),
  "exam-rooms": collection(
    "exam-rooms",
    [
      record("room-tsa", "Phòng luyện TSA", "active", { category: "TSA", description: "Các đề luyện TSA theo cấu trúc mới.", metrics: [{ label: "Đề thi", value: 8 }], metadata: { examType: "TSA" } }),
      record("room-hsa", "Phòng luyện HSA", "active", { category: "HSA", description: "Luyện tập HSA theo từng phần và tổ hợp.", metrics: [{ label: "Đề thi", value: 6 }], metadata: { examType: "HSA" } }),
      record("room-thptqg", "Thi thử THPTQG", "scheduled", { category: "THPTQG", description: "Đề thi thử theo môn, giữ nguyên giao diện làm bài chuyên biệt.", metrics: [{ label: "Đề thi", value: 12 }], metadata: { examType: "THPTQG" } }),
      record("room-vsat", "Phòng luyện V-SAT", "draft", { category: "V-SAT", description: "Bộ đề đánh giá đầu vào đại học V-SAT.", metrics: [{ label: "Đề thi", value: 3 }], metadata: { examType: "V-SAT" } }),
    ],
    [{ label: "Phòng khả dụng", value: 3, tone: "success" }, { label: "Đề luyện", value: 29, tone: "primary" }],
  ),
  assessments: collection("assessments", [
    record("assessment-tsa-01", "TSA tổng hợp số 01", "published", { category: "TSA", metrics: [{ label: "Thời gian", value: "150 phút" }, { label: "Câu hỏi", value: 100 }], metadata: { roomId: "room-tsa" } }),
    record("assessment-tsa-02", "TSA tổng hợp số 02", "published", { category: "TSA", metrics: [{ label: "Thời gian", value: "150 phút" }, { label: "Câu hỏi", value: 100 }], metadata: { roomId: "room-tsa" } }),
    record("assessment-hsa-01", "HSA luyện tập số 01", "published", { category: "HSA", metrics: [{ label: "Thời gian", value: "195 phút" }, { label: "Câu hỏi", value: 150 }], metadata: { roomId: "room-hsa" } }),
    record("assessment-math-01", "Toán THPTQG số 01", "scheduled", { category: "THPTQG", metrics: [{ label: "Thời gian", value: "90 phút" }, { label: "Câu hỏi", value: 34 }], metadata: { roomId: "room-thptqg" } }),
  ]),
  attempts: collection("attempts", [
    record("attempt-001", "TSA tổng hợp số 01", "completed", { category: "TSA", metrics: [{ label: "Điểm", value: 72.5 }, { label: "Đúng", value: "73/100" }], updatedAt: "2026-08-24T14:30:00.000Z", metadata: { resultPath: "/exam/result/assessment-tsa-01" } }),
    record("attempt-002", "HSA luyện tập số 01", "completed", { category: "HSA", metrics: [{ label: "Điểm", value: 91 }, { label: "Đúng", value: "104/150" }], updatedAt: "2026-08-19T12:10:00.000Z", metadata: { resultPath: "/exam/result/assessment-hsa-01" } }),
    record("attempt-003", "TSA định lượng chuyên đề", "completed", { category: "TSA", metrics: [{ label: "Điểm", value: 81 }, { label: "Đúng", value: "32/40" }], updatedAt: "2026-08-12T13:00:00.000Z", metadata: { resultPath: "/exam/result/attempt-003" } }),
  ], [{ label: "Đã làm", value: 3, tone: "primary" }, { label: "Điểm cao nhất", value: 91, tone: "success" }]),
  progress: collection("progress", [
    record("progress-tsa", "Luyện thi TSA 2026", "active", { category: "Khóa học", metrics: [{ label: "Hoàn thành", value: "38%" }, { label: "Chuỗi ngày", value: 7 }], metadata: { progress: 38 } }),
    record("progress-hsa", "Ôn luyện HSA toàn diện", "active", { category: "Khóa học", metrics: [{ label: "Hoàn thành", value: "12%" }, { label: "Chuỗi ngày", value: 3 }], metadata: { progress: 12 } }),
  ]),
  users: collection("users", [
    record("user-001", "Nguyễn Minh Anh", "active", { category: "Học viên", owner: "minhanh@example.vn", tags: ["HS-2026-001"], metrics: [{ label: "Khóa học", value: 3 }] }),
    record("user-002", "Trần Gia Huy", "active", { category: "Học viên", owner: "giahuy@example.vn", tags: ["HS-2026-002"], metrics: [{ label: "Khóa học", value: 2 }] }),
    record("user-003", "Lê Khánh Linh", "pending", { category: "Học viên", owner: "khanhlinh@example.vn", tags: ["Chưa xác minh"], metrics: [{ label: "Khóa học", value: 1 }] }),
    record("user-004", "Phạm Đức Long", "locked", { category: "Học viên", owner: "duclong@example.vn", tags: ["Đã khóa"], metrics: [{ label: "Khóa học", value: 2 }] }),
    record("user-005", "Cộng tác viên nội dung", "active", { category: "CTV", owner: "ctv@aeck.vn", tags: ["Kho câu hỏi"], metrics: [{ label: "Quyền", value: "Biên tập" }] }),
  ], [{ label: "Tổng tài khoản", value: 12_840, tone: "primary" }, { label: "Đang hoạt động", value: 11_964, tone: "success" }, { label: "Chờ xác minh", value: 748, tone: "warning" }, { label: "Đã khóa", value: 128, tone: "danger" }]),
  groups: collection("groups", [
    record("group-tsa-a", "TSA 2026 · Nhóm A", "active", { category: "Lớp học", metrics: [{ label: "Thành viên", value: 42 }, { label: "Khóa học", value: 2 }] }),
    record("group-hsa-01", "HSA tăng tốc 01", "active", { category: "Lớp học", metrics: [{ label: "Thành viên", value: 36 }, { label: "Khóa học", value: 1 }] }),
    record("group-thptqg", "THPTQG Toán K01", "scheduled", { category: "Lớp học", metrics: [{ label: "Thành viên", value: 28 }, { label: "Khai giảng", value: "05/09" }] }),
  ]),
  sessions: collection("sessions", [
    record("session-tsa-01", "Kíp TSA thử nghiệm 01", "scheduled", { category: "TSA", metrics: [{ label: "Thí sinh", value: 120 }, { label: "Bắt đầu", value: "30/08 08:00" }], metadata: { mode: "both" } }),
    record("session-hsa-01", "Kíp HSA tháng 8", "active", { category: "HSA", metrics: [{ label: "Đang thi", value: 42 }, { label: "Đã nộp", value: 78 }], metadata: { mode: "account" } }),
    record("session-thptqg-01", "Thi thử THPTQG đợt 1", "draft", { category: "THPTQG", metrics: [{ label: "Thí sinh", value: 0 }, { label: "Hình thức", value: "Link + QR" }], metadata: { mode: "link_qr" } }),
  ]),
  media: collection("media", [
    record("media-folder-tsa", "TSA · Bài giảng", "active", { category: "Thư mục", metrics: [{ label: "Tệp", value: 84 }, { label: "Dung lượng", value: "12,4 GB" }] }),
    record("media-folder-hsa", "HSA · Tài liệu", "active", { category: "Thư mục", metrics: [{ label: "Tệp", value: 56 }, { label: "Dung lượng", value: "4,8 GB" }] }),
    record("media-processing", "Video chuyên đề xác suất", "processing", { category: "Video", metrics: [{ label: "Tiến trình", value: "68%" }, { label: "Định dạng", value: "HLS" }] }),
    record("media-pdf", "Công thức TSA định lượng", "active", { category: "PDF", metrics: [{ label: "Dung lượng", value: "8,2 MB" }, { label: "Quyền", value: "Riêng tư" }] }),
  ]),
  results: collection("results", [
    record("result-tsa-01", "TSA tổng hợp số 01", "completed", { category: "TSA", metrics: [{ label: "Lượt thi", value: 1240 }, { label: "Điểm TB", value: 68.4 }, { label: "Hoàn thành", value: "92%" }] }),
    record("result-hsa-01", "HSA luyện tập số 01", "completed", { category: "HSA", metrics: [{ label: "Lượt thi", value: 860 }, { label: "Điểm TB", value: 87.2 }, { label: "Hoàn thành", value: "89%" }] }),
    record("result-thptqg-01", "Toán THPTQG số 01", "processing", { category: "THPTQG", metrics: [{ label: "Lượt thi", value: 438 }, { label: "Đã chấm", value: "96%" }] }),
  ]),
  "irt-exams": collection("irt-exams", [
    record("irt-001", "IRT năng lực định lượng", "published", { category: "IRT", metrics: [{ label: "Câu hỏi", value: 40 }, { label: "Lượt thi", value: 628 }] }),
    record("irt-002", "IRT tư duy đọc hiểu", "published", { category: "IRT", metrics: [{ label: "Câu hỏi", value: 35 }, { label: "Lượt thi", value: 514 }] }),
    record("irt-003", "IRT khoa học tổng hợp", "draft", { category: "IRT", metrics: [{ label: "Câu hỏi", value: 48 }, { label: "Độ phủ", value: "72%" }] }),
  ]),
  verification: collection("verification", [
    record("verification-001", "Nguyễn Hoàng Nam", "pending", { category: "Minh chứng học sinh", owner: "nam.nguyen@example.vn", updatedAt: "2026-08-28T07:40:00.000Z" }),
    record("verification-002", "Trần Thu Trang", "completed", { category: "Minh chứng học sinh", owner: "trang.tran@example.vn", updatedAt: "2026-08-27T10:20:00.000Z" }),
    record("verification-003", "Lê Quang Minh", "failed", { category: "Minh chứng học sinh", owner: "minh.le@example.vn", tags: ["Ảnh không rõ"] }),
  ]),
  plans: collection("plans", [
    record("plan-basic", "Gói Cơ bản", "published", { category: "Học tập", metrics: [{ label: "Giá", value: "299.000 ₫" }, { label: "Người dùng", value: 3840 }] }),
    record("plan-plus", "Gói Luyện thi Plus", "published", { category: "Học tập", metrics: [{ label: "Giá", value: "799.000 ₫" }, { label: "Người dùng", value: 2180 }] }),
    record("plan-school", "Gói Trường học", "draft", { category: "Tổ chức", metrics: [{ label: "Giá", value: "Liên hệ" }, { label: "Giới hạn", value: "500 tài khoản" }] }),
  ]),
  shipments: collection("shipments", [
    record("AECK26082801", "Nguyễn Minh Anh · Hà Nội", "processing", { category: "GHN", metrics: [{ label: "Trạng thái", value: "Đang lấy hàng" }, { label: "COD", value: "0 ₫" }], metadata: { carrier: "GHN", trackingCode: "G8AECK001" } }),
    record("AECK26082714", "Trần Gia Huy · Đà Nẵng", "active", { category: "GHTK", metrics: [{ label: "Trạng thái", value: "Đang giao" }, { label: "COD", value: "299.000 ₫" }], metadata: { carrier: "GHTK", trackingCode: "S1AECK144" } }),
    record("AECK26082609", "Lê Khánh Linh · TP.HCM", "completed", { category: "GHN", metrics: [{ label: "Trạng thái", value: "Đã giao" }, { label: "Thời gian", value: "26/08" }], metadata: { carrier: "GHN", trackingCode: "G8AECK009" } }),
    record("AECK26082503", "Phạm Đức Long · Hải Phòng", "failed", { category: "VNPost", metrics: [{ label: "Trạng thái", value: "Giao thất bại" }, { label: "Lý do", value: "Không liên lạc được" }], metadata: { carrier: "VNPost", trackingCode: "VNPAECK003" } }),
  ]),
  timetable: collection("timetable", [
    record("schedule-tsa-mon", "Luyện tư duy định lượng", "scheduled", { category: "Trực tuyến", owner: "Thầy Nguyễn Văn An", metrics: [{ label: "Thời gian", value: "Thứ hai · 19:30" }, { label: "Lớp", value: "TSA A" }] }),
    record("schedule-hsa-wed", "Chuyên đề đọc hiểu HSA", "scheduled", { category: "Trực tuyến", owner: "Cô Trần Mai", metrics: [{ label: "Thời gian", value: "Thứ tư · 19:30" }, { label: "Lớp", value: "HSA 01" }] }),
    record("schedule-test-sat", "Thi thử và chữa đề", "scheduled", { category: "Khảo thí", owner: "Ban học thuật", metrics: [{ label: "Thời gian", value: "Thứ bảy · 08:00" }, { label: "Phòng", value: "Phòng 01" }] }),
  ]),
  ilearn: collection("ilearn", [
    record("ilearn-tsa-a", "Lớp TSA 2026 · A", "active", { category: "Zoom", owner: "Thầy Nguyễn Văn An", metrics: [{ label: "Học viên", value: 42 }, { label: "Buổi tới", value: "29/08 19:30" }], metadata: { provider: "zoom" } }),
    record("ilearn-hsa-01", "Lớp HSA tăng tốc 01", "active", { category: "Zoom", owner: "Cô Trần Mai", metrics: [{ label: "Học viên", value: 36 }, { label: "Buổi tới", value: "30/08 20:00" }], metadata: { provider: "zoom" } }),
    record("ilearn-thpt", "Toán THPTQG K01", "scheduled", { category: "Zoom", owner: "Thầy Lê Minh", metrics: [{ label: "Học viên", value: 28 }, { label: "Khai giảng", value: "05/09" }], metadata: { provider: "zoom" } }),
  ]),
  audit: collection("audit", [
    record("audit-001", "Xuất bản đề TSA tổng hợp số 02", "completed", { category: "Đề thi", owner: "admin@aeck.vn", updatedAt: "2026-08-28T08:45:00.000Z", tags: ["publish_exam"] }),
    record("audit-002", "Gia hạn 10 phút cho lượt thi", "completed", { category: "Kíp thi", owner: "admin@aeck.vn", updatedAt: "2026-08-28T08:12:00.000Z", tags: ["extend_time"] }),
    record("audit-003", "Khóa tài khoản HS-2026-044", "completed", { category: "Tài khoản", owner: "security@aeck.vn", updatedAt: "2026-08-27T16:30:00.000Z", tags: ["lock_account"] }),
    record("audit-004", "Đồng bộ video OneDrive", "failed", { category: "Media", owner: "content@aeck.vn", updatedAt: "2026-08-27T15:10:00.000Z", tags: ["sync_media"] }),
  ]),
  watermark: collection("watermark", [
    record("trace-001", "WM-2026-08-2818A", "completed", { category: "Tài liệu TSA", owner: "HS-2026-018", metrics: [{ label: "Lần tải", value: 2 }, { label: "IP", value: "Đã ẩn" }] }),
    record("trace-002", "WM-2026-08-2704F", "pending", { category: "Đề HSA", owner: "HS-2026-104", metrics: [{ label: "Nguồn", value: "Ảnh chụp" }, { label: "Độ tin cậy", value: "86%" }] }),
  ]),
  "server-health": collection("server-health", [
    record("service-api", "API chính", "active", { category: "Cloudflare", metrics: [{ label: "Độ trễ", value: "84 ms" }, { label: "Uptime", value: "99,99%" }] }),
    record("service-database", "Supabase Database", "active", { category: "Database", metrics: [{ label: "Kết nối", value: 48 }, { label: "Độ trễ", value: "31 ms" }] }),
    record("service-storage", "R2 Media", "active", { category: "Storage", metrics: [{ label: "Dung lượng", value: "248 GB" }, { label: "Lỗi 24h", value: 0 }] }),
    record("service-zoom", "Zoom connector", "active", { category: "Integration", metrics: [{ label: "Token", value: "Hợp lệ" }, { label: "Lần gọi", value: 238 }] }),
    record("service-gemini", "Gemini OCR", "active", { category: "Integration", metrics: [{ label: "Hàng đợi", value: 3 }, { label: "Tỉ lệ thành công", value: "97,8%" }] }),
    record("service-shipping", "GHN connector", "inactive", { category: "Integration", metrics: [{ label: "Trạng thái", value: "Bảo trì" }, { label: "Kiểm tra lại", value: "10 phút" }] }),
  ]),
  "question-bank": collection("question-bank", [
    record("question-folder-tsa", "TSA · Tư duy định lượng", "active", { category: "Thư mục", metrics: [{ label: "Câu hỏi", value: 1240 }, { label: "Đã duyệt", value: "94%" }] }),
    record("question-folder-hsa", "HSA · Tư duy định tính", "active", { category: "Thư mục", metrics: [{ label: "Câu hỏi", value: 860 }, { label: "Đã duyệt", value: "91%" }] }),
    record("question-folder-thpt", "THPTQG · Toán", "active", { category: "Thư mục", metrics: [{ label: "Câu hỏi", value: 2180 }, { label: "Đã duyệt", value: "97%" }] }),
    record("dedup-batch-01", "Rà soát trùng tháng 8", "processing", { category: "Lọc trùng", metrics: [{ label: "Ứng viên", value: 128 }, { label: "Đã xử lý", value: "68%" }] }),
  ]),
};

export const courseDetails: Record<string, CourseDetail> = {
  "course-tsa-2026": {
    id: "course-tsa-2026",
    title: "Luyện thi TSA 2026",
    description: "Lộ trình học theo cấu trúc TSA, kết hợp video, tài liệu và bài luyện sau từng chuyên đề.",
    color: "#2f6fed",
    coverUrl: null,
    progress: 38,
    chapters: [
      {
        id: "tsa-chapter-1",
        title: "Phần 1: Tư duy định lượng",
        lessons: [
          { id: "tsa-lesson-1", title: "Bài 1: Mô hình hóa đại số", description: "Nhận diện dữ kiện và lập mô hình.", completed: true, resources: [{ id: "tsa-video-1", title: "Bài giảng mô hình hóa", type: "video", durationMinutes: 42, available: true }, { id: "tsa-pdf-1", title: "Phiếu bài tập", type: "document", durationMinutes: null, available: true }] },
          { id: "tsa-lesson-2", title: "Bài 2: Xác suất và thống kê", description: "Kỹ thuật đọc bảng và xử lý số liệu.", completed: true, resources: [{ id: "tsa-video-2", title: "Bài giảng xác suất", type: "video", durationMinutes: 48, available: true }] },
          { id: "tsa-lesson-3", title: "Bài 3: Hình học ứng dụng", description: "Các mô hình hình học thường gặp.", completed: false, resources: [{ id: "tsa-video-3", title: "Bài giảng hình học", type: "video", durationMinutes: 51, available: true }] },
        ],
      },
      {
        id: "tsa-chapter-2",
        title: "Phần 2: Tư duy định tính",
        lessons: [
          { id: "tsa-lesson-4", title: "Bài 1: Đọc hiểu văn bản khoa học", description: "Tìm luận điểm, bằng chứng và quan hệ logic.", completed: false, resources: [{ id: "tsa-video-4", title: "Chiến lược đọc hiểu", type: "video", durationMinutes: 45, available: true }] },
          { id: "tsa-lesson-5", title: "Bài 2: Suy luận ngôn ngữ", description: "Loại trừ nhiễu và kiểm tra kết luận.", completed: false, resources: [{ id: "tsa-quiz-5", title: "Bài luyện cuối chuyên đề", type: "quiz", durationMinutes: 30, available: true }] },
        ],
      },
    ],
  },
};

export const timetableEntries: TimetableEntry[] = [
  { id: "entry-1", title: "Luyện tư duy định lượng", startsAt: "2026-08-31T12:30:00.000Z", endsAt: "2026-08-31T14:00:00.000Z", location: "Zoom · TSA A", mode: "online", joinUrl: "https://zoom.us/", instructor: "Thầy Nguyễn Văn An" },
  { id: "entry-2", title: "Chuyên đề đọc hiểu HSA", startsAt: "2026-09-02T12:30:00.000Z", endsAt: "2026-09-02T14:00:00.000Z", location: "Zoom · HSA 01", mode: "online", joinUrl: "https://zoom.us/", instructor: "Cô Trần Mai" },
  { id: "entry-3", title: "Thi thử và chữa đề", startsAt: "2026-09-05T01:00:00.000Z", endsAt: "2026-09-05T02:30:00.000Z", location: "Phòng khảo thí 01", mode: "exam", joinUrl: null, instructor: "Ban học thuật" },
];

export const examDocuments: Record<string, ExamDocument> = {
  "exam-demo-tsa": {
    examId: "exam-demo-tsa",
    revision: 1,
    contentHash: "9d7e53e820e47fb9564f6e3bea64a7e6b28eb0d6d12d418a7f90293cd2af53c8",
    title: "TSA tổng hợp · Bản biên soạn mới",
    authoritativeHtml: "<h2>Hướng dẫn chung</h2><p>Đọc kỹ yêu cầu trước khi làm bài.</p>",
    normalizedSections: [
      { id: "section-quantitative", title: "Tư duy định lượng", html: "<p>Nội dung giới thiệu phần thi định lượng.</p>", latexSource: "" },
      { id: "section-qualitative", title: "Tư duy định tính", html: "<p>Nội dung giới thiệu phần thi định tính.</p>", latexSource: "" },
    ],
    lexicalJson: null,
    updatedAt: generatedAt,
  },
};
