export default function LoadingIndicator({ label = "Đang tải…", fullPage = false }: { label?: string; fullPage?: boolean }) {
  return <div className={`remix-loading${fullPage ? " full-page" : ""}`} role="status" aria-live="polite">
    <div className="remix-loader" aria-hidden="true" />
    <span>{label}</span>
  </div>;
}
