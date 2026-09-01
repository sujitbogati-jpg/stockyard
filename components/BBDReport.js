import { useState, useMemo } from "react";
import { Download, TriangleAlert } from "lucide-react";
import { PageHeader, Pill, ExpiryPill } from "./UI";
import { zoneName, fmtDate, daysUntil, exportToExcel } from "../lib/helpers";

const BUCKETS = [
  { key: "expired", label: "Already Expired", max: -1, color: "#8A2E2E", bg: "#F5E1E1" },
  { key: "b30", label: "0–30 days", max: 30, color: "#B0563A", bg: "#F5EAE5" },
  { key: "b60", label: "31–60 days", max: 60, color: "#B07A1F", bg: "#FBF1DF" },
  { key: "b90", label: "61–90 days", max: 90, color: "#8A6A3A", bg: "#F3ECDD" },
  { key: "b120", label: "91–120 days", max: 120, color: "#3A5A6D", bg: "#E9EEF1" },
];

function bucketFor(days) {
  if (days < 0) return BUCKETS[0];
  if (days <= 30) return BUCKETS[1];
  if (days <= 60) return BUCKETS[2];
  if (days <= 90) return BUCKETS[3];
  if (days <= 120) return BUCKETS[4];
  return null;
}

export default function BBDReport({ rows }) {
  const [activeBucket, setActiveBucket] = useState("all");

  const atRisk = useMemo(() => {
    return rows
      .filter((r) => r.quantity > 0 && r.expiry_date)
      .map((r) => ({ ...r, daysLeft: daysUntil(r.expiry_date), bucket: bucketFor(daysUntil(r.expiry_date)) }))
      .filter((r) => r.bucket)
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [rows]);

  const counts = useMemo(() => {
    const c = {};
    for (const b of BUCKETS) c[b.key] = { count: 0, value: 0 };
    for (const r of atRisk) {
      c[r.bucket.key].count += 1;
      c[r.bucket.key].value += Number(r.total_stock_value || 0);
    }
    return c;
  }, [atRisk]);

  const filtered = activeBucket === "all" ? atRisk : atRisk.filter((r) => r.bucket.key === activeBucket);

  const handleExport = () => {
    const data = filtered.map((r) => ({
      Code: r.code, 
      Description: r.description, 
      Batch: r.batch, 
      Zone: zoneName(r.storage_location),
      "Bin Location": r.bin_location, 
      // Formats the exported Excel data to 3 decimal places
      Quantity: r.quantity != null ? Number(Number(r.quantity).toFixed(3)) : 0, 
      Unit: r.unit,
      "Unit Price USD": r.unit_price, 
      "Total Value USD": r.total_stock_value,
      "Expiry Date": r.expiry_date, 
      "Days Left": r.daysLeft, 
      Risk: r.bucket.label,
    }));
    exportToExcel(data, `bbd-risk-report-${new Date().toISOString().slice(0, 10)}.xlsx`, "BBD Risk");
  };

  return (
    <div>
      <PageHeader title="BBD Risk Report" subtitle="Stock approaching or past its Best Before Date, bucketed by days remaining" accent="#B0563A" />

      <div className="grid grid-cols-5 gap-3 mb-6">
        {BUCKETS.map((b) => (
          <button
            key={b.key}
            onClick={() => setActiveBucket(activeBucket === b.key ? "all" : b.key)}
            className="rounded-lg p-3 text-left"
            style={{ backgroundColor: activeBucket === b.key ? b.bg : "#FFFFFF", border: `1px solid ${activeBucket === b.key ? b.color : "#E4E1D6"}` }}
          >
            <div className="text-[12px] font-semibold" style={{ color: b.color }}>{b.label}</div>
            <div className="text-xl font-bold mt-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#23241F" }}>{counts[b.key].count}</div>
            <div className="text-[11px]" style={{ color: "#8A8A7E" }}>${counts[b.key].value.toLocaleString(undefined, { maximumFractionDigits: 0 })} at risk</div>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-3">
        {activeBucket !== "all" && (
          <button onClick={() => setActiveBucket("all")} className="text-[12px] font-semibold px-3 py-1.5 rounded-md" style={{ backgroundColor: "#EFECE2", color: "#23241F" }}>Show all buckets</button>
        )}
        <button onClick={handleExport} disabled={filtered.length === 0} className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-2 rounded-md ml-auto" style={{ color: "#B0563A", backgroundColor: "#F5EAE5" }}>
          <Download size={14} /> Export to Excel
        </button>
      </div>

      <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #E4E1D6" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: "#EFECE2" }}>
              {["Item", "Code", "Batch", "Zone", "Bin", "Qty", "Value USD", "Expiry", "Risk"].map((h) => <th key={h} className="text-left px-3 py-2 text-[11px] uppercase tracking-wider font-semibold" style={{ color: "#6B6A62" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid #E4E1D6" }}>
                <td className="px-3 py-2 font-medium">{r.description}</td>
                <td className="px-3 py-2 text-[12px]" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#6B6A62" }}>{r.code}</td>
                <td className="px-3 py-2 text-[13px]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{r.batch}</td>
                <td className="px-3 py-2 text-[13px]">{zoneName(r.storage_location)}</td>
                <td className="px-3 py-2 text-[13px]">{r.bin_location || "—"}</td>
                {/* Fixed column: parses the raw quantity string and displays exactly 3 decimal points */}
                <td className="px-3 py-2 font-semibold" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                  {r.quantity != null ? Number(r.quantity).toFixed(3) : "0.000"} {r.unit}
                </td>
                <td className="px-3 py-2" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{r.total_stock_value != null ? Number(r.total_stock_value).toFixed(2) : "—"}</td>
                <td className="px-3 py-2"><ExpiryPill expiry={r.expiry_date} /></td>
                <td className="px-3 py-2"><Pill color={r.bucket.color} bg={r.bucket.bg}>{r.bucket.label}</Pill></td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm" style={{ color: "#8A8A7E" }}>
                  <TriangleAlert size={16} className="inline mr-1" style={{ color: "#4C7A5E" }} /> Nothing at risk in this range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
