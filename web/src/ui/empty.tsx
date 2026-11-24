// Nothing here yet, in one voice everywhere: a plain sentence of what is missing, a line on what to do about it, the
// one next step as a button or a link, and the setting it needs (small, in mono) only when a setting is the fix.
import type { ReactNode } from "react";

export function EmptyState({
  title,
  line,
  action,
  detail,
}: {
  title: string;
  line?: ReactNode;
  action?: ReactNode;
  detail?: string;
}) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {line && <p className="empty-line">{line}</p>}
      {action && <div className="empty-action">{action}</div>}
      {detail && <code className="empty-detail">{detail}</code>}
    </div>
  );
}
