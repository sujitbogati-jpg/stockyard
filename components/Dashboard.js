import { PageHeader } from "./UI";
import { WAREHOUSE_ZONE_CODES, PROJECT_SITES, TYPE_META, zoneName, fmtDate, daysUntil } from "../lib/helpers";
import { CalendarClock, TriangleAlert } from "lucide-react";

function LocCard({ label, sub, qty, unitLabel }) {
  return (
    <div className="rounded-lg p-3" style={{ backgroundColor: "#FFFFFF", border: "1px solid #E4E1D6" }}>
      <div className="text-[13px] font-semibold truncate">{label}</div>
      {sub && <div className="text-[11px]" style={{ color: "#8A8A7E", fontFamily: "'IBM Plex Mono', monospace" }}>{sub}</div>}
      <div className="text-xl font-bold mt-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#3A5A6D" }}>
        {qty.toLocaleString(undefined, { maximumFractionDigits: 1 })}
      </div>
      {unitLabel && <div className="text-[11px]" style={{ color: "#8A8A7E" }}>{unitLabel}</div>}
    </div>
  );
}

export default function Dashboard({ rows, movements, itemSettings = [] }) {
  const stockByZone = {};
  for (const r of rows) stockByZone[r.storage_location] = (stockByZone[r.storage_location] || 0) + Number(r.quantity || 0);

  const nearExpiry = rows
    .filter((r) => r.quantity > 0 && r.expiry_date && daysUntil(r.expiry_date) <= 14)
    .sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date));

  const thresholdBySku = new Map(itemSettings.filter((s) => s.reorder_threshold != null).map((s) => [s.sku, Number(s.reorder_threshold)]));
  const totalBySku = new Map();
  for (const r of rows) {
    const key = r.sku || r.code;
    totalBySku.set(key, (totalBySku.get(key) || 0) + Number(r.quantity || 0));
  }
  const lowStock = [];
  for (const [sku, threshold] of thresholdBySku) {
    const total = totalBySku.get(sku) || 0;
    if (total < threshold) {
      const sample = rows.find((r) => (r.sku || r.code) === sku);
      lowStock.push({ sku, desc: sample?.description || sku, unit: sample?.unit || "", total, threshold });
    }
  }
  lowStock.sort((a, b) => (a.total / a.threshold) - (b.total / b.threshold));

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Central Warehouse zones — the only stock this app tracks" />

      {lowStock.length > 0 && (
        <div className="rounded-lg p-4 mb-6" style={{ backgroundColor: "#F5EAE5", border: "1px solid #E3B7A6" }}>
          <div className="flex items-center gap-2 font-semibold text-sm mb-2" style={{ color: "#8A3E24" }}><TriangleAlert size={16} /> Below reorder threshold</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            {lowStock.slice(0, 10).map((it) => (
              <div key={it.sku} className="text-sm flex justify-between" style={{ color: "#8A3E24" }}>
                <span className="truncate">{it.desc}</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{it.total} / {it.threshold} {it.unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-5 gap-3 mb-6">
        {WAREHOUSE_ZONE_CODES.map((z) => (
          <LocCard key={z} label={zoneName(z)} sub={`Storage Location ${z}`} qty={stockByZone[z] || 0} />
        ))}
      </div>

      <div className="mb-2 text-[11px] uppercase tracking-wider font-semibold" style={{ color: "#8A8A7E" }}>
        Sent to Project Sites (record only — projects manage their own stock)
      </div>
      <div className="grid grid-cols-6 gap-3 mb-6">
        {PROJECT_SITES.map((p) => {
          const count = movements.filter((m) => m.type === "transfer" && m.to_location === p.id).length;
          return <LocCard key={p.id} label={p.name} sub={p.code} qty={count} unitLabel={count === 1 ? "transfer" : "transfers"} />;
        })}
      </div>

      {nearExpiry.length > 0 && (
        <div className="rounded-lg p-4 mb-6" style={{ backgroundColor: "#FBF1DF", border: "1px solid #EFD7A0" }}>
          <div className="flex items-center gap-2 font-semibold text-sm mb-2" style={{ color: "#7A5417" }}><CalendarClock size={16} /> Expiring within 14 days</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            {nearExpiry.slice(0, 10).map((r) => (
              <div key={r.id} className="text-sm flex justify-between" style={{ color: "#7A5417" }}>
                <span className="truncate">{r.description} <span style={{ opacity: 0.7 }}>({r.batch})</span></span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{fmtDate(r.expiry_date)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #E4E1D6" }}>
        <div className="px-4 py-3 font-semibold text-sm" style={{ backgroundColor: "#EFECE2" }}>Recent Activity</div>
        <div className="divide-y" style={{ borderColor: "#E4E1D6" }}>
          {movements.slice(0, 8).map((m) => {
            const meta = TYPE_META[m.type];
            const it = rows.find((r) => r.code === m.code);
            return (
              <div key={m.id} className="px-4 py-2.5 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{meta.label} — {it?.description}</div>
                  <div className="text-[12px]" style={{ color: "#8A8A7E" }}>
                    {m.qty} {it?.unit} · {m.to_location ? `to ${m.to_location}` : m.from_zone ? `from ${zoneName(m.from_zone)}` : ""} · {fmtDate(m.created_at)}
                  </div>
                </div>
              </div>
            );
          })}
          {movements.length === 0 && <div className="px-4 py-6 text-sm text-center" style={{ color: "#8A8A7E" }}>No movements logged yet.</div>}
        </div>
      </div>
    </div>
  );
}
