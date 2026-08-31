import { useState, useMemo } from "react";
import { ChevronDown, TriangleAlert } from "lucide-react";
import { Field, PageHeader, ExpiryPill, inputCls, selectStyle } from "./UI";
import { WAREHOUSE_ZONE_CODES, PROJECT_SITES, TYPE_META, zoneName } from "../lib/helpers";

function uid() { return Math.random().toString(36).slice(2, 10); }

function GridItemPicker({ items, value, onChange }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = items.find((i) => i.CODE === value);
  const results = useMemo(() => {
    if (!query) return items.slice(0, 30);
    const q = query.toLowerCase();
    return items.filter((i) => i.CODE.toLowerCase().includes(q) || i.DESCRIPTION.toLowerCase().includes(q)).slice(0, 30);
  }, [query, items]);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full text-left rounded border px-2 py-1.5 text-[13px] flex items-center justify-between gap-1" style={selectStyle}>
        <span className="truncate">{selected ? selected.DESCRIPTION : <span style={{ color: "#8A8A7E" }}>Select item…</span>}</span>
        <ChevronDown size={13} style={{ color: "#8A8A7E", flexShrink: 0 }} />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 rounded-md shadow-lg overflow-hidden" style={{ backgroundColor: "#FFFFFF", border: "1px solid #D8D5C9", width: 320 }}>
          <div className="p-1.5" style={{ borderBottom: "1px solid #E4E1D6" }}>
            <input autoFocus className="w-full rounded border px-2 py-1 text-[13px] outline-none" style={{ borderColor: "#D8D5C9" }} placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="max-h-56 overflow-auto">
            {results.map((it) => (
              <button type="button" key={it.CODE} onClick={() => { onChange(it.CODE); setOpen(false); setQuery(""); }} className="w-full text-left px-2.5 py-1.5 text-[13px] hover:bg-[#F6F4EF] flex items-center justify-between gap-2">
                <span className="truncate">{it.DESCRIPTION}</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#8A8A7E" }}>{it.CODE}</span>
              </button>
            ))}
            {results.length === 0 && <div className="px-3 py-3 text-[13px] text-center" style={{ color: "#8A8A7E" }}>No matches.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function LineItemGrid({ type, items, rows, onPost, showToastErr }) {
  const meta = TYPE_META[type];
  const blankLine = () => ({ __lid: uid(), code: "", rowId: "", batchNo: "", qty: "", zone: WAREHOUSE_ZONE_CODES[0], expiry: "", price: "", note: "" });
  const [lines, setLines] = useState([blankLine(), blankLine(), blankLine()]);
  const [toProject, setToProject] = useState(PROJECT_SITES[0]?.id || "");
  const [docNote, setDocNote] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [vendor, setVendor] = useState("");
  const [postingDate, setPostingDate] = useState(() => new Date().toISOString().slice(0, 10));

  const updateLine = (lid, patch) => setLines((prev) => prev.map((l) => (l.__lid === lid ? { ...l, ...patch } : l)));
  const addLine = () => setLines((prev) => [...prev, blankLine()]);
  const removeLine = (lid) => setLines((prev) => prev.filter((l) => l.__lid !== lid));

  const availableRowsFor = (code) => rows.filter((r) => r.code === code && r.quantity > 0).sort((a, b) => {
    if (!a.expiry_date) return 1;
    if (!b.expiry_date) return -1;
    return new Date(a.expiry_date) - new Date(b.expiry_date);
  });

  const handleItemChange = (lid, code) => {
    if (type === "receipt") {
      const proto = items.find((i) => i.CODE === code);
      updateLine(lid, { code, zone: proto ? proto["Storage Location"] : WAREHOUSE_ZONE_CODES[0] });
    } else {
      const avail = availableRowsFor(code);
      updateLine(lid, { code, rowId: avail[0]?.id || "" });
    }
  };

  const validLines = () => {
    const errs = [];
    const posted = [];
    lines.forEach((l, idx) => {
      if (!l.code && !l.qty) return;
      if (!l.code) { errs.push(`Line ${idx + 1}: select an item.`); return; }
      const q = Number(l.qty);
      if (!q || q <= 0) { errs.push(`Line ${idx + 1}: enter a quantity.`); return; }
      if (type === "receipt") {
        posted.push({ code: l.code, zone: l.zone, batchNo: l.batchNo, qty: q, expiry: l.expiry, price: l.price ? Number(l.price) : null, note: l.note || docNote, poNumber, vendor, postingDate });
      } else {
        const row = rows.find((r) => r.id === l.rowId);
        if (!row) { errs.push(`Line ${idx + 1}: no batch selected.`); return; }
        if (q > row.quantity) { errs.push(`Line ${idx + 1}: only ${row.quantity} available in batch ${row.batch}.`); return; }
        posted.push({ rowId: l.rowId, code: l.code, toProject: type === "transfer" ? toProject : null, qty: q, note: l.note || docNote });
      }
    });
    return { errs, posted };
  };

  const handlePost = () => {
    const { errs, posted } = validLines();
    if (posted.length === 0) { showToastErr("Add at least one valid line."); return; }
    if (errs.length > 0) { showToastErr(errs[0]); return; }
    onPost(posted);
    setLines([blankLine(), blankLine(), blankLine()]);
    setDocNote("");
  };

  const handleCancel = () => {
    setLines([blankLine(), blankLine(), blankLine()]);
    setDocNote("");
    if (type === "receipt") { setPoNumber(""); setVendor(""); }
  };

  const colHeaders = type === "receipt"
    ? ["Line", "Item", "Batch", "Storage Location", "Qty", "Unit", "Expiry Date", "Unit Price", ""]
    : ["Line", "Item", "Batch (FEFO)", "Available", "Qty", "Unit", "Expiry Date", ""];

  return (
    <div>
      <PageHeader
        title={meta.label}
        subtitle={type === "receipt" ? "Post multiple lines in one goods receipt document" : type === "transfer" ? "Post multiple lines in one transfer to a project site" : "Post multiple lines in one goods issue"}
        accent={meta.color}
      />

      {type === "transfer" && (
        <div className="mb-4 max-w-xs">
          <Field label="To project site">
            <select className={inputCls} style={selectStyle} value={toProject} onChange={(e) => setToProject(e.target.value)}>
              {PROJECT_SITES.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}
            </select>
          </Field>
        </div>
      )}

      {type === "receipt" && (
        <div className="mb-4 rounded-lg p-4 grid grid-cols-3 gap-4" style={{ backgroundColor: "#FFFFFF", border: "1px solid #E4E1D6" }}>
          <Field label="PO / Inbound Delivery No."><input className={inputCls} style={selectStyle} value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="e.g. 180100890" /></Field>
          <Field label="Vendor"><input className={inputCls} style={selectStyle} value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="e.g. Al-Taid For General Contracting" /></Field>
          <Field label="Posting Date"><input type="date" className={inputCls} style={selectStyle} value={postingDate} onChange={(e) => setPostingDate(e.target.value)} /></Field>
        </div>
      )}

      <div className="rounded-lg overflow-visible" style={{ backgroundColor: "#FFFFFF", border: "1px solid #E4E1D6" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]" style={{ minWidth: type === "receipt" ? 1180 : 1080 }}>
            <thead>
              <tr style={{ backgroundColor: "#EFECE2" }}>
                {colHeaders.map((h) => <th key={h} className="text-left px-3 py-2 text-[11px] uppercase tracking-wider font-semibold whitespace-nowrap" style={{ color: "#6B6A62" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => {
                const item = items.find((i) => i.CODE === l.code);
                const avail = type !== "receipt" ? availableRowsFor(l.code) : [];
                const selectedRow = type !== "receipt" ? rows.find((r) => r.id === l.rowId) : null;
                return (
                  <tr key={l.__lid} style={{ borderTop: "1px solid #E4E1D6", backgroundColor: idx % 2 ? "#FBFAF7" : "#FFFFFF" }}>
                    <td className="px-3 py-1.5 text-center" style={{ color: "#8A8A7E", fontFamily: "'IBM Plex Mono', monospace" }}>{(idx + 1) * 10}</td>
                    <td className="px-3 py-1.5" style={{ minWidth: 260 }}><GridItemPicker items={items} value={l.code} onChange={(code) => handleItemChange(l.__lid, code)} /></td>
                    {type === "receipt" ? (
                      <>
                        <td className="px-3 py-1.5"><input className="w-24 rounded border px-2 py-1.5 text-[13px]" style={selectStyle} value={l.batchNo} onChange={(e) => updateLine(l.__lid, { batchNo: e.target.value })} placeholder="auto" /></td>
                        <td className="px-3 py-1.5">
                          <select className="rounded border px-2 py-1.5 text-[13px]" style={selectStyle} value={l.zone} onChange={(e) => updateLine(l.__lid, { zone: Number(e.target.value) })}>
                            {WAREHOUSE_ZONE_CODES.map((z) => <option key={z} value={z}>{zoneName(z)}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-1.5"><input type="number" min="0" step="any" className="w-20 rounded border px-2 py-1.5 text-[13px]" style={{ ...selectStyle, fontFamily: "'IBM Plex Mono', monospace" }} value={l.qty} onChange={(e) => updateLine(l.__lid, { qty: e.target.value })} placeholder="0" /></td>
                        <td className="px-3 py-1.5" style={{ color: "#8A8A7E" }}>{item?.Unit || "—"}</td>
                        <td className="px-3 py-1.5"><input type="date" className="rounded border px-2 py-1.5 text-[13px]" style={selectStyle} value={l.expiry} onChange={(e) => updateLine(l.__lid, { expiry: e.target.value })} /></td>
                        <td className="px-3 py-1.5"><input type="number" min="0" step="any" className="w-20 rounded border px-2 py-1.5 text-[13px]" style={{ ...selectStyle, fontFamily: "'IBM Plex Mono', monospace" }} value={l.price} onChange={(e) => updateLine(l.__lid, { price: e.target.value })} placeholder="USD" /></td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-1.5">
                          <select className="rounded border px-2 py-1.5 text-[13px]" style={{ ...selectStyle, minWidth: 150 }} value={l.rowId} onChange={(e) => updateLine(l.__lid, { rowId: e.target.value })} disabled={!l.code}>
                            {avail.length === 0 && <option value="">No stock</option>}
                            {avail.map((r) => <option key={r.id} value={r.id}>{r.batch} · {zoneName(r.storage_location)} · {r.quantity} {r.unit}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-1.5" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{selectedRow ? `${selectedRow.quantity} ${selectedRow.unit}` : "—"}</td>
                        <td className="px-3 py-1.5"><input type="number" min="0" step="any" className="w-20 rounded border px-2 py-1.5 text-[13px]" style={{ ...selectStyle, fontFamily: "'IBM Plex Mono', monospace" }} value={l.qty} onChange={(e) => updateLine(l.__lid, { qty: e.target.value })} placeholder="0" /></td>
                        <td className="px-3 py-1.5" style={{ color: "#8A8A7E" }}>{item?.Unit || "—"}</td>
                        <td className="px-3 py-1.5"><ExpiryPill expiry={selectedRow?.expiry_date} /></td>
                      </>
                    )}
                    <td className="px-3 py-1.5 text-right"><button type="button" onClick={() => removeLine(l.__lid)} className="text-[12px] font-semibold px-2 py-1 rounded" style={{ color: "#B0563A" }}>✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2" style={{ borderTop: "1px solid #E4E1D6" }}>
          <button type="button" onClick={addLine} className="text-[13px] font-semibold px-3 py-1.5 rounded-md" style={{ color: "#3A5A6D", backgroundColor: "#E9EEF1" }}>+ Add Line</button>
        </div>
      </div>

      <div className="mt-4 max-w-md">
        <Field label="Document note (optional)">
          <input className={inputCls} style={selectStyle} value={docNote} onChange={(e) => setDocNote(e.target.value)} placeholder={type === "receipt" ? "e.g. Supplier delivery, PO number" : type === "transfer" ? "e.g. Project reference / request no." : "e.g. What it was issued for"} />
        </Field>
      </div>

      <div className="flex items-center gap-3 mt-5">
        <button type="button" onClick={handlePost} className="rounded-md px-6 py-3 font-semibold text-sm hover:opacity-90" style={{ backgroundColor: meta.color, color: "#FFFFFF" }}>Post {meta.label}</button>
        <button type="button" onClick={handleCancel} className="rounded-md px-5 py-3 font-semibold text-sm" style={{ backgroundColor: "#EFECE2", color: "#23241F" }}>Cancel</button>
      </div>
    </div>
  );
}
