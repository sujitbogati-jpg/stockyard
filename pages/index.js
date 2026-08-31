import { useEffect, useState, useCallback } from "react";
import {
  LayoutGrid, PackagePlus, ArrowLeftRight, PackageMinus, Boxes,
  ClipboardList, ScrollText, Upload, TriangleAlert, ClipboardCheck, TrendingUp, BookOpen, CalendarClock,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { round2, WAREHOUSE_ZONE_CODES, PROJECT_SITES, excelRowToDbRow, excelRowToMasterRow, getUserName } from "../lib/helpers";
import { Toast } from "../components/UI";
import Dashboard from "../components/Dashboard";
import LineItemGrid from "../components/LineItemGrid";
import StockBrowser from "../components/StockBrowser";
import PickingLists from "../components/PickingLists";
import MovementLog from "../components/MovementLog";
import ImportPanel from "../components/ImportPanel";
import StockTake from "../components/StockTake";
import Forecast from "../components/Forecast";
import CodeMaster from "../components/CodeMaster";
import BBDReport from "../components/BBDReport";

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "codemaster", label: "Code Master", icon: BookOpen },
  { id: "receipt", label: "Goods Receipt", icon: PackagePlus },
  { id: "transfer", label: "Transfer", icon: ArrowLeftRight },
  { id: "issue", label: "Goods Issue", icon: PackageMinus },
  { id: "stock", label: "Stock & Batches", icon: Boxes },
  { id: "bbd", label: "BBD Risk Report", icon: CalendarClock },
  { id: "picking", label: "Picking Lists", icon: ClipboardList },
  { id: "stocktake", label: "Stock Take", icon: ClipboardCheck },
  { id: "forecast", label: "Forecast", icon: TrendingUp },
  { id: "log", label: "Movement Log", icon: ScrollText },
  { id: "import", label: "Import Stock File", icon: Upload },
];

export default function Home() {
  const [tab, setTab] = useState("dashboard");
  const [rows, setRows] = useState([]);
  const [movements, setMovements] = useState([]);
  const [pendingOps, setPendingOps] = useState([]);
  const [lastImport, setLastImport] = useState(null);
  const [itemMaster, setItemMaster] = useState([]);
  const [consumptionRecords, setConsumptionRecords] = useState([]);
  const [pendingAdjustments, setPendingAdjustments] = useState([]);
  const [itemSettings, setItemSettings] = useState([]);
  const [stockTakes, setStockTakes] = useState([]);
  const [forecasts, setForecasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const showToast = (msg, tone = "ok") => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 3200);
  };

  // Supabase/PostgREST caps a single request's rows (1000 by default,
  // whatever your project's Max Rows setting is). For tables that can
  // legitimately exceed that, fetch in pages until an empty page comes
  // back, so nothing gets silently truncated regardless of the cap.
  const fetchPaginated = useCallback(async (table, buildQuery) => {
    let all = [];
    let from = 0;
    for (let i = 0; i < 100; i++) {
      let q = supabase.from(table).select("*");
      if (buildQuery) q = buildQuery(q);
      const { data, error } = await q.range(from, from + 999);
      if (error) return { data: null, error };
      if (!data || data.length === 0) break;
      all = all.concat(data);
      from += data.length;
    }
    return { data: all, error: null };
  }, []);

  const fetchAll = useCallback(async () => {
    const [rowsRes, movRes, opsRes, importRes, settingsRes, stRes, fcRes, imRes, crRes, paRes] = await Promise.all([
      fetchPaginated("stock_rows", (q) => q.order("received_at", { ascending: true })),
      supabase.from("movements").select("*").order("created_at", { ascending: false }).limit(500),
      fetchPaginated("picking_lists", (q) => q.order("created_at", { ascending: false })),
      supabase.from("last_import").select("*").eq("id", 1).maybeSingle(),
      fetchPaginated("item_settings"),
      fetchPaginated("stock_takes", (q) => q.order("created_at", { ascending: false })),
      fetchPaginated("forecasts", (q) => q.order("created_at", { ascending: false })),
      fetchPaginated("item_master", (q) => q.order("description", { ascending: true })),
      fetchPaginated("consumption_records", (q) => q.order("uploaded_at", { ascending: false })),
      fetchPaginated("pending_adjustments", (q) => q.order("created_at", { ascending: false })),
    ]);
    if (rowsRes.error) showToast("Failed to load stock: " + rowsRes.error.message, "err");
    else setRows(rowsRes.data || []);
    if (movRes.error) showToast("Failed to load movements: " + movRes.error.message, "err");
    else setMovements(movRes.data || []);
    if (opsRes.error) showToast("Failed to load picking lists: " + opsRes.error.message, "err");
    else setPendingOps(opsRes.data || []);
    if (!importRes.error) setLastImport(importRes.data);
    if (!settingsRes.error) setItemSettings(settingsRes.data || []);
    if (!stRes.error) setStockTakes(stRes.data || []);
    if (!fcRes.error) setForecasts(fcRes.data || []);
    if (imRes.error) showToast("Failed to load code master: " + imRes.error.message, "err");
    else setItemMaster(imRes.data || []);
    if (!crRes.error) setConsumptionRecords(crRes.data || []);
    if (!paRes.error) setPendingAdjustments(paRes.data || []);
    setLoading(false);
  }, [fetchPaginated]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ---------- Stock mutations ----------
  async function doReceipt({ code, zone, batchNo, qty, expiry, price, note, poNumber, vendor, postingDate }) {
    const finalBatch = batchNo || `NEW-${Date.now().toString().slice(-5)}`;
    const existing = rows.find((r) => r.code === code && r.storage_location === zone && r.batch === finalBatch);
    if (existing) {
      const newQty = round2(Number(existing.quantity) + qty);
      const { error } = await supabase.from("stock_rows").update({
        quantity: newQty,
        total_stock_value: round2(newQty * (existing.unit_price || 0)),
      }).eq("id", existing.id);
      if (error) { showToast("Receipt failed: " + error.message, "err"); return; }
      await supabase.from("movements").insert({
        type: "receipt", code, batch_no: finalBatch, to_location: String(zone), qty, note,
        po_number: poNumber, vendor, posting_date: postingDate || null, row_id: existing.id,
        created_by: getUserName(),
      });
    } else {
      const proto = itemMaster.find((m) => m.code === code) || rows.find((r) => r.code === code);
      const { data: inserted, error } = await supabase.from("stock_rows").insert({
        sku: proto?.sku || code,
        code,
        description: proto?.description || code,
        batch: finalBatch,
        primary_packing: proto?.primary_packing || null,
        box_net_weight: proto?.box_net_weight || null,
        packing_size: proto?.packing_size || null,
        expiry_date: expiry || null,
        storage_location: zone,
        material_category: proto?.material_category || null,
        unit: proto?.unit || null,
        quantity: qty,
        unit_price: price != null ? price : proto?.unit_price || null,
        total_stock_value: round2(qty * (price != null ? price : proto?.unit_price || 0)),
        brand: proto?.brand || null,
        origin: proto?.origin || null,
        received_at: Date.now(),
      }).select().single();
      if (error) { showToast("Receipt failed: " + error.message, "err"); return; }
      await supabase.from("movements").insert({
        type: "receipt", code, batch_no: finalBatch, to_location: String(zone), qty, note,
        po_number: poNumber, vendor, posting_date: postingDate || null, row_id: inserted.id,
        created_by: getUserName(),
      });
    }
    await fetchAll();
  }

  async function doMove(type, { rowId, code, toProject, qty, note, opId }) {
    const src = rows.find((r) => r.id === rowId);
    if (!src) return;
    const newQty = round2(Number(src.quantity) - qty);
    const { error } = await supabase.from("stock_rows").update({
      quantity: newQty,
      total_stock_value: round2(newQty * (src.unit_price || 0)),
    }).eq("id", rowId);
    if (error) { showToast("Failed: " + error.message, "err"); return; }
    await supabase.from("movements").insert({
      type, code, batch_no: src.batch, from_zone: src.storage_location,
      to_location: type === "transfer" ? toProject : null, qty, note, row_id: rowId, op_id: opId || null,
      created_by: getUserName(),
    });
  }

  async function deleteMovement(movementId) {
    const m = movements.find((x) => x.id === movementId);
    if (!m) return;
    if (m.row_id) {
      const row = rows.find((r) => r.id === m.row_id);
      if (row) {
        const delta = m.type === "receipt" ? -m.qty : m.qty;
        const newQty = round2(Number(row.quantity) + delta);
        await supabase.from("stock_rows").update({
          quantity: newQty,
          total_stock_value: round2(newQty * (row.unit_price || 0)),
        }).eq("id", row.id);
      }
    }
    await supabase.from("movements").delete().eq("id", movementId);
    showToast("Entry deleted and stock reversed");
    await fetchAll();
  }

  // ---------- Picking list mutations ----------
  async function createDraftOp(type, lines, toProject, forecastId) {
    const { data: plData } = await supabase.rpc("next_pl_number");
    const plNumber = plData || `PL/${pendingOps.length + 1}`;
    const pickLines = lines.map((l) => {
      const row = rows.find((r) => r.id === l.rowId);
      return {
        rowId: l.rowId, code: l.code, desc: row?.description || l.code, batch: row?.batch || "—",
        zone: row?.storage_location, bin: row?.bin_location || null, packingSize: row?.packing_size || null,
        expiry: row?.expiry_date || null, category: row?.material_category || null,
        qty: l.qty, unit: row?.unit || "", picked: false, note: l.note,
      };
    });
    pickLines.sort((a, b) => {
      if (a.zone !== b.zone) return a.zone - b.zone;
      return (a.bin || "ZZZZ").localeCompare(b.bin || "ZZZZ");
    });
    const projectName = toProject ? PROJECT_SITES.find((p) => p.id === toProject)?.name : null;
    const { data: inserted, error } = await supabase.from("picking_lists").insert({
      pl_number: plNumber, type, project: projectName, to_project: toProject, status: "picking",
      lines: pickLines,
      forecast_id: forecastId || null,
      created_by: getUserName(),
      transfer_note: {
        numberOfPallets: "", containerRef: "", tempStockOk: "Yes", tempDry: "", tempFrozen: "", tempChilled: "",
        visualPackaging: "Yes", visualLabeling: "Yes", visualPest: "NO", visualForeignObjects: "NO",
        comments: "", acceptedOrRejected: "Accepted", pickedBy: getUserName(), checkedBy: "",
      },
    }).select().single();
    if (error) { showToast("Couldn't create picking list: " + error.message, "err"); return null; }
    await fetchAll();
    return inserted;
  }

  async function toggleLinePicked(opId, idx) {
    const op = pendingOps.find((o) => o.id === opId);
    if (!op) return;
    const newLines = op.lines.map((l, i) => i === idx ? { ...l, picked: !l.picked } : l);
    setPendingOps((prev) => prev.map((o) => o.id === opId ? { ...o, lines: newLines } : o));
    const { error } = await supabase.from("picking_lists").update({ lines: newLines }).eq("id", opId);
    if (error) { showToast("Couldn't save: " + error.message, "err"); await fetchAll(); }
  }

  async function updateOpLines(opId, newLines) {
    setPendingOps((prev) => prev.map((o) => o.id === opId ? { ...o, lines: newLines } : o));
    const { error } = await supabase.from("picking_lists").update({ lines: newLines }).eq("id", opId);
    if (error) { showToast("Couldn't save: " + error.message, "err"); await fetchAll(); }
  }

  async function updateTransferNote(opId, patch) {
    const op = pendingOps.find((o) => o.id === opId);
    if (!op) return;
    await supabase.from("picking_lists").update({ transfer_note: { ...op.transfer_note, ...patch } }).eq("id", opId);
    setPendingOps((prev) => prev.map((o) => o.id === opId ? { ...o, transfer_note: { ...o.transfer_note, ...patch } } : o));
  }

  async function markSent(opId) {
    setPendingOps((prev) => prev.map((o) => o.id === opId ? { ...o, status: "sent", sent_at: new Date().toISOString() } : o));
    const { error } = await supabase.from("picking_lists").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", opId);
    if (error) { showToast("Couldn't save: " + error.message, "err"); await fetchAll(); }
  }

  async function confirmOp(opId) {
    const op = pendingOps.find((o) => o.id === opId);
    if (!op) return;
    for (const l of op.lines) {
      await doMove(op.type, { rowId: l.rowId, code: l.code, toProject: op.to_project, qty: l.qty, note: l.note, opId: op.id });
    }
    await supabase.from("picking_lists").update({ status: "confirmed", confirmed_at: new Date().toISOString() }).eq("id", opId);
    showToast("Posted — stock updated");
    await fetchAll();
  }

  async function deletePendingOp(opId) {
    const op = pendingOps.find((o) => o.id === opId);
    if (!op) return;
    if (op.status === "confirmed") {
      for (const l of op.lines) {
        const row = rows.find((r) => r.id === l.rowId);
        if (row) {
          const newQty = round2(Number(row.quantity) + l.qty);
          await supabase.from("stock_rows").update({
            quantity: newQty,
            total_stock_value: round2(newQty * (row.unit_price || 0)),
          }).eq("id", row.id);
        }
      }
      await supabase.from("movements").delete().eq("op_id", opId);
    }
    await supabase.from("picking_lists").delete().eq("id", opId);
    showToast(op.status === "confirmed" ? "Picking list deleted and stock reversed" : "Picking list deleted");
    await fetchAll();
  }

  // ---------- Import & danger zone ----------
  async function handleImportFile(file, XLSX) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array", cellDates: false, bookImages: false, bookFiles: false, bookVBA: false, cellStyles: false });
        const sheetName = wb.SheetNames.includes("SOH") ? "SOH" : wb.SheetNames[0];
        const json = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null, raw: true });
        const now = Date.now();
        const dbRows = json.map((r, idx) => ({ ...excelRowToDbRow(r), received_at: now + idx }));

        await supabase.from("stock_rows").delete().neq("id", "00000000-0000-0000-0000-000000000000");
        for (let i = 0; i < dbRows.length; i += 500) {
          const chunk = dbRows.slice(i, i + 500);
          const { error } = await supabase.from("stock_rows").insert(chunk);
          if (error) { showToast(`Import failed on rows ${i + 1}-${i + chunk.length}: ${error.message}`, "err"); return; }
        }

        // Upsert the catalog too — de-duplicated by code, keeping the item
        // master up to date without ever deleting entries (a code missing
        // from this file might still exist elsewhere, e.g. added by hand).
        const masterByCode = new Map();
        for (const r of json) masterByCode.set(r["CODE"], excelRowToMasterRow(r));
        const masterRows = [...masterByCode.values()];
        for (let i = 0; i < masterRows.length; i += 500) {
          const chunk = masterRows.slice(i, i + 500);
          const { error: masterError } = await supabase.from("item_master").upsert(chunk, { onConflict: "code" });
          if (masterError) { showToast(`Stock imported, but code master update failed on items ${i + 1}-${i + chunk.length}: ${masterError.message}`, "err"); break; }
        }

        await supabase.from("last_import").upsert({
          id: 1, file_name: file.name, row_count: dbRows.length,
          imported_at: new Date().toISOString(), snapshot: dbRows,
        });
        showToast(`Imported ${dbRows.length} rows from ${file.name}`);
        setTab("dashboard");
        await fetchAll();
      } catch (err) {
        showToast("Import failed: " + (err && err.message ? err.message : String(err)), "err");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function resetStockToBaseline() {
    if (!lastImport?.snapshot) { showToast("No imported file on record to reset to.", "err"); return; }
    await supabase.from("stock_rows").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("stock_rows").insert(lastImport.snapshot);
    showToast("Stock reset to the originally imported file");
    await fetchAll();
  }
  async function clearMovementLog() {
    await supabase.from("movements").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    showToast("Movement log cleared");
    await fetchAll();
  }
  async function clearPickingLists() {
    await supabase.from("picking_lists").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    showToast("All picking lists cleared");
    await fetchAll();
  }
  async function wipeEverything() {
    await resetStockToBaseline();
    await clearMovementLog();
    await clearPickingLists();
    showToast("Everything reset to the originally imported file");
  }

  // ---------- Reorder thresholds (keyed on SKU — the real consolidation key) ----------
  async function setReorderThreshold(sku, threshold) {
    const value = threshold === "" ? null : Number(threshold);
    setItemSettings((prev) => {
      const existing = prev.find((s) => s.sku === sku);
      if (existing) return prev.map((s) => s.sku === sku ? { ...s, reorder_threshold: value } : s);
      return [...prev, { sku, reorder_threshold: value }];
    });
    const { error } = await supabase.from("item_settings").upsert({
      sku, reorder_threshold: value, updated_at: new Date().toISOString(),
    });
    if (error) { showToast("Couldn't save threshold: " + error.message, "err"); await fetchAll(); }
  }

  // ---------- Stock take (physical count reconciliation) ----------
  async function createStockTake(zoneFilter) {
    const { data: stNum } = await supabase.rpc("next_st_number");
    const stNumber = stNum || `ST/${stockTakes.length + 1}`;
    const byCode = new Map();
    for (const r of rows) {
      if (zoneFilter && r.storage_location !== zoneFilter) continue;
      if (r.quantity <= 0) continue;
      if (!byCode.has(r.code)) byCode.set(r.code, { code: r.code, desc: r.description, unit: r.unit, systemQty: 0, batches: [] });
      const entry = byCode.get(r.code);
      entry.systemQty = round2(entry.systemQty + Number(r.quantity));
      entry.batches.push({ rowId: r.id, batch: r.batch, zone: r.storage_location, qty: Number(r.quantity) });
    }
    const lines = [...byCode.values()].map((e) => ({ ...e, countedQty: "" }));
    const { data: inserted, error } = await supabase.from("stock_takes").insert({
      st_number: stNumber, zone_filter: zoneFilter || null, status: "counting", lines, created_by: getUserName(),
    }).select().single();
    if (error) { showToast("Couldn't start stock take: " + error.message, "err"); return null; }
    await fetchAll();
    return inserted;
  }

  async function updateStockTakeLine(stId, code, countedQty) {
    const st = stockTakes.find((s) => s.id === stId);
    if (!st) return;
    const newLines = st.lines.map((l) => l.code === code ? { ...l, countedQty } : l);
    await supabase.from("stock_takes").update({ lines: newLines }).eq("id", stId);
    setStockTakes((prev) => prev.map((s) => s.id === stId ? { ...s, lines: newLines } : s));
  }

  async function completeStockTake(stId) {
    const st = stockTakes.find((s) => s.id === stId);
    if (!st) return;
    for (const line of st.lines) {
      if (line.countedQty === "" || line.countedQty == null) continue;
      const variance = round2(Number(line.countedQty) - line.systemQty);
      if (variance === 0) continue;
      // Apply the variance to the batch with the largest quantity for this
      // item — simplest reasonable place to book an adjustment against.
      const target = [...line.batches].sort((a, b) => b.qty - a.qty)[0];
      if (!target) continue;
      const row = rows.find((r) => r.id === target.rowId);
      if (!row) continue;
      const newQty = round2(Number(row.quantity) + variance);
      await supabase.from("stock_rows").update({
        quantity: newQty, total_stock_value: round2(newQty * (row.unit_price || 0)),
      }).eq("id", row.id);
      await supabase.from("movements").insert({
        type: "adjustment", code: line.code, batch_no: target.batch, from_zone: target.zone,
        qty: Math.abs(variance),
        note: `Stock take ${st.st_number}: system ${line.systemQty}, counted ${line.countedQty} (${variance > 0 ? "+" : ""}${variance})`,
        row_id: row.id, created_by: getUserName(),
      });
    }
    await supabase.from("stock_takes").update({
      status: "completed", completed_by: getUserName(), completed_at: new Date().toISOString(),
    }).eq("id", stId);
    showToast("Stock take completed — variances posted as adjustments");
    await fetchAll();
  }

  async function deleteStockTake(stId) {
    await supabase.from("stock_takes").delete().eq("id", stId);
    await fetchAll();
  }

  // ---------- Forecast (monthly site requests -> SKU consolidation -> purchase list) ----------
  async function createForecast(periodLabel) {
    const { data: fcNum } = await supabase.rpc("next_fc_number");
    const fcNumber = fcNum || `FC/${forecasts.length + 1}`;
    const { data: inserted, error } = await supabase.from("forecasts").insert({
      fc_number: fcNumber, period_label: periodLabel, status: "collecting", submissions: [], created_by: getUserName(),
    }).select().single();
    if (error) { showToast("Couldn't start forecast: " + error.message, "err"); return null; }
    await fetchAll();
    return inserted;
  }

  async function addForecastSubmission(fcId, submission) {
    const fc = forecasts.find((f) => f.id === fcId);
    if (!fc) return;
    const newSubmissions = [...fc.submissions, submission];
    await supabase.from("forecasts").update({ submissions: newSubmissions }).eq("id", fcId);
    showToast(`Added ${submission.project}'s submission`);
    await fetchAll();
  }

  async function completeForecast(fcId) {
    await supabase.from("forecasts").update({ status: "completed" }).eq("id", fcId);
    showToast("Forecast marked completed");
    await fetchAll();
  }

  async function updateForecastManualField(fcId, code, patch) {
    const fc = forecasts.find((f) => f.id === fcId);
    if (!fc) return;
    const newManual = { ...fc.manual_fields, [code]: { ...(fc.manual_fields[code] || {}), ...patch } };
    await supabase.from("forecasts").update({ manual_fields: newManual }).eq("id", fcId);
    setForecasts((prev) => prev.map((f) => f.id === fcId ? { ...f, manual_fields: newManual } : f));
  }

  async function deleteForecast(fcId) {
    await supabase.from("forecasts").delete().eq("id", fcId);
    await fetchAll();
  }

  // ---------- Pending-to-transfer adjustments (opening balances the app can't see itself) ----------
  async function addPendingAdjustments(records) {
    if (!records || records.length === 0) return;
    for (let i = 0; i < records.length; i += 500) {
      const chunk = records.slice(i, i + 500);
      const { error } = await supabase.from("pending_adjustments").insert(chunk);
      if (error) { showToast(`Couldn't save pending adjustments ${i + 1}-${i + chunk.length}: ${error.message}`, "err"); return; }
    }
  }

  async function deletePendingAdjustment(id) {
    await supabase.from("pending_adjustments").delete().eq("id", id);
    await fetchAll();
  }

  // ---------- Full forecast import — one Excel file populates requests,
  // pending-to-transfer, consumption, and transit all at once ----------
  async function importFullForecast({ periodLabel, submissions, pendingRecords, consumptionRecords: consRecords, manualFieldsByCode }) {
    const { data: plData } = await supabase.rpc("next_fc_number");
    const fcNumber = plData || `FC/${forecasts.length + 1}`;
    const { data: inserted, error } = await supabase.from("forecasts").insert({
      fc_number: fcNumber, period_label: periodLabel, status: "collecting",
      submissions, manual_fields: manualFieldsByCode, created_by: getUserName(),
    }).select().single();
    if (error) { showToast("Import failed: " + error.message, "err"); return null; }

    if (pendingRecords.length > 0) await addPendingAdjustments(pendingRecords);
    if (consRecords.length > 0) {
      for (let i = 0; i < consRecords.length; i += 500) {
        const chunk = consRecords.slice(i, i + 500);
        const { error: cErr } = await supabase.from("consumption_records").insert(chunk);
        if (cErr) { showToast(`Forecast imported, but consumption data failed: ${cErr.message}`, "err"); break; }
      }
    }
    showToast(`Imported ${fcNumber}: ${submissions.length} site${submissions.length === 1 ? "" : "s"}, ${pendingRecords.length} pending records, ${consRecords.length} consumption records`);
    await fetchAll();
    return inserted;
  }

  // ---------- Code Master (item catalog) ----------
  async function addMasterItem(item) {
    if (!item.code || !item.sku) { showToast("Code and SKU are both required.", "err"); return; }
    const existing = itemMaster.find((m) => m.code === item.code);
    if (existing) { showToast(`Code ${item.code} already exists in the catalog.`, "err"); return; }
    const { error } = await supabase.from("item_master").insert({
      code: item.code, sku: item.sku, description: item.description || null, unit: item.unit || null,
      material_category: item.category || null, primary_packing: item.primaryPacking || null,
      packing_size: item.packingSize || null, brand: item.brand || null, origin: item.origin || null,
      remarks: item.remarks || null,
      default_storage_location: item.defaultZone ? Number(item.defaultZone) : null,
    });
    if (error) { showToast("Couldn't add item: " + error.message, "err"); return; }
    showToast(`Added ${item.code} to the code master`);
    await fetchAll();
  }

  async function updateMasterItem(code, patch) {
    setItemMaster((prev) => prev.map((m) => m.code === code ? { ...m, ...patch, updated_at: new Date().toISOString() } : m));
    const { error } = await supabase.from("item_master").update({ ...patch, updated_at: new Date().toISOString() }).eq("code", code);
    if (error) { showToast("Couldn't update item: " + error.message, "err"); await fetchAll(); }
  }

  // ---------- Consumption data (periodic SAP export, referenced in Forecast) ----------
  async function uploadConsumption(records) {
    if (!records || records.length === 0) { showToast("No consumption records to add.", "err"); return; }
    for (let i = 0; i < records.length; i += 500) {
      const chunk = records.slice(i, i + 500);
      const { error } = await supabase.from("consumption_records").insert(chunk);
      if (error) { showToast(`Upload failed on records ${i + 1}-${i + chunk.length}: ${error.message}`, "err"); return; }
    }
    showToast(`Added ${records.length} consumption records`);
    await fetchAll();
  }

  const items = itemMaster.map((m) => ({
    CODE: m.code, DESCRIPTION: m.description, "SKU's": m.sku, Unit: m.unit,
    "Material Category": m.material_category, "Storage Location": m.default_storage_location,
  }));

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#F6F4EF" }}>Loading…</div>;
  }

  return (
    <div className="w-full min-h-screen flex" style={{ backgroundColor: "#F6F4EF", fontFamily: "'Inter', sans-serif", color: "#23241F" }}>
      <div className="w-[220px] shrink-0 flex flex-col py-6 px-3 gap-1" style={{ backgroundColor: "#23241F" }}>
        <div className="px-3 mb-6">
          <div className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Oswald', sans-serif", color: "#F6F4EF" }}>STOCKYARD</div>
          <div className="text-[11px] tracking-widest uppercase mt-0.5" style={{ color: "#8A8A7E" }}>Central Warehouse 1117</div>
        </div>
        {NAV.map((n) => {
          const Icon = n.icon;
          const active = tab === n.id;
          return (
            <button key={n.id} onClick={() => setTab(n.id)} className="flex items-center gap-3 rounded-md px-3 py-2.5 text-[14px] font-medium transition-colors text-left" style={{ backgroundColor: active ? "#E8A93B" : "transparent", color: active ? "#23241F" : "#D8D6CB" }}>
              <Icon size={17} strokeWidth={2} />
              {n.label}
            </button>
          );
        })}
        <div className="mt-auto px-3 pt-4 text-[11px]" style={{ borderTop: "1px solid #3A3A32", color: "#6B6A62" }}>
          {items.length} items · {rows.length} rows
        </div>
      </div>

      <div className="flex-1 p-8 overflow-auto relative">
        <Toast toast={toast} />
        {rows.length === 0 && tab !== "import" && (
          <div className="mb-6 rounded-lg p-4 flex items-center gap-3" style={{ backgroundColor: "#FBF1DF", border: "1px solid #EFD7A0" }}>
            <TriangleAlert size={18} style={{ color: "#B07A1F" }} />
            <div className="text-sm" style={{ color: "#7A5417" }}>No stock loaded yet — go to <strong>Import Stock File</strong> to upload your Stock.xlsx.</div>
          </div>
        )}

        {tab === "dashboard" && <Dashboard rows={rows} movements={movements} itemSettings={itemSettings} />}
        {tab === "codemaster" && <CodeMaster itemMaster={itemMaster} rows={rows} onAdd={addMasterItem} onUpdate={updateMasterItem} />}
        {tab === "receipt" && <LineItemGrid type="receipt" items={items} rows={rows} showToastErr={(m) => showToast(m, "err")} onPost={async (lines) => { for (const l of lines) await doReceipt(l); showToast(`Goods receipt posted: ${lines.length} line${lines.length > 1 ? "s" : ""}`); await fetchAll(); }} />}
        {tab === "transfer" && <LineItemGrid type="transfer" items={items} rows={rows} showToastErr={(m) => showToast(m, "err")} onPost={async (lines) => { await createDraftOp("transfer", lines, lines[0]?.toProject); showToast("Picking list created — stock stays put until you confirm"); setTab("picking"); }} />}
        {tab === "issue" && <LineItemGrid type="issue" items={items} rows={rows} showToastErr={(m) => showToast(m, "err")} onPost={async (lines) => { await createDraftOp("issue", lines, null); showToast("Picking list created — stock stays put until you confirm"); setTab("picking"); }} />}
        {tab === "stock" && <StockBrowser items={items} rows={rows} itemSettings={itemSettings} onSetThreshold={setReorderThreshold} />}
        {tab === "bbd" && <BBDReport rows={rows} />}
        {tab === "picking" && (
          <PickingLists
            pendingOps={pendingOps} items={items} rows={rows} forecasts={forecasts}
            onToggleLine={toggleLinePicked} onMarkSent={markSent} onConfirm={confirmOp}
            onCreateDraft={createDraftOp} onDelete={deletePendingOp}
            onUpdateLines={updateOpLines} onUpdateTransferNote={updateTransferNote}
          />
        )}
        {tab === "stocktake" && (
          <StockTake
            stockTakes={stockTakes}
            onCreate={createStockTake}
            onUpdateLine={updateStockTakeLine}
            onComplete={completeStockTake}
            onDelete={deleteStockTake}
          />
        )}
        {tab === "forecast" && (
          <Forecast
            forecasts={forecasts}
            items={items}
            itemMaster={itemMaster}
            rows={rows}
            pendingOps={pendingOps}
            consumptionRecords={consumptionRecords}
            pendingAdjustments={pendingAdjustments}
            onCreate={createForecast}
            onAddSubmission={addForecastSubmission}
            onComplete={completeForecast}
            onDelete={deleteForecast}
            onUploadConsumption={uploadConsumption}
            onUpdateManualField={updateForecastManualField}
            onImportFull={importFullForecast}
            onDeletePendingAdjustment={deletePendingAdjustment}
          />
        )}
        {tab === "log" && <MovementLog movements={movements} items={items} onDelete={deleteMovement} />}
        {tab === "import" && (
          <ImportPanel
            onFile={handleImportFile} lastImport={lastImport} rowCount={rows.length}
            movementCount={movements.length} pickingCount={pendingOps.length}
            onResetStock={resetStockToBaseline} onClearMovements={clearMovementLog}
            onClearPicking={clearPickingLists} onWipeAll={wipeEverything}
          />
        )}
      </div>
    </div>
  );
}
