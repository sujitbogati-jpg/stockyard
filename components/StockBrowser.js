import { useState, useMemo } from "react";
import { Search, ChevronDown, ChevronRight, Download } from "lucide-react";
import { PageHeader, Pill, ExpiryPill } from "./UI";
import { CATEGORY_META, zoneName, fmtDate, exportToExcel } from "../lib/helpers";

export default function StockBrowser({ items, rows, itemSettings = [], onSetThreshold }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(null);
  const batchCols = ["Code", "Batch", "Storage Location", "Primary Packing", "Packing Size", "Quantity", "Unit Price in USD", "Total Stock Value in USD", "Expiry Date", "Brand", "Origin", "Bin Location"];
  const thresholdBySku = new Map(itemSettings.map((s) => [s.sku, s.reorder_threshold]));

  // Consolidate every code (pack-size variant) that shares a SKU into one
  // group — SKU is the real stock key, CODE is just how the company splits
  // it by packing size.
  const grouped = useMemo(() => {
    const bySku = new Map();
    for (const r of rows) {
      if (r.quantity <= 0) continue;
      const key = r.sku || r.code;
      if (!bySku.has(key)) bySku.set(key, { sku: key, codes: new Set(), category: r.material_category, unit: r.unit, rows: [] });
      const entry = bySku.get(key);
      entry.codes.add(r.code);
      entry.rows.push(r);
    }
    for (const entry of bySku.values()) {
      entry.rows.sort((a, b) => (a.expiry_date && b.expiry_date) ? new Date(a.expiry_date) - new Date(b.expiry_date) : 0);
    }
    let entries = [...bySku.values()];
    if (query) {
      const q = query.toLowerCase();
      entries = entries.filter((e) => e.sku.toLowerCase().includes(q) || [...e.codes].some((c) => c.toLowerCase().includes(q)) || e.rows.some((r) => (r.description || "").toLowerCase().includes(q)));
    }
    return entries.sort((a, b) => a.sku.localeCompare(b.sku));
  }, [rows, query]);

  const handleExport = () => {
    const data = rows.map((r) => ({
      "SKU's": r.sku, CODE: r.code, DESCRIPTION: r.description, Batch: r.batch,
      "Primary Packing": r.primary_packing, "Packing Size": r.packing_size,
      "Expiry Date": r.expiry_date, "Storage Location": r.storage_location,
      "Material Category": r.material_category, Unit: r.unit, Quantity: r.quantity,
      "Unit Price in USD": r.unit_price, "Total Stock Value in USD": r.total_stock_value,
      Brand: r.brand, Origin: r.origin, "Bin Location": r.bin_location,
    }));
    exportToExcel(data, `stock-report-${new Date().toISOString().slice(0, 10)}.xlsx`, "Stock");
  };

  return (
    <div>
      <PageHeader title="Stock & Batches" subtitle="Consolidated by SKU — every packing-size code under one item, pooled" />
      <div className="flex items-center gap-3 mb-4">
        <div className="relative max-w-xs flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#8A8A7E" }} />
          <input className="w-full rounded-md border pl-9 pr-3 py-2 text-sm outline-none" style={{ borderColor: "#D8D5C9", backgroundColor: "#FFFFFF" }} placeholder="Search SKU, code, or description…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <button onClick={handleExport} className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-2 rounded-md" style={{ color: "#3A5A6D", backgroundColor: "#E9EEF1" }}>
          <Download size={14} /> Export to Excel
        </button>
      </div>
      <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #E4E1D6" }}>
        {grouped.map((g, idx) => {
          const isOpen = expanded === g.sku;
          const total = g.rows.reduce((s, r) => s + Number(r.quantity), 0);
          const threshold = thresholdBySku.get(g.sku);
          const isLow = threshold != null && total < threshold;
          const codeCount = g.codes.size;
          return (
            <div key={g.sku} style={{ borderTop: idx ? "1px solid #E4E1D6" : "none" }}>
              <button onClick={() => setExpanded(isOpen ? null : g.sku)} className="w-full flex items-center gap-3 px-4 py-3 text-left" style={{ backgroundColor: idx % 2 ? "#FBFAF7" : "#FFFFFF" }}>
                {isOpen ? <ChevronDown size={15} style={{ color: "#8A8A7E" }} /> : <ChevronRight size={15} style={{ color: "#8A8A7E" }} />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{g.sku}</div>
                  <div className="text-[12px]" style={{ color: "#8A8A7E" }}>{codeCount} code{codeCount > 1 ? "s" : ""} pooled · {g.rows.length} batch{g.rows.length > 1 ? "es" : ""}</div>
                </div>
                <Pill color={CATEGORY_META[g.category]?.color} bg={CATEGORY_META[g.category]?.bg}>{CATEGORY_META[g.category]?.label}</Pill>
                {isLow && <Pill color="#B0563A" bg="#F5EAE5">Low stock</Pill>}
                <div className="w-32 text-right font-semibold text-sm" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{total.toLocaleString(undefined, { maximumFractionDigits: 2 })} {g.unit}</div>
              </button>
              {isOpen && (
                <div className="px-4 pb-3 overflow-auto">
                  <div className="flex items-center gap-2 py-2 text-[13px]">
                    <span style={{ color: "#6B6A62" }}>Reorder threshold:</span>
                    <input
                      type="number" min="0" step="any"
                      className="w-28 rounded border px-2 py-1 text-[13px]"
                      style={{ borderColor: "#D8D5C9", fontFamily: "'IBM Plex Mono', monospace" }}
                      defaultValue={threshold ?? ""}
                      placeholder="none set"
                      onBlur={(e) => onSetThreshold(g.sku, e.target.value)}
                    />
                    <span style={{ color: "#8A8A7E" }}>{g.unit} — checked against the total pooled across all codes, alerts on the Dashboard</span>
                  </div>
                  <table className="text-[12.5px] w-full" style={{ minWidth: 900 }}>
                    <thead>
                      <tr style={{ color: "#8A8A7E" }}>{batchCols.map((c) => <th key={c} className="text-left font-medium py-1 pr-4 whitespace-nowrap">{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {g.rows.map((r) => (
                        <tr key={r.id}>
                          <td className="py-1 pr-4" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{r.code}</td>
                          <td className="py-1 pr-4" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{r.batch}</td>
                          <td className="py-1 pr-4">{zoneName(r.storage_location)}</td>
                          <td className="py-1 pr-4">{r.primary_packing || "—"}</td>
                          <td className="py-1 pr-4">{r.packing_size || "—"}</td>
                          <td className="py-1 pr-4" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{r.quantity}</td>
                          <td className="py-1 pr-4" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{r.unit_price != null ? Number(r.unit_price).toFixed(2) : "—"}</td>
                          <td className="py-1 pr-4" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{r.total_stock_value != null ? Number(r.total_stock_value).toFixed(2) : "—"}</td>
                          <td className="py-1 pr-4"><ExpiryPill expiry={r.expiry_date} /></td>
                          <td className="py-1 pr-4">{r.brand || "—"}</td>
                          <td className="py-1 pr-4">{r.origin || "—"}</td>
                          <td className="py-1 pr-4">{r.bin_location || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
        {grouped.length === 0 && <div className="px-4 py-8 text-center text-sm" style={{ color: "#8A8A7E" }}>No items match.</div>}
      </div>
    </div>
  );
}
