import { z } from "zod";

export const DashboardSourceSchema = z.enum([
  "backend",
  "legacy-adapter",
  "reference-fixture",
]);

const DashboardMetaSchema = z.object({
  generatedAt: z.iso.datetime({ offset: true }),
  source: DashboardSourceSchema,
});

const CatalogItemSchema = z.object({
  id: z.union([z.string().trim().min(1), z.number().int().nonnegative()]),
  title: z.string().trim().min(1),
});

const AttemptSchema = CatalogItemSchema.extend({
  score: z.number().finite().optional(),
  submittedAt: z.iso.datetime({ offset: true }).optional(),
});

export const ActivityDaySchema = z.object({
  date: z.iso.date(),
  count: z.number().int().nonnegative(),
});

export const StudentDashboardSchema = DashboardMetaSchema.extend({
  profile: z.object({
    fullName: z.string().trim().min(1),
    email: z.email(),
    studentCode: z.string().trim().min(1),
  }),
  summary: z.object({
    totalAttempts: z.number().int().nonnegative(),
    yearAttempts: z.number().int().nonnegative(),
    year: z.number().int().min(2000).max(2200),
  }),
  courses: z.array(CatalogItemSchema),
  practiceRooms: z.array(CatalogItemSchema),
  irtExams: z.array(CatalogItemSchema),
  recentAttempts: z.array(AttemptSchema),
  topScores: z.array(AttemptSchema),
  activity: z.array(ActivityDaySchema),
});
export type StudentDashboard = z.infer<typeof StudentDashboardSchema>;

const MetricCountSchema = z.number().int().nonnegative();
const ChartPointSchema = z.object({
  label: z.string().trim().min(1),
  value: MetricCountSchema,
});
const CompletionSchema = z.object({
  complete: MetricCountSchema,
  incomplete: MetricCountSchema,
});

export const AdminDashboardSchema = DashboardMetaSchema.extend({
  metrics: z.object({
    totalUsers: MetricCountSchema,
    totalExams: MetricCountSchema,
    totalAttempts: MetricCountSchema,
    todayUsers: MetricCountSchema,
    monthUsers: MetricCountSchema,
    yearUsers: MetricCountSchema,
  }),
  monthlyGrowth: z.array(ChartPointSchema),
  dailyUsers: z.array(ChartPointSchema),
  emailVerification: CompletionSchema,
  profileCompletion: CompletionSchema,
  examsBySubject: z.array(ChartPointSchema),
});
export type AdminDashboard = z.infer<typeof AdminDashboardSchema>;
