import { ArrowUpRight, ShieldAlert } from "lucide-react";

function legacyUrl(path: string) {
  const origin = import.meta.env.VITE_LEGACY_APP_ORIGIN?.trim();
  if (!origin) return null;
  try {
    return new URL(path, origin).toString();
  } catch {
    return null;
  }
}

export function LegacyModulePage({
  title,
  description,
  legacyPath,
  protectedVisual = false,
}: {
  title: string;
  description: string;
  legacyPath: string;
  protectedVisual?: boolean;
}) {
  const target = legacyUrl(legacyPath);
  return (
    <div className="aeck-page-stack">
      <header className="aeck-page-heading">
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      <section className="aeck-migration-boundary">
        <span className="aeck-migration-icon" aria-hidden="true"><ShieldAlert /></span>
        <div>
          <h2>{protectedVisual ? "Giao diện chuyên biệt được giữ nguyên" : "Module đang chạy qua adapter tương thích"}</h2>
          <p>
            {protectedVisual
              ? "Workspace mới không thay đổi phần câu hỏi, đáp án, làm bài, kết quả hoặc biên soạn. Hãy mở module trong ứng dụng hiện tại để tiếp tục."
              : "Dữ liệu và thao tác của module này vẫn thuộc ứng dụng hiện tại trong giai đoạn chuyển đổi cuốn chiếu."}
          </p>
        </div>
        {target ? (
          <a href={target} className="aeck-primary-link">
            Mở module hiện tại <ArrowUpRight aria-hidden="true" />
          </a>
        ) : (
          <p className="aeck-adapter-note" role="status">
            Cần cấu hình <code>VITE_LEGACY_APP_ORIGIN</code> để mở module từ deployment này.
          </p>
        )}
      </section>
    </div>
  );
}
