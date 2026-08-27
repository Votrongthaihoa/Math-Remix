import { Construction } from "lucide-react";

export function AdminModulePage({ title, description }: { title: string; description: string }) {
  return (
    <div className="aeck-page-stack">
      <header className="aeck-page-heading"><h1>{title}</h1><p>{description}</p></header>
      <section className="aeck-module-status">
        <Construction aria-hidden="true" />
        <div><h2>Nền tảng đã sẵn sàng</h2><p>Route, phân quyền và khung giao diện đã được tách riêng. Adapter dữ liệu sẽ được nối sau khi schema live được xác minh qua Supabase MCP.</p></div>
      </section>
    </div>
  );
}
