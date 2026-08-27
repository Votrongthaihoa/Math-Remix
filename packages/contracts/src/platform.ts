import { z } from "zod";

export const PlatformDataSourceSchema = z.enum([
  "backend",
  "legacy-adapter",
  "reference-fixture",
]);
export type PlatformDataSource = z.infer<typeof PlatformDataSourceSchema>;

export const PlatformResourceSchema = z.enum([
  "courses",
  "exam-rooms",
  "assessments",
  "attempts",
  "progress",
  "users",
  "groups",
  "sessions",
  "media",
  "results",
  "irt-exams",
  "verification",
  "plans",
  "shipments",
  "timetable",
  "ilearn",
  "audit",
  "watermark",
  "server-health",
  "question-bank",
]);
export type PlatformResource = z.infer<typeof PlatformResourceSchema>;

export const PlatformRecordStatusSchema = z.enum([
  "active",
  "inactive",
  "draft",
  "published",
  "scheduled",
  "pending",
  "processing",
  "completed",
  "failed",
  "archived",
  "locked",
]);
export type PlatformRecordStatus = z.infer<typeof PlatformRecordStatusSchema>;

export const PlatformToneSchema = z.enum([
  "neutral",
  "primary",
  "success",
  "warning",
  "danger",
  "info",
]);

export const PlatformMetricSchema = z.object({
  label: z.string().trim().min(1),
  value: z.union([z.string().trim().min(1), z.number().finite().nonnegative()]),
  tone: PlatformToneSchema.optional(),
});
export type PlatformMetric = z.infer<typeof PlatformMetricSchema>;

export const PlatformRecordSchema = z.object({
  id: z.union([z.string().trim().min(1), z.number().int().nonnegative()]),
  title: z.string().trim().min(1),
  description: z.string().trim().default(""),
  status: PlatformRecordStatusSchema,
  category: z.string().trim().default(""),
  updatedAt: z.iso.datetime({ offset: true }).nullable().default(null),
  owner: z.string().trim().default(""),
  tags: z.array(z.string().trim().min(1)).default([]),
  metrics: z.array(PlatformMetricSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type PlatformRecord = z.infer<typeof PlatformRecordSchema>;

export const PlatformCollectionSchema = z.object({
  generatedAt: z.iso.datetime({ offset: true }),
  source: PlatformDataSourceSchema,
  resource: PlatformResourceSchema,
  summary: z.array(PlatformMetricSchema).default([]),
  records: z.array(PlatformRecordSchema),
});
export type PlatformCollection = z.infer<typeof PlatformCollectionSchema>;

export const CourseResourceSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  type: z.enum(["video", "document", "link", "quiz"]),
  durationMinutes: z.number().int().nonnegative().nullable().default(null),
  available: z.boolean().default(true),
});

export const CourseLessonSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().trim().default(""),
  completed: z.boolean().default(false),
  resources: z.array(CourseResourceSchema).default([]),
});

export const CourseChapterSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  lessons: z.array(CourseLessonSchema),
});

export const CourseDetailSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().trim().default(""),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  coverUrl: z.string().url().nullable().default(null),
  progress: z.number().min(0).max(100).default(0),
  chapters: z.array(CourseChapterSchema),
});
export type CourseDetail = z.infer<typeof CourseDetailSchema>;

export const TimetableEntrySchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  location: z.string().trim().min(1),
  mode: z.enum(["online", "offline", "exam"]),
  joinUrl: z.string().url().nullable().default(null),
  instructor: z.string().trim().default(""),
});
export type TimetableEntry = z.infer<typeof TimetableEntrySchema>;

export const ExamDocumentSchema = z.object({
  examId: z.string().trim().min(1),
  revision: z.number().int().nonnegative(),
  contentHash: z.string().trim().min(8),
  title: z.string().trim().min(1),
  authoritativeHtml: z.string(),
  normalizedSections: z.array(z.object({
    id: z.string().trim().min(1),
    title: z.string().trim().min(1),
    html: z.string(),
    latexSource: z.string().default(""),
  })),
  lexicalJson: z.record(z.string(), z.unknown()).nullable().default(null),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type ExamDocument = z.infer<typeof ExamDocumentSchema>;

export const ExamDocumentSaveSchema = ExamDocumentSchema.omit({ updatedAt: true });
export type ExamDocumentSave = z.infer<typeof ExamDocumentSaveSchema>;

export const IntegrationProviderSchema = z.enum([
  "zoom",
  "gemini-ocr",
  "vietqr",
  "ghn",
  "manual-tracking",
]);
export type IntegrationProvider = z.infer<typeof IntegrationProviderSchema>;

export const IntegrationStateSchema = z.enum([
  "ready",
  "unavailable",
  "disabled",
  "fallback",
]);
export type IntegrationState = z.infer<typeof IntegrationStateSchema>;

export const IntegrationStatusSchema = z.object({
  provider: IntegrationProviderSchema,
  label: z.string().trim().min(1),
  state: IntegrationStateSchema,
  message: z.string().trim().min(1),
});
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>;

export const IntegrationStatusListSchema = z.object({
  generatedAt: z.iso.datetime({ offset: true }),
  source: PlatformDataSourceSchema,
  providers: z.array(IntegrationStatusSchema),
});
export type IntegrationStatusList = z.infer<typeof IntegrationStatusListSchema>;

export const ZoomMeetingRequestSchema = z.object({
  classId: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(160),
  startsAt: z.iso.datetime({ offset: true }),
  durationMinutes: z.number().int().min(15).max(480),
});
export type ZoomMeetingRequest = z.infer<typeof ZoomMeetingRequestSchema>;

export const ZoomMeetingResultSchema = z.object({
  meetingId: z.string().trim().min(1),
  joinUrl: z.url(),
  startsAt: z.iso.datetime({ offset: true }),
  source: PlatformDataSourceSchema,
});
export type ZoomMeetingResult = z.infer<typeof ZoomMeetingResultSchema>;

export const VietQrLookupRequestSchema = z.object({
  bankId: z.string().trim().toUpperCase().min(2).max(20),
  accountNumber: z.string().trim().regex(/^\d{6,24}$/),
});
export type VietQrLookupRequest = z.infer<typeof VietQrLookupRequestSchema>;

export const VietQrLookupResultSchema = VietQrLookupRequestSchema.extend({
  accountName: z.string().trim().min(1).nullable(),
  source: PlatformDataSourceSchema,
});
export type VietQrLookupResult = z.infer<typeof VietQrLookupResultSchema>;

export const OcrResultSchema = z.object({
  engine: z.literal("gemini"),
  text: z.string(),
  latex: z.string(),
  confidence: z.number().min(0).max(1),
  source: PlatformDataSourceSchema,
});
export type OcrResult = z.infer<typeof OcrResultSchema>;

export const ShipmentCarrierSchema = z.preprocess(
  (value) => typeof value === "string" ? value.trim().toLowerCase() : value,
  z.enum(["ghn", "ghtk", "spx", "vnpost", "viettelpost", "other"]),
);
export type ShipmentCarrier = z.infer<typeof ShipmentCarrierSchema>;

export const ShipmentTrackingRequestSchema = z.object({
  carrier: ShipmentCarrierSchema,
  trackingCode: z.string().trim().min(3).max(80),
});
export type ShipmentTrackingRequest = z.infer<typeof ShipmentTrackingRequestSchema>;

export const ShipmentTrackingResultSchema = ShipmentTrackingRequestSchema.extend({
  state: z.enum(["pending", "shipping", "delivered", "unknown"]),
  message: z.string().trim().min(1),
  trackingUrl: z.url().nullable(),
  source: z.enum(["provider", "manual"]),
});
export type ShipmentTrackingResult = z.infer<typeof ShipmentTrackingResultSchema>;
