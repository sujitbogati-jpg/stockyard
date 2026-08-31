import { useState } from "react";
import { Search, Download } from "lucide-react";
import { PageHeader, Pill } from "./UI";
import { TYPE_META, zoneName, fmtDate, exportToExcel } from "../lib/helpers";

export default function MovementLog({ movements, items, onDelete }) {
  const [filterType, setFilterType] = useState("all");
  const [query, setQuery] = useState("");
  const [confirmingId, setConfirmingId] = useState(null);

  const filtered = movements.filter((m) => {
    if (filterType !== "all" && m.type !== filterType) return false;
    if (query) {
      const it = items.find((i) => i.CODE === m.code);
      const hay = `${it?.CODE} ${it?.DESCRIPTION} ${m.note || ""}`.toLowerCase();
      if (!hay.includes(query.toLowerCase())) return false;
    }
    return true;
  });

  const handleExport = () => {
    const data = filtered.map((m) => {
      const it = items.find((i) => i.CODE === m.code);
      return {
        Type: TYPE_META[m.type]?.label || m.type, Code: m.code, Item: it?.DESCRIPTION,
        Batch: m.batch_no, From: m.from_zone ? zoneName(m.from_zone) : "", To: m.to_location || "",
        Qty: m.qty, Unit: it?.Unit, Date: fmtDate(m.created_at), By: m.created_by || "",
        Note: m.note || "", PO: m.po_number || "", Vendor: m.vendor || "",
      };
    });
    exportToExcel(data, `movement-log-${new Date().toISOString().slice(0, 10)}.xlsx`, "Movements");
  };

  return (
    <div>
      <PageHeader title="Movement Log" subtitle="Full history of receipts, transfers and issues — delete an entry to undo a mistaken one" />
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#8A8A7E" }} />
          <input className="w-full rounded-md border pl-9 pr-3 py-2 text-sm outline-none" style={{ borderColor: "#D8D5C9", backgroundColor: "#FFFFFF" }} placeholder="Search item or note…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="flex gap-1.5">
          {["all", "receipt", "transfer", "issue", "adjustment"].map((t) => (
            <button key={t} onClick={() => setFilterType(t)} className="rounded-md px-3 py-2 text-xs font-semibold capitalize" style={{ backgroundColor: filterType === t ? "#23241F" : "#FFFFFF", color: filterType === t ? "#F6F4EF" : "#23241F", border: "1px solid #D8D5C9" }}>{t}</button>
          ))}
        </div>
        <button onClick={handleExport} className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-2 rounded-md" style={{ color: "#3A5A6D", backgroundColor: "#E9EEF1" }}>
          <Download size={14} /> Export to Excel
        </button>
      </div>
      <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #E4E1D6" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: "#EFECE2" }}>
              {["Type", "Item", "Batch", "From", "To", "Qty", "By", "Date", "Note", ""].map((h) => <th key={h} className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wider font-semibold" style={{ color: "#6B6A62" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map((m, idx) => {
              const meta = TYPE_META[m.type];
              const it = items.find((i) => i.CODE === m.code);
              const isConfirming = confirmingId === m.id;
              return (
                <tr key={m.id} style={{ backgroundColor: idx % 2 ? "#FBFAF7" : "#FFFFFF" }}>
                  <td className="px-4 py-2.5"><Pill color={meta.color} bg={meta.bg}>{meta.label}</Pill></td>
                  <td className="px-4 py-2.5"><div className="font-medium">{it?.DESCRIPTION}</div><div className="text-[12px]" style={{ color: "#8A8A7E", fontFamily: "'IBM Plex Mono', monospace" }}>{it?.CODE}</div></td>
                  <td className="px-4 py-2.5 text-[13px]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{m.batch_no || "—"}</td>
                  <td className="px-4 py-2.5 text-[13px]">{m.from_zone ? zoneName(m.from_zone) : "—"}</td>
                  <td className="px-4 py-2.5 text-[13px]">{m.to_location || "—"}</td>
                  <td className="px-4 py-2.5 font-semibold" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{m.qty} {it?.Unit}</td>
                  <td className="px-4 py-2.5 text-[13px]">{m.created_by || "—"}</td>
                  <td className="px-4 py-2.5 text-[13px]" style={{ color: "#8A8A7E" }}>{fmtDate(m.created_at)}</td>
                  <td className="px-4 py-2.5 text-[13px]" style={{ color: "#8A8A7E" }}>{[m.note, m.po_number ? `PO ${m.po_number}` : null, m.vendor || null].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {!isConfirming ? (
                      <button onClick={() => setConfirmingId(m.id)} className="text-[12px] font-semibold px-2 py-1 rounded" style={{ color: "#B0563A" }}>Delete</button>
                    ) : (
                      <span className="flex items-center gap-1.5 justify-end">
                        <button onClick={() => { onDelete(m.id); setConfirmingId(null); }} className="text-[12px] font-semibold px-2 py-1 rounded" style={{ backgroundColor: "#B0563A", color: "#FFFFFF" }}>Confirm</button>
                        <button onClick={() => setConfirmingId(null)} className="text-[12px] font-semibold px-2 py-1 rounded" style={{ backgroundColor: "#EFECE2", color: "#23241F" }}>Cancel</button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-sm" style={{ color: "#8A8A7E" }}>No movements match this filter.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
