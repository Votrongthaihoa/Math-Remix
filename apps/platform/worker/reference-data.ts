import type {
  AdminDashboard,
  StudentDashboard,
} from "@aeck/contracts";

export const studentDashboardReference = {
  generatedAt: "2026-08-27T03:03:00.000Z",
  source: "reference-fixture",
  profile: {
    fullName: "Nguyễn Minh Anh",
    email: "minhanh@example.vn",
    studentCode: "HS-2026-001",
  },
  summary: {
    totalAttempts: 0,
    yearAttempts: 0,
    year: 2026,
  },
  courses: [{ id: "tsa-2026", title: "Luyện thi TSA 2026" }],
  practiceRooms: [{ id: "tsa-room", title: "Phòng thi thử TSA" }],
  irtExams: [],
  recentAttempts: [],
  topScores: [],
  activity: [],
} satisfies StudentDashboard;

export const adminDashboardReference = {
  generatedAt: "2026-08-27T03:03:00.000Z",
  source: "reference-fixture",
  metrics: {
    totalUsers: 12_840,
    totalExams: 186,
    totalAttempts: 32_640,
    todayUsers: 128,
    monthUsers: 2_410,
    yearUsers: 9_780,
  },
  monthlyGrowth: [
    { label: "Thg 3 2026", value: 680 },
    { label: "Thg 4 2026", value: 910 },
    { label: "Thg 5 2026", value: 1_150 },
    { label: "Thg 6 2026", value: 1_360 },
    { label: "Thg 7 2026", value: 1_600 },
    { label: "Thg 8 2026", value: 2_120 },
  ],
  dailyUsers: [
    { label: "21-08", value: 85 },
    { label: "22-08", value: 96 },
    { label: "23-08", value: 110 },
    { label: "24-08", value: 75 },
    { label: "25-08", value: 140 },
    { label: "26-08", value: 120 },
    { label: "27-08", value: 128 },
  ],
  emailVerification: { complete: 11_180, incomplete: 1_660 },
  profileCompletion: { complete: 9_870, incomplete: 2_970 },
  examsBySubject: [
    { label: "Toán", value: 72 },
    { label: "Vật lý", value: 48 },
    { label: "Hóa học", value: 66 },
    { label: "Sinh học", value: 58 },
    { label: "Tiếng Anh", value: 63 },
    { label: "Lịch sử", value: 35 },
  ],
} satisfies AdminDashboard;
