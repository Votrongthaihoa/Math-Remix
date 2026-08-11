import { normalizeExamType } from "./exam-config.ts";

export const EXAM_POLICY_VERSION = 1 as const;

export type ExamPolicyMode = "practice" | "official";
export type ExamPolicyAudience = "account" | "guest" | "both";
export type ExamPolicyRosterMode = "open" | "enrolled" | "class" | "allowlist";
export type ExamPolicySeedStrategy = "none" | "attempt";
export type ExamPolicyRandomizationMode = "none" | "per_attempt" | "exam_code";
export type ExamPolicyVisibility = "never" | "after_submit" | "after_slot" | "threshold" | "manual" | "scheduled";

export type ExamReleaseVisibility = {
  scoreVisible: boolean;
  answersVisible: boolean;
  solutionsVisible: boolean;
};

export type ExamPolicy = {
  version: typeof EXAM_POLICY_VERSION;
  examType: string;
  mode: ExamPolicyMode;
  examCode: string | null;
  access: {
    audience: ExamPolicyAudience;
    accountRequired: boolean;
    rosterMode: ExamPolicyRosterMode;
    allowedClasses: string[];
    maxAttempts: number;
    passwordRequired: boolean;
  };
  timing: {
    opensAt: string | null;
    closesAt: string | null;
    durationMinutes: number;
    gracePeriodMinutes: number;
  };
  randomization: {
    enabled: boolean;
    shuffleQuestions: boolean;
    shuffleOptions: boolean;
    questionPoolSize: number;
    randomizationMode: ExamPolicyRandomizationMode;
    examCodeCount: number;
    seedStrategy: ExamPolicySeedStrategy;
    seed: string | null;
  };
  navigation: {
    allowBacktrack: boolean;
    allowSkip: boolean;
    allowSectionBacktrack: boolean;
    requireAnswerBeforeNext: boolean;
    lockCompletedSections: boolean;
  };
  integrity: {
    fullscreenRequired: boolean;
    warnOnExit: boolean;
    visibilityMonitoring: boolean;
    focusMonitoring: boolean;
    copyProtection: boolean;
    pasteProtection: boolean;
    contextMenuProtection: boolean;
    maxConcurrentDevices: number;
  };
  release: {
    score: ExamPolicyVisibility;
    answers: ExamPolicyVisibility;
    solutions: ExamPolicyVisibility;
    scoreThreshold: number;
    answerThreshold: number;
    hideWrongAnswers: boolean;
    releaseAt: string | null;
  };
  network: {
    showSaveState: boolean;
    allowOfflineDraft: boolean;
  };
  review: {
    manualReviewRequired: boolean;
    allowScoreOverride: boolean;
    regradeVersion: number;
  };
};

export type ExamPolicyContext = {
  examType?: string | null;
  mode?: ExamPolicyMode;
  audience?: ExamPolicyAudience;
  durationMinutes?: number | null;
  opensAt?: string | null;
  closesAt?: string | null;
  gracePeriodMinutes?: number | null;
  passwordRequired?: boolean;
  examCode?: string | null;
};

export type GuestPolicySettingsLike = {
  maxAttempts?: number;
  rosterMode?: ExamPolicyRosterMode | string;
  allowedClasses?: string[];
  shuffleQuestions?: boolean;
  shuffleAnswers?: boolean;
  subExamCount?: number;
  autoMonitor?: "off" | "exit" | "advanced" | string;
  showScore?: ExamPolicyVisibility | string;
  scoreThreshold?: number;
  showAnswers?: ExamPolicyVisibility | string;
  answerThreshold?: number;
  hideWrongAnswers?: boolean;
  examCode?: string | null;
  policy?: unknown;
  [key: string]: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === "number" || typeof value === "string" ? Number(value) : fallback;
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
}

function asNullableDate(value: unknown, fallback: string | null = null) {
  if (value === null || value === undefined || String(value).trim() === "") return fallback;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function enumValue<T extends string>(value: unknown, values: readonly T[], fallback: T) {
  return typeof value === "string" && values.includes(value as T) ? value as T : fallback;
}

function stringList(value: unknown, maxItems = 100) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => typeof item === "string")
    .map(item => item.trim().slice(0, 100))
    .filter(Boolean)
    .slice(0, maxItems);
}

function monitorPolicy(autoMonitor: unknown, mode: ExamPolicyMode) {
  const monitor = enumValue(autoMonitor, ["off", "exit", "advanced"] as const, mode === "official" ? "exit" : "off");
  return {
    fullscreenRequired: mode === "official",
    warnOnExit: mode === "official",
    visibilityMonitoring: monitor !== "off",
    focusMonitoring: monitor === "advanced",
    copyProtection: monitor === "advanced",
    pasteProtection: monitor === "advanced",
    contextMenuProtection: monitor === "advanced",
  };
}

function defaultPolicy(context: ExamPolicyContext = {}): ExamPolicy {
  const mode = context.mode ?? "practice";
  const audience = context.audience ?? "account";
  const monitor = monitorPolicy(undefined, mode);
  return {
    version: EXAM_POLICY_VERSION,
    examType: normalizeExamType(context.examType),
    mode,
    examCode: typeof context.examCode === "string" ? context.examCode : null,
    access: {
      audience,
      accountRequired: audience === "account",
      rosterMode: "open",
      allowedClasses: [],
      maxAttempts: 0,
      passwordRequired: Boolean(context.passwordRequired),
    },
    timing: {
      opensAt: asNullableDate(context.opensAt),
      closesAt: asNullableDate(context.closesAt),
      durationMinutes: asNumber(context.durationMinutes, 90, 0, 24 * 60),
      gracePeriodMinutes: asNumber(context.gracePeriodMinutes, 0, 0, 24 * 60),
    },
    randomization: {
      enabled: false,
      shuffleQuestions: false,
      shuffleOptions: false,
      questionPoolSize: 0,
      randomizationMode: "none",
      examCodeCount: 0,
      seedStrategy: "none",
      seed: null,
    },
    navigation: {
      allowBacktrack: true,
      allowSkip: true,
      allowSectionBacktrack: true,
      requireAnswerBeforeNext: false,
      lockCompletedSections: false,
    },
    integrity: {
      ...monitor,
      maxConcurrentDevices: 1,
    },
    release: {
      score: mode === "official" ? "never" : "after_submit",
      answers: "never",
      solutions: "never",
      scoreThreshold: 0,
      answerThreshold: 0,
      hideWrongAnswers: false,
      releaseAt: null,
    },
    network: {
      showSaveState: true,
      allowOfflineDraft: mode === "practice",
    },
    review: {
      manualReviewRequired: false,
      allowScoreOverride: false,
      regradeVersion: 1,
    },
  };
}

export function normalizeExamPolicy(value: unknown, context: ExamPolicyContext = {}): ExamPolicy {
  const raw = asRecord(value);
  const nested = asRecord(raw.policy);
  const source = { ...raw, ...nested };
  const sourceExamType = typeof source.examType === "string" ? source.examType : context.examType;
  const sourceMode: ExamPolicyMode | undefined = source.mode === "exam"
    ? "official"
    : source.mode === "practice" || source.mode === "official"
      ? source.mode
      : context.mode;
  const base = defaultPolicy({ ...context, examType: sourceExamType, mode: sourceMode });
  const access = asRecord(source.access);
  const timing = asRecord(source.timing);
  const randomization = asRecord(source.randomization);
  const navigation = asRecord(source.navigation);
  const integrity = asRecord(source.integrity);
  const release = asRecord(source.release);
  const network = asRecord(source.network);
  const review = asRecord(source.review);
  const monitor = monitorPolicy(source.autoMonitor, base.mode);

  const shuffleQuestions = asBoolean(randomization.shuffleQuestions ?? source.shuffleQuestions, base.randomization.shuffleQuestions);
  const shuffleOptions = asBoolean(randomization.shuffleOptions ?? source.shuffleAnswers, base.randomization.shuffleOptions);
  const questionPoolSize = asNumber(randomization.questionPoolSize ?? source.subExamCount, 0, 0, 10000);
  const inferredRandomizationMode = shuffleQuestions || shuffleOptions || questionPoolSize > 0 ? "per_attempt" : "none";
  const randomizationMode = enumValue(randomization.randomizationMode, ["none", "per_attempt", "exam_code"] as const, inferredRandomizationMode);
  const seedStrategy = enumValue(randomization.seedStrategy, ["none", "attempt"] as const, randomizationMode === "none" ? "none" : "attempt");
  const releaseValues = ["never", "after_submit", "after_slot", "threshold", "manual", "scheduled"] as const;
  const releaseScore = enumValue(release.score ?? source.showScore, releaseValues, base.release.score);
  const releaseAnswers = enumValue(release.answers ?? source.showAnswers, releaseValues, base.release.answers);
  const releaseSolutions = enumValue(release.solutions ?? source.showSolutions, releaseValues, base.release.solutions);

  return {
    ...base,
    version: EXAM_POLICY_VERSION,
    examType: normalizeExamType(sourceExamType),
    mode: sourceMode ?? base.mode,
    examCode: typeof source.examCode === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(source.examCode) ? source.examCode : base.examCode,
    access: {
      audience: enumValue(access.audience ?? source.audience, ["account", "guest", "both"] as const, context.audience ?? base.access.audience),
      accountRequired: asBoolean(access.accountRequired, base.access.accountRequired),
      rosterMode: enumValue(access.rosterMode, ["open", "enrolled", "class", "allowlist"] as const, base.access.rosterMode),
      allowedClasses: stringList(access.allowedClasses),
      maxAttempts: asNumber(access.maxAttempts ?? source.maxAttempts, base.access.maxAttempts, 0, 1000),
      passwordRequired: asBoolean(access.passwordRequired, base.access.passwordRequired),
    },
    timing: {
      opensAt: asNullableDate(timing.opensAt ?? source.opensAt, base.timing.opensAt),
      closesAt: asNullableDate(timing.closesAt ?? source.closesAt, base.timing.closesAt),
      durationMinutes: asNumber(timing.durationMinutes ?? source.durationMinutes, base.timing.durationMinutes, 0, 24 * 60),
      gracePeriodMinutes: asNumber(timing.gracePeriodMinutes ?? source.gracePeriodMinutes, base.timing.gracePeriodMinutes, 0, 24 * 60),
    },
    randomization: {
      enabled: asBoolean(randomization.enabled, shuffleQuestions || shuffleOptions || questionPoolSize > 0),
      shuffleQuestions,
      shuffleOptions,
      questionPoolSize,
      randomizationMode,
      examCodeCount: asNumber(randomization.examCodeCount ?? source.examCodeCount, randomizationMode === "exam_code" ? 4 : 0, 0, 1000),
      seedStrategy,
      seed: typeof randomization.seed === "string" && randomization.seed.length <= 128 ? randomization.seed : null,
    },
    navigation: {
      allowBacktrack: asBoolean(navigation.allowBacktrack, base.navigation.allowBacktrack),
      allowSkip: asBoolean(navigation.allowSkip, base.navigation.allowSkip),
      allowSectionBacktrack: asBoolean(navigation.allowSectionBacktrack, base.navigation.allowSectionBacktrack),
      requireAnswerBeforeNext: asBoolean(navigation.requireAnswerBeforeNext, base.navigation.requireAnswerBeforeNext),
      lockCompletedSections: asBoolean(navigation.lockCompletedSections, base.navigation.lockCompletedSections),
    },
    integrity: {
      fullscreenRequired: asBoolean(integrity.fullscreenRequired, monitor.fullscreenRequired),
      warnOnExit: asBoolean(integrity.warnOnExit, monitor.warnOnExit),
      visibilityMonitoring: asBoolean(integrity.visibilityMonitoring, monitor.visibilityMonitoring),
      focusMonitoring: asBoolean(integrity.focusMonitoring, monitor.focusMonitoring),
      copyProtection: asBoolean(integrity.copyProtection, monitor.copyProtection),
      pasteProtection: asBoolean(integrity.pasteProtection, monitor.pasteProtection),
      contextMenuProtection: asBoolean(integrity.contextMenuProtection, monitor.contextMenuProtection),
      maxConcurrentDevices: asNumber(integrity.maxConcurrentDevices, 1, 1, 5),
    },
    release: {
      score: releaseScore,
      answers: releaseAnswers,
      solutions: releaseSolutions,
      scoreThreshold: asNumber(release.scoreThreshold ?? source.scoreThreshold, base.release.scoreThreshold, 0, 100),
      answerThreshold: asNumber(release.answerThreshold ?? source.answerThreshold, base.release.answerThreshold, 0, 100),
      hideWrongAnswers: asBoolean(release.hideWrongAnswers ?? source.hideWrongAnswers, base.release.hideWrongAnswers),
      releaseAt: asNullableDate(release.releaseAt ?? source.releaseAt, base.release.releaseAt),
    },
    network: {
      showSaveState: asBoolean(network.showSaveState, base.network.showSaveState),
      allowOfflineDraft: asBoolean(network.allowOfflineDraft, base.network.allowOfflineDraft),
    },
    review: {
      manualReviewRequired: asBoolean(review.manualReviewRequired, base.review.manualReviewRequired),
      allowScoreOverride: asBoolean(review.allowScoreOverride, base.review.allowScoreOverride),
      regradeVersion: asNumber(review.regradeVersion, base.review.regradeVersion, 1, 1000000),
    },
  };
}

export function policyFromGuestSettings(
  settings: GuestPolicySettingsLike,
  context: Required<Pick<ExamPolicyContext, "examType" | "durationMinutes" | "opensAt" | "closesAt" | "gracePeriodMinutes">> & Pick<ExamPolicyContext, "passwordRequired">,
): ExamPolicy {
  const policy = normalizeExamPolicy({
    ...settings,
    policy: settings.policy,
    mode: "official",
    audience: "guest",
    access: {
      audience: "guest",
      accountRequired: false,
      rosterMode: settings.rosterMode === "allowlist" ? "allowlist" : "open",
      allowedClasses: Array.isArray(settings.allowedClasses) ? settings.allowedClasses : [],
      maxAttempts: settings.maxAttempts ?? 0,
      passwordRequired: Boolean(context.passwordRequired),
    },
    timing: {
      opensAt: context.opensAt,
      closesAt: context.closesAt,
      durationMinutes: Math.max(0, Number(context.durationMinutes) || 0),
      gracePeriodMinutes: context.gracePeriodMinutes,
    },
    integrity: {
      ...monitorPolicy(settings.autoMonitor, "official"),
    },
  }, { ...context, mode: "official", audience: "guest" });
  return {
    ...policy,
    mode: "official" as const,
    access: {
      ...policy.access,
      audience: "guest" as const,
      accountRequired: false,
      passwordRequired: Boolean(context.passwordRequired),
    },
    timing: {
      ...policy.timing,
      opensAt: context.opensAt,
      closesAt: context.closesAt,
      durationMinutes: Math.max(0, Number(context.durationMinutes) || 0),
      gracePeriodMinutes: Math.max(0, Number(context.gracePeriodMinutes) || 0),
    },
    integrity: {
      ...policy.integrity,
      fullscreenRequired: true,
      warnOnExit: policy.integrity.warnOnExit || policy.mode === "official",
    },
  };
}

export function policyFromExamSettings(settings: unknown, context: ExamPolicyContext = {}) {
  const raw = asRecord(settings);
  const configuredPolicy = raw.policy ?? (raw.version === EXAM_POLICY_VERSION ? raw : {});
  return normalizeExamPolicy(configuredPolicy, {
    ...context,
    mode: context.mode ?? "practice",
    audience: context.audience ?? "account",
  });
}

function randomSeed() {
  const values = new Uint32Array(4);
  crypto.getRandomValues(values);
  return Array.from(values, value => value.toString(16).padStart(8, "0")).join("-");
}

export function examCodes(policy: ExamPolicy) {
  const count = Math.max(0, policy.randomization.examCodeCount);
  return Array.from({ length: count }, (_, index) => String(101 + index));
}

export function normalizeExamCode(value: unknown) {
  const code = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9_-]{1,32}$/.test(code) ? code : null;
}

export function isExamCodeAllowed(policy: ExamPolicy, value: unknown) {
  const code = normalizeExamCode(value);
  return Boolean(code && examCodes(policy).includes(code));
}

export function createAttemptPolicy(policy: ExamPolicy, options: { examCode?: string | null } = {}): ExamPolicy {
  const code = policy.randomization.randomizationMode === "exam_code"
    ? options.examCode ?? policy.examCode ?? examCodes(policy)[0] ?? null
    : null;
  const seed = policy.randomization.seedStrategy === "attempt"
    ? policy.randomization.randomizationMode === "exam_code" && code
      ? `exam-code:${code}:v${policy.version}:${policy.examType}`
      : policy.randomization.seed ?? randomSeed()
    : null;
  return {
    ...policy,
    examCode: code,
    randomization: { ...policy.randomization, seed },
  };
}

export function resolveAttemptPolicy(snapshot: unknown, fallback: ExamPolicy): ExamPolicy {
  const raw = asRecord(snapshot);
  return raw.version === EXAM_POLICY_VERSION ? normalizeExamPolicy(raw, fallback) : fallback;
}

export function publicExamPolicy(policy: ExamPolicy): ExamPolicy {
  return {
    ...policy,
    randomization: { ...policy.randomization, seed: null },
  };
}

/**
 * Resolve result visibility on the server. A release option is only a
 * permission to expose the corresponding projection; it must never be
 * interpreted by the browser. Answer review is additionally gated by score
 * visibility so a learner cannot reconstruct a hidden score from correctness
 * markers or an answer key.
 */
export function examReleaseVisibility(
  policy: ExamPolicy,
  attempt: { status?: string | null; score?: number | string | null },
  options: { releasedAt?: string | null; slotEndsAt?: string | null } = {},
  now = Date.now(),
): ExamReleaseVisibility {
  const completed = String(attempt.status ?? "") !== "in_progress";
  const score = Number(attempt.score);
  const scheduled = Boolean(policy.release.releaseAt)
    && Number.isFinite(new Date(policy.release.releaseAt as string).getTime())
    && now >= new Date(policy.release.releaseAt as string).getTime();
  const manuallyReleased = Boolean(options.releasedAt)
    && Number.isFinite(new Date(options.releasedAt as string).getTime())
    && now >= new Date(options.releasedAt as string).getTime();
  const afterSlot = Boolean(options.slotEndsAt)
    && Number.isFinite(new Date(options.slotEndsAt as string).getTime())
    && now >= new Date(options.slotEndsAt as string).getTime();
  const scoreVisible = policy.release.score === "after_submit" && completed
    || policy.release.score === "after_slot" && afterSlot
    || policy.release.score === "manual" && manuallyReleased
    || policy.release.score === "scheduled" && scheduled
    || policy.release.score === "threshold" && Number.isFinite(score) && score >= policy.release.scoreThreshold;
  const answersConfigured = policy.release.answers === "after_submit" && completed
    || policy.release.answers === "after_slot" && afterSlot
    || policy.release.answers === "manual" && manuallyReleased
    || policy.release.answers === "scheduled" && scheduled
    || policy.release.answers === "threshold" && Number.isFinite(score) && score >= policy.release.answerThreshold;
  const solutionsConfigured = policy.release.solutions === "after_submit" && completed
    || policy.release.solutions === "after_slot" && afterSlot
    || policy.release.solutions === "manual" && manuallyReleased
    || policy.release.solutions === "scheduled" && scheduled
    || policy.release.solutions === "threshold" && Number.isFinite(score) && score >= policy.release.answerThreshold;
  return {
    scoreVisible,
    answersVisible: scoreVisible && answersConfigured,
    solutionsVisible: scoreVisible && answersConfigured && solutionsConfigured,
  };
}

function seededRandom(seed: string) {
  let state = 0x6d2b79f5;
  for (let index = 0; index < seed.length; index += 1) state = Math.imul(state ^ seed.charCodeAt(index), 16777619);
  return () => {
    state = Math.imul(state + 0x6d2b79f5, 1 | state);
    let value = Math.imul(state ^ state >>> 7, 61 | state);
    value ^= value + Math.imul(value ^ value >>> 14, 9 | value);
    return ((value ^ value >>> 9) >>> 0) / 4294967296;
  };
}

export function shuffleWithSeed<T>(items: T[], seed?: string | null) {
  const result = [...items];
  const random = seed ? seededRandom(seed) : Math.random;
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export type PolicyQuestionIdentity = {
  id: string;
  section_id?: string | null;
  /**
   * Optional stable boundary for question randomization inside one section.
   * THPTQG uses this to keep Parts I/II/III independent while preserving the
   * immutable per-attempt question snapshot.
   */
  randomizationGroup?: string | null;
  passage?: string | null;
  optionValues?: string[];
};

export function prepareQuestionIdentityForPolicy<T extends PolicyQuestionIdentity>(questions: T[], policy: ExamPolicy) {
  const bySectionGroup = new Map<string, { seedKey: string; questions: T[] }>();
  for (const question of questions) {
    const section = question.section_id ?? "__default";
    const randomizationGroup = question.randomizationGroup ?? "__default";
    const groupKey = JSON.stringify([section, randomizationGroup]);
    const entry = bySectionGroup.get(groupKey) ?? {
      seedKey: `${section}:${randomizationGroup}`,
      questions: [],
    };
    entry.questions.push(question);
    bySectionGroup.set(groupKey, entry);
  }
  const selected: T[] = [];
  const optionOrder: Record<string, string[]> = {};
  for (const { seedKey, questions: sectionQuestions } of bySectionGroup.values()) {
    const groups: T[][] = [];
    let previousGroupKey = "";
    for (const question of sectionQuestions) {
      const passage = String(question.passage ?? "").trim();
      const groupKey = passage ? `passage:${passage}` : `question:${question.id}`;
      // Only adjacent questions with the same passage belong to a group.
      // Reusing one map entry would incorrectly join two separate passages
      // that happen to contain identical text later in the section.
      if (groupKey !== previousGroupKey) groups.push([]);
      groups.at(-1)?.push(question);
      previousGroupKey = groupKey;
    }
    let orderedGroups = policy.randomization.shuffleQuestions
      ? shuffleWithSeed(groups, policy.randomization.seed ? `${policy.randomization.seed}:questions:${seedKey}` : null)
      : groups;
    if (policy.randomization.questionPoolSize > 0 && bySectionGroup.size === 1 && policy.randomization.questionPoolSize < sectionQuestions.length) {
      orderedGroups = shuffleWithSeed(orderedGroups, policy.randomization.seed ? `${policy.randomization.seed}:pool:${seedKey}` : null);
      let remaining = policy.randomization.questionPoolSize;
      orderedGroups = orderedGroups.filter(group => {
        if (remaining <= 0) return false;
        if (group.length <= remaining) {
          remaining -= group.length;
          return true;
        }
        return false;
      });
    }
    for (const group of orderedGroups) {
      for (const question of group) {
        selected.push(question);
        const values = Array.isArray(question.optionValues) ? [...question.optionValues] : [];
        optionOrder[question.id] = policy.randomization.shuffleOptions
          ? shuffleWithSeed(values, policy.randomization.seed ? `${policy.randomization.seed}:options:${question.id}` : null)
          : values;
      }
    }
  }
  return { questions: selected, questionOrder: selected.map(question => question.id), optionOrder };
}
