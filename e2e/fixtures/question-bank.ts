import { expect, test as base, type BrowserContext, type Route } from "@playwright/test";

type AdminPermission = "question-bank" | "exams";
type RequestEvidence = {
  method: string;
  origin: string;
  pathname: string;
  search: string;
  kind: string;
};
type QuestionBankPost = { body: Record<string, unknown>; pathname: string };
type PausablePostAction = "create_item" | "import_latex" | "seed_from_section" | "create_node" | "attach_to_exam";
type QuestionBank = {
  id: string;
  name: string;
  subject_code: string;
  grade: string;
  curriculum: string;
  description: string;
  status: "draft" | "active" | "archived";
  created_at: string;
  updated_at: string;
};
type QuestionBankNode = {
  id: string;
  bank_id: string;
  parent_id: string | null;
  title: string;
  node_type: "topic" | "unit";
  sort_order: number;
};
type QuestionBankItem = {
  id: string;
  bank_id: string;
  node_id: string | null;
  current_version: number;
  difficulty: string | null;
  tags: string[];
  status: "draft" | "active" | "archived";
  prompt: string;
  question_type: string;
  options: Array<{ value: string; label: string }>;
  correct_answer: unknown;
  explanation: string;
  passage: string | null;
  media_url: string | null;
  instruction: string | null;
  solution_source: string;
  created_at: string;
  updated_at: string;
};
type BankDetail = { bank: QuestionBank; nodes: QuestionBankNode[]; items: QuestionBankItem[] };
type Deferred = { promise: Promise<void>; release: () => void };

export type QuestionBankFixtureOptions = { permissions: AdminPermission[]; longContent?: boolean };
export type QuestionBankFixture = {
  posts: QuestionBankPost[];
  apiRequests: RequestEvidence[];
  authRequests: RequestEvidence[];
  blockedRequests: RequestEvidence[];
  unexpectedRequests: RequestEvidence[];
  externalResponses: RequestEvidence[];
  failNextCatalogLoad: (message?: string) => void;
  failNextDetailLoad: (bankId: string, message?: string) => void;
  pauseDetail: (bankId: string) => void;
  releaseDetail: (bankId: string) => void;
  pauseCreateBank: () => void;
  releaseCreateBank: () => void;
  pausePost: (action: PausablePostAction) => void;
  releasePost: (action: PausablePostAction) => void;
  detailRequestCount: (bankId: string) => number;
};

type TestFixtures = {
  questionBank: QuestionBankFixture;
  questionBankOptions: QuestionBankFixtureOptions;
};

const timestamp = "2026-09-16T00:00:00.000Z";

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createDeferred(): Deferred {
  let resolved = false;
  let resolvePromise!: () => void;
  const promise = new Promise<void>(resolve => { resolvePromise = resolve; });
  return {
    promise,
    release: () => {
      if (resolved) return;
      resolved = true;
      resolvePromise();
    },
  };
}

function requestEvidence(route: Route): RequestEvidence {
  const request = route.request();
  const url = new URL(request.url());
  return {
    method: request.method(),
    origin: url.origin,
    pathname: url.pathname,
    search: url.search,
    kind: request.resourceType(),
  };
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function optionsValue(value: unknown): Array<{ value: string; label: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((option, index) => {
    const row = recordValue(option);
    const label = stringValue(row.label).trim();
    if (!label) return [];
    return [{ value: stringValue(row.value, String.fromCharCode(65 + index)).trim(), label }];
  });
}

function requestBody(route: Route): Record<string, unknown> {
  try {
    return recordValue(JSON.parse(route.request().postData() ?? "{}"));
  } catch {
    return {};
  }
}

function questionBankData() {
  const bankA: QuestionBank = {
    id: "qbank-a",
    name: "Ngân hàng A",
    subject_code: "TOAN",
    grade: "12",
    curriculum: "CT 2018",
    description: "Dữ liệu synthetic cho ngân hàng A.",
    status: "active",
    created_at: timestamp,
    updated_at: timestamp,
  };
  const bankB: QuestionBank = {
    ...bankA,
    id: "qbank-b",
    name: "Ngân hàng B",
    description: "Dữ liệu synthetic cho ngân hàng B.",
  };
  const nodeA: QuestionBankNode = {
    id: "qbank-node-a",
    bank_id: bankA.id,
    parent_id: null,
    title: "Hàm số",
    node_type: "topic",
    sort_order: 0,
  };
  const itemA: QuestionBankItem = {
    id: "qbank-item-a",
    bank_id: bankA.id,
    node_id: nodeA.id,
    current_version: 1,
    difficulty: "NB",
    tags: ["fixture"],
    status: "active",
    prompt: "Câu hỏi thuộc ngân hàng A",
    question_type: "single",
    options: [{ value: "A", label: "Đúng" }, { value: "B", label: "Sai" }],
    correct_answer: "A",
    explanation: "",
    passage: null,
    media_url: null,
    instruction: null,
    solution_source: "",
    created_at: timestamp,
    updated_at: timestamp,
  };
  const itemB: QuestionBankItem = {
    ...itemA,
    id: "qbank-item-b",
    bank_id: bankB.id,
    node_id: null,
    prompt: "Câu hỏi thuộc ngân hàng B",
  };
  return {
    banks: [bankA, bankB],
    details: new Map<string, BankDetail>([
      [bankA.id, { bank: bankA, nodes: [nodeA], items: [itemA] }],
      [bankB.id, { bank: bankB, nodes: [], items: [itemB] }],
    ]),
  };
}

function createItemFromPost(body: Record<string, unknown>, detail: BankDetail, index: number): QuestionBankItem {
  const content = recordValue(body.content);
  const tags = Array.isArray(body.tags)
    ? body.tags.filter((tag): tag is string => typeof tag === "string")
    : [];
  return {
    id: `qbank-created-${index}`,
    bank_id: detail.bank.id,
    node_id: typeof body.parentId === "string" ? body.parentId : null,
    current_version: 1,
    difficulty: typeof body.difficulty === "string" ? body.difficulty : null,
    tags,
    status: "active",
    prompt: stringValue(content.prompt),
    question_type: stringValue(content.question_type, "single"),
    options: optionsValue(content.options),
    correct_answer: content.correct_answer ?? null,
    explanation: stringValue(content.explanation),
    passage: stringValue(content.passage) || null,
    media_url: stringValue(content.media_url) || null,
    instruction: stringValue(content.instruction) || null,
    solution_source: stringValue(content.solution_source),
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function isLoopback(hostname: string) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
}

/**
 * A deliberately closed browser boundary for Question Bank coverage. It gives
 * the shell a short-lived synthetic admin session, fulfills only the precise
 * Auth/profile/Question Bank calls needed by the route, and aborts everything
 * else before a real service can observe it.
 */
export const test = base.extend<TestFixtures>({
  questionBankOptions: [{ permissions: ["question-bank", "exams"] }, { option: true }],
  questionBank: [async ({ context, baseURL, questionBankOptions }, useFixture, testInfo) => {
    if (!baseURL || !isLoopback(new URL(baseURL).hostname)) {
      throw new Error("Question Bank synthetic tests require an explicit loopback base URL");
    }
    const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!configuredSupabaseUrl || new URL(configuredSupabaseUrl).origin !== "https://synthetic.supabase.test") {
      throw new Error("Question Bank synthetic tests require NEXT_PUBLIC_SUPABASE_URL=https://synthetic.supabase.test");
    }

    const appOrigin = new URL(baseURL).origin;
    const authOrigin = new URL(configuredSupabaseUrl).origin;
    const permissions = Array.from(new Set(questionBankOptions.permissions));
    if (!permissions.includes("question-bank")) {
      throw new Error("Question Bank fixture requires the question-bank permission");
    }
    const canManageExams = permissions.includes("exams");
    const { banks, details } = questionBankData();
    if (questionBankOptions.longContent) {
      const longText = "Ngân hàng ôn tập chuyên đề nâng cao – Advanced mathematics question collection ";
      const unbroken = "ChuoiKhongNgat".repeat(18);
      for (const bank of banks) {
        bank.name = `${longText}${unbroken}`;
        bank.description = longText.repeat(3);
      }
      for (const detail of details.values()) {
        for (const node of detail.nodes) node.title = `${longText}${unbroken}`;
        for (const item of detail.items) {
          item.prompt = `${longText.repeat(2)}${unbroken}`;
          item.tags = [unbroken, "Tiếng Việt có dấu", "Advanced mathematics"];
          item.options[0].label = `${longText}${unbroken}`;
          item.correct_answer = "A";
        }
      }
    }
    const sourceExams = canManageExams
      ? [
        { id: "qbank-exam-draft", title: "Đề fixture nháp", exam_type: "TSA", published: false },
        { id: "qbank-exam-published", title: "Đề fixture đã xuất bản", exam_type: "TSA", published: true },
      ]
      : [];
    const sourceSections = canManageExams
      ? [{ id: "qbank-section-draft", exam_id: "qbank-exam-draft", title: "Phần fixture", sort_order: 0 }]
      : [];
    const posts: QuestionBankPost[] = [];
    const apiRequests: RequestEvidence[] = [];
    const authRequests: RequestEvidence[] = [];
    const blockedRequests: RequestEvidence[] = [];
    const unexpectedRequests: RequestEvidence[] = [];
    const externalResponses: RequestEvidence[] = [];
    const catalogFailures: { remaining: number; message: string } = { remaining: 0, message: "Không thể tải danh sách ngân hàng synthetic." };
    const detailFailures = new Map<string, { remaining: number; message: string }>();
    const pausedDetails = new Map<string, Deferred>();
    const pausedCreateBank: { current: Deferred | null } = { current: null };
    const pausedPosts = new Map<PausablePostAction, Deferred>();
    const detailCounts = new Map<string, number>();

    const expiresAt = Math.floor(Date.now() / 1_000) + 3_600;
    const user = {
      id: "qbank-admin",
      email: "qbank-admin@example.test",
      aud: "authenticated",
      role: "authenticated",
      app_metadata: { role: "admin", admin_permissions: permissions },
      user_metadata: {},
      email_confirmed_at: "2026-01-01T00:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z",
    };
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const accessToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
      sub: user.id,
      email: user.email,
      aud: user.aud,
      role: user.role,
      exp: expiresAt,
      app_metadata: user.app_metadata,
    })}.synthetic-signature`;

    await installAdminSession(context, configuredSupabaseUrl, {
      access_token: accessToken,
      refresh_token: "synthetic-question-bank-refresh-token",
      expires_at: expiresAt,
      expires_in: 3_600,
      token_type: "bearer",
      user,
    });

    const corsHeaders = {
      "access-control-allow-origin": appOrigin,
      "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, x-supabase-access-token",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    };
    const fulfillJson = (route: Route, body: unknown, status = 200, extraHeaders: Record<string, string> = {}) => route.fulfill({
      status,
      headers: { "content-type": "application/json", ...corsHeaders, ...extraHeaders },
      body: JSON.stringify(body),
    });
    const catalogPayload = () => ({
      banks: jsonClone(banks),
      sourceExams: jsonClone(sourceExams),
      sourceSections: jsonClone(sourceSections),
      canManageExams,
    });
    const detailPayload = (detail: BankDetail) => ({
      ...jsonClone(detail),
      sourceExams: jsonClone(sourceExams),
      sourceSections: jsonClone(sourceSections),
      canManageExams,
    });

    context.on("response", response => {
      const url = new URL(response.url());
      if (url.origin !== appOrigin && url.origin !== authOrigin) {
        externalResponses.push({ method: response.request().method(), origin: url.origin, pathname: url.pathname, search: url.search, kind: response.request().resourceType() });
      }
    });
    await context.routeWebSocket("**/*", socket => {
      const url = new URL(socket.url());
      const httpOrigin = `${url.protocol === "wss:" ? "https:" : "http:"}//${url.host}`;
      if (httpOrigin === appOrigin) {
        socket.connectToServer();
        return;
      }
      blockedRequests.push({ method: "WEBSOCKET", origin: httpOrigin, pathname: url.pathname, search: url.search, kind: "websocket" });
      socket.close();
    });
    await context.route("**/*", async route => {
      const request = route.request();
      const url = new URL(request.url());
      const evidence = requestEvidence(route);

      if (url.origin === authOrigin) {
        if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: corsHeaders });
        if (request.method() === "GET" && url.pathname === "/auth/v1/user") {
          authRequests.push(evidence);
          return fulfillJson(route, user);
        }
        if (request.method() === "GET" && url.pathname === "/rest/v1/profiles") {
          authRequests.push(evidence);
          return fulfillJson(route, {
            id: user.id,
            full_name: "Quản trị viên Question Bank synthetic",
            student_code: "QB-SYNTHETIC",
            role: "admin",
            status: "active",
            account_status: "active",
            banned_until: null,
          });
        }
        if (request.method() === "POST" && url.pathname === "/auth/v1/logout") {
          authRequests.push(evidence);
          return route.fulfill({ status: 204, headers: corsHeaders });
        }
        unexpectedRequests.push(evidence);
        return route.abort("blockedbyclient");
      }

      if (url.origin !== appOrigin) {
        blockedRequests.push(evidence);
        return route.abort("blockedbyclient");
      }

      if (url.pathname === "/api/admin/exam-content" && request.method() === "GET" && !url.search) {
        apiRequests.push(evidence);
        return fulfillJson(route, { rooms: [], exams: [], sections: [], questions: [], keys: [] });
      }
      if (url.pathname === "/api/admin/exam-history" && request.method() === "GET" && !url.search) {
        apiRequests.push(evidence);
        return fulfillJson(route, { count: 0 });
      }

      if (url.pathname !== "/api/admin/question-banks") {
        if (url.pathname.startsWith("/api/")) {
          unexpectedRequests.push(evidence);
          return route.abort("blockedbyclient");
        }
        return route.continue();
      }

      apiRequests.push(evidence);
      if (request.method() === "GET") {
        const bankId = url.searchParams.get("bankId");
        if (!bankId) {
          if (catalogFailures.remaining) {
            catalogFailures.remaining -= 1;
            return fulfillJson(route, { error: catalogFailures.message }, 503);
          }
          return fulfillJson(route, catalogPayload());
        }
        detailCounts.set(bankId, (detailCounts.get(bankId) ?? 0) + 1);
        const failure = detailFailures.get(bankId);
        if (failure?.remaining) {
          failure.remaining -= 1;
          return fulfillJson(route, { error: failure.message }, 503);
        }
        const gate = pausedDetails.get(bankId);
        if (gate) {
          await gate.promise;
          if (pausedDetails.get(bankId) === gate) pausedDetails.delete(bankId);
        }
        const detail = details.get(bankId);
        return detail
          ? fulfillJson(route, detailPayload(detail))
          : fulfillJson(route, { error: "Không tìm thấy ngân hàng synthetic." }, 404);
      }

      if (request.method() === "POST") {
        const body = requestBody(route);
        posts.push({ body, pathname: url.pathname });
        const postAction = body.action;
        if (postAction === "create_item" || postAction === "import_latex" || postAction === "seed_from_section" || postAction === "create_node" || postAction === "attach_to_exam") {
          const gate = pausedPosts.get(postAction);
          if (gate) {
            await gate.promise;
            if (pausedPosts.get(postAction) === gate) pausedPosts.delete(postAction);
          }
        }
        if (body.action === "create_bank") {
          const gate = pausedCreateBank.current;
          if (gate) {
            await gate.promise;
            if (pausedCreateBank.current === gate) pausedCreateBank.current = null;
          }
          const bank: QuestionBank = {
            id: `qbank-created-bank-${posts.length}`,
            name: stringValue(body.name).trim(),
            subject_code: stringValue(body.subjectCode).trim(),
            grade: stringValue(body.grade).trim(),
            curriculum: stringValue(body.curriculum).trim(),
            description: stringValue(body.description).trim(),
            status: "draft",
            created_at: timestamp,
            updated_at: timestamp,
          };
          banks.unshift(bank);
          details.set(bank.id, { bank, nodes: [], items: [] });
          return fulfillJson(route, { bank: jsonClone(bank) }, 201);
        }
        if (body.action === "create_item" && typeof body.bankId === "string") {
          const detail = details.get(body.bankId);
          if (detail) detail.items.push(createItemFromPost(body, detail, posts.length));
          return fulfillJson(route, { itemId: `qbank-created-${posts.length}`, version: 1 }, 201);
        }
        if (body.action === "create_node" && typeof body.bankId === "string") {
          const detail = details.get(body.bankId);
          const node: QuestionBankNode = {
            id: `qbank-created-node-${posts.length}`,
            bank_id: body.bankId,
            parent_id: stringValue(body.parentId) || null,
            title: stringValue(body.title),
            node_type: body.nodeType === "unit" ? "unit" : "topic",
            sort_order: detail?.nodes.length ?? 0,
          };
          detail?.nodes.push(node);
          return fulfillJson(route, { node: jsonClone(node) }, 201);
        }
        if (body.action === "import_latex") {
          const imported = Array.isArray(body.importIndexes) ? body.importIndexes.length : 0;
          return fulfillJson(route, { imported, skipped: 0 }, 201);
        }
        if (body.action === "seed_from_section") {
          return fulfillJson(route, { imported: 0 }, 200);
        }
        if (body.action === "attach_to_exam") {
          const attached = Array.isArray(body.itemIds) ? body.itemIds.length : 0;
          return fulfillJson(route, { attached, questionIds: [] }, 200);
        }
        return fulfillJson(route, { ok: true }, 201);
      }

      unexpectedRequests.push(evidence);
      return route.abort("blockedbyclient");
    });

    const fixture: QuestionBankFixture = {
      posts,
      apiRequests,
      authRequests,
      blockedRequests,
      unexpectedRequests,
      externalResponses,
      failNextCatalogLoad: (message = "Không thể tải danh sách ngân hàng synthetic.") => {
        catalogFailures.remaining += 1;
        catalogFailures.message = message;
      },
      failNextDetailLoad: (bankId, message = "Không thể tải chi tiết ngân hàng synthetic.") => {
        const current = detailFailures.get(bankId);
        detailFailures.set(bankId, { remaining: (current?.remaining ?? 0) + 1, message });
      },
      pauseDetail: bankId => {
        pausedDetails.get(bankId)?.release();
        pausedDetails.set(bankId, createDeferred());
      },
      releaseDetail: bankId => pausedDetails.get(bankId)?.release(),
      pauseCreateBank: () => {
        pausedCreateBank.current?.release();
        pausedCreateBank.current = createDeferred();
      },
      releaseCreateBank: () => {
        pausedCreateBank.current?.release();
      },
      pausePost: action => {
        pausedPosts.get(action)?.release();
        pausedPosts.set(action, createDeferred());
      },
      releasePost: action => pausedPosts.get(action)?.release(),
      detailRequestCount: bankId => detailCounts.get(bankId) ?? 0,
    };

    try {
      await useFixture(fixture);
    } finally {
      for (const gate of pausedDetails.values()) gate.release();
      pausedCreateBank.current?.release();
      for (const gate of pausedPosts.values()) gate.release();
      await testInfo.attach("question-bank-network-boundary", {
        body: JSON.stringify({
          apiRequests,
          authRequests,
          posts,
          blockedRequests,
          unexpectedRequests,
          externalResponses,
        }, null, 2),
        contentType: "application/json",
      });
      expect(unexpectedRequests, "Unexpected browser API/Auth requests were aborted before reaching a backend").toEqual([]);
      expect(blockedRequests, "External browser requests were aborted; this suite expects none").toEqual([]);
      expect(externalResponses, "No external response may be observed by the synthetic Question Bank suite").toEqual([]);
    }
  }, { auto: true }],
});

async function installAdminSession(
  context: BrowserContext,
  configuredSupabaseUrl: string,
  session: Record<string, unknown>,
) {
  const projectRef = new URL(configuredSupabaseUrl).hostname.split(".")[0];
  await context.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: `sb-${projectRef}-auth-token`, value: session });
}

export { expect };
