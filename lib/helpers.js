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

export const FORECAST_SITES = [
  { key: "DAQING WQ1", siteId: "DAQING-WQ1" },
  { key: "SIBA", siteId: "KE-SIBA" },
  { key: "Block9", siteId: "KE-BLOCK9" },
  { key: "Flycamp", siteId: "KE-FLYCAMP" },
  { key: "ROO", siteId: "BECL-ROO" },
  { key: "RSB", siteId: "RSB" },
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

export const round2 = (n) => {
  const num = Number(n) || 0;
  return Math.round((num + Number.EPSILON) * 1000) / 1000;
};

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

export function allocateByBoxTheory(requestedQty, config = {}) {
  const req = Number(requestedQty) || 0;
  const boxWeight = Number(config.boxWeight) || 0;
  if (req <= 0) return { boxes: 0, looseQty: 0, totalPicked: 0 };

  if (boxWeight > 0) {
    const boxes = Math.floor(req / boxWeight);
    const looseQty = round2(req - boxes * boxWeight);
    return { boxes, looseQty, totalPicked: req };
  }

  return { boxes: 0, looseQty: req, totalPicked: req };
}

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
  const numericQty = Number(qty) || 0;
  const baseUnit = unit || "KG";

  if (numericQty <= 0) return "—";

  if (
    !packingSize ||
    packingSize === "—" ||
    String(packingSize).toUpperCase().includes("AVG")
  ) {
    return `${round2(numericQty)} ${baseUnit}`;
  }

  const str = String(packingSize).toUpperCase();
  const tokens = str.split(/[*X]/).filter(Boolean);
  if (tokens.length === 0) return `${round2(numericQty)} ${baseUnit}`;

  const numbers = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i].trim();
    const match = token.match(/^([\d.]+)(KG|GR|GM|G|L|ML|EA)?$/);
    if (match) {
      let val = parseFloat(match[1]);
      const u = match[2];
      if (u) {
        if ((u === "GR" || u === "GM" || u === "G") && baseUnit === "KG") val /= 1000;
        else if (u === "ML" && baseUnit === "L") val /= 1000;
      }
      if (!isNaN(val) && val > 0) numbers.push(val);
    }
  }

  if (numbers.length === 0) return `${round2(numericQty)} ${baseUnit}`;

  const packetWeight = numbers[numbers.length - 1];
  const boxWeight = numbers.reduce((acc, curr) => acc * curr, 1);

  const eps = 0.001;

  const rawBoxes = numericQty / boxWeight;
  const fullBoxes = Math.floor(rawBoxes + eps);
  let remainingAfterBoxes = numericQty - fullBoxes * boxWeight;
  if (Math.abs(remainingAfterBoxes) < eps) remainingAfterBoxes = 0;

  const rawPackets = remainingAfterBoxes / packetWeight;
  const loosePackets = Math.floor(rawPackets + eps);
  let remainingQty = round2(remainingAfterBoxes - loosePackets * packetWeight);
  if (Math.abs(remainingQty) < eps) remainingQty = 0;

  const parts = [];

  if (fullBoxes > 0) {
    parts.push(`${fullBoxes} box${fullBoxes > 1 ? "es" : ""}`);
  }

  if (loosePackets > 0) {
    parts.push(`${loosePackets} packet${loosePackets > 1 ? "s" : ""}`);
  }

  if (remainingQty > 0.001) {
    parts.push(`${remainingQty} ${baseUnit}`);
  }

  return parts.length > 0 ? parts.join(" + ") : `0 ${baseUnit}`;
}

export function allocateItemQuantity(requestedQty, item = {}) {
  const boxWeight = Number(item.box_net_weight) || parsePackingSize(item.packing_size, item.unit);

  let availablePacks = [];
  if (Array.isArray(item.available_packs)) {
    availablePacks = item.available_packs;
  } else if (item.primary_packing) {
    const extracted = String(item.primary_packing).match(/[\d.]+/g);
    if (extracted) {
      availablePacks = extracted.map(Number).filter((n) => !isNaN(n) && n > 0);
    }
  }

  const isLoose = item.is_loose ?? (!boxWeight && availablePacks.length === 0);

  return allocateByBoxTheory(requestedQty, {
    boxWeight,
    availablePacks,
    isLoose,
  });
}

export function getActiveAllocations(pendingOps = []) {
  const allocations = new Map();

  for (const op of pendingOps) {
    if (op.status === "confirmed") continue;
    for (const line of op.lines || []) {
      if (line.rowId) {
        const currentAlloc = allocations.get(line.rowId) || 0;
        allocations.set(line.rowId, currentAlloc + (Number(line.qty) || 0));
      }
    }
  }

  return allocations;
}

export function getAvailableUnreservedStock(rows, codes, activeAllocations = new Map()) {
  return round2(
    rows
      .filter((r) => codes.includes(r.code))
      .reduce((sum, r) => {
        const physicalQty = Number(r.quantity) || 0;
        const allocatedQty = activeAllocations.get(r.id) || 0;
        const netAvailable = Math.max(0, physicalQty - allocatedQty);
        return sum + netAvailable;
      }, 0)
  );
}

export function allocateFEFOWithReservation(rows, codes, qtyNeeded, pendingOps = []) {
  const activeAllocations = getActiveAllocations(pendingOps);

  const pool = rows
    .filter((r) => codes.includes(r.code))
    .map((r) => {
      const physical = Number(r.quantity) || 0;
      const allocated = activeAllocations.get(r.id) || 0;
      const unreserved = Math.max(0, round2(physical - allocated));
      return { ...r, unreservedAvailable: unreserved };
    })
    .filter((r) => r.unreservedAvailable > 0)
    .sort((a, b) => {
      if (!a.expiry_date) return 1;
      if (!b.expiry_date) return -1;
      return new Date(a.expiry_date) - new Date(b.expiry_date);
    });

  const draws = [];
  let remaining = round2(qtyNeeded);

  for (const r of pool) {
    if (remaining <= 0) break;
    const take = round2(Math.min(r.unreservedAvailable, remaining));
    if (take > 0) {
      draws.push({ rowId: r.id, code: r.code, qty: take });
      remaining = round2(remaining - take);
    }
  }

  return { draws, shortfall: round2(remaining) };
}

export function getUserName() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("stockyard_user_name") || "";
}

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

// Helper to look up key values using a fuzzy header name match algorithm
function getValueByFuzzyKey(rowObj, searchWords) {
  const keys = Object.keys(rowObj);
  for (const key of keys) {
    const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    // Checks if all required matching keywords exist inside the row object identifier
    const matchesAll = searchWords.every(word => cleanKey.includes(word));
    if (matchesAll && rowObj[key] !== undefined && rowObj[key] !== null) {
      return rowObj[key];
    }
  }
  return null;
}

// 🛠️ FUZZY BULLETPROOF EXCEL ROW CONVERTER
export function excelRowToDbRow(r) {
  // Finds pricing headers even if parsed as "Unit Price", "Unit Price in USD", "Price_1", etc.
  const rawPriceValue = getValueByFuzzyKey(r, ["unit", "price"]) ?? getValueByFuzzyKey(r, ["price"]) ?? 0;
  const rawQtyValue = getValueByFuzzyKey(r, ["quantity"]) ?? getValueByFuzzyKey(r, ["qty"]) ?? 0;
  const rawTotalValue = getValueByFuzzyKey(r, ["total", "stock", "value"]) ?? getValueByFuzzyKey(r, ["total", "value"]) ?? null;

  // Clean data properties converting string structures to mathematical floats securely
