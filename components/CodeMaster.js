import { useState } from "react";
import { Search, Plus } from "lucide-react";
import { Field, PageHeader, Pill, inputCls, selectStyle } from "./UI";
import { WAREHOUSE_ZONE_CODES, CATEGORY_META, zoneName } from "../lib/helpers";

function AddItemForm({ onAdd, onDone }) {
  const [form, setForm] = useState({
    code: "", sku: "", description: "", unit: "KG", category: "AMB",
    primaryPacking: "", packingSize: "", brand: "", origin: "", remarks: "", defaultZone: WAREHOUSE_ZONE_CODES[0],
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    onAdd(form);
    onDone();
  };

  return (
    <div className="rounded-lg p-5 mb-6" style={{ backgroundColor: "#FFFFFF", border: "1px solid #E4E1D6" }}>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <Field label="Code" hint="Unique pack-size variant identifier"><input className={inputCls} style={selectStyle} value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="e.g. 1013010100-01" /></Field>
        <Field label="SKU" hint="Shared across all pack sizes of this item"><input className={inputCls} style={selectStyle} value={form.sku} onChange={(e) => set("sku", e.target.value)} placeholder="e.g. CHICKEN WHOLE" /></Field>
        <Field label="Description"><input className={inputCls} style={selectStyle} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. CHICKEN WHOLE, 1.2KG" /></Field>
      </div>
      <div className="grid grid-cols-4 gap-4 mb-4">
        <Field label="Unit">
          <select className={inputCls} style={selectStyle} value={form.unit} onChange={(e) => set("unit", e.target.value)}>
            <option value="KG">KG</option><option value="L">L</option><option value="EA">EA</option>
          </select>
        </Field>
        <Field label="Category">
          <select className={inputCls} style={selectStyle} value={form.category} onChange={(e) => set("category", e.target.value)}>
            <option value="AMB">Ambient</option><option value="CHL">Chilled</option><option value="FRZ">Frozen</option><option value="WTR">Water</option>
          </select>
        </Field>
        <Field label="Default zone">
          <select className={inputCls} style={selectStyle} value={form.defaultZone} onChange={(e) => set("defaultZone", e.target.value)}>
            {WAREHOUSE_ZONE_CODES.map((z) => <option key={z} value={z}>{zoneName(z)}</option>)}
          </select>
        </Field>
        <Field label="Packing Size"><input className={inputCls} style={selectStyle} value={form.packingSize} onChange={(e) => set("packingSize", e.target.value)} placeholder="e.g. 1*12*1.2KG" /></Field>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <Field label="Primary Packing"><input className={inputCls} style={selectStyle} value={form.primaryPacking} onChange={(e) => set("primaryPacking", e.target.value)} /></Field>
        <Field label="Brand"><input className={inputCls} style={selectStyle} value={form.brand} onChange={(e) => set("brand", e.target.value)} /></Field>
        <Field label="Origin"><input className={inputCls} style={selectStyle} value={form.origin} onChange={(e) => set("origin", e.target.value)} /></Field>
        <Field label="Remarks" hint="Procurement note, e.g. 'MUST BE CHUNK'"><input className={inputCls} style={selectStyle} value={form.remarks} onChange={(e) => set("remarks", e.target.value)} /></Field>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={handleSubmit} disabled={!form.code || !form.sku} className="rounded-md px-5 py-2.5 font-semibold text-sm" style={{ backgroundColor: form.code && form.sku ? "#3A5A6D" : "#C9C6BA", color: "#FFFFFF" }}>Add to Code Master</button>
        <button onClick={onDone} className="rounded-md px-5 py-2.5 font-semibold text-sm" style={{ backgroundColor: "#EFECE2", color: "#23241F" }}>Cancel</button>
      </div>
    </div>
  );
}

function EditableCell({ value, onSave, placeholder }) {
  return (
    <input
      className="w-full rounded border px-2 py-1 text-[13px]"
      style={{ ...selectStyle, minWidth: 100 }}
      defaultValue={value ?? ""}
      placeholder={placeholder}
      onBlur={(e) => { if (e.target.value !== (value ?? "")) onSave(e.target.value); }}
    />
  );
}

export default function CodeMaster({ itemMaster, rows, onAdd, onUpdate }) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);

  const stockByCode = new Map();
  for (const r of rows) stockByCode.set(r.code, (stockByCode.get(r.code) || 0) + Number(r.quantity || 0));

  let list = itemMaster;
  if (query) {
    const q = query.toLowerCase();
    list = list.filter((m) => m.code.toLowerCase().includes(q) || (m.sku || "").toLowerCase().includes(q) || (m.description || "").toLowerCase().includes(q));
  }

  return (
    <div>
      <PageHeader title="Code Master" subtitle="Every item that exists — searched by Goods Receipt, Picking, and Forecast, whether or not it currently has stock" />

      <div className="flex items-center gap-3 mb-4">
        <div className="relative max-w-xs flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#8A8A7E" }} />
          <input className="w-full rounded-md border pl-9 pr-3 py-2 text-sm outline-none" style={{ borderColor: "#D8D5C9", backgroundColor: "#FFFFFF" }} placeholder="Search code, SKU, or description…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <button onClick={() => setAdding((o) => !o)} className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-md" style={{ backgroundColor: adding ? "#23241F" : "#E9EEF1", color: adding ? "#F6F4EF" : "#3A5A6D" }}>
          <Plus size={15} /> {adding ? "Hide" : "New Item"}
        </button>
      </div>

      {adding && <AddItemForm onAdd={onAdd} onDone={() => setAdding(false)} />}

      <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #E4E1D6" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: "#EFECE2" }}>
              {["Code", "SKU", "Description", "Unit", "Category", "Packing Size", "Remarks", "Current Stock"].map((h) => (
                <th key={h} className="text-left px-3 py-2 text-[11px] uppercase tracking-wider font-semibold whitespace-nowrap" style={{ color: "#6B6A62" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((m, idx) => (
              <tr key={m.code} style={{ borderTop: "1px solid #E4E1D6", backgroundColor: idx % 2 ? "#FBFAF7" : "#FFFFFF" }}>
                <td className="px-3 py-2" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{m.code}</td>
                <td className="px-3 py-2"><EditableCell value={m.sku} onSave={(v) => onUpdate(m.code, { sku: v })} /></td>
                <td className="px-3 py-2"><EditableCell value={m.description} onSave={(v) => onUpdate(m.code, { description: v })} /></td>
                <td className="px-3 py-2">
                  <select className="rounded border px-2 py-1 text-[13px]" style={selectStyle} defaultValue={m.unit || "KG"} onChange={(e) => onUpdate(m.code, { unit: e.target.value })}>
                    <option value="KG">KG</option><option value="L">L</option><option value="EA">EA</option>
                  </select>
                </td>
                <td className="px-3 py-2"><Pill color={CATEGORY_META[m.material_category]?.color} bg={CATEGORY_META[m.material_category]?.bg}>{CATEGORY_META[m.material_category]?.label || m.material_category || "—"}</Pill></td>
                <td className="px-3 py-2"><EditableCell value={m.packing_size} onSave={(v) => onUpdate(m.code, { packing_size: v })} /></td>
                <td className="px-3 py-2"><EditableCell value={m.remarks} onSave={(v) => onUpdate(m.code, { remarks: v })} placeholder="—" /></td>
                <td className="px-3 py-2 font-semibold" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{(stockByCode.get(m.code) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} {m.unit}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: "#8A8A7E" }}>No items match — or your catalog is empty. Import a Stock.xlsx or add an item above.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
