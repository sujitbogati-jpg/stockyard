import { useState, useMemo } from "react";
import { ClipboardList, Printer, FileSpreadsheet, TriangleAlert, CircleCheck } from "lucide-react";
import { Field, PageHeader, Pill, ExpiryPill, inputCls, selectStyle } from "./UI";
import { WAREHOUSE_ZONE_CODES, PROJECT_SITES, TYPE_META, CATEGORY_META, zoneName, fmtDate, boxesToPick, round2 } from "../lib/helpers";

function uid() { return Math.random().toString(36).slice(2, 10); }

/* ---------- Paste-to-generate parsing ---------- */
function parsePastedText(text, items) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines
    .filter((raw) => {
      const low = raw.toLowerCase();
      return !(low.startsWith("code") && low.includes("description"));
    })
    .map((raw) => {
      // Tab or a run of 2+ spaces is a real field boundary (how Excel pastes
      // cells). Comma is NOT a delimiter here — it shows up both inside
      // descriptions ("CHICKEN WHOLE, 900GR") and inside large quantities
      // as a thousands separator ("6,500"), so splitting on it corrupts both.
      const parts = raw.split(/\t|\s{2,}/).map((p) => p.trim()).filter(Boolean);
      let codeTxt = parts[0] || "";
      let qtyTxt = parts.length > 1 ? parts[parts.length - 1] : "";
      if (parts.length === 1) {
        const tokens = raw.split(/\s+/);
        if (tokens.length > 1 && /^[\d,]+\.?\d*$/.test(tokens[tokens.length - 1])) {
          qtyTxt = tokens[tokens.length - 1];
          codeTxt = tokens.slice(0, -1).join(" ");
        }
      }
      const qty = Number(String(qtyTxt).replace(/,/g, ""));
      const qtyVal = isNaN(qty) || qty <= 0 ? "" : qty;

      let matchedItem = items.find((i) => i.CODE.toLowerCase() === codeTxt.toLowerCase());
      let matchType = matchedItem ? "code" : null;
      if (!matchedItem) {
        const q = codeTxt.toLowerCase();
        matchedItem = items.find((i) => (i["SKU's"] || "").toLowerCase() === q);
        if (matchedItem) matchType = "sku";
      }
      if (!matchedItem) {
        const q = codeTxt.toLowerCase();
        matchedItem = items.find((i) => (i["SKU's"] || "").toLowerCase().includes(q) || i.DESCRIPTION.toLowerCase().includes(q));
        if (matchedItem) matchType = "fuzzy";
      }
      if (matchedItem) {
        const skuValue = matchedItem["SKU's"];
        const codes = items.filter((i) => i["SKU's"] === skuValue).map((i) => i.CODE);
        return { __pid: uid(), raw, codeTxt, qty: qtyVal, matchType, sku: skuValue, codes, label: `${skuValue} — pooled across ${codes.length} code${codes.length > 1 ? "s" : ""}` };
      }
      return { __pid: uid(), raw, codeTxt, qty: qtyVal, matchType: null, sku: null, codes: [], label: null };
    });
}

function allocateFEFO(rows, codes, qtyNeeded, remainingMap) {
  const pool = rows.filter((r) => codes.includes(r.code) && (remainingMap.get(r.id) ?? r.quantity) > 0).sort((a, b) => {
    if (!a.expiry_date) return 1;
    if (!b.expiry_date) return -1;
    return new Date(a.expiry_date) - new Date(b.expiry_date);
  });
  const draws = [];
  let remaining = qtyNeeded;
  for (const r of pool) {
    if (remaining <= 0) break;
    const available = remainingMap.get(r.id) ?? r.quantity;
    const take = Math.min(available, remaining);
    if (take > 0) {
      draws.push({ rowId: r.id, code: r.code, qty: take });
      remaining -= take;
      remainingMap.set(r.id, round2(available - take));
    }
  }
  return { draws, shortfall: round2(remaining) };
}

function PastePanel({ items, rows, forecasts = [], onCreateDraft, onCreated }) {
  const [type, setType] = useState("transfer");
  const [toProject, setToProject] = useState(PROJECT_SITES[0]?.id || "");
  const [linkedForecastId, setLinkedForecastId] = useState("");
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState([]);
  const [error, setError] = useState("");

  const handleParse = () => {
    if (!text.trim()) { setError("Paste your item list first."); return; }
    setError("");
    setParsed(parsePastedText(text, items));
  };

  const matchedCount = parsed.filter((p) => p.matchType && p.qty).length;
  const unmatchedCount = parsed.length - matchedCount;

  const handleGenerate = async () => {
    const good = parsed.filter((p) => p.matchType && p.qty);
    if (good.length === 0) { setError("No matched lines to generate a picking list from."); return; }
    const shortfalls = [];
    const lines = [];
    const remainingMap = new Map(rows.map((r) => [r.id, r.quantity]));
    for (const p of good) {
      const { draws, shortfall } = allocateFEFO(rows, p.codes, p.qty, remainingMap);
      for (const d of draws) lines.push({ rowId: d.rowId, code: d.code, qty: d.qty, note: "" });
      if (shortfall > 0) shortfalls.push(`${p.sku || p.codeTxt} (short ${shortfall})`);
    }
    if (lines.length === 0) { setError("None of the matched items currently have stock."); return; }
    if (shortfalls.length > 0) setError(`Not enough stock for: ${shortfalls.join(", ")}`);
    const op = await onCreateDraft(type, lines, type === "transfer" ? toProject : null, linkedForecastId || null);
    setText(""); setParsed([]);
    if (op) onCreated(op);
  };

  return (
    <div className="rounded-lg p-5" style={{ backgroundColor: "#FFFFFF", border: "1px solid #E4E1D6" }}>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <Field label="Document type">
          <select className={inputCls} style={selectStyle} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="transfer">Transfer (to project site)</option>
            <option value="issue">Goods Issue</option>
          </select>
        </Field>
        {type === "transfer" && (
          <Field label="To project site">
            <select className={inputCls} style={selectStyle} value={toProject} onChange={(e) => setToProject(e.target.value)}>
              {PROJECT_SITES.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}
            </select>
          </Field>
        )}
        {type === "transfer" && forecasts.length > 0 && (
          <Field label="Link to Forecast Cycle (optional)" hint="Tracks this transfer against that forecast's requested quantities">
            <select className={inputCls} style={selectStyle} value={linkedForecastId} onChange={(e) => setLinkedForecastId(e.target.value)}>
              <option value="">— Not linked —</option>
              {forecasts.map((fc) => <option key={fc.id} value={fc.id}>{fc.fc_number} · {fc.period_label}</option>)}
            </select>
          </Field>
        )}
      </div>

      <Field label="Paste project request" hint="Paste straight from your request sheet — code, description, UOM, condition, qty req, or just code + qty.">
        <textarea className="w-full rounded-md border px-3 py-2.5 text-[14px] outline-none font-mono" style={{ ...selectStyle, minHeight: 140 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={"1004061100-04\tICE CREAM VANILLA POWDER, 2.5KG\tKG\tAMB\t75"} />
      </Field>

      <div className="flex items-center gap-3 mt-3">
        <button type="button" onClick={handleParse} className="rounded-md px-4 py-2 font-semibold text-sm" style={{ backgroundColor: "#E9EEF1", color: "#3A5A6D" }}>Match Items</button>
        {parsed.length > 0 && <span className="text-[12px]" style={{ color: "#8A8A7E" }}>{matchedCount} matched{unmatchedCount > 0 ? `, ${unmatchedCount} not found` : ""}</span>}
      </div>

      {parsed.length > 0 && (
        <div className="mt-4 rounded-md overflow-hidden" style={{ border: "1px solid #E4E1D6" }}>
          <table className="w-full text-[13px]">
            <thead><tr style={{ backgroundColor: "#EFECE2" }}>{["Pasted text", "Matched to", "Qty", ""].map((h) => <th key={h} className="text-left px-3 py-1.5 text-[11px] uppercase tracking-wider font-semibold" style={{ color: "#6B6A62" }}>{h}</th>)}</tr></thead>
            <tbody>
              {parsed.map((p) => (
                <tr key={p.__pid} style={{ borderTop: "1px solid #E4E1D6" }}>
                  <td className="px-3 py-1.5" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#8A8A7E" }}>{p.raw}</td>
                  <td className="px-3 py-1.5">{p.matchType ? <span className="flex items-center gap-1.5">{p.label}<Pill color="#3A5A6D" bg="#E9EEF1">{p.matchType === "code" ? "exact code" : p.matchType === "sku" ? "SKU name" : "fuzzy match"}</Pill></span> : <span style={{ color: "#B0563A" }}>No match</span>}</td>
                  <td className="px-3 py-1.5" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{p.qty || "—"}</td>
                  <td className="px-3 py-1.5">{p.matchType && p.qty ? <CircleCheck size={15} style={{ color: "#4C7A5E" }} /> : <TriangleAlert size={15} style={{ color: "#B0563A" }} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && <div className="text-sm font-medium flex items-center gap-2 mt-3" style={{ color: "#B0563A" }}><TriangleAlert size={15} /> {error}</div>}

      <div className="flex items-center gap-3 mt-4">
        <button type="button" onClick={handleGenerate} disabled={matchedCount === 0} className="rounded-md px-5 py-2.5 font-semibold text-sm" style={{ backgroundColor: matchedCount > 0 ? "#3A5A6D" : "#C9C6BA", color: "#FFFFFF", cursor: matchedCount > 0 ? "pointer" : "not-allowed" }}>Generate Picking List ({matchedCount} line{matchedCount === 1 ? "" : "s"})</button>
        <button type="button" onClick={() => { setText(""); setParsed([]); setError(""); }} className="rounded-md px-5 py-2.5 font-semibold text-sm" style={{ backgroundColor: "#EFECE2", color: "#23241F" }}>Cancel</button>
      </div>
    </div>
  );
}

/* ---------- Printable / downloadable documents ---------- */
function buildPickingListHtml(op) {
  const rowsHtml = op.lines.map((l, idx) => {
    const boxes = boxesToPick(l.qty, l.packingSize, l.unit);
    const calcText = boxes != null ? `${boxes} box${boxes === 1 ? "" : "es"} (${l.packingSize})` : "—";
    return `<tr><td class="c">${idx + 1}</td><td>${l.code}</td><td class="l">${l.desc}</td><td>${l.batch}</td><td>${l.packingSize || "—"}</td><td>${fmtDate(l.expiry)}</td><td>${CATEGORY_META[l.category]?.label || l.category || "—"}</td><td class="c">${l.unit}</td><td class="c" style="font-weight:700;">${l.qty}</td><td class="c">${l.unit}</td><td></td><td class="c" style="font-weight:600;">${calcText}</td></tr>`;
  }).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Picking List — ${op.pl_number}</title><style>
    body { font-family: -apple-system, Arial, sans-serif; padding: 20px; color: #1F1F1F; font-size: 11px; }
    .top { display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #1F3864; padding-bottom:10px; margin-bottom:14px; }
    table.lines { width:100%; border-collapse:collapse; font-size:11.5px; }
    table.lines th, table.lines td { border:1px solid #1F1F1F; padding:5px 7px; text-align:center; white-space:nowrap; }
    table.lines td.l { text-align:left; white-space:normal; font-weight:600; }
    table.lines th { background:#D9EAD3; font-weight:700; }
    .hint { margin-top:16px; font-size:11px; color:#8A8A7E; }
    @media print { .hint { display:none; } body { padding:0.4in; } }
  </style></head><body>
    <div class="top"><div><b>Forecast:</b> &nbsp;</div><div><b>Picking Date#</b> ${fmtDate(op.created_at)} · ${op.pl_number}</div><div><b>SITE :</b> ${op.project || TYPE_META[op.type].label}</div></div>
    <table class="lines"><thead><tr><th>SN</th><th>CODE</th><th>ITEMS NAME</th><th>Lot/Batch No.</th><th>Packing Size</th><th>Expiry Date</th><th>Material Group</th><th>UOM</th><th>QTY/REQ</th><th>UOM</th><th>Picked (BOX/PCS/KG/L)</th><th>Calculation</th></tr></thead><tbody>${rowsHtml}</tbody></table>
    <div class="hint">Open this file in your browser and press Ctrl+P (or Cmd+P) to print.</div>
  </body></html>`;
}

function buildTransferNoteHtml(op) {
  const tn = op.transfer_note;
  const rowsHtml = op.lines.map((l, idx) => `<tr><td class="c">${idx + 1}</td><td>${l.code}</td><td class="l">${l.desc}</td><td>${l.batch}</td><td>${l.packingSize || "—"}</td><td>${fmtDate(l.expiry)}</td><td>${zoneName(l.zone)}</td><td class="c">${l.unit}</td><td class="c" style="font-weight:700;">${l.qty}</td><td></td><td></td></tr>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Goods Transfer Note — ${op.pl_number}</title><style>
    body { font-family: Calibri, Arial, sans-serif; padding:20px; color:#1F1F1F; font-size:11px; }
    .doc-meta { font-size:9px; color:#555; line-height:1.4; margin-bottom:8px; }
    .doc-title { font-size:20px; font-weight:700; text-align:center; background:#E7F0E2; border:1px solid #1F1F1F; padding:8px; margin-bottom:0; }
    table.hdr { width:100%; border-collapse:collapse; }
    table.hdr td { border:1px solid #1F1F1F; padding:4px 8px; vertical-align:top; }
    table.hdr td.label { font-weight:700; background:#F2F2F2; width:14%; }
    table.temp th, table.temp td { border:1px solid #1F1F1F; padding:3px 6px; text-align:center; }
    table.temp th { background:#F2F2F2; }
    table.lines { width:100%; border-collapse:collapse; margin-top:0; }
    table.lines th, table.lines td { border:1px solid #1F1F1F; padding:4px 6px; text-align:left; }
    table.lines td.c { text-align:center; }
    table.lines td.l { font-weight:600; }
    table.lines th { background:#A9C6E8; font-size:10px; }
    .sig-row td { border:1px solid #1F1F1F; padding:18px 8px 6px 8px; font-weight:700; font-size:10px; vertical-align:bottom; }
    .hint { margin-top:16px; font-size:11px; color:#8A8A7E; }
    @media print { .hint { display:none; } body { padding:0.35in; } }
  </style></head><body>
    <div class="doc-meta">EL-FSMS-FWH-F-019<br/>Edition No: 1.1 &nbsp; Edition Date: 01 Jan 19<br/>Approved: QS Manager &nbsp;·&nbsp; Ref: ${op.pl_number}</div>
    <div class="doc-title">Goods Transfer Note</div>
    <table class="hdr">
      <tr><td class="label">Date:</td><td>${fmtDate(op.confirmed_at || op.created_at)}</td>
        <td rowspan="4" style="width:40%;padding:0;">
          <table class="temp" style="width:100%;">
            <tr><th colspan="2">Product Temperature</th><th>Visual Checks</th><th>Comments</th><th>Accepted / Rejected</th></tr>
            <tr><td>Stock</td><td>${tn.tempStockOk}</td><td>Packaging: ${tn.visualPackaging}</td><td rowspan="4">${tn.comments || "—"}</td><td rowspan="4" style="font-weight:700;">${tn.acceptedOrRejected}</td></tr>
            <tr><td>Dry (+20°C)</td><td>${tn.tempDry || "—"}</td><td>Labeling: ${tn.visualLabeling}</td></tr>
            <tr><td>Frozen (-18°C)</td><td>${tn.tempFrozen || "—"}</td><td>Pest Contamination: ${tn.visualPest}</td></tr>
            <tr><td>Chilled (+5°C)</td><td>${tn.tempChilled || "—"}</td><td>Foreign Objects: ${tn.visualForeignObjects}</td></tr>
          </table>
        </td>
      </tr>
      <tr><td class="label">Site Name From:</td><td>Central Warehouse 1117</td></tr>
      <tr><td class="label">Destination:</td><td>${op.project || "—"}</td></tr>
      <tr><td class="label">Number of Pallets:</td><td>${tn.numberOfPallets || "—"}</td></tr>
      <tr><td class="label">Container #/ Transfer #:</td><td colspan="3">${tn.containerRef || op.pl_number}</td></tr>
    </table>
    <table class="lines"><thead><tr><th>S.No</th><th>Item Code</th><th>Description</th><th>Lot/Batch No</th><th>Packing Size</th><th>Expiry Date/BBD</th><th>Location</th><th>UOM</th><th>Transferred Qty.</th><th>Received Qty.</th><th>Remarks</th></tr></thead><tbody>${rowsHtml}</tbody></table>
    <table class="lines" style="margin-top:0;"><tr class="sig-row"><td style="width:33%;">Picked by (Warehouse Supervisor):<br/>Signature: ${tn.pickedBy || ""}</td><td style="width:33%;">Checked By (Warehouse Manager):<br/>Signature: ${tn.checkedBy || ""}</td><td style="width:34%;">Received By (Warehouse Manager):<br/>Signature:</td></tr></table>
    <div class="hint">Open this file in your browser and press Ctrl+P (or Cmd+P) to print.</div>
  </body></html>`;
}

function downloadHtml(html, filename) {
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const downloadPickingList = (op) => downloadHtml(buildPickingListHtml(op), `picking-list-${op.pl_number.replace("/", "-")}.html`);
const downloadTransferNote = (op) => downloadHtml(buildTransferNoteHtml(op), `goods-transfer-note-${op.pl_number.replace("/", "-")}.html`);

/* ---------- Migrate to Goods Transfer — review, edit, confirm ---------- */
function TransferMigrateReview({ op, onUpdateLines, onUpdateTransferNote, onBack, onConfirm }) {
  const tn = op.transfer_note;
  const patch = (p) => onUpdateTransferNote(op.id, p);
  const updateLineQty = (idx, qty) => onUpdateLines(op.id, op.lines.map((l, i) => i === idx ? { ...l, qty: Number(qty) || 0 } : l));
  const removeLine = (idx) => onUpdateLines(op.id, op.lines.filter((_, i) => i !== idx));

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #E4E1D6" }}>
      <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2" style={{ backgroundColor: "#EAF2EC" }}>
        <div className="font-semibold text-sm">Migrate to Goods Transfer — {op.pl_number} → {op.project}</div>
        <div className="text-[12px]" style={{ color: "#4C7A5E" }}>Review and edit before confirming — nothing is posted yet</div>
      </div>
      <div className="p-4 grid grid-cols-2 gap-4" style={{ borderBottom: "1px solid #E4E1D6" }}>
        <Field label="Number of Pallets"><input className={inputCls} style={selectStyle} value={tn.numberOfPallets} onChange={(e) => patch({ numberOfPallets: e.target.value })} placeholder="e.g. 4" /></Field>
        <Field label="Container #/ Transfer #"><input className={inputCls} style={selectStyle} value={tn.containerRef} onChange={(e) => patch({ containerRef: e.target.value })} placeholder="e.g. MI-FC-8805" /></Field>
      </div>
      <div className="p-4 grid grid-cols-4 gap-4" style={{ borderBottom: "1px solid #E4E1D6" }}>
        <Field label="Dry (rec. +20°C)"><input className={inputCls} style={selectStyle} value={tn.tempDry} onChange={(e) => patch({ tempDry: e.target.value })} placeholder="°C" /></Field>
        <Field label="Frozen (rec. -18°C)"><input className={inputCls} style={selectStyle} value={tn.tempFrozen} onChange={(e) => patch({ tempFrozen: e.target.value })} placeholder="°C" /></Field>
        <Field label="Chilled (rec. +5°C)"><input className={inputCls} style={selectStyle} value={tn.tempChilled} onChange={(e) => patch({ tempChilled: e.target.value })} placeholder="°C" /></Field>
        <Field label="Stock OK"><select className={inputCls} style={selectStyle} value={tn.tempStockOk} onChange={(e) => patch({ tempStockOk: e.target.value })}><option>Yes</option><option>No</option></select></Field>
      </div>
      <div className="p-4 grid grid-cols-4 gap-4" style={{ borderBottom: "1px solid #E4E1D6" }}>
        <Field label="Packaging"><select className={inputCls} style={selectStyle} value={tn.visualPackaging} onChange={(e) => patch({ visualPackaging: e.target.value })}><option>Yes</option><option>No</option></select></Field>
        <Field label="Labeling"><select className={inputCls} style={selectStyle} value={tn.visualLabeling} onChange={(e) => patch({ visualLabeling: e.target.value })}><option>Yes</option><option>No</option></select></Field>
        <Field label="Pest Contamination"><select className={inputCls} style={selectStyle} value={tn.visualPest} onChange={(e) => patch({ visualPest: e.target.value })}><option>NO</option><option>YES</option></select></Field>
        <Field label="Foreign Objects"><select className={inputCls} style={selectStyle} value={tn.visualForeignObjects} onChange={(e) => patch({ visualForeignObjects: e.target.value })}><option>NO</option><option>YES</option></select></Field>
      </div>
      <div className="p-4 grid grid-cols-3 gap-4" style={{ borderBottom: "1px solid #E4E1D6" }}>
        <div className="col-span-2"><Field label="Comments"><input className={inputCls} style={selectStyle} value={tn.comments} onChange={(e) => patch({ comments: e.target.value })} placeholder="Optional" /></Field></div>
        <Field label="Accepted or Rejected"><select className={inputCls} style={selectStyle} value={tn.acceptedOrRejected} onChange={(e) => patch({ acceptedOrRejected: e.target.value })}><option>Accepted</option><option>Rejected</option></select></Field>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]" style={{ minWidth: 900 }}>
          <thead><tr style={{ backgroundColor: "#EFECE2" }}>{["S.No", "Item Code", "Description", "Lot/Batch No", "Packing Size", "Expiry Date/BBD", "Location", "UOM", "Transferred Qty.", ""].map((h) => <th key={h} className="text-left px-3 py-2 text-[11px] uppercase tracking-wider font-semibold whitespace-nowrap" style={{ color: "#6B6A62" }}>{h}</th>)}</tr></thead>
          <tbody>
            {op.lines.map((l, idx) => (
              <tr key={idx} style={{ borderTop: "1px solid #E4E1D6" }}>
                <td className="px-3 py-1.5">{idx + 1}</td>
                <td className="px-3 py-1.5" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{l.code}</td>
                <td className="px-3 py-1.5">{l.desc}</td>
                <td className="px-3 py-1.5" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{l.batch}</td>
                <td className="px-3 py-1.5">{l.packingSize || "—"}</td>
                <td className="px-3 py-1.5">{fmtDate(l.expiry)}</td>
                <td className="px-3 py-1.5">{zoneName(l.zone)}</td>
                <td className="px-3 py-1.5">{l.unit}</td>
                <td className="px-3 py-1.5"><input type="number" min="0" step="any" className="w-24 rounded border px-2 py-1 text-[13px]" style={{ ...selectStyle, fontFamily: "'IBM Plex Mono', monospace" }} value={l.qty} onChange={(e) => updateLineQty(idx, e.target.value)} /></td>
                <td className="px-3 py-1.5 text-right"><button type="button" onClick={() => removeLine(idx)} className="text-[12px] font-semibold px-2 py-1 rounded" style={{ color: "#B0563A" }}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="p-4 flex items-center gap-3" style={{ borderTop: "1px solid #E4E1D6", backgroundColor: "#FBFAF7" }}>
        <button type="button" onClick={onConfirm} disabled={op.lines.length === 0} className="rounded-md px-5 py-2.5 font-semibold text-sm" style={{ backgroundColor: op.lines.length > 0 ? "#4C7A5E" : "#C9C6BA", color: "#FFFFFF" }}>Confirm &amp; Post Transfer</button>
        <button type="button" onClick={onBack} className="rounded-md px-4 py-2.5 font-semibold text-sm" style={{ backgroundColor: "#EFECE2", color: "#23241F" }}>Back (keep editing later)</button>
      </div>
    </div>
  );
}

/* ---------- Main Picking Lists view ---------- */
export default function PickingLists({ pendingOps, items, rows, forecasts = [], onToggleLine, onMarkSent, onConfirm, onCreateDraft, onDelete, onUpdateLines, onUpdateTransferNote }) {
  const [openId, setOpenId] = useState(pendingOps[0]?.id || null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(pendingOps.length === 0);
  const current = pendingOps.find((p) => p.id === openId) || pendingOps[0];

  if (pendingOps.length === 0) {
    return (
      <div>
        <PageHeader title="Picking Lists" subtitle="Paste your project's request and generate a picking list instantly" accent="#3A5A6D" />
        <PastePanel items={items} rows={rows} forecasts={forecasts} onCreateDraft={onCreateDraft} onCreated={(op) => setOpenId(op.id)} />
      </div>
    );
  }

  const meta = TYPE_META[current.type];
  const pickedCount = current.lines.filter((l) => l.picked).length;
  const allPicked = pickedCount === current.lines.length;
  const STATUS_META = {
    picking: { label: "Picking", color: "#B07A1F", bg: "#FBF1DF" },
    sent: { label: "Sent — ready to migrate", color: "#3A5A6D", bg: "#E9EEF1" },
    confirmed: { label: "Confirmed & posted", color: "#4C7A5E", bg: "#EAF2EC" },
  };
  const sMeta = STATUS_META[current.status];

  return (
    <div>
      <PageHeader title="Picking Lists" subtitle="Pick first — stock only moves once you confirm" accent="#3A5A6D" />

      <button onClick={() => setPasteOpen((o) => !o)} className="mb-4 flex items-center gap-2 text-[13px] font-semibold px-3 py-2 rounded-md" style={{ backgroundColor: pasteOpen ? "#23241F" : "#E9EEF1", color: pasteOpen ? "#F6F4EF" : "#3A5A6D" }}>
        <ClipboardList size={15} /> {pasteOpen ? "Hide" : "+ New Picking List (paste items)"}
      </button>
      {pasteOpen && <div className="mb-6"><PastePanel items={items} rows={rows} forecasts={forecasts} onCreateDraft={onCreateDraft} onCreated={(op) => { setOpenId(op.id); setPasteOpen(false); }} /></div>}

      <div className="flex gap-2 mb-4 flex-wrap">
        {pendingOps.map((pl) => (
          <button key={pl.id} onClick={() => { setOpenId(pl.id); setDeleteConfirm(false); setMigrating(false); }} className="rounded-md px-3 py-1.5 text-[12px] font-semibold" style={{ backgroundColor: pl.id === current.id ? "#23241F" : "#FFFFFF", color: pl.id === current.id ? "#F6F4EF" : "#23241F", border: "1px solid #D8D5C9" }}>
            {pl.pl_number} · {TYPE_META[pl.type].label}{pl.project ? ` → ${pl.project}` : ""} · {fmtDate(pl.created_at)}
          </button>
        ))}
      </div>

      {migrating && current.status === "sent" && current.type === "transfer" ? (
        <TransferMigrateReview op={current} onUpdateLines={onUpdateLines} onUpdateTransferNote={onUpdateTransferNote} onBack={() => setMigrating(false)} onConfirm={() => { onConfirm(current.id); setMigrating(false); }} />
      ) : (
        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #E4E1D6" }}>
          <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2" style={{ backgroundColor: "#EFECE2" }}>
            <div className="font-semibold text-sm flex items-center gap-2 flex-wrap">
              <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{current.pl_number}</span>
              <Pill color={meta.color} bg={meta.bg}>{meta.label}</Pill>
              <Pill color={sMeta.color} bg={sMeta.bg}>{sMeta.label}</Pill>
              {current.project && <span>to {current.project}</span>}
              <span style={{ color: "#8A8A7E" }}>· {fmtDate(current.created_at)}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[12px]" style={{ color: "#8A8A7E" }}>{pickedCount}/{current.lines.length} picked</span>
              <button onClick={() => downloadPickingList(current)} className="flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded" style={{ color: "#3A5A6D", backgroundColor: "#E9EEF1" }}><Printer size={13} /> Download to Print</button>
              {current.status === "confirmed" && current.type === "transfer" && (
                <button onClick={() => downloadTransferNote(current)} className="flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded" style={{ color: "#4C7A5E", backgroundColor: "#EAF2EC" }}><FileSpreadsheet size={13} /> Download Transfer Note</button>
              )}
              {!deleteConfirm ? (
                <button onClick={() => setDeleteConfirm(true)} className="text-[12px] font-semibold px-2.5 py-1 rounded" style={{ color: "#B0563A", backgroundColor: "#F5EAE5" }}>Delete</button>
              ) : (
                <span className="flex items-center gap-1.5">
                  <span className="text-[12px] font-medium" style={{ color: "#B0563A" }}>{current.status === "confirmed" ? "Reverse stock & delete?" : "Delete?"}</span>
                  <button onClick={() => { onDelete(current.id); setDeleteConfirm(false); setOpenId(null); }} className="text-[12px] font-semibold px-2.5 py-1 rounded" style={{ backgroundColor: "#B0563A", color: "#FFFFFF" }}>Yes, delete</button>
                  <button onClick={() => setDeleteConfirm(false)} className="text-[12px] font-semibold px-2.5 py-1 rounded" style={{ backgroundColor: "#EFECE2", color: "#23241F" }}>Cancel</button>
                </span>
              )}
            </div>
          </div>
          <table className="w-full text-sm">
            <thead><tr style={{ backgroundColor: "#FBFAF7" }}>{["✓", "Zone", "Bin", "Item", "Code", "Batch", "Packing Size", "Expiry", "Qty", "Boxes to Pick"].map((h) => <th key={h} className="text-left px-4 py-2 text-[11px] uppercase tracking-wider font-semibold whitespace-nowrap" style={{ color: "#6B6A62" }}>{h}</th>)}</tr></thead>
            <tbody>
              {current.lines.map((l, idx) => {
                const boxes = boxesToPick(l.qty, l.packingSize, l.unit);
                return (
                  <tr key={idx} style={{ borderTop: "1px solid #E4E1D6", opacity: l.picked ? 0.5 : 1 }}>
                    <td className="px-4 py-2.5"><input type="checkbox" checked={l.picked} disabled={current.status !== "picking"} onChange={() => onToggleLine(current.id, idx)} className="w-4 h-4" /></td>
                    <td className="px-4 py-2.5 text-[13px] font-medium">{zoneName(l.zone)}</td>
                    <td className="px-4 py-2.5 text-[13px]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{l.bin || "—"}</td>
                    <td className="px-4 py-2.5"><div className="font-medium" style={{ textDecoration: l.picked ? "line-through" : "none" }}>{l.desc}</div></td>
                    <td className="px-4 py-2.5 text-[13px]" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#6B6A62" }}>{l.code}</td>
                    <td className="px-4 py-2.5 text-[13px]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{l.batch}</td>
                    <td className="px-4 py-2.5 text-[13px]">{l.packingSize || "—"}</td>
                    <td className="px-4 py-2.5"><ExpiryPill expiry={l.expiry} /></td>
                    <td className="px-4 py-2.5 font-semibold" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{l.qty} {l.unit}</td>
                    <td className="px-4 py-2.5 font-semibold" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#3A5A6D" }}>{boxes != null ? `${boxes} box${boxes === 1 ? "" : "es"}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-4" style={{ borderTop: "1px solid #E4E1D6", backgroundColor: "#FBFAF7" }}>
            {current.status === "picking" && current.type === "transfer" && (
              <button disabled={!allPicked} onClick={() => onMarkSent(current.id)} className="rounded-md px-4 py-2.5 font-semibold text-sm" style={{ backgroundColor: allPicked ? "#3A5A6D" : "#C9C6BA", color: "#FFFFFF", cursor: allPicked ? "pointer" : "not-allowed" }}>
                {allPicked ? "Mark as Picked & Sent to Project" : `Pick all lines first (${pickedCount}/${current.lines.length})`}
              </button>
            )}
            {current.status === "picking" && current.type === "issue" && (
              <button disabled={!allPicked} onClick={() => onConfirm(current.id)} className="rounded-md px-4 py-2.5 font-semibold text-sm" style={{ backgroundColor: allPicked ? "#B0563A" : "#C9C6BA", color: "#FFFFFF", cursor: allPicked ? "pointer" : "not-allowed" }}>
                {allPicked ? "Confirm Picked & Post Issue" : `Pick all lines first (${pickedCount}/${current.lines.length})`}
              </button>
            )}
            {current.status === "sent" && (
              <button onClick={() => setMigrating(true)} className="rounded-md px-4 py-2.5 font-semibold text-sm" style={{ backgroundColor: "#4C7A5E", color: "#FFFFFF" }}>Migrate to Goods Transfer →</button>
            )}
            {current.status === "confirmed" && (
              <div className="text-sm flex items-center gap-2" style={{ color: "#4C7A5E" }}><CircleCheck size={16} /> Posted {fmtDate(current.confirmed_at)}. Stock has been deducted.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
