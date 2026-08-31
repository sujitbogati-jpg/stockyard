import { useState } from "react";
import { ClipboardCheck, TriangleAlert, CircleCheck } from "lucide-react";
import { Field, PageHeader, Pill, inputCls, selectStyle } from "./UI";
import { WAREHOUSE_ZONE_CODES, zoneName, fmtDate, round2 } from "../lib/helpers";

export default function StockTake({ stockTakes, onCreate, onUpdateLine, onComplete, onDelete }) {
  const [openId, setOpenId] = useState(stockTakes[0]?.id || null);
  const [zoneFilter, setZoneFilter] = useState("");
  const [creating, setCreating] = useState(stockTakes.length === 0);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const current = stockTakes.find((s) => s.id === openId) || stockTakes[0];

  const handleCreate = async () => {
    const st = await onCreate(zoneFilter ? Number(zoneFilter) : null);
    if (st) { setOpenId(st.id); setCreating(false); }
  };

  return (
    <div>
      <PageHeader title="Stock Take" subtitle="Count what's actually on the shelf and reconcile against system quantities" accent="#8A6A3A" />

      <button onClick={() => setCreating((o) => !o)} className="mb-4 flex items-center gap-2 text-[13px] font-semibold px-3 py-2 rounded-md" style={{ backgroundColor: creating ? "#23241F" : "#F3ECDD", color: creating ? "#F6F4EF" : "#8A6A3A" }}>
        <ClipboardCheck size={15} /> {creating ? "Hide" : "+ New Stock Take"}
      </button>

      {creating && (
        <div className="rounded-lg p-5 mb-6 flex items-end gap-3" style={{ backgroundColor: "#FFFFFF", border: "1px solid #E4E1D6" }}>
          <div className="max-w-xs flex-1">
            <Field label="Zone (optional — leave blank for all zones)">
              <select className={inputCls} style={selectStyle} value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)}>
                <option value="">All zones</option>
                {WAREHOUSE_ZONE_CODES.map((z) => <option key={z} value={z}>{zoneName(z)}</option>)}
              </select>
            </Field>
          </div>
          <button onClick={handleCreate} className="rounded-md px-5 py-2.5 font-semibold text-sm" style={{ backgroundColor: "#8A6A3A", color: "#FFFFFF" }}>Start Count</button>
        </div>
      )}

      {stockTakes.length === 0 && !creating && (
        <div className="rounded-lg p-8 text-center text-sm" style={{ backgroundColor: "#FFFFFF", border: "1px solid #E4E1D6", color: "#8A8A7E" }}>
          No stock takes yet — start one to count physical stock and catch discrepancies.
        </div>
      )}

      {current && (
        <>
          <div className="flex gap-2 mb-4 flex-wrap">
            {stockTakes.map((st) => (
              <button key={st.id} onClick={() => { setOpenId(st.id); setConfirmComplete(false); setDeleteConfirm(false); }} className="rounded-md px-3 py-1.5 text-[12px] font-semibold" style={{ backgroundColor: st.id === current.id ? "#23241F" : "#FFFFFF", color: st.id === current.id ? "#F6F4EF" : "#23241F", border: "1px solid #D8D5C9" }}>
                {st.st_number} · {st.zone_filter ? zoneName(st.zone_filter) : "All zones"} · {fmtDate(st.created_at)}
              </button>
            ))}
          </div>

          <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #E4E1D6" }}>
            <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2" style={{ backgroundColor: "#F3ECDD" }}>
              <div className="font-semibold text-sm flex items-center gap-2 flex-wrap">
                <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{current.st_number}</span>
                <Pill color={current.status === "completed" ? "#4C7A5E" : "#B07A1F"} bg={current.status === "completed" ? "#EAF2EC" : "#FBF1DF"}>{current.status === "completed" ? "Completed" : "Counting"}</Pill>
                <span>{current.zone_filter ? zoneName(current.zone_filter) : "All zones"}</span>
                <span style={{ color: "#8A8A7E" }}>· {fmtDate(current.created_at)} by {current.created_by || "—"}</span>
              </div>
              {!deleteConfirm ? (
                <button onClick={() => setDeleteConfirm(true)} className="text-[12px] font-semibold px-2.5 py-1 rounded" style={{ color: "#B0563A", backgroundColor: "#F5EAE5" }}>Delete</button>
              ) : (
                <span className="flex items-center gap-1.5">
                  <span className="text-[12px] font-medium" style={{ color: "#B0563A" }}>Delete this count?</span>
                  <button onClick={() => { onDelete(current.id); setDeleteConfirm(false); setOpenId(null); }} className="text-[12px] font-semibold px-2.5 py-1 rounded" style={{ backgroundColor: "#B0563A", color: "#FFFFFF" }}>Yes, delete</button>
                  <button onClick={() => setDeleteConfirm(false)} className="text-[12px] font-semibold px-2.5 py-1 rounded" style={{ backgroundColor: "#EFECE2", color: "#23241F" }}>Cancel</button>
                </span>
              )}
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "#FBFAF7" }}>
                  {["Item", "Code", "System Qty", "Counted Qty", "Variance"].map((h) => <th key={h} className="text-left px-4 py-2 text-[11px] uppercase tracking-wider font-semibold" style={{ color: "#6B6A62" }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {current.lines.map((l) => {
                  const variance = l.countedQty === "" || l.countedQty == null ? null : round2(Number(l.countedQty) - l.systemQty);
                  return (
                    <tr key={l.code} style={{ borderTop: "1px solid #E4E1D6" }}>
                      <td className="px-4 py-2.5 font-medium">{l.desc}</td>
                      <td className="px-4 py-2.5 text-[13px]" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#6B6A62" }}>{l.code}</td>
                      <td className="px-4 py-2.5" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{l.systemQty} {l.unit}</td>
                      <td className="px-4 py-2.5">
                        <input
                          type="number" min="0" step="any"
                          className="w-28 rounded border px-2 py-1.5 text-[13px]"
                          style={{ ...selectStyle, fontFamily: "'IBM Plex Mono', monospace" }}
                          value={l.countedQty}
                          disabled={current.status === "completed"}
                          onChange={(e) => onUpdateLine(current.id, l.code, e.target.value)}
                          placeholder="not counted"
                        />
                      </td>
                      <td className="px-4 py-2.5 font-semibold" style={{ fontFamily: "'IBM Plex Mono', monospace", color: variance == null ? "#B7B4A6" : variance === 0 ? "#4C7A5E" : "#B0563A" }}>
                        {variance == null ? "—" : `${variance > 0 ? "+" : ""}${variance} ${l.unit}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="px-4 py-4" style={{ borderTop: "1px solid #E4E1D6", backgroundColor: "#FBFAF7" }}>
              {current.status === "counting" && !confirmComplete && (
                <button onClick={() => setConfirmComplete(true)} className="rounded-md px-4 py-2.5 font-semibold text-sm" style={{ backgroundColor: "#8A6A3A", color: "#FFFFFF" }}>Complete Stock Take</button>
              )}
              {current.status === "counting" && confirmComplete && (
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm flex items-center gap-2" style={{ color: "#B0563A" }}><TriangleAlert size={15} /> This posts a stock adjustment for every line with a counted quantity that differs from the system quantity. Uncounted lines are skipped.</span>
                  <button onClick={() => { onComplete(current.id); setConfirmComplete(false); }} className="rounded-md px-4 py-2.5 font-semibold text-sm" style={{ backgroundColor: "#8A6A3A", color: "#FFFFFF" }}>Confirm & Post Adjustments</button>
                  <button onClick={() => setConfirmComplete(false)} className="rounded-md px-4 py-2.5 font-semibold text-sm" style={{ backgroundColor: "#EFECE2", color: "#23241F" }}>Cancel</button>
                </div>
              )}
              {current.status === "completed" && (
                <div className="text-sm flex items-center gap-2" style={{ color: "#4C7A5E" }}><CircleCheck size={16} /> Completed {fmtDate(current.completed_at)} by {current.completed_by || "—"}. Variances posted as stock adjustments.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
