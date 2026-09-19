"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Search } from "lucide-react";
import { authenticatedFetch } from "../../../../lib/auth-client";
import AuthGuard from "../../../auth-guard";
import Shell from "../../../shell";
import { AeckButton, AeckCard, AeckErrorState, AeckLoadingState, AeckPageHeader } from "../../../aeck-ui";
import "./dedup.css";

type Bank = { id: string; name: string };
type DuplicateGroup = { itemIds: string[]; similarity: number; representativeId: string };

export function DedupContent() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankId, setBankId] = useState("");
  const [threshold, setThreshold] = useState("0.86");
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [scanned, setScanned] = useState(0);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const loadBanks = useCallback(async () => {
    const response = await authenticatedFetch("/api/admin/question-banks", { cache: "no-store" });
    const payload = await response.json().catch(() => null) as { banks?: Bank[]; error?: string } | null;
    if (!response.ok) throw new Error(payload?.error ?? "Không thể tải ngân hàng câu hỏi.");
    setBanks(payload?.banks ?? []);
    if (!bankId && payload?.banks?.[0]?.id) setBankId(payload.banks[0].id);
  }, [bankId]);
  // Initial network synchronization intentionally updates local view state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadBanks().catch(value => setError(value instanceof Error ? value.message : "Không thể tải ngân hàng câu hỏi.")).finally(() => setLoading(false)); }, [loadBanks]);
  async function scan() {
    setScanning(true); setError("");
    try {
      const response = await authenticatedFetch("/api/admin/question-banks/dedup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bankId: bankId || undefined, threshold: Number(threshold) }) });
      const payload = await response.json().catch(() => null) as { groups?: DuplicateGroup[]; scanned?: number; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Không thể quét trùng lặp.");
      setGroups(payload?.groups ?? []); setScanned(payload?.scanned ?? 0);
    } catch (value) { setError(value instanceof Error ? value.message : "Không thể quét trùng lặp."); }
    finally { setScanning(false); }
  }
  if (loading) return <AeckLoadingState label="Đang tải ngân hàng câu hỏi…" />;
  return <div className="aeck-dedup-page">
    <AeckPageHeader kicker="QUESTION BANK / DEDUP" title="Phát hiện câu hỏi trùng lặp" description="Quét theo nội dung đã chuẩn hóa, chỉ báo nhóm tương tự để quản trị viên kiểm tra trước khi hợp nhất hoặc xóa." />
    <AeckCard className="aeck-dedup-controls">
      <label htmlFor="dedup-bank">Ngân hàng<select id="dedup-bank" value={bankId} onChange={event => setBankId(event.target.value)}><option value="">Tất cả ngân hàng</option>{banks.map(bank => <option value={bank.id} key={bank.id}>{bank.name}</option>)}</select></label>
      <label htmlFor="dedup-threshold">Ngưỡng tương đồng<input id="dedup-threshold" type="number" min="0.5" max="1" step="0.01" value={threshold} onChange={event => setThreshold(event.target.value)} /></label>
      <AeckButton variant="primary" onClick={() => void scan()} disabled={scanning}><Search aria-hidden="true" />{scanning ? "Đang quét…" : "Quét trùng lặp"}</AeckButton>
    </AeckCard>
    {error ? <AeckErrorState description={error} onRetry={() => void scan()} /> : null}
    <p className="aeck-dedup-summary" role="status" aria-live="polite">Đã quét {scanned} câu hỏi · phát hiện {groups.length} nhóm cần rà soát.</p>
    <section className="aeck-dedup-groups" aria-label="Nhóm câu hỏi tương tự">
      {groups.length ? groups.map(group => <AeckCard className="aeck-dedup-group" key={group.representativeId}><header><AlertTriangle aria-hidden="true" /><strong>Nhóm {group.representativeId}</strong><span>{Math.round(group.similarity * 100)}% tương đồng</span></header><p>{group.itemIds.length} câu hỏi trong nhóm · đại diện: <code>{group.representativeId}</code></p><ul>{group.itemIds.map(id => <li key={id}><code>{id}</code>{id === group.representativeId ? <CheckCircle2 aria-label="Đại diện" /> : null}</li>)}</ul></AeckCard>) : <AeckCard><p>Chưa có nhóm trùng lặp được xác nhận.</p></AeckCard>}
    </section>
  </div>;
}

export default function AdminQuestionBankDedup() {
  return <AuthGuard requiredRole="admin" requiredPermission="question-bank"><Shell><DedupContent /></Shell></AuthGuard>;
}
