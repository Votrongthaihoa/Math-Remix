import assert from "node:assert/strict";
import test from "node:test";

import {
  AdminDashboardSchema,
  StudentDashboardSchema,
} from "./dashboard.ts";

test("dashboard contracts reject malformed metrics and preserve Vietnamese labels", () => {
  const student = StudentDashboardSchema.parse({
    generatedAt: "2026-08-27T03:03:00.000Z",
    source: "reference-fixture",
    profile: {
      fullName: "Nguyễn Minh Anh",
      email: "minhanh@example.vn",
      studentCode: "HS-2026-001",
    },
    summary: { totalAttempts: 0, yearAttempts: 0, year: 2026 },
    courses: [{ id: "tsa-2026", title: "Luyện thi TSA 2026" }],
    practiceRooms: [{ id: "tsa-room", title: "Phòng thi thử TSA" }],
    irtExams: [],
    recentAttempts: [],
    topScores: [],
    activity: [],
  });
  assert.equal(student.courses[0]?.title, "Luyện thi TSA 2026");

  const admin = AdminDashboardSchema.safeParse({
    generatedAt: "2026-08-27T03:03:00.000Z",
    source: "reference-fixture",
    metrics: {
      totalUsers: -1,
      totalExams: 186,
      totalAttempts: 32640,
      todayUsers: 128,
      monthUsers: 2410,
      yearUsers: 9780,
    },
    monthlyGrowth: [],
    dailyUsers: [],
    emailVerification: { complete: 11180, incomplete: 1660 },
    profileCompletion: { complete: 9870, incomplete: 2970 },
    examsBySubject: [],
  });
  assert.equal(admin.success, false);
});
