import { daysUntil, fmtDate } from "../lib/helpers";

export function Pill({ children, color, bg }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap"
      style={{ color, backgroundColor: bg, fontFamily: "'IBM Plex Mono', monospace" }}
    >
      {children}
    </span>
  );
}

export function ExpiryPill({ expiry }) {
  if (!expiry) return <span style={{ color: "#B7B4A6" }}>—</span>;
  const d = daysUntil(expiry);
  let color = "#4C7A5E", bg = "#EAF2EC";
  if (d < 0) { color = "#8A2E2E"; bg = "#F5E1E1"; }
  else if (d <= 7) { color = "#B0563A"; bg = "#F5EAE5"; }
  else if (d <= 30) { color = "#B07A1F"; bg = "#FBF1DF"; }
  return <Pill color={color} bg={bg}>{fmtDate(expiry)} {d < 0 ? "(expired)" : `(${d}d)`}</Pill>;
}

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B6A62" }}>{label}</span>
      {children}
      {hint && <span className="block text-[12px] mt-1" style={{ color: "#8A8A7E" }}>{hint}</span>}
    </label>
  );
}

export const inputCls = "w-full rounded-md border px-3 py-2.5 text-[15px] outline-none transition-colors focus:ring-2";
export const selectStyle = { borderColor: "#D8D5C9", backgroundColor: "#FBFAF7" };

export function PageHeader({ title, subtitle, accent = "#3A5A6D" }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2.5">
        <div className="w-1.5 h-7 rounded-sm" style={{ backgroundColor: accent }} />
        <h1 className="text-[28px] font-bold tracking-tight" style={{ fontFamily: "'Oswald', sans-serif" }}>{title.toUpperCase()}</h1>
      </div>
      <p className="text-sm mt-1 ml-4" style={{ color: "#8A8A7E" }}>{subtitle}</p>
    </div>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div
      className="fixed top-6 right-6 z-50 rounded-lg px-4 py-3 shadow-lg text-sm font-medium"
      style={{ backgroundColor: toast.tone === "ok" ? "#4C7A5E" : "#B0563A", color: "#F6F4EF" }}
    >
      {toast.msg}
    </div>
  );
}
