"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Eye, FlaskConical, History, Plus, Save, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { authenticatedFetch } from "../lib/auth-client";
import type { ExamPolicy } from "../lib/exam-policy";
import LoadingIndicator from "./loading-indicator";
import "./admin-exam-policy.css";

type Preset = { id?: string; slug: string; name: string; policy: Partial<ExamPolicy> };
type RegradeQuestion = { id: string; section_id: string; section_title: string; prompt: string; question_type: string };
type RegradeVersion = { id: string; version: number; status: string; reason: string; created_at: string };
type RegradeRun = { id: string; status: string; attempt_count: number; affected_count: number; reason: string; created_at: string };
type OverrideDraft = { questionId: string; mode: "accept_multiple" | "void_question" | "award_all"; acceptedAnswers: string };
function localDate(value: string | null) { if (!value) return ""; const date = new Date(value); return Number.isFinite(date.getTime()) ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""; }
function iso(value: string) { return value ? new Date(value).toISOString() : null; }
function mergePolicy(base: ExamPolicy, patch: Partial<ExamPolicy>) { return { ...base, ...patch, access: { ...base.access, ...(patch.access ?? {}) }, timing: { ...base.timing, ...(patch.timing ?? {}) }, randomization: { ...base.randomization, ...(patch.randomization ?? {}) }, navigation: { ...base.navigation, ...(patch.navigation ?? {}) }, integrity: { ...base.integrity, ...(patch.integrity ?? {}) }, release: { ...base.release, ...(patch.release ?? {}) }, network: { ...base.network, ...(patch.network ?? {}) }, review: { ...base.review, ...(patch.review ?? {}) } }; }

export default function AdminExamPolicy({ examId, navigate }: { examId: string; navigate: (path: string) => void }) {
  const [policy, setPolicy] = useState<ExamPolicy | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resultsReleasedAt, setResultsReleasedAt] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<{ status: string; checks: Array<{ code: string; level: string; message: string }>; canPublish: boolean } | null>(null);
  const [regradeQuestions, setRegradeQuestions] = useState<RegradeQuestion[]>([]);
  const [regradeVersions, setRegradeVersions] = useState<RegradeVersion[]>([]);
  const [regradeRuns, setRegradeRuns] = useState<RegradeRun[]>([]);
  const [overrideDrafts, setOverrideDrafts] = useState<OverrideDraft[]>([]);
  const [regradeReason, setRegradeReason] = useState("");
  const [regradeBusy, setRegradeBusy] = useState(false);
  const [impactPreview, setImpactPreview] = useState<{ attemptCount: number; affectedCount: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await authenticatedFetch(`/api/admin/exam-policy?examId=${encodeURIComponent(examId)}`, { cache: "no-store" });
      const payload = await response.json() as { error?: string; policy?: ExamPolicy; presets?: Preset[]; exam?: { results_released_at?: string | null } };
      if (!response.ok || !payload.policy) throw new Error(payload.error || "Không thể tải Exam Policy.");
      setPolicy(payload.policy); setPresets(payload.presets ?? []);
      setResultsReleasedAt(payload.exam?.results_released_at ?? null);
      const regradeResponse = await authenticatedFetch(`/api/admin/exam-regrade?examId=${encodeURIComponent(examId)}`, { cache: "no-store" });
      if (regradeResponse.ok) {
        const regrade = await regradeResponse.json() as { questions?: RegradeQuestion[]; versions?: RegradeVersion[]; runs?: RegradeRun[] };
        setRegradeQuestions(regrade.questions ?? []);
        setRegradeVersions(regrade.versions ?? []);
        setRegradeRuns(regrade.runs ?? []);
      }
    } catch (value) { setError(value instanceof Error ? value.message : "Không thể tải Exam Policy."); }
    finally { setLoading(false); }
  }, [examId]);
  // Load the policy when the route becomes active. This effect intentionally
  // synchronizes component state with the authenticated API response.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  if (loading || !policy) return error ? <div className="policy-page"><p className="admin-access-error">{error}</p><button className="workspace-button primary" onClick={() => void load()}>Thử lại</button></div> : <LoadingIndicator label="Đang tải cài đặt làm bài…" />;

  const update = (changes: Partial<ExamPolicy>) => setPolicy(current => current ? mergePolicy(current, changes) : current);
  const updateNested = (group: keyof ExamPolicy, key: string, value: unknown) => setPolicy(current => current ? ({ ...current, [group]: { ...(current[group] as object), [key]: value } } as ExamPolicy) : current);
  async function post(action: string, extra: Record<string, unknown> = {}) {
    const response = await authenticatedFetch("/api/admin/exam-policy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, examId, ...extra }) });
    const payload = await response.json().catch(() => ({})) as { error?: string; policy?: ExamPolicy; status?: string; checks?: Array<{ code: string; level: string; message: string }>; canPublish?: boolean; results_released_at?: string | null };
    if (!response.ok) throw new Error(payload.error || "Thao tác không thành công.");
    return payload;
  }
  async function save() { setSaving(true); setError(""); try { const payload = await post("save_policy", { policy }); if (payload.policy) setPolicy(payload.policy); setNotice("Đã lưu Exam Policy snapshot cho các lượt thi mới."); } catch (value) { setError(value instanceof Error ? value.message : "Không thể lưu."); } finally { setSaving(false); } }
  async function runPreflight() { setError(""); try { const payload = await post("preflight"); setPreflight({ status: payload.status ?? "error", checks: payload.checks ?? [], canPublish: Boolean(payload.canPublish) }); } catch (value) { setError(value instanceof Error ? value.message : "Không thể chạy preflight."); } }
  async function saveTemplate() { const name = window.prompt("Tên template:", "Template thi thử"); if (!name) return; try { await post("save_template", { name, policy }); setNotice("Đã lưu template cấu hình."); } catch (value) { setError(value instanceof Error ? value.message : "Không thể lưu template."); } }
  async function releaseResults() {
    if (!window.confirm("Mở kết quả cho các lượt tài khoản đã nộp theo policy hiện tại?")) return;
    try {
      const payload = await post("release_results");
      setResultsReleasedAt(typeof payload.results_released_at === "string" ? payload.results_released_at : new Date().toISOString());
      setNotice("Đã mở kết quả cho các lượt thi tài khoản.");
    } catch (value) { setError(value instanceof Error ? value.message : "Không thể mở kết quả."); }
  }
  async function previewRegrade() {
    if (!regradeReason.trim()) { setError("Vui lòng nhập lý do regrade."); return; }
    setRegradeBusy(true); setError("");
    try {
      const response = await authenticatedFetch("/api/admin/exam-regrade", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "preview", examId, reason: regradeReason, overrides: overrideDrafts.map(item => ({ questionId: item.questionId, mode: item.mode, acceptedAnswers: item.acceptedAnswers.split(",").map(value => value.trim()).filter(Boolean) })) }) });
      const payload = await response.json().catch(() => ({})) as { error?: string; version?: RegradeVersion; run?: RegradeRun; impact?: { attemptCount: number; affectedCount: number } };
      if (!response.ok) throw new Error(payload.error || "Không thể preview regrade.");
      if (payload.version) setRegradeVersions(current => [payload.version!, ...current]);
      if (payload.run) setRegradeRuns(current => [payload.run!, ...current]);
      setImpactPreview(payload.impact ?? null);
      setNotice("Đã tạo preview regrade; chưa thay đổi điểm cho đến khi bạn bấm áp dụng.");
    } catch (value) { setError(value instanceof Error ? value.message : "Không thể preview regrade."); }
    finally { setRegradeBusy(false); }
  }
  async function applyRegrade(versionId: string) {
    if (!window.confirm("Áp dụng phiên bản chấm này cho toàn bộ bài đã nộp? Lịch sử điểm gốc vẫn được giữ lại.")) return;
    setRegradeBusy(true); setError("");
    try {
      const response = await authenticatedFetch("/api/admin/exam-regrade", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "apply", examId, versionId, reason: regradeReason || "Áp dụng phiên bản chấm đã preview" }) });
      const payload = await response.json().catch(() => ({})) as { error?: string; affectedCount?: number };
      if (!response.ok) throw new Error(payload.error || "Không thể áp dụng regrade.");
      setNotice(`Đã regrade ${payload.affectedCount ?? 0} lượt bị ảnh hưởng.`);
      await load();
    } catch (value) { setError(value instanceof Error ? value.message : "Không thể áp dụng regrade."); }
    finally { setRegradeBusy(false); }
  }
  const applyPreset = (slug: string) => { const preset = presets.find(item => item.slug === slug); if (preset) setPolicy(current => current ? mergePolicy(current, preset.policy) : current); };
  return <div className="policy-page">
    <header className="policy-page-header"><div><button className="workspace-back" onClick={() => navigate(`/admin/exams/${examId}`)}>← Quay lại soạn đề</button><span className="editor-eyebrow">QUY TẮC ĐỢT THI</span><h1>Cách làm bài và công bố kết quả</h1><p>Đề thi là nội dung; các quy tắc dưới đây quyết định cách tổ chức từng đợt thi. Thay đổi áp dụng cho lượt thi mới.</p></div><div className="policy-header-actions"><button className="workspace-button ghost" onClick={() => navigate(`/admin/exams/${examId}/preview`)}><Eye/>Xem trước</button><button className="workspace-button primary" disabled={saving} onClick={() => void save()}><Save/>{saving ? "Đang lưu…" : "Lưu quy tắc"}</button></div></header>
    {notice && <p className="policy-notice" role="status" aria-live="polite"><CheckCircle2 aria-hidden="true"/>{notice}</p>}{error && <p className="admin-access-error" role="alert">{error}</p>}
    <section className="policy-toolbar"><label>Mẫu cấu hình<select defaultValue="" onChange={event => applyPreset(event.target.value)}><option value="">Chọn mẫu để điền nhanh…</option>{presets.map(preset => <option key={preset.slug} value={preset.slug}>{preset.name}</option>)}</select></label><button className="workspace-button ghost" onClick={saveTemplate}><Sparkles/>Lưu thành mẫu</button><button className="workspace-button ghost" onClick={() => void runPreflight()}><FlaskConical/>Kiểm tra trước khi xuất bản</button>{[policy.release.score, policy.release.answers, policy.release.solutions].includes("manual") && <button className="workspace-button primary" onClick={() => void releaseResults()} disabled={Boolean(resultsReleasedAt)}><Eye/>{resultsReleasedAt ? "Đã công bố kết quả" : "Công bố kết quả"}</button>}</section>
    <div className="policy-grid">
      <section className="policy-card"><h2>Quyền truy cập và lượt làm</h2><div className="policy-form-grid"><label>Chế độ<select value={policy.mode} onChange={event => update({ mode: event.target.value as ExamPolicy["mode"] })}><option value="practice">Luyện tập</option><option value="official">Thi chính thức / thi thử</option></select></label><label>Số lượt tối đa (0 = không giới hạn)<input type="number" min={0} placeholder="0 = không giới hạn" value={policy.access.maxAttempts} onChange={event => updateNested("access", "maxAttempts", Number(event.target.value))}/></label><label>Đối tượng<select value={policy.access.audience} onChange={event => updateNested("access", "audience", event.target.value)}><option value="account">Tài khoản</option><option value="both">Tài khoản + link</option><option value="guest">Link ngắn hạn</option></select></label><label>Danh sách được tham gia<select value={policy.access.rosterMode} onChange={event => updateNested("access", "rosterMode", event.target.value)}><option value="open">Mở</option><option value="enrolled">Theo lớp / phân quyền</option><option value="allowlist">Mã thí sinh được chọn</option></select></label></div></section>
      <section className="policy-card"><h2>Thời gian</h2><div className="policy-form-grid"><label>Mở đề<input type="datetime-local" value={localDate(policy.timing.opensAt)} onChange={event => updateNested("timing", "opensAt", iso(event.target.value))}/></label><label>Đóng truy cập<input type="datetime-local" value={localDate(policy.timing.closesAt)} onChange={event => updateNested("timing", "closesAt", iso(event.target.value))}/></label><label>Thời lượng (phút)<input type="number" min={1} value={policy.timing.durationMinutes} onChange={event => updateNested("timing", "durationMinutes", Number(event.target.value))}/></label><label>Thời gian gia hạn (phút)<input type="number" min={0} value={policy.timing.gracePeriodMinutes} onChange={event => updateNested("timing", "gracePeriodMinutes", Number(event.target.value))}/></label></div></section>
      <section className="policy-card"><h2>Cách làm bài</h2><div className="policy-checks"><label><input type="checkbox" checked={policy.randomization.shuffleQuestions} onChange={event => updateNested("randomization", "shuffleQuestions", event.target.checked)}/> Đảo câu hỏi</label><label><input type="checkbox" checked={policy.randomization.shuffleOptions} onChange={event => updateNested("randomization", "shuffleOptions", event.target.checked)}/> Đảo đáp án</label></div><div className="policy-form-grid"><label>Cách xáo trộn<select value={policy.randomization.randomizationMode} onChange={event => updateNested("randomization", "randomizationMode", event.target.value)}><option value="none">Không đảo</option><option value="per_attempt">Mỗi lượt một thứ tự</option><option value="exam_code">Theo mã đề</option></select></label><label>Số mã đề<input type="number" min={0} value={policy.randomization.examCodeCount} onChange={event => updateNested("randomization", "examCodeCount", Number(event.target.value))}/></label><label>Số câu chọn ngẫu nhiên<input type="number" min={0} value={policy.randomization.questionPoolSize} onChange={event => updateNested("randomization", "questionPoolSize", Number(event.target.value))}/></label></div><p className="policy-help">Thứ tự câu, đáp án và điểm số vẫn được lưu bằng mã ổn định của hệ thống.</p></section>
      <section className="policy-card"><h2>Điều hướng câu hỏi</h2><div className="policy-checks"><label><input type="checkbox" checked={policy.navigation.allowSkip} onChange={event => updateNested("navigation", "allowSkip", event.target.checked)}/> Cho phép bỏ qua câu</label><label><input type="checkbox" checked={policy.navigation.allowBacktrack} onChange={event => updateNested("navigation", "allowBacktrack", event.target.checked)}/> Cho quay lại câu trước</label><label><input type="checkbox" checked={policy.navigation.allowSectionBacktrack} onChange={event => updateNested("navigation", "allowSectionBacktrack", event.target.checked)}/> Cho quay lại phần trước</label><label><input type="checkbox" checked={policy.navigation.requireAnswerBeforeNext} onChange={event => updateNested("navigation", "requireAnswerBeforeNext", event.target.checked)}/> Bắt buộc trả lời trước khi sang câu</label></div></section>
      <section className="policy-card"><h2>Giám sát</h2><div className="policy-checks"><label><input type="checkbox" checked={policy.integrity.fullscreenRequired} onChange={event => updateNested("integrity", "fullscreenRequired", event.target.checked)}/> Bắt buộc toàn màn hình</label><label><input type="checkbox" checked={policy.integrity.visibilityMonitoring} onChange={event => updateNested("integrity", "visibilityMonitoring", event.target.checked)}/> Ghi nhận rời tab</label><label><input type="checkbox" checked={policy.integrity.focusMonitoring} onChange={event => updateNested("integrity", "focusMonitoring", event.target.checked)}/> Ghi nhận mất focus</label><label><input type="checkbox" checked={policy.integrity.copyProtection} onChange={event => updateNested("integrity", "copyProtection", event.target.checked)}/> Theo dõi copy/cut</label><label><input type="checkbox" checked={policy.integrity.pasteProtection} onChange={event => updateNested("integrity", "pasteProtection", event.target.checked)}/> Theo dõi paste</label></div><p className="policy-help"><ShieldCheck/> Chỉ ghi nhận sự kiện kỹ thuật để giáo viên xem lại; hệ thống không tự kết luận gian lận.</p></section>
      <section className="policy-card"><h2>Kết quả</h2><div className="policy-form-grid"><label>Điểm<select value={policy.release.score} onChange={event => updateNested("release", "score", event.target.value)}><option value="never">Không công bố</option><option value="after_submit">Sau khi nộp</option><option value="after_slot">Sau khi đợt thi kết thúc</option><option value="manual">Giáo viên công bố</option><option value="scheduled">Theo lịch</option></select></label><label>Đáp án<select value={policy.release.answers} onChange={event => updateNested("release", "answers", event.target.value)}><option value="never">Không công bố</option><option value="after_submit">Sau khi nộp</option><option value="after_slot">Sau khi đợt thi kết thúc</option><option value="manual">Giáo viên công bố</option></select></label><label>Lời giải<select value={policy.release.solutions} onChange={event => updateNested("release", "solutions", event.target.value)}><option value="never">Không công bố</option><option value="after_submit">Sau khi nộp</option><option value="after_slot">Sau khi đợt thi kết thúc</option><option value="manual">Giáo viên công bố</option></select></label><label>Ẩn đáp án câu sai<input type="checkbox" checked={policy.release.hideWrongAnswers} onChange={event => updateNested("release", "hideWrongAnswers", event.target.checked)}/></label></div></section>
    </div>
    {preflight && <section className={`policy-preflight is-${preflight.status}`} aria-live="polite"><h2>Kiểm tra phát hành: {preflight.status.toUpperCase()}</h2>{preflight.checks.map(check => <div key={check.code}><b aria-hidden="true">{check.level === "error" ? "✕" : check.level === "warning" ? "!" : "✓"}</b><span>{check.message}</span></div>)}<strong>{preflight.canPublish ? "Có thể xuất bản hoặc mở kíp" : "Cần sửa lỗi trước khi xuất bản"}</strong></section>}
    <div className="policy-grid policy-extra-grid">
      <section className="policy-card"><h2>Trạng thái lưu & kết nối</h2><div className="policy-checks"><label><input type="checkbox" checked={policy.network.showSaveState} onChange={event => updateNested("network", "showSaveState", event.target.checked)}/> Hiển thị trạng thái đã lưu</label><label><input type="checkbox" checked={policy.network.allowOfflineDraft} onChange={event => updateNested("network", "allowOfflineDraft", event.target.checked)}/> Cho phép giữ nháp khi mất mạng</label></div><p className="policy-help">Câu trả lời chỉ được coi là đã lưu khi máy chủ xác nhận.</p></section>
      <section className="policy-card"><h2>Lịch sử chấm</h2><div className="policy-form-grid"><label>Thiết bị đồng thời<input type="number" min={1} max={5} value={policy.integrity.maxConcurrentDevices} onChange={event => updateNested("integrity", "maxConcurrentDevices", Number(event.target.value))}/></label><label>Phiên bản chấm lại<input type="number" min={1} value={policy.review.regradeVersion} onChange={event => updateNested("review", "regradeVersion", Number(event.target.value))}/></label></div><div className="policy-checks"><label><input type="checkbox" checked={policy.navigation.lockCompletedSections} onChange={event => updateNested("navigation", "lockCompletedSections", event.target.checked)}/> Khóa phần đã hoàn tất</label><label><input type="checkbox" checked={policy.review.manualReviewRequired} onChange={event => updateNested("review", "manualReviewRequired", event.target.checked)}/> Yêu cầu giáo viên xem lại</label></div></section>
      <section className="policy-card"><h2>Phát hành nâng cao</h2><div className="policy-form-grid"><label>Ngưỡng xem điểm (%)<input type="number" min={0} max={100} value={policy.release.scoreThreshold} onChange={event => updateNested("release", "scoreThreshold", Number(event.target.value))}/></label><label>Ngưỡng xem đáp án (%)<input type="number" min={0} max={100} value={policy.release.answerThreshold} onChange={event => updateNested("release", "answerThreshold", Number(event.target.value))}/></label><label>Lịch phát hành<input type="datetime-local" value={localDate(policy.release.releaseAt)} onChange={event => updateNested("release", "releaseAt", iso(event.target.value))}/></label></div></section>
    </div>
    <RegradePanel questions={regradeQuestions} versions={regradeVersions} runs={regradeRuns} drafts={overrideDrafts} reason={regradeReason} impact={impactPreview} busy={regradeBusy} onReasonChange={setRegradeReason} onDraftsChange={setOverrideDrafts} onPreview={() => void previewRegrade()} onApply={versionId => void applyRegrade(versionId)} />
  </div>;
}

function RegradePanel({ questions, versions, runs, drafts, reason, impact, busy, onReasonChange, onDraftsChange, onPreview, onApply }: {
  questions: RegradeQuestion[];
  versions: RegradeVersion[];
  runs: RegradeRun[];
  drafts: OverrideDraft[];
  reason: string;
  impact: { attemptCount: number; affectedCount: number } | null;
  busy: boolean;
  onReasonChange: (value: string) => void;
  onDraftsChange: (value: OverrideDraft[]) => void;
  onPreview: () => void;
  onApply: (versionId: string) => void;
}) {
  const add = () => {
    const first = questions[0];
    if (!first) return;
    onDraftsChange([...drafts, { questionId: first.id, mode: "void_question", acceptedAnswers: "" }]);
  };
  return <section className="policy-card regrade-panel">
    <div className="regrade-heading"><div><span className="editor-eyebrow">LỊCH SỬ CHẤM</span><h2>Chấm lại có kiểm soát</h2><p>Kiểm tra điều gì thay đổi, ai bị ảnh hưởng và điểm số thay đổi ra sao trước khi áp dụng.</p></div><History/></div>
    <label>Lý do thao tác<textarea value={reason} onChange={event => onReasonChange(event.target.value)} rows={2} placeholder="Ví dụ: Câu 17 chấp nhận B hoặc C"/></label>
    <div className="regrade-override-list">{drafts.map((draft, index) => <div className="regrade-override-row" key={`${draft.questionId}-${index}`}><select value={draft.questionId} onChange={event => onDraftsChange(drafts.map((item, itemIndex) => itemIndex === index ? { ...item, questionId: event.target.value } : item))}>{questions.map(question => <option key={question.id} value={question.id}>{question.section_title} · {question.prompt.slice(0, 90)}</option>)}</select><select value={draft.mode} onChange={event => onDraftsChange(drafts.map((item, itemIndex) => itemIndex === index ? { ...item, mode: event.target.value as OverrideDraft["mode"] } : item))}><option value="void_question">Hủy câu</option><option value="accept_multiple">Chấp nhận nhiều đáp án</option><option value="award_all">Tính điểm tất cả</option></select>{draft.mode === "accept_multiple" && <input value={draft.acceptedAnswers} onChange={event => onDraftsChange(drafts.map((item, itemIndex) => itemIndex === index ? { ...item, acceptedAnswers: event.target.value } : item))} placeholder="B, C"/>}<button type="button" aria-label="Xóa override" onClick={() => onDraftsChange(drafts.filter((_, itemIndex) => itemIndex !== index))}><Trash2/></button></div>)}</div>
    <div className="regrade-actions"><button className="workspace-button ghost" type="button" onClick={add} disabled={busy || !questions.length}><Plus/>Thêm thay đổi</button><button className="workspace-button primary" type="button" onClick={onPreview} disabled={busy || !reason.trim()}>{busy ? "Đang kiểm tra…" : "Xem tác động"}</button></div>
    {impact && <p className="regrade-impact">Đã kiểm tra {impact.attemptCount} lượt · {impact.affectedCount} lượt sẽ thay đổi.</p>}
    {versions.length > 0 && <div className="regrade-history"><h3>Phiên bản chấm</h3>{versions.slice(0, 8).map(version => <div key={version.id}><span>v{version.version} · {version.status}</span><small>{version.reason}</small>{version.status === "draft" && <button type="button" onClick={() => onApply(version.id)} disabled={busy}>Áp dụng</button>}</div>)}</div>}
    {runs.length > 0 && <div className="regrade-history"><h3>Lịch sử áp dụng</h3>{runs.slice(0, 5).map(run => <div key={run.id}><span>{run.status} · {run.affected_count}/{run.attempt_count} lượt</span><small>{run.reason}</small></div>)}</div>}
  </section>;
}
