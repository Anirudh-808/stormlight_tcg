export function PageHeading({ title, description, action }) {
  return <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h1 className="page-title">{title}</h1>{description && <p className="page-subtitle">{description}</p>}</div>{action}</div>;
}
export function StatCard({ label, value, hint }) {
  return <div className="panel"><p className="text-sm font-semibold text-slate-500">{label}</p><p className="stat-value mt-2">{value ?? "—"}</p>{hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}</div>;
}
export function Message({ children, type = "info" }) {
  if (!children) return null;
  const cls = type === "error" ? "notice notice-error" : type === "warning" ? "notice notice-warn" : "notice";
  return <div className={cls} role={type === "error" ? "alert" : "status"}>{children}</div>;
}
export function LoadingPanel({ text = "Loading…" }) { return <div className="panel py-10 text-center text-slate-500">{text}</div>; }
