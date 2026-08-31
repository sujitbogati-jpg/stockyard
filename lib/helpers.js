export const WAREHOUSE_ZONE_CODES = [4, 17, 18, 19, 20];
export const ZONE_NAMES = { 4: "Water Store", 17: "Ambient Store", 18: "Chiller", 19: "Freezer", 20: "Freezer (Overflow)" };

export const PROJECT_SITES = [
  { id: "DAQING-WQ1", name: "DAQING WQ1", code: "" },
  { id: "KE-SIBA", name: "KE-SIBA", code: "0080" },
  { id: "KE-BLOCK9", name: "KE-BLOCK9", code: "0170" },
  { id: "KE-CPF", name: "KE-CPF", code: "0220" },
  { id: "KE-FLYCAMP", name: "KE-FLYCAMP", code: "0180" },
  { id: "BECL-ROO", name: "BECL-ROO", code: "0110" },
  { id: "RSB", name: "RSB", code: "0120" },
];

// The exact 6 sites and order used on the Forecast template — a subset/
// reordering of PROJECT_SITES, matched by name to what your template uses.
export const FORECAST_SITES = [
  { key: "DAQING WQ1", siteId: "DAQING-WQ1", match: /daqing/i },
  { key: "SIBA", siteId: "KE-SIBA", match: /siba/i },
  { key: "Block9", siteId: "KE-BLOCK9", match: /b9|block ?9/i },
  { key: "Flycamp", siteId: "KE-FLYCAMP", match: /flycamp/i },
  { key: "ROO", siteId: "BECL-ROO", match: /roo/i },
  { key: "RSB", siteId: "RSB", match: /rsb/i },
];

export const CATEGORY_META = {
  AMB: { label: "Ambient", color: "#8A6A3A", bg: "#F3ECDD" },
  CHL: { label: "Chilled", color: "#3A5A6D", bg: "#E9EEF1" },
  FRZ: { label: "Frozen", color: "#3A5F8A", bg: "#E7EEF5" },
  WTR: { label: "Water", color: "#2E7D8A", bg: "#E4F0F1" },
};

export const TYPE_META = {
  receipt: { label: "Goods Receipt", color: "#4C7A5E", bg: "#EAF2EC" },
  transfer: { label: "Transfer", color: "#3A5A6D", bg: "#E9EEF1" },
  issue: { label: "Goods Issue", color: "#B0563A", bg: "#F5EAE5" },
  adjustment: { label: "Stock Adjustment", color: "#8A6A3A", bg: "#F3ECDD" },
};

export const zoneName = (code) => ZONE_NAMES[code] || `Zone ${code}`;
export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export const fmtDate = (v) => {
  if (!v) return "—";
  const d = typeof v === "number" ? new Date(v) : new Date(v);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

export const daysUntil = (isoDate) => {
  if (!isoDate) return null;
  const now = new Date();
  const exp = new Date(isoDate);
  if (isNaN(exp)) return null;
  return Math.round((exp - now) / 86400000);
};

// Parses strings like "1*25KG", "1*24*500GR", "18 x 375 GM", "6 x 2.5 KG"
// into a per-box/carton quantity expressed in the item's base Unit (KG/L/EA),
// so we can tell a picker how many whole boxes to grab for a requested qty.
export function parsePackingSize(packingSize, unit) {
  if (!packingSize) return null;
  const cleaned = String(packingSize).toUpperCase().replace(/\s+/g, "");
  const tokens = cleaned.split(/[*X]/).filter(Boolean);
  if (tokens.length === 0) return null;
  const last = tokens[tokens.length - 1];
  const m = last.match(/^([\d.]+)(KG|GR|GM|G|L|ML|EA)?$/);
  if (!m) return null;
  let value = parseFloat(m[1]);
  const foundUnit = m[2] || unit;
  if (isNaN(value)) return null;
  if ((foundUnit === "GR" || foundUnit === "GM" || foundUnit === "G") && unit === "KG") value /= 1000;
  else if (foundUnit === "ML" && unit === "L") value /= 1000;
  const multipliers = tokens.slice(0, -1).map((t) => parseFloat(t)).filter((n) => !isNaN(n) && n > 0);
  for (const mult of multipliers) value *= mult;
  return value > 0 ? value : null;
}

export function boxesToPick(qty, packingSize, unit) {
  const perBox = parsePackingSize(packingSize, unit);
  if (!perBox) return null;
  return Math.ceil((qty / perBox) - 1e-9);
}

export function getUserName() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("stockyard_user_name") || "";
}

// Exports an array of plain objects to a downloadable .xlsx file, entirely
// client-side (the xlsx library is already a dependency).
export async function exportToExcel(rows, filename, sheetName = "Sheet1") {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

export const ORIGINAL_HEADERS = [
  "SKU's", "CODE", "DESCRIPTION", "Batch", "Primary Packing", "Box Net Weight",
  "Packing Size", "Expiry Date", "Days to Expire", "Storage Location",
  "Material Category", "Unit", "Quantity", "Unit Price in USD",
  "Total Stock Value in USD", "Brand", "Origin", "Bin Location",
];

// Maps a parsed Excel row (original headers) onto the stock_rows table's
// snake_case columns for insertion into Supabase.
export function excelRowToDbRow(r) {
  return {
    sku: r["SKU's"] ?? null,
    code: r["CODE"],
    description: r["DESCRIPTION"] ?? null,
    batch: r["Batch"] ?? null,
    primary_packing: r["Primary Packing"] ?? null,
    box_net_weight: r["Box Net Weight"] ?? null,
    packing_size: r["Packing Size"] ?? null,
    expiry_date: r["Expiry Date"] || null,
    storage_location: Number(r["Storage Location"]),
    material_category: r["Material Category"] ?? null,
    unit: r["Unit"] ?? null,
    quantity: Number(r["Quantity"]) || 0,
    unit_price: r["Unit Price in USD"] ?? null,
    total_stock_value: r["Total Stock Value in USD"] ?? null,
    brand: r["Brand"] ?? null,
    origin: r["Origin"] ?? null,
    bin_location: r["Bin Location"] ?? null,
  };
}

// Maps the same parsed Excel row onto item_master's columns — the item
// catalog entry, independent of any particular batch's quantity or expiry.
export function excelRowToMasterRow(r) {
  return {
    code: r["CODE"],
    sku: r["SKU's"] ?? r["CODE"],
    description: r["DESCRIPTION"] ?? null,
    unit: r["Unit"] ?? null,
    material_category: r["Material Category"] ?? null,
    primary_packing: r["Primary Packing"] ?? null,
    packing_size: r["Packing Size"] ?? null,
    box_net_weight: r["Box Net Weight"] ?? null,
    brand: r["Brand"] ?? null,
    origin: r["Origin"] ?? null,
    default_storage_location: Number(r["Storage Location"]) || null,
    updated_at: new Date().toISOString(),
  };
}
