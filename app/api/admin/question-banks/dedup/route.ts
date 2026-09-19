import { ensureAdminPermission } from "../../../../../lib/admin-authorization-server";
import { readJsonBody } from "../../../../../lib/http-server";
import { findDuplicateGroups, type DedupQuestion } from "../../../../../lib/question-dedup";

const headers = { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" };

type Body = { bankId?: string; threshold?: number; limit?: number };

export async function POST(request: Request) {
  const security = await ensureAdminPermission(request, "question-bank");
  if (!security.ok) return security.response;
  const parsed = await readJsonBody<Body>(request);
  if (!parsed.ok) return Response.json({ error: "Payload không hợp lệ." }, { status: 400, headers });
  const bankId = typeof parsed.body.bankId === "string" ? parsed.body.bankId.trim() : "";
  const limit = Math.min(1_000, Math.max(2, Number(parsed.body.limit) || 500));
  const threshold = Math.min(1, Math.max(0.5, Number(parsed.body.threshold) || 0.86));
  const itemsQuery = security.admin.from("question_bank_items").select("id,bank_id,current_version").order("updated_at", { ascending: false }).limit(limit);
  const itemsResult = bankId ? itemsQuery.eq("bank_id", bankId) : itemsQuery;
  const items = await itemsResult;
  if (items.error) return Response.json({ error: "Không thể tải dữ liệu ngân hàng câu hỏi." }, { status: 503, headers });
  const rows = items.data ?? [];
  const ids = rows.map(row => row.id);
  const versions = ids.length
    ? await security.admin.from("question_bank_item_versions").select("item_id,version,prompt,question_type").in("item_id", ids)
    : { data: [], error: null };
  if (versions.error) return Response.json({ error: "Không thể tải phiên bản câu hỏi." }, { status: 503, headers });
  const currentVersion = new Map((versions.data ?? []).map(row => [`${row.item_id}:${row.version}`, row]));
  const questions: DedupQuestion[] = rows.flatMap(row => {
    const version = currentVersion.get(`${row.id}:${row.current_version}`);
    return version?.prompt ? [{ id: String(row.id), prompt: String(version.prompt), questionType: version.question_type ? String(version.question_type) : null }] : [];
  });
  const groups = findDuplicateGroups(questions, threshold);
  return Response.json({ bankId: bankId || null, threshold, scanned: questions.length, groups }, { headers });
}
