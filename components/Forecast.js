import React, { useState, useMemo } from "react";
import { ClipboardList, TriangleAlert, CircleCheck, Download, Printer, Upload, ChevronDown, ChevronRight, ListChecks, FileUp, Trash2 } from "lucide-react";
import { Field, PageHeader, Pill, inputCls, selectStyle } from "./UI";
import { FORECAST_SITES, fmtDate, round2, exportToExcel } from "../lib/helpers";

function uid() { return Math.random().toString(36).slice(2, 10); }

/* ============ Paste-to-match a site's request — matched to CODE first, SKU/description as fallback ============ */
function parseForecastText(text, items) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines
    .filter((raw) => !(raw.toLowerCase().startsWith("code") && raw.toLowerCase().includes("description")))
    .map((raw) => {
      // Comma is not a delimiter — it's part of descriptions and thousands-
      // formatted quantities ("6,500"). Tab / 2+ spaces are the real boundary.
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

      let matched = items.find((i) => i.CODE.toLowerCase() === codeTxt.toLowerCase());
      if (!matched) {
        const q = codeTxt.toLowerCase();
        matched = items.find((i) => (i["SKU's"] || "").toLowerCase() === q);
      }
      if (!matched) {
        const q = codeTxt.toLowerCase();
        matched = items.find((i) => (i["SKU's"] || "").toLowerCase().includes(q) || i.DESCRIPTION.toLowerCase().includes(q));
      }
      return {
        __pid: uid(), raw, codeTxt, qty: qtyVal,
        code: matched ? matched.CODE : null,
        sku: matched ? matched["SKU's"] : null,
        desc: matched ? matched.DESCRIPTION : null,
        unit: matched ? matched.Unit : null,
      };
    });
}

function SubmissionPaste({ items, onSubmit }) {
  const [siteKey, setSiteKey] = useState(FORECAST_SITES[0].key);
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState([]);
  const [error, setError] = useState("");

  const handleParse = () => {
    if (!text.trim()) { setError("Paste the site's request first."); return; }
    setError("");
    setParsed(parseForecastText(text, items));
  };
  const matchedCount = parsed.filter((p) => p.code && p.qty).length;

  const handleSubmit = () => {
    const good = parsed.filter((p) => p.code && p.qty);
    if (good.length === 0) { setError("No matched lines to submit."); return; }
    const site = FORECAST_SITES.find((s) => s.key === siteKey);
    onSubmit({
      siteKey: site.key,
      siteId: site.siteId,
      lines: good.map((p) => ({ code: p.code, sku: p.sku, desc: p.desc, qty: p.qty, unit: p.unit })),
      submittedAt: new Date().toISOString(),
    });
    setText(""); setParsed([]);
  };

  return (
    <div className="rounded-lg p-5" style={{ backgroundColor: "#FFFFFF", border: "1px solid #E4E1D6" }}>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <Field label="From project site">
          <select className={inputCls} style={selectStyle} value={siteKey} onChange={(e) => setSiteKey(e.target.value)}>
            {FORECAST_SITES.map((s) => <option key={s.key} value={s.key}>{s.key}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Paste the site's monthly request" hint="Code, item name, or description, plus quantity for the month — matched to a specific item code.">
        <textarea className="w-full rounded-md border px-3 py-2.5 text-[14px] outline-none font-mono" style={{ ...selectStyle, minHeight: 120 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={"1003030400-02\t300\nMILK POWDER FULL CREAM, 25KG\t50"} />
      </Field>
      <div className="flex items-center gap-3 mt-3">
        <button type="button" onClick={handleParse} className="rounded-md px-4 py-2 font-semibold text-sm" style={{ backgroundColor: "#E9EEF1", color: "#3A5A6D" }}>Match Items</button>
        {parsed.length > 0 && <span className="text-[12px]" style={{ color: "#8A8A7E" }}>{matchedCount} matched{parsed.length - matchedCount > 0 ? `, ${parsed.length - matchedCount} not found` : ""}</span>}
      </div>
      {parsed.length > 0 && (
        <div className="mt-3 rounded-md overflow-hidden" style={{ border: "1px solid #E4E1D6" }}>
          <table className="w-full text-[13px]">
            <thead><tr style={{ backgroundColor: "#EFECE2" }}>{["Pasted", "Matched Item", "Code", "Qty", ""].map((h) => <th key={h} className="text-left px-3 py-1.5 text-[11px] uppercase tracking-wider font-semibold" style={{ color: "#6B6A62" }}>{h}</th>)}</tr></thead>
            <tbody>
              {parsed.map((p) => (
                <tr key={p.__pid} style={{ borderTop: "1px solid #E4E1D6" }}>
                  <td className="px-3 py-1.5" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#8A8A7E" }}>{p.raw}</td>
                  <td className="px-3 py-1.5">{p.desc || <span style={{ color: "#B0563A" }}>No match</span>}</td>
                  <td className="px-3 py-1.5" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}>{p.code || "—"}</td>
                  <td className="px-3 py-1.5" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{p.qty || "—"}</td>
                  <td className="px-3 py-1.5">{p.code && p.qty ? <CircleCheck size={15} style={{ color: "#4C7A5E" }} /> : <TriangleAlert size={15} style={{ color: "#B0563A" }} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && <div className="text-sm font-medium flex items-center gap-2 mt-3" style={{ color: "#B0563A" }}><TriangleAlert size={15} /> {error}</div>}
      <div className="flex items-center gap-3 mt-4">
        <button type="button" onClick={handleSubmit} disabled={matchedCount === 0} className="rounded-md px-5 py-2.5 font-semibold text-sm" style={{ backgroundColor: matchedCount > 0 ? "#3A5A6D" : "#C9C6BA", color: "#FFFFFF" }}>Add Submission ({matchedCount} line{matchedCount === 1 ? "" : "s"})</button>
        <button type="button" onClick={() => { setText(""); setParsed([]); setError(""); }} className="rounded-md px-5 py-2.5 font-semibold text-sm" style={{ backgroundColor: "#EFECE2", color: "#23241F" }}>Cancel</button>
      </div>
    </div>
  );
}

/* ============ SAP consumption upload — reads the same wide, per-site columns as the template ============ */
function ConsumptionUpload({ itemMaster, onUpload }) {
  const [periodLabel, setPeriodLabel] = useState("");
  const [open, setOpen] = useState(false);

  const handleFile = async (file) => {
    if (!periodLabel.trim()) { alert("Enter a period label first (e.g. 'Jun-Jul 2026')."); return; }
    const XLSX = await import("xlsx");
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array", cellDates: false, bookImages: false, bookFiles: false, bookVBA: false, cellStyles: false, sheets: 0 });
        const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null, raw: true });
        if (json.length === 0) { alert("That file has no rows."); return; }
        const headers = Object.keys(json[0]);
        const codeKey = headers.find((h) => /item.?code/i.test(h)) || headers.find((h) => /^code$/i.test(h));
        const skuKey = headers.find((h) => /^sku$/i.test(h));
        const unitKey = headers.find((h) => /^unit$/i.test(h));
        // Per-site "Monthly Avg..." columns, matched by the same abbreviations
        // your template uses (e.g. "B9" for Block9, "ROO" for BP_ROO).
        const siteCols = FORECAST_SITES.map((s) => ({
          site: s,
          header: headers.find((h) => /avg|consump/i.test(h) && s.match.test(h)),
        })).filter((x) => x.header);
        // Overall figure column, if present and not one of the per-site ones
        const overallKey = headers.find((h) => /1m avg|monthly avg consumption/i.test(h) && !FORECAST_SITES.some((s) => s.match.test(h)));

        if (siteCols.length === 0 && !overallKey) { alert("Couldn't find any 'Monthly Avg...' consumption columns in that file."); return; }

        const skuByCode = new Map(itemMaster.map((m) => [m.code, m.sku]));
        const records = [];
        for (const row of json) {
          const code = codeKey ? row[codeKey] : null;
          const sku = skuKey ? row[skuKey] : (code ? skuByCode.get(code) : null);
          if (!code && !sku) continue;
          const unit = unitKey ? row[unitKey] : null;
          for (const { site, header } of siteCols) {
            const qty = Number(row[header]);
            if (qty > 0) records.push({ code, sku, project: site.siteId, qty, unit, period_label: periodLabel });
          }
          if (overallKey) {
            const qty = Number(row[overallKey]);
            if (qty > 0) records.push({ code, sku, project: null, qty, unit, period_label: periodLabel });
          }
        }
        if (records.length === 0) { alert("Found the columns, but no usable rows with a code and a positive quantity."); return; }
        onUpload(records);
        setPeriodLabel("");
        setOpen(false);
      } catch (err) {
        alert("Couldn't read that file: " + (err && err.message ? err.message : String(err)));
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="mb-6">
      <button onClick={() => setOpen((o) => !o)} className="mb-3 flex items-center gap-2 text-[13px] font-semibold px-3 py-2 rounded-md" style={{ backgroundColor: open ? "#23241F" : "#F3ECDD", color: open ? "#F6F4EF" : "#8A6A3A" }}>
        <Upload size={15} /> {open ? "Hide" : "+ Upload SAP Consumption Data"}
      </button>
      {open && (
        <div className="rounded-lg p-5" style={{ backgroundColor: "#FFFFFF", border: "1px solid #E4E1D6" }}>
          <div className="grid grid-cols-2 gap-4 items-end">
            <Field label="Period label" hint="e.g. 'Jun-Jul 2026' — whatever period this export covers">
              <input className={inputCls} style={selectStyle} value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder="Jun-Jul 2026" />
            </Field>
            <div><input type="file" accept=".xlsx,.xls" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} className="text-sm" /></div>
          </div>
          <div className="text-[12px] mt-2" style={{ color: "#8A8A7E" }}>Reads the same per-site "Monthly Avg..." columns as your forecast template — Item Code, SKU, and one column per site — automatically, no reformatting.</div>
        </div>
      )}
    </div>
  );
}

/* ============ Full Forecast Import — one Excel file, matching your real template exactly,
   populates a new forecast's requests, pending-to-transfer, consumption, and transit at once ============ */
function FullForecastImport({ items, onImportFull }) {
  const [periodLabel, setPeriodLabel] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file) => {
    if (!periodLabel.trim()) { alert("Enter a period label first (e.g. 'October 2026')."); return; }
    setBusy(true);
    const XLSX = await import("xlsx");
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array", cellDates: false, bookImages: false, bookFiles: false, bookVBA: false, cellStyles: false, sheets: 0 });
        const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null, raw: true });
        if (json.length === 0) { alert("That file has no rows."); setBusy(false); return; }
        const headers = Object.keys(json[0]);

        const codeKey = headers.find((h) => /item.?code/i.test(h)) || headers.find((h) => /^code$/i.test(h));
        const skuKey = headers.find((h) => /^sku$/i.test(h));
        if (!codeKey) { alert("Couldn't find an 'Item Code' column in that file."); setBusy(false); return; }

        // Per site: the request column is the one matching the site name
        // that ISN'T also a "pending" or "avg/consump" column.
        const siteCols = FORECAST_SITES.map((s) => {
          const matches = headers.filter((h) => s.match.test(h));
          return {
            site: s,
            requestHeader: matches.find((h) => !/pending/i.test(h) && !/avg|consump/i.test(h)),
            pendingHeader: matches.find((h) => /pending/i.test(h)),
            consumpHeader: matches.find((h) => /avg|consump/i.test(h)),
          };
        });
        const transitIntKey = headers.find((h) => /transit.*int/i.test(h));
        const transitLclKey = headers.find((h) => /transit.*lcl/i.test(h));

        const skuByCode = new Map(items.map((i) => [i.CODE, i["SKU's"]]));
        const bySite = {}; // siteId -> [{code, sku, desc, qty, unit}]
        const pendingRecords = [];
        const consumptionRecords = [];
        const manualFieldsByCode = {};

        for (const row of json) {
          const code = row[codeKey];
          if (!code) continue;
          const sku = skuKey ? row[skuKey] : skuByCode.get(code);

          for (const sc of siteCols) {
            if (sc.requestHeader) {
              const qty = Number(row[sc.requestHeader]);
              if (qty > 0) {
                bySite[sc.site.siteId] = bySite[sc.site.siteId] || [];
                bySite[sc.site.siteId].push({ code, sku, qty });
              }
            }
            if (sc.pendingHeader) {
              const qty = Number(row[sc.pendingHeader]);
              if (qty > 0) pendingRecords.push({ code, site_id: sc.site.siteId, qty, note: `Imported with ${periodLabel} forecast file` });
            }
            if (sc.consumpHeader) {
              const qty = Number(row[sc.consumpHeader]);
              if (qty > 0) consumptionRecords.push({ code, sku, project: sc.site.siteId, qty, period_label: periodLabel });
            }
          }

          const transitInt = transitIntKey ? Number(row[transitIntKey]) : 0;
          const transitLcl = transitLclKey ? Number(row[transitLclKey]) : 0;
          if (transitInt > 0 || transitLcl > 0) {
            manualFieldsByCode[code] = { transitInt: transitInt || "", transitLcl: transitLcl || "" };
          }
        }

        const submissions = Object.entries(bySite).map(([siteId, lines]) => {
          const site = FORECAST_SITES.find((s) => s.siteId === siteId);
          return { siteKey: site.key, siteId, lines, submittedAt: new Date().toISOString() };
        });

        if (submissions.length === 0) {
          alert("Found the file, but no site columns had any requested quantity greater than zero.");
          setBusy(false);
          return;
        }

        await onImportFull({ periodLabel, submissions, pendingRecords, consumptionRecords, manualFieldsByCode });
        setPeriodLabel("");
        setOpen(false);
      } catch (err) {
        alert("Couldn't read that file: " + (err && err.message ? err.message : String(err)));
      } finally {
        setBusy(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="mb-6">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 text-[13px] font-semibold px-3 py-2 rounded-md" style={{ backgroundColor: open ? "#23241F" : "#EAF2EC", color: open ? "#F6F4EF" : "#4C7A5E" }}>
        <FileUp size={15} /> {open ? "Hide" : "+ Import Full Forecast from Excel"}
      </button>
      {open && (
        <div className="mt-3 rounded-lg p-5" style={{ backgroundColor: "#FFFFFF", border: "1px solid #E4E1D6" }}>
          <div className="text-[13px] mb-3" style={{ color: "#6B6A62" }}>
            Reads your filled-in forecast template directly — per-site requested quantities, pending-to-transfer, monthly consumption, and Transit_INT/Transit_LCL all in one go. This creates a brand-new forecast cycle; PR QTY is always recalculated by the app, not read from the file.
          </div>
          <div className="grid grid-cols-2 gap-4 items-end">
            <Field label="Period label"><input className={inputCls} style={selectStyle} value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder="e.g. October 2026" /></Field>
            <div><input type="file" accept=".xlsx,.xls" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} className="text-sm" /></div>
          </div>
          {busy && <div className="text-[12px] mt-2" style={{ color: "#8A8A7E" }}>Importing…</div>}
        </div>
      )}
    </div>
  );
}

/* ============ Legacy/manual pending-to-transfer adjustments — management list ============ */
function PendingAdjustmentsList({ pendingAdjustments, items, onDelete }) {
  const [open, setOpen] = useState(false);
  if (pendingAdjustments.length === 0) return null;
  return (
    <div className="mb-6">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 text-[13px] font-semibold px-3 py-2 rounded-md" style={{ backgroundColor: open ? "#23241F" : "#F3ECDD", color: open ? "#F6F4EF" : "#8A6A3A" }}>
        {open ? "Hide" : `Manual Pending-to-Transfer Adjustments (${pendingAdjustments.length})`}
      </button>
      {open && (
        <div className="mt-3 rounded-lg overflow-hidden" style={{ border: "1px solid #E4E1D6" }}>
          <div className="px-4 py-2 text-[12px]" style={{ color: "#8A8A7E", backgroundColor: "#F3ECDD" }}>
            Delete one once the real transfer actually happens in the app, so it isn't counted twice.
          </div>
          <table className="w-full text-sm">
            <thead><tr style={{ backgroundColor: "#FBFAF7" }}>{["Item", "Code", "Site", "Qty", "Note", "Added", ""].map((h) => <th key={h} className="text-left px-3 py-2 text-[11px] uppercase tracking-wider font-semibold" style={{ color: "#6B6A62" }}>{h}</th>)}</tr></thead>
            <tbody>
              {pendingAdjustments.map((a) => {
                const item = items.find((i) => i.CODE === a.code);
                const site = FORECAST_SITES.find((s) => s.siteId === a.site_id);
                return (
                  <tr key={a.id} style={{ borderTop: "1px solid #E4E1D6" }}>
                    <td className="px-3 py-2">{item?.DESCRIPTION || a.code}</td>
                    <td className="px-3 py-2 text-[12px]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{a.code}</td>
                    <td className="px-3 py-2">{site?.key || a.site_id}</td>
                    <td className="px-3 py-2 font-semibold" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{a.qty}</td>
                    <td className="px-3 py-2 text-[12px]" style={{ color: "#8A8A7E" }}>{a.note || "—"}</td>
                    <td className="px-3 py-2 text-[12px]" style={{ color: "#8A8A7E" }}>{fmtDate(a.created_at)}</td>
                    <td className="px-3 py-2 text-right"><button onClick={() => onDelete(a.id)} className="text-[12px] font-semibold px-2 py-1 rounded" style={{ color: "#B0563A" }}><Trash2 size={13} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============ Pending Transfers Report — every open (not-yet-confirmed) transfer, system-wide ============ */
function buildPendingReportHtml(rows) {
  const rowsHtml = rows.map((r, i) => `<tr><td class="c">${i + 1}</td><td>${r.plNumber}</td><td>${r.desc}</td><td>${r.code}</td><td>${r.site}</td><td class="c">${r.qty}</td><td>${r.status}</td><td>${r.date}</td></tr>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Pending Transfers Report</title><style>
    body { font-family: Arial, sans-serif; padding: 20px; color: #1F1F1F; }
    table { width:100%; border-collapse:collapse; font-size:12px; }
    th, td { border:1px solid #1F1F1F; padding:6px 8px; text-align:left; }
    td.c { text-align:center; }
    th { background:#E9EEF1; }
  </style></head><body>
    <h1 style="font-size:18px;">Pending Transfers Report</h1>
    <table><thead><tr><th>SN</th><th>PL Number</th><th>Item</th><th>Code</th><th>Site</th><th>Qty</th><th>Status</th><th>Date</th></tr></thead><tbody>${rowsHtml}</tbody></table>
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

function PendingTransfersReport({ pendingOps }) {
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => {
    const out = [];
    for (const op of pendingOps) {
      if (op.type !== "transfer" || op.status === "confirmed") continue;
      for (const l of op.lines) {
        out.push({ plNumber: op.pl_number, desc: l.desc, code: l.code, site: op.project, qty: l.qty, status: op.status === "sent" ? "Sent" : "Picking", date: fmtDate(op.created_at) });
      }
    }
    return out;
  }, [pendingOps]);

  return (
    <div className="mb-6">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 text-[13px] font-semibold px-3 py-2 rounded-md" style={{ backgroundColor: open ? "#23241F" : "#E9EEF1", color: open ? "#F6F4EF" : "#3A5A6D" }}>
        <ListChecks size={15} /> {open ? "Hide" : `Pending Transfers Report (${rows.length})`}
      </button>
      {open && (
        <div className="mt-3 rounded-lg overflow-hidden" style={{ border: "1px solid #E4E1D6" }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: "#E9EEF1" }}>
            <div className="text-sm font-semibold">Every open (not-yet-confirmed) transfer, across all picking lists</div>
            <div className="flex items-center gap-2">
              <button onClick={() => exportToExcel(rows, `pending-transfers-${new Date().toISOString().slice(0, 10)}.xlsx`, "Pending")} className="flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded" style={{ color: "#3A5A6D", backgroundColor: "#FFFFFF" }}><Download size={13} /> Export</button>
              <button onClick={() => downloadHtml(buildPendingReportHtml(rows), `pending-transfers-${new Date().toISOString().slice(0, 10)}.html`)} className="flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded" style={{ color: "#3A5A6D", backgroundColor: "#FFFFFF" }}><Printer size={13} /> Print</button>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead><tr style={{ backgroundColor: "#FBFAF7" }}>{["PL Number", "Item", "Code", "Site", "Qty", "Status", "Date"].map((h) => <th key={h} className="text-left px-4 py-2 text-[11px] uppercase tracking-wider font-semibold" style={{ color: "#6B6A62" }}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid #E4E1D6" }}>
                  <td className="px-4 py-2 font-medium" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{r.plNumber}</td>
                  <td className="px-4 py-2">{r.desc}<div className="text-[11px]" style={{ color: "#8A8A7E", fontFamily: "'IBM Plex Mono', monospace" }}>{r.code}</div></td>
                  <td className="px-4 py-2 text-[13px]">—</td>
                  <td className="px-4 py-2 text-[13px]">{r.site}</td>
                  <td className="px-4 py-2 font-semibold" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{r.qty}</td>
                  <td className="px-4 py-2 text-[13px]">{r.status}</td>
                  <td className="px-4 py-2 text-[13px]" style={{ color: "#8A8A7E" }}>{r.date}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: "#8A8A7E" }}>Nothing pending right now — everything's either not yet transferred or already confirmed.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============ Main Forecast component ============ */
export default function Forecast({ forecasts, items, itemMaster, rows, pendingOps, consumptionRecords = [], pendingAdjustments = [], onCreate, onAddSubmission, onComplete, onDelete, onUploadConsumption, onUpdateManualField, onImportFull, onDeletePendingAdjustment }) {
  const [openId, setOpenId] = useState(forecasts[0]?.id || null);
  const [periodLabel, setPeriodLabel] = useState("");
  const [creating, setCreating] = useState(forecasts.length === 0);
  const [addingSubmission, setAddingSubmission] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [expandedCode, setExpandedCode] = useState(null);
  const [fulfillmentOpen, setFulfillmentOpen] = useState(false);
  const current = forecasts.find((f) => f.id === openId) || forecasts[0];

  const handleCreate = async () => {
    if (!periodLabel.trim()) return;
    const fc = await onCreate(periodLabel.trim());
    if (fc) { setOpenId(fc.id); setCreating(false); setPeriodLabel(""); }
  };

  // Live "Pending to Transfer" per code, per site — from every open (not yet
  // confirmed) transfer picking list, system-wide (not scoped to one forecast).
  const pendingByCodeSite = useMemo(() => {
    const map = new Map(); // code -> siteId -> qty
    for (const op of pendingOps) {
      if (op.type !== "transfer" || op.status === "confirmed") continue;
      for (const l of op.lines) {
        if (!map.has(l.code)) map.set(l.code, {});
        map.get(l.code)[op.to_project] = round2((map.get(l.code)[op.to_project] || 0) + l.qty);
      }
    }
    // Legacy/manual pending amounts the app couldn't see itself (e.g. from
    // before it was in use, or imported from an existing forecast file) —
    // added on top of what's tracked live.
    for (const adj of pendingAdjustments) {
      if (!map.has(adj.code)) map.set(adj.code, {});
      map.get(adj.code)[adj.site_id] = round2((map.get(adj.code)[adj.site_id] || 0) + Number(adj.qty));
    }
    return map;
  }, [pendingOps, pendingAdjustments]);

  // Latest consumption per code+site (and per code overall when project is null)
  const consumptionByCodeSite = useMemo(() => {
    const map = new Map(); // `${code}::${siteId||'ALL'}` -> record
    for (const rec of consumptionRecords) {
      const key = `${rec.code}::${rec.project || "ALL"}`;
      const existing = map.get(key);
      if (!existing || new Date(rec.uploaded_at) > new Date(existing.uploaded_at)) map.set(key, rec);
    }
    return map;
  }, [consumptionRecords]);

  const stockByCode = useMemo(() => {
    const map = new Map();
    for (const r of rows) map.set(r.code, round2((map.get(r.code) || 0) + Number(r.quantity || 0)));
    return map;
  }, [rows]);

  const requestByCodeSite = useMemo(() => {
    const map = new Map(); // code -> siteId -> qty
    if (!current) return map;
    for (const sub of current.submissions) {
      for (const line of sub.lines) {
        if (!map.has(line.code)) map.set(line.code, {});
        map.get(line.code)[sub.siteId] = round2((map.get(line.code)[sub.siteId] || 0) + Number(line.qty));
      }
    }
    return map;
  }, [current]);

  // One row per Code Master item, matching the template's per-code design
  const tableRows = useMemo(() => {
    let list = itemMaster.map((m) => {
      const perSite = FORECAST_SITES.map((s) => {
        const request = requestByCodeSite.get(m.code)?.[s.siteId] || 0;
        const pending = pendingByCodeSite.get(m.code)?.[s.siteId] || 0;
        const consumption = consumptionByCodeSite.get(`${m.code}::${s.siteId}`)?.qty ?? null;
        return { site: s, request, pending, consumption };
      });
      const totalRequest = round2(perSite.reduce((s, x) => s + x.request, 0));
      const totalPending = round2(perSite.reduce((s, x) => s + x.pending, 0));
      const soh = stockByCode.get(m.code) || 0;
      const overallConsumption = consumptionByCodeSite.get(`${m.code}::ALL`)?.qty
        ?? (perSite.some((x) => x.consumption != null) ? round2(perSite.reduce((s, x) => s + (x.consumption || 0), 0)) : null);
      const manual = current?.manual_fields?.[m.code] || {};
      const transitInt = Number(manual.transitInt) || 0;
      const transitLcl = Number(manual.transitLcl) || 0;
      const prQty = round2(Math.max(0, totalRequest - (soh - totalPending) - transitInt - transitLcl));
      return { item: m, perSite, totalRequest, totalPending, soh, overallConsumption, manual, prQty };
    });
    if (!showAll) list = list.filter((r) => r.totalRequest > 0 || r.prQty > 0);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((r) => r.item.code.toLowerCase().includes(q) || (r.item.sku || "").toLowerCase().includes(q) || (r.item.description || "").toLowerCase().includes(q));
    }
    return list.sort((a, b) => b.prQty - a.prQty);
  }, [itemMaster, requestByCodeSite, pendingByCodeSite, consumptionByCodeSite, stockByCode, current, showAll, query]);

  // Fulfillment tracking: for every requested site+code in this forecast,
  // how much has actually been transferred (confirmed, linked to this
  // forecast) vs still open (picking/sent, linked) vs not yet started at all.
  const fulfillment = useMemo(() => {
    if (!current) return [];
    const transferredByCodeSite = new Map(); // code -> siteId -> qty
    const pendingLinkedByCodeSite = new Map();
    for (const op of pendingOps) {
      if (op.type !== "transfer" || op.forecast_id !== current.id) continue;
      const target = op.status === "confirmed" ? transferredByCodeSite : pendingLinkedByCodeSite;
      for (const l of op.lines) {
        if (!target.has(l.code)) target.set(l.code, {});
        target.get(l.code)[op.to_project] = round2((target.get(l.code)[op.to_project] || 0) + l.qty);
      }
    }
    const rows = [];
    for (const [code, bySite] of requestByCodeSite) {
      const master = itemMaster.find((m) => m.code === code);
      for (const site of FORECAST_SITES) {
        const requested = bySite[site.siteId] || 0;
        if (requested <= 0) continue;
        const transferred = transferredByCodeSite.get(code)?.[site.siteId] || 0;
        const pendingQty = pendingLinkedByCodeSite.get(code)?.[site.siteId] || 0;
        const notStarted = round2(Math.max(0, requested - transferred - pendingQty));
        const pctComplete = requested > 0 ? round2((transferred / requested) * 100) : 0;
        rows.push({
          code, desc: master?.description || code, unit: master?.unit || "",
          site: site.key, requested, transferred, pending: pendingQty, notStarted, pctComplete,
        });
      }
    }
    return rows.sort((a, b) => a.pctComplete - b.pctComplete);
  }, [current, pendingOps, requestByCodeSite, itemMaster]);

  const handleExportFulfillment = () => {
    const data = fulfillment.map((r) => ({
      Site: r.site, "Item Code": r.code, Description: r.desc, Unit: r.unit,
      Requested: r.requested, Transferred: r.transferred, Pending: r.pending,
      "Not Started": r.notStarted, "% Complete": r.pctComplete,
    }));
    exportToExcel(data, `${current.fc_number.replace("/", "-")}-fulfillment.xlsx`, "Fulfillment");
  };

  const handleExportFull = () => {
    const data = tableRows.map((r, i) => {
      const row = {
        "SN#": i + 1,
        "Sloc Condition": r.item.material_category,
        "SKU": r.item.sku,
        "Item Code": r.item.code,
        "Materials Description": r.item.description,
        "Unit": r.item.unit,
        "Recommend Brand": r.item.brand,
        "Remarks": r.item.remarks,
      };
      for (const ps of r.perSite) {
        row[ps.site.key] = ps.request || "";
        row[`${ps.site.key} Pending to Transfer from CW`] = ps.pending || "";
        row[`Monthly Avg. ${ps.site.key}`] = ps.consumption ?? "";
      }
      row["Total Request"] = r.totalRequest;
      row["Transit_INT"] = r.manual.transitInt || "";
      row["Transit_LCL"] = r.manual.transitLcl || "";
      row["SOH_CW"] = r.soh;
      row["PR QTY"] = r.prQty;
      return row;
    });
    exportToExcel(data, `${current.fc_number.replace("/", "-")}-forecast.xlsx`, "QTY FROM PROJECTS");
  };

  return (
    <div>
      <PageHeader title="Forecast" subtitle="Collect each site's monthly request, consolidate per item, and see what needs purchasing" accent="#3A5A6D" />

      <FullForecastImport items={items} onImportFull={onImportFull} />
      <ConsumptionUpload itemMaster={itemMaster} onUpload={onUploadConsumption} />
      <PendingTransfersReport pendingOps={pendingOps} />
      <PendingAdjustmentsList pendingAdjustments={pendingAdjustments} items={items} onDelete={onDeletePendingAdjustment} />

      <button onClick={() => setCreating((o) => !o)} className="mb-4 flex items-center gap-2 text-[13px] font-semibold px-3 py-2 rounded-md" style={{ backgroundColor: creating ? "#23241F" : "#E9EEF1", color: creating ? "#F6F4EF" : "#3A5A6D" }}>
        <ClipboardList size={15} /> {creating ? "Hide" : "+ New Forecast Cycle"}
      </button>
      {creating && (
        <div className="rounded-lg p-5 mb-6 flex items-end gap-3" style={{ backgroundColor: "#FFFFFF", border: "1px solid #E4E1D6" }}>
          <div className="max-w-xs flex-1">
            <Field label="Period label"><input className={inputCls} style={selectStyle} value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder="e.g. September 2026" /></Field>
          </div>
          <button onClick={handleCreate} className="rounded-md px-5 py-2.5 font-semibold text-sm" style={{ backgroundColor: "#3A5A6D", color: "#FFFFFF" }}>Start Forecast</button>
        </div>
      )}

      {forecasts.length === 0 && !creating && (
        <div className="rounded-lg p-8 text-center text-sm" style={{ backgroundColor: "#FFFFFF", border: "1px solid #E4E1D6", color: "#8A8A7E" }}>
          No forecast cycles yet — start one, then add each site's response as it comes back.
        </div>
      )}

      {current && (
        <>
          <div className="flex gap-2 mb-4 flex-wrap">
            {forecasts.map((fc) => (
              <button key={fc.id} onClick={() => { setOpenId(fc.id); setAddingSubmission(false); setDeleteConfirm(false); }} className="rounded-md px-3 py-1.5 text-[12px] font-semibold" style={{ backgroundColor: fc.id === current.id ? "#23241F" : "#FFFFFF", color: fc.id === current.id ? "#F6F4EF" : "#23241F", border: "1px solid #D8D5C9" }}>
                {fc.fc_number} · {fc.period_label} · {fc.submissions.length} site{fc.submissions.length === 1 ? "" : "s"}
              </button>
            ))}
          </div>

          <div className="rounded-lg overflow-hidden mb-4" style={{ border: "1px solid #E4E1D6" }}>
            <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2" style={{ backgroundColor: "#E9EEF1" }}>
              <div className="font-semibold text-sm flex items-center gap-2 flex-wrap">
                <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{current.fc_number}</span>
                <span>{current.period_label}</span>
                <Pill color={current.status === "completed" ? "#4C7A5E" : "#B07A1F"} bg={current.status === "completed" ? "#EAF2EC" : "#FBF1DF"}>{current.status === "completed" ? "Completed" : "Collecting"}</Pill>
              </div>
              <div className="flex items-center gap-2">
                {current.status === "collecting" && (
                  <button onClick={() => setAddingSubmission((o) => !o)} className="text-[12px] font-semibold px-2.5 py-1 rounded" style={{ backgroundColor: "#FFFFFF", color: "#3A5A6D" }}>{addingSubmission ? "Hide" : "+ Add Site Submission"}</button>
                )}
                {!deleteConfirm ? (
                  <button onClick={() => setDeleteConfirm(true)} className="text-[12px] font-semibold px-2.5 py-1 rounded" style={{ color: "#B0563A", backgroundColor: "#F5EAE5" }}>Delete</button>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <button onClick={() => { onDelete(current.id); setDeleteConfirm(false); setOpenId(null); }} className="text-[12px] font-semibold px-2.5 py-1 rounded" style={{ backgroundColor: "#B0563A", color: "#FFFFFF" }}>Yes, delete</button>
                    <button onClick={() => setDeleteConfirm(false)} className="text-[12px] font-semibold px-2.5 py-1 rounded" style={{ backgroundColor: "#EFECE2", color: "#23241F" }}>Cancel</button>
                  </span>
                )}
              </div>
            </div>
            {current.submissions.length > 0 && (
              <div className="px-4 py-2 text-[12px]" style={{ color: "#6B6A62", borderTop: "1px solid #E4E1D6" }}>
                Submissions: {current.submissions.map((s) => `${s.siteKey} (${s.lines.length} lines)`).join(" · ")}
              </div>
            )}
          </div>

          {addingSubmission && current.status === "collecting" && (
            <div className="mb-6"><SubmissionPaste items={items} onSubmit={(sub) => { onAddSubmission(current.id, sub); setAddingSubmission(false); }} /></div>
          )}

          <button onClick={() => setFulfillmentOpen((o) => !o)} className="mb-4 flex items-center gap-2 text-[13px] font-semibold px-3 py-2 rounded-md" style={{ backgroundColor: fulfillmentOpen ? "#23241F" : "#EAF2EC", color: fulfillmentOpen ? "#F6F4EF" : "#4C7A5E" }}>
            <ListChecks size={15} /> {fulfillmentOpen ? "Hide" : `Fulfillment Tracking (${fulfillment.length} line${fulfillment.length === 1 ? "" : "s"})`}
          </button>
          {fulfillmentOpen && (
            <div className="mb-6 rounded-lg overflow-hidden" style={{ border: "1px solid #E4E1D6" }}>
              <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2" style={{ backgroundColor: "#EAF2EC" }}>
                <div className="text-sm font-semibold">What's been transferred against this forecast's requests, and what's still outstanding</div>
                <button onClick={handleExportFulfillment} disabled={fulfillment.length === 0} className="flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded" style={{ color: "#4C7A5E", backgroundColor: "#FFFFFF" }}><Download size={13} /> Export</button>
              </div>
              <div className="px-4 py-2 text-[12px]" style={{ color: "#8A8A7E", borderTop: "1px solid #E4E1D6" }}>
                Only transfers explicitly linked to this forecast when created (via "Link to Forecast Cycle" in Picking Lists) count toward Transferred/Pending here.
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: "#FBFAF7" }}>
                    {["Site", "Item", "Requested", "Transferred", "Pending", "Not Started", "% Complete"].map((h) => <th key={h} className="text-left px-4 py-2 text-[11px] uppercase tracking-wider font-semibold" style={{ color: "#6B6A62" }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {fulfillment.map((r, i) => (
                    <tr key={i} style={{ borderTop: "1px solid #E4E1D6" }}>
                      <td className="px-4 py-2 font-medium">{r.site}</td>
                      <td className="px-4 py-2"><div>{r.desc}</div><div className="text-[11px]" style={{ color: "#8A8A7E", fontFamily: "'IBM Plex Mono', monospace" }}>{r.code}</div></td>
                      <td className="px-4 py-2" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{r.requested} {r.unit}</td>
                      <td className="px-4 py-2" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#4C7A5E" }}>{r.transferred} {r.unit}</td>
                      <td className="px-4 py-2" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#B07A1F" }}>{r.pending} {r.unit}</td>
                      <td className="px-4 py-2 font-semibold" style={{ fontFamily: "'IBM Plex Mono', monospace", color: r.notStarted > 0 ? "#B0563A" : "#B7B4A6" }}>{r.notStarted} {r.unit}</td>
                      <td className="px-4 py-2 font-semibold" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{r.pctComplete}%</td>
                    </tr>
                  ))}
                  {fulfillment.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: "#8A8A7E" }}>No requested lines yet — add a site submission above.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <input className="rounded-md border px-3 py-2 text-sm outline-none max-w-xs flex-1" style={{ borderColor: "#D8D5C9", backgroundColor: "#FFFFFF" }} placeholder="Search code, SKU, or description…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <label className="flex items-center gap-1.5 text-[13px]" style={{ color: "#6B6A62" }}>
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show all Code Master items (not just those with activity)
            </label>
            <button onClick={handleExportFull} className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-2 rounded-md ml-auto" style={{ color: "#4C7A5E", backgroundColor: "#EAF2EC" }}><Download size={14} /> Export Full Forecast (matches your template)</button>
          </div>

          <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #E4E1D6" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "#EFECE2" }}>
                  {["", "Item", "SKU / Code", "Total Request", "SOH (CW)", "Total Pending", "PR QTY"].map((h) => <th key={h} className="text-left px-3 py-2 text-[11px] uppercase tracking-wider font-semibold" style={{ color: "#6B6A62" }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r) => {
                  const isOpen = expandedCode === r.item.code;
                  return (
                    <React.Fragment key={r.item.code}>
                      <tr style={{ borderTop: "1px solid #E4E1D6" }}>
                        <td className="px-3 py-2"><button onClick={() => setExpandedCode(isOpen ? null : r.item.code)}>{isOpen ? <ChevronDown size={15} style={{ color: "#8A8A7E" }} /> : <ChevronRight size={15} style={{ color: "#8A8A7E" }} />}</button></td>
                        <td className="px-3 py-2"><div className="font-medium">{r.item.description}</div><div className="text-[11px]" style={{ color: "#8A8A7E" }}>{r.item.remarks}</div></td>
                        <td className="px-3 py-2 text-[12px]" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#6B6A62" }}>{r.item.sku}<br />{r.item.code}</td>
                        <td className="px-3 py-2 font-semibold" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{r.totalRequest} {r.item.unit}</td>
                        <td className="px-3 py-2" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{r.soh} {r.item.unit}</td>
                        <td className="px-3 py-2" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{r.totalPending} {r.item.unit}</td>
                        <td className="px-3 py-2 font-semibold" style={{ fontFamily: "'IBM Plex Mono', monospace", color: r.prQty > 0 ? "#B0563A" : "#4C7A5E" }}>{r.prQty > 0 ? `${r.prQty} ${r.item.unit}` : "Sufficient"}</td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={7} className="px-4 py-4" style={{ backgroundColor: "#FBFAF7", borderTop: "1px solid #E4E1D6" }}>
                            <table className="w-full text-[13px] mb-3">
                              <thead><tr style={{ color: "#8A8A7E" }}>{["Site", "Request", "Pending to Transfer", "Monthly Avg. Consumption"].map((h) => <th key={h} className="text-left font-medium py-1 pr-4">{h}</th>)}</tr></thead>
                              <tbody>
                                {r.perSite.map((ps) => (
                                  <tr key={ps.site.key}>
                                    <td className="py-1 pr-4 font-medium">{ps.site.key}</td>
                                    <td className="py-1 pr-4" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{ps.request || "—"}</td>
                                    <td className="py-1 pr-4" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{ps.pending || "—"}</td>
                                    <td className="py-1 pr-4" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{ps.consumption ?? <span style={{ color: "#B7B4A6" }}>no data</span>}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div className="grid grid-cols-2 gap-4 max-w-md">
                              <Field label="Transit_INT (already ordered, international)">
                                <input type="number" className={inputCls} style={selectStyle} defaultValue={r.manual.transitInt || ""} onBlur={(e) => onUpdateManualField(current.id, r.item.code, { transitInt: e.target.value })} placeholder="0" />
                              </Field>
                              <Field label="Transit_LCL (already ordered, local)">
                                <input type="number" className={inputCls} style={selectStyle} defaultValue={r.manual.transitLcl || ""} onBlur={(e) => onUpdateManualField(current.id, r.item.code, { transitLcl: e.target.value })} placeholder="0" />
                              </Field>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {tableRows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: "#8A8A7E" }}>Nothing to show — add a site submission, or check "Show all Code Master items".</td></tr>}
              </tbody>
            </table>
          </div>

          {current.status === "collecting" && (
            <div className="mt-4">
              <button onClick={() => onComplete(current.id)} className="rounded-md px-4 py-2.5 font-semibold text-sm" style={{ backgroundColor: "#4C7A5E", color: "#FFFFFF" }}>Mark Forecast Completed</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
