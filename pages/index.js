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

  // Core initial load (only critical tables for fast boot)
  const fetchInitialData = useCallback(async () => {
    const [rowsRes, movRes, opsRes, importRes, settingsRes, imRes] = await Promise.all([
      fetchPaginated("stock_rows", (q) => q.order("received_at", { ascending: true })),
      supabase.from("movements").select("*").order("created_at", { ascending: false }).limit(100),
      fetchPaginated("picking_lists", (q) => q.order("created_at", { ascending: false })),
      supabase.from("last_import").select("*").eq("id", 1).maybeSingle(),
      fetchPaginated("item_settings"),
      fetchPaginated("item_master", (q) => q.order("description", { ascending: true })),
    ]);

    if (!rowsRes.error) setRows(rowsRes.data || []);
    if (!movRes.error) setMovements(movRes.data || []);
    if (!opsRes.error) setPendingOps(opsRes.data || []);
    if (!importRes.error) setLastImport(importRes.data);
    if (!settingsRes.error) setItemSettings(settingsRes.data || []);
    if (!imRes.error) setItemMaster(imRes.data || []);
    
    setLoading(false);
  }, [fetchPaginated]);

  // Lazy load heavy optional tables only when needed
  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  useEffect(() => {
    if (tab === "forecast" && forecasts.length === 0) {
      Promise.all([
        fetchPaginated("forecasts", (q) => q.order("created_at", { ascending: false })),
        fetchPaginated("consumption_records", (q) => q.order("uploaded_at", { ascending: false })),
        fetchPaginated("pending_adjustments", (q) => q.order("created_at", { ascending: false })),
      ]).then(([fcRes, crRes, paRes]) => {
        if (!fcRes.error) setForecasts(fcRes.data || []);
        if (!crRes.error) setConsumptionRecords(crRes.data || []);
        if (!paRes.error) setPendingAdjustments(paRes.data || []);
      });
    }
    if (tab === "stocktake" && stockTakes.length === 0) {
      fetchPaginated("stock_takes", (q) => q.order("created_at", { ascending: false })).then((res) => {
        if (!res.error) setStockTakes(res.data || []);
      });
    }
  }, [tab, forecasts.length, stockTakes.length, fetchPaginated]);

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

      setRows((prev) => prev.map((r) => r.id === existing.id ? { ...r, quantity: newQty, total_stock_value: round2(newQty * (r.unit_price || 0)) } : r));
    } else {
      const proto = itemMaster.find((m) => m.code === code) || rows.find((r) => r.code === code);
      const newRowData = {
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
      };
      const { data: inserted, error } = await supabase.from("stock_rows").insert(newRowData).select().single();
      if (error) { showToast("Receipt failed: " + error.message, "err"); return; }
      
      await supabase.from("movements").insert({
        type: "receipt", code, batch_no: finalBatch, to_location: String(zone), qty, note,
        po_number: poNumber, vendor, posting_date: postingDate || null, row_id: inserted.id,
        created_by: getUserName(),
      });

      setRows((prev) => [...prev, inserted]);
    }
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

    setRows((prev) => prev.map((r) => r.id === rowId ? { ...r, quantity: newQty, total_stock_value: round2(newQty * (r.unit_price || 0)) } : r));
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
        setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, quantity: newQty, total_stock_value: round2(newQty * (r.unit_price || 0)) } : r));
      }
    }
    await supabase.from("movements").delete().eq("id", movementId);
    setMovements((prev) => prev.filter((x) => x.id !== movementId));
    showToast("Entry deleted and stock reversed");
  }

  // ---------- CORRECTED createDraftOp (fixed syntax) ----------
  async function createDraftOp(type, lines, toProject, forecastId) {
    const { data: plData } = await supabase.rpc("next_pl_number");
    const plNumber = plData || `PL/${pendingOps.length + 1}`;
    
    const pickLines = lines.map((l) => {
      const row = rows.find((r) => r.id === l.rowId);
      return {
        rowId: l.rowId,
        code: row?.code || l.code,
        description: row?.description || '',
        batch: row?.batch || '',
        qty: l.qty,
        // Add any other fields you need (e.g., unit, expiry)
      };
    });

    // Insert a new picking list draft
    const { data: newOp, error } = await supabase
      .from("picking_lists")
      .insert({
        type,
        pl_number: plNumber,
        to_project: toProject || null,
        forecast_id: forecastId || null,
        lines: pickLines,
        status: 'draft',
        created_by: getUserName(),
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      showToast("Failed to create draft: " + error.message, "err");
      return null;
    }

    setPendingOps(prev => [newOp, ...prev]);
    return newOp;
  }

  // ---------- Render ----------
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading stockyard...</p>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (tab) {
      case "dashboard":
        return <Dashboard rows={rows} movements={movements} itemSettings={itemSettings} />;
      case "codemaster":
        return <CodeMaster itemMaster={itemMaster} setItemMaster={setItemMaster} />;
      case "receipt":
        return (
          <LineItemGrid
            rows={rows}
            itemMaster={itemMaster}
            mode="receipt"
            onReceipt={doReceipt}
            showToast={showToast}
          />
        );
      case "transfer":
        return (
          <LineItemGrid
            rows={rows}
            itemMaster={itemMaster}
            mode="transfer"
            onMove={doMove}
            showToast={showToast}
            projects={PROJECT_SITES}
          />
        );
      case "issue":
        return (
          <LineItemGrid
            rows={rows}
            itemMaster={itemMaster}
            mode="issue"
            onMove={doMove}
            showToast={showToast}
          />
        );
      case "stock":
        return <StockBrowser rows={rows} itemMaster={itemMaster} />;
      case "bbd":
        return <BBDReport rows={rows} />;
      case "picking":
        return <PickingLists rows={rows} pendingOps={pendingOps} setPendingOps={setPendingOps} onMove={doMove} showToast={showToast} />;
      case "stocktake":
        return <StockTake rows={rows} setRows={setRows} stockTakes={stockTakes} setStockTakes={setStockTakes} showToast={showToast} />;
      case "forecast":
        return <Forecast rows={rows} movements={movements} itemMaster={itemMaster} consumptionRecords={consumptionRecords} pendingAdjustments={pendingAdjustments} forecasts={forecasts} setForecasts={setForecasts} showToast={showToast} />;
      case "log":
        return <MovementLog movements={movements} rows={rows} deleteMovement={deleteMovement} />;
      case "import":
        return <ImportPanel onImportComplete={fetchInitialData} showToast={showToast} />;
      default:
        return <div>Unknown tab</div>;
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 p-4 flex-shrink-0">
        <div className="text-2xl font-bold mb-6" style={{ fontFamily: "'Oswald', sans-serif" }}>
          STOCKYARD
        </div>
        <nav className="space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`flex items-center gap-3 w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === item.id
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 overflow-y-auto">
        {renderContent()}
      </main>

      {/* Toast notifications */}
      {toast && <Toast message={toast.msg} tone={toast.tone} />}
    </div>
  );
}
