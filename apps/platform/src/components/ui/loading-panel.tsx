export function LoadingPanel({ label = "Đang tải dữ liệu…" }: { label?: string }) {
  return (
    <div className="aeck-loading-panel" role="status" aria-live="polite">
      <span className="aeck-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
