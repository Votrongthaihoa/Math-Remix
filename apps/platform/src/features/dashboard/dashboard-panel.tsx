import type { ReactNode } from "react";
import { Ellipsis } from "lucide-react";

export function DashboardPanel({
  title,
  action,
  icon,
  children,
  className = "",
}: {
  title: string;
  action?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`aeck-dashboard-panel ${className}`.trim()}>
      <header>
        <h2>{icon}{title}</h2>
        {action ?? <Ellipsis aria-hidden="true" />}
      </header>
      <div className="aeck-panel-body">{children}</div>
    </section>
  );
}
