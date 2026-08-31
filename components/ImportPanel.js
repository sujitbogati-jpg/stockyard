import { useRef, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { PageHeader } from "./UI";
import { ORIGINAL_HEADERS, fmtDate } from "../lib/helpers";

function DangerButton({ id, label, desc, onConfirm, disabled, confirming, setConfirming }) {
  const isConfirming = confirming === id;
  return (
    <div className="flex items-center justify-between gap-3 py-2.5" style={{ borderTop: "1px solid #E4E1D6" }}>
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[12px]" style={{ color: "#8A8A7E" }}>{desc}</div>
      </div>
      {!isConfirming ? (
        <button type="button" disabled={disabled} onClick={() => setConfirming(id)} className="shrink-0 rounded-md px-3 py-1.5 text-[12px] font-semibold" style={{ backgroundColor: disabled ? "#F0EEE8" : "#F5EAE5", color: disabled ? "#B7B4A6" : "#B0563A", cursor: disabled ? "not-allowed" : "pointer" }}>
          Wipe
        </button>
      ) : (
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[12px] font-medium" style={{ color: "#B0563A" }}>Sure?</span>
          <button type="button" onClick={() => { onConfirm(); setConfirming(null); }} className="rounded-md px-3 py-1.5 text-[12px] font-semibold" style={{ backgroundColor: "#B0563A", color: "#FFFFFF" }}>Yes, wipe it</button>
          <button type="button" onClick={() => setConfirming(null)} className="rounded-md px-3 py-1.5 text-[12px] font-semibold" style={{ backgroundColor: "#EFECE2", color: "#23241F" }}>Cancel</button>
        </div>
      )}
    </div>
  );
}

export default function ImportPanel({ onFile, lastImport, rowCount, movementCount, pickingCount, onResetStock, onClearMovements, onClearPicking, onWipeAll }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [confirming, setConfirming] = useState(null);

  const handleFile = async (f) => {
    const XLSX = await import("xlsx");
    onFile(f, XLSX);
  };

  return (
    <div className="max-w-xl">
      <PageHeader title="Import Stock File" subtitle="Refresh the app with an updated copy of your Stock.xlsx (sheet: SOH)" accent="#8A6A3A" />
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
        className="rounded-lg p-10 flex flex-col items-center justify-center text-center gap-3 cursor-pointer"
        style={{ backgroundColor: dragOver ? "#FBF1DF" : "#FFFFFF", border: `2px dashed ${dragOver ? "#E8A93B" : "#D8D5C9"}` }}
        onClick={() => inputRef.current?.click()}
      >
        <FileSpreadsheet size={32} style={{ color: "#8A6A3A" }} />
        <div className="font-semibold text-sm">Drop your updated Stock.xlsx here, or click to browse</div>
        <div className="text-[12px]" style={{ color: "#8A8A7E" }}>Reads the &quot;SOH&quot; sheet and matches the same 18 columns exactly — replaces the app&apos;s current stock rows with what&apos;s in the file.</div>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      </div>

      <div className="mt-6 rounded-lg p-4" style={{ backgroundColor: "#FFFFFF", border: "1px solid #E4E1D6" }}>
        <div className="text-[11px] uppercase tracking-wider font-semibold mb-2" style={{ color: "#8A8A7E" }}>Current data</div>
        <div className="text-sm">{rowCount} stock rows loaded.</div>
        {lastImport?.file_name && <div className="text-sm mt-1" style={{ color: "#8A8A7E" }}>Last import: <strong>{lastImport.file_name}</strong> — {lastImport.row_count} rows, {fmtDate(lastImport.imported_at)}.</div>}
      </div>

      <div className="mt-4 text-[12px]" style={{ color: "#8A8A7E" }}>Expected columns: {ORIGINAL_HEADERS.join(", ")}.</div>

      <div className="mt-8">
        <PageHeader title="Fix a Mistake" subtitle="Undo bad entries by wiping just the affected data — each asks you to confirm before it does anything" accent="#B0563A" />
        <div className="rounded-lg px-4" style={{ backgroundColor: "#FFFFFF", border: "1px solid #E4E1D6" }}>
          <DangerButton id="movements" label="Clear Movement Log" desc={`Deletes the ${movementCount} logged receipt/transfer/issue entries. Stock quantities are not affected.`} onConfirm={onClearMovements} disabled={movementCount === 0} confirming={confirming} setConfirming={setConfirming} />
          <DangerButton id="picking" label="Clear Picking Lists" desc={`Deletes all ${pickingCount} picking lists (picking / sent / confirmed). Already-confirmed stock changes are not undone.`} onConfirm={onClearPicking} disabled={pickingCount === 0} confirming={confirming} setConfirming={setConfirming} />
          <DangerButton id="stock" label="Reset Stock to Imported File" desc="Reloads stock quantities and batches exactly as they were in the last file you imported — undoes any receipts, transfers, or issues posted since." onConfirm={onResetStock} confirming={confirming} setConfirming={setConfirming} />
          <DangerButton id="all" label="Wipe Everything" desc="Resets stock, the movement log, and all picking lists back to the originally imported file. Use this if entries got badly mixed up." onConfirm={onWipeAll} confirming={confirming} setConfirming={setConfirming} />
        </div>
      </div>
    </div>
  );
}
