import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  IntegrationProvider,
  IntegrationStatus,
  ShipmentCarrier,
} from "@aeck/contracts";
import {
  CalendarPlus2,
  FileScan,
  Landmark,
  RefreshCw,
  Truck,
  Video,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import {
  createZoomMeeting,
  integrationStatusQuery,
  lookupVietQrAccount,
  recognizeEquation,
  trackShipment,
} from "../../api/integration-api.ts";
import { LoadingPanel } from "../../components/ui/loading-panel.tsx";
import { QueryError } from "../../components/ui/query-error.tsx";
import "../../styles/integration-hub.css";

const bankOptions = [
  ["VCB", "Vietcombank"],
  ["VTB", "VietinBank"],
  ["BIDV", "BIDV"],
  ["MB", "MBBank"],
  ["TCB", "Techcombank"],
] as const;

const carrierOptions = [
  ["ghn", "GHN"],
  ["ghtk", "GHTK"],
  ["spx", "SPX Express"],
  ["vnpost", "VNPost"],
  ["viettelpost", "Viettel Post"],
  ["other", "Khác"],
] as const;

function localDateTimeValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function StatusBadge({ status }: { status: IntegrationStatus | undefined }) {
  const state = status?.state ?? "unavailable";
  const label = {
    ready: "Sẵn sàng",
    fallback: "Dự phòng",
    disabled: "Đang tắt",
    unavailable: "Chưa cấu hình",
  }[state];
  return <span className="aeck-integration-status" data-state={state}>{label}</span>;
}

function OperationMessage({ error, success }: { error?: string; success?: string }) {
  return (
    <div className="aeck-operation-message" aria-live="polite">
      {error ? <p role="alert">{error}</p> : success ? <p>{success}</p> : null}
    </div>
  );
}

export function AdminIntegrationsPage() {
  const statusQuery = useQuery(integrationStatusQuery);
  const statuses = useMemo(
    () => new Map(statusQuery.data?.providers.map((item) => [item.provider, item])),
    [statusQuery.data?.providers],
  );
  const [zoomClassId, setZoomClassId] = useState("ilearn-tsa-a");
  const [zoomTitle, setZoomTitle] = useState("Buổi học trực tuyến");
  const [zoomStartsAt, setZoomStartsAt] = useState(() => localDateTimeValue(new Date(Date.now() + 86_400_000)));
  const [zoomDuration, setZoomDuration] = useState(90);
  const [bankId, setBankId] = useState("VTB");
  const [accountNumber, setAccountNumber] = useState("");
  const [carrier, setCarrier] = useState<ShipmentCarrier>("ghn");
  const [trackingCode, setTrackingCode] = useState("");
  const [ocrFile, setOcrFile] = useState<File | null>(null);

  const zoomMutation = useMutation({ mutationFn: createZoomMeeting });
  const bankMutation = useMutation({ mutationFn: lookupVietQrAccount });
  const trackingMutation = useMutation({ mutationFn: trackShipment });
  const ocrMutation = useMutation({ mutationFn: recognizeEquation });

  if (statusQuery.isPending) return <LoadingPanel label="Đang kiểm tra tích hợp vận hành…" />;
  if (statusQuery.isError) {
    return <QueryError message={statusQuery.error.message} retry={() => void statusQuery.refetch()} />;
  }

  const status = (provider: IntegrationProvider) => statuses.get(provider);
  const providerReady = (provider: IntegrationProvider) => status(provider)?.state === "ready";
  const errorText = (error: unknown) => error instanceof Error ? error.message : "Không thể hoàn tất thao tác. Vui lòng thử lại.";

  const submitZoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    zoomMutation.mutate({
      classId: zoomClassId,
      title: zoomTitle,
      startsAt: new Date(zoomStartsAt).toISOString(),
      durationMinutes: zoomDuration,
    });
  };

  const submitBank = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    bankMutation.mutate({ bankId, accountNumber });
  };

  const submitTracking = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    trackingMutation.mutate({ carrier, trackingCode });
  };

  const submitOcr = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (ocrFile) ocrMutation.mutate(ocrFile);
  };

  return (
    <div className="aeck-integration-hub">
      <header className="aeck-integration-heading">
        <div>
          <span>Tích hợp vận hành</span>
          <h1>Connector và phương án dự phòng</h1>
          <p>Kiểm tra từng luồng trước khi bật cho môi trường production.</p>
        </div>
        <button type="button" onClick={() => void statusQuery.refetch()} disabled={statusQuery.isFetching}>
          <RefreshCw aria-hidden="true" />
          {statusQuery.isFetching ? "Đang kiểm tra…" : "Kiểm tra lại"}
        </button>
      </header>

      <section className="aeck-integration-summary" aria-label="Trạng thái tích hợp">
        {statusQuery.data.providers.map((item) => (
          <article key={item.provider}>
            <div>
              <strong>{item.label}</strong>
              <StatusBadge status={item} />
            </div>
            <p>{item.message}</p>
          </article>
        ))}
      </section>

      <div className="aeck-integration-grid">
        <section className="aeck-integration-card" aria-labelledby="aeck-zoom-title">
          <header>
            <span aria-hidden="true"><Video /></span>
            <div><h2 id="aeck-zoom-title">Zoom cho iLearn</h2><p>Tạo buổi học và nhận link tham gia.</p></div>
            <StatusBadge status={status("zoom")} />
          </header>
          <form onSubmit={submitZoom} aria-busy={zoomMutation.isPending}>
            <label htmlFor="integration-zoom-class">Mã lớp iLearn</label>
            <input id="integration-zoom-class" value={zoomClassId} onChange={(event) => setZoomClassId(event.target.value)} maxLength={120} required />
            <label htmlFor="integration-zoom-title">Tên buổi học</label>
            <input id="integration-zoom-title" value={zoomTitle} onChange={(event) => setZoomTitle(event.target.value)} maxLength={160} required />
            <div className="aeck-integration-fields">
              <div><label htmlFor="integration-zoom-start">Bắt đầu</label><input id="integration-zoom-start" type="datetime-local" value={zoomStartsAt} onChange={(event) => setZoomStartsAt(event.target.value)} required /></div>
              <div><label htmlFor="integration-zoom-duration">Thời lượng (phút)</label><input id="integration-zoom-duration" type="number" min="15" max="480" value={zoomDuration} onChange={(event) => setZoomDuration(Number(event.target.value))} required /></div>
            </div>
            <button type="submit" disabled={zoomMutation.isPending || !providerReady("zoom")}><CalendarPlus2 aria-hidden="true" />{zoomMutation.isPending ? "Đang tạo…" : "Tạo buổi Zoom"}</button>
            <OperationMessage error={zoomMutation.isError ? errorText(zoomMutation.error) : undefined} success={zoomMutation.data ? `Đã tạo Meeting ID ${zoomMutation.data.meetingId}.` : undefined} />
          </form>
          <Link to="/admin/ilearn">Mở quản lý iLearn</Link>
        </section>

        <section className="aeck-integration-card" aria-labelledby="aeck-ocr-title">
          <header>
            <span aria-hidden="true"><FileScan /></span>
            <div><h2 id="aeck-ocr-title">Gemini OCR</h2><p>Đọc nhanh một biểu thức từ ảnh hoặc PDF.</p></div>
            <StatusBadge status={status("gemini-ocr")} />
          </header>
          <form onSubmit={submitOcr} aria-busy={ocrMutation.isPending}>
            <label htmlFor="integration-ocr-file">Tệp cần nhận diện</label>
            <input id="integration-ocr-file" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => setOcrFile(event.target.files?.[0] ?? null)} required />
            <p className="aeck-integration-hint">PNG, JPEG, WebP hoặc PDF; tối đa 8 MB.</p>
            <button type="submit" disabled={ocrMutation.isPending || !ocrFile || !providerReady("gemini-ocr")}><FileScan aria-hidden="true" />{ocrMutation.isPending ? "Đang nhận diện…" : "Nhận diện biểu thức"}</button>
            <OperationMessage error={ocrMutation.isError ? errorText(ocrMutation.error) : undefined} success={ocrMutation.data ? `LaTeX: ${ocrMutation.data.latex}` : undefined} />
          </form>
        </section>

        <section className="aeck-integration-card" aria-labelledby="aeck-bank-title">
          <header>
            <span aria-hidden="true"><Landmark /></span>
            <div><h2 id="aeck-bank-title">VietQR</h2><p>Đối chiếu tên chủ tài khoản trước khi lưu.</p></div>
            <StatusBadge status={status("vietqr")} />
          </header>
          <form onSubmit={submitBank} aria-busy={bankMutation.isPending}>
            <div className="aeck-integration-fields">
              <div><label htmlFor="integration-bank-id">Ngân hàng</label><select id="integration-bank-id" value={bankId} onChange={(event) => setBankId(event.target.value)}>{bankOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
              <div><label htmlFor="integration-account">Số tài khoản</label><input id="integration-account" inputMode="numeric" pattern="[0-9]{6,24}" value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} placeholder="123456789" required /></div>
            </div>
            <button type="submit" disabled={bankMutation.isPending || !providerReady("vietqr")}><Landmark aria-hidden="true" />{bankMutation.isPending ? "Đang tra cứu…" : "Tra cứu tài khoản"}</button>
            <OperationMessage error={bankMutation.isError ? errorText(bankMutation.error) : undefined} success={bankMutation.data ? `Tên chủ tài khoản: ${bankMutation.data.accountName ?? "Chưa xác định"}.` : undefined} />
          </form>
        </section>

        <section className="aeck-integration-card" aria-labelledby="aeck-tracking-title">
          <header>
            <span aria-hidden="true"><Truck /></span>
            <div><h2 id="aeck-tracking-title">Theo dõi vận đơn</h2><p>Ưu tiên GHN và luôn giữ luồng cập nhật thủ công.</p></div>
            <StatusBadge status={status("manual-tracking")} />
          </header>
          <form onSubmit={submitTracking} aria-busy={trackingMutation.isPending}>
            <div className="aeck-integration-fields">
              <div><label htmlFor="integration-carrier">Đơn vị vận chuyển</label><select id="integration-carrier" value={carrier} onChange={(event) => setCarrier(event.target.value as ShipmentCarrier)}>{carrierOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
              <div><label htmlFor="integration-tracking-code">Mã vận đơn</label><input id="integration-tracking-code" value={trackingCode} onChange={(event) => setTrackingCode(event.target.value)} placeholder="G8AECK001" maxLength={80} required /></div>
            </div>
            <button type="submit" disabled={trackingMutation.isPending}><Truck aria-hidden="true" />{trackingMutation.isPending ? "Đang kiểm tra…" : "Kiểm tra vận đơn"}</button>
            <OperationMessage error={trackingMutation.isError ? errorText(trackingMutation.error) : undefined} success={trackingMutation.data?.message} />
          </form>
          <Link to="/admin/delivery">Mở quản lý giao hàng</Link>
        </section>
      </div>
    </div>
  );
}
