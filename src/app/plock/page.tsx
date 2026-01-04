"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Category, OrderRow } from "@/lib/types";
import { getCategories, getOrderRows, rpcClearPicked, rpcPicked } from "@/lib/data";

function generatePickListPDF(rows: OrderRow[], categories: Category[], fileName: string = "plocklista.html") {
  // Create minimal print-optimized HTML
  const html = `
    <!DOCTYPE html>
    <html lang="sv">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Plocklista</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 10px; font-size: 12px; }
        h1 { font-size: 18px; margin: 0 0 10px 0; page-break-after: avoid; }
        h2 { font-size: 13px; margin: 8px 0 4px 0; page-break-after: avoid; background: #f0f0f0; padding: 4px; }
        .item { display: flex; gap: 8px; padding: 4px 2px; border-bottom: 1px dotted #ddd; page-break-inside: avoid; align-items: flex-start; }
        .qty { width: 30px; text-align: center; font-weight: bold; flex-shrink: 0; }
        .img { width: 40px; height: 50px; flex-shrink: 0; background: #f5f5f5; border-radius: 4px; overflow: hidden; }
        .img img { width: 100%; height: 100%; object-fit: cover; }
        .name { flex: 1; }
        .extra { font-size: 10px; color: #666; }
        @media print {
          body { margin: 0; padding: 5px; }
          h1 { font-size: 16px; }
          h2 { font-size: 12px; margin: 6px 0 2px 0; }
          .item { padding: 2px; }
          .img { width: 35px; height: 45px; }
        }
      </style>
    </head>
    <body>
      <h1>📋 Plocklista</h1>
      <p style="margin: 0 0 10px 0; font-size: 11px;">Genererad: ${new Date().toLocaleString("sv-SE")}</p>
  `;

  // Group by category
  const groupByCat = (list: OrderRow[]) => {
    const map = new Map<string, OrderRow[]>();
    for (const r of list) {
      if (!map.has(r.category_id)) map.set(r.category_id, []);
      map.get(r.category_id)!.push(r);
    }
    for (const [_k, arr] of map) arr.sort((a, b) => (a.product?.name ?? "").localeCompare((b.product?.name ?? ""), "sv"));
    return map;
  };

  const todoList = rows.filter((r) => !r.is_picked && r.qty > 0);
  const todoGroups = groupByCat(todoList);

  let html2 = html;
  for (const [catId, items] of todoGroups) {
    const catName = categories.find((c) => c.id === catId)?.name ?? "Okänd";
    html2 += `<h2>${catName} (${items.length})</h2>`;
    for (const r of items) {
      const brand = (r.product as any)?.brand ? ` - ${(r.product as any).brand}` : "";
      const weight = (r.product as any)?.weight ? ` [${(r.product as any).weight}]` : "";
      const imgHtml = r.product?.image_url ? `<div class="img"><img src="${r.product.image_url}" alt="Produktbild" loading="lazy" /></div>` : '<div class="img"></div>';
      html2 += `
        <div class="item">
          ${imgHtml}
          <div class="qty">☐ ${r.qty}</div>
          <div class="name">
            ${r.product?.name ?? "Okänd"}${brand}${weight}
            <div class="extra">EAN: ${r.ean}</div>
          </div>
        </div>
      `;
    }
  }

  html2 += `
    </body>
    </html>
  `;

  return html2;
}

function downloadPDF(html: string, fileName: string = "plocklista.html") {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function printPickList(rows: OrderRow[], categories: Category[]) {
  const html = generatePickListPDF(rows, categories);
  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
    w.print();
  }
}

export default function PlockPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [me, setMe] = useState<string>("");
  const [mailOpen, setMailOpen] = useState(false);
  const [mailTo, setMailTo] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function refresh() {
    const [cats, ord] = await Promise.all([getCategories(), getOrderRows()]);
    setCategories(cats);
    setRows(ord);
  }

  useEffect(() => {
    refresh();
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.email ?? "okänd"));
    
    // Load favorites from localStorage
    const saved = localStorage.getItem("plock_favorites");
    if (saved) setFavorites(JSON.parse(saved));

    const ch = supabase
      .channel("plock_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => refresh())
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const { todo, picked } = useMemo(() => {
    const t = rows.filter((r) => !r.is_picked && r.qty > 0);
    const p = rows.filter((r) => r.is_picked && r.qty > 0);
    return { todo: t, picked: p };
  }, [rows]);

  const groupByCat = (list: OrderRow[]) => {
    const map = new Map<string, OrderRow[]>();
    for (const r of list) {
      if (!map.has(r.category_id)) map.set(r.category_id, []);
      map.get(r.category_id)!.push(r);
    }
    for (const [_k, arr] of map) arr.sort((a, b) => (a.product?.name ?? "").localeCompare((b.product?.name ?? ""), "sv"));
    return map;
  };

  const todoGroups = useMemo(() => groupByCat(todo), [todo]);
  const pickedGroups = useMemo(() => groupByCat(picked), [picked]);

  async function toggle(ean: string, isPicked: boolean) {
    await rpcPicked(ean, isPicked, me);
    await refresh();
  }

  async function clearPicked() {
    const n = await rpcClearPicked();
    alert(`Rensade ${n} plockade rader`);
    await refresh();
  }

  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? "Okänd kategori";

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "clamp(16px, 4vw, 24px)", minHeight: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "clamp(12px, 3vw, 20px)", marginBottom: "clamp(20px, 5vw, 30px)", paddingBottom: "clamp(12px, 3vw, 16px)", borderBottom: "2px solid #f0f0f0", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <h1 style={{ margin: 0, marginBottom: "4px" }}>✅ Liatorp – Plocklista</h1>
          <p style={{ color: "#666", fontSize: "clamp(0.85em, 2vw, 0.95em)", margin: 0 }}>Markera produkter när de är plockade</p>
        </div>
        <div style={{ display: "flex", gap: "clamp(8px, 2vw, 12px)" }}>
          <button 
            onClick={() => setSettingsOpen(true)}
            style={{ 
              padding: "10px 16px", 
              background: "#f0f0f0", 
              color: "#333", 
              border: "none",
              borderRadius: 8, 
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.2s",
              whiteSpace: "nowrap",
              minHeight: "44px",
              display: "flex",
              alignItems: "center",
              fontSize: "clamp(0.85em, 2vw, 0.95em)"
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#e0e0e0")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#f0f0f0")}
          >
            ⚙️ Inställningar
          </button>
          <Link 
            href="/" 
            style={{ 
              padding: "10px 16px", 
              background: "#f0f0f0", 
              color: "#333", 
              borderRadius: 8, 
              textDecoration: "none",
              fontWeight: 500,
              transition: "all 0.2s",
              whiteSpace: "nowrap",
              minHeight: "44px",
              display: "flex",
              alignItems: "center",
              fontSize: "clamp(0.85em, 2vw, 0.95em)"
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#e0e0e0")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#f0f0f0")}
          >
            ← Tillbaka
          </Link>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: "clamp(12px, 3vw, 12px)", flexWrap: "wrap", background: "#f9f9f9", padding: "clamp(12px, 3vw, 16px)", borderRadius: 12, marginBottom: "clamp(16px, 4vw, 24px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#666", fontSize: "clamp(0.8em, 1.5vw, 0.9em)" }}>Inloggad:</span>
          <span style={{ fontWeight: 600, color: "#E4002B", fontSize: "clamp(0.9em, 2vw, 1em)" }}>{me}</span>
        </div>
        <button onClick={clearPicked} style={{ padding: "clamp(10px, 2vw, 12px) clamp(14px, 2vw, 20px)", fontSize: "clamp(0.85em, 2vw, 0.95em)", flex: "1 1 auto", minWidth: "120px" }}>
          🗑️ Rensa plockade
        </button>
        <button onClick={() => printPickList(todo, categories)} style={{ padding: "clamp(10px, 2vw, 12px) clamp(14px, 2vw, 20px)", fontSize: "clamp(0.85em, 2vw, 0.95em)", flex: "1 1 auto", minWidth: "120px" }}>
          🖨️ Skriv ut
        </button>
        <button onClick={() => setMailOpen(true)} style={{ padding: "clamp(10px, 2vw, 12px) clamp(14px, 2vw, 20px)", fontSize: "clamp(0.85em, 2vw, 0.95em)", flex: "1 1 auto", minWidth: "120px" }}>
          📧 Maila
        </button>
      </div>

      <div style={{ marginBottom: "clamp(16px, 4vw, 24px)" }}>
        <h2 style={{ marginBottom: "clamp(12px, 3vw, 16px)", display: "flex", alignItems: "center", gap: 8 }}>
          📋 Att plocka <span style={{ background: "#E4002B", color: "white", borderRadius: 20, padding: "4px 12px", fontSize: "clamp(0.7em, 1.5vw, 0.8em)", fontWeight: 700 }}>{todo.length}</span>
        </h2>
        {todo.length === 0 ? (
          <div style={{ background: "#f9f9f9", padding: "clamp(16px, 4vw, 24px)", borderRadius: 12, textAlign: "center", color: "#999" }}>
            <p style={{ fontSize: "clamp(0.9em, 2vw, 1.1em)" }}>✨ Inget att plocka just nu</p>
          </div>
        ) : (
          <>
            {[...todoGroups.entries()].map(([catId, items]) => (
              <div key={catId} style={{ marginBottom: "clamp(16px, 3vw, 20px)" }}>
                <h3 style={{ marginBottom: "clamp(8px, 2vw, 10px)", color: "#E4002B", fontSize: "clamp(0.95em, 2vw, 1.1em)" }}>{catName(catId)} ({items.length})</h3>
                <div style={{ display: "grid", gap: "clamp(8px, 2vw, 10px)" }}>
                  {items.map((r) => (
                    <PlockRow key={r.id} row={r} onToggle={(v) => toggle(r.ean, v)} toned={false} />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {picked.length > 0 && (
        <div style={{ marginTop: "clamp(16px, 4vw, 24px)" }}>
          <h2 style={{ marginBottom: "clamp(12px, 3vw, 16px)", opacity: 0.7 }}>
            ✓ Plockat
          </h2>
          {[...pickedGroups.entries()].map(([catId, items]) => (
            <div key={catId} style={{ marginBottom: "clamp(16px, 3vw, 20px)", opacity: 0.65 }}>
              <h3 style={{ marginBottom: "clamp(8px, 2vw, 10px)", fontSize: "clamp(0.95em, 2vw, 1.1em)" }}>{catName(catId)}</h3>
              <div style={{ display: "grid", gap: "clamp(8px, 2vw, 10px)" }}>
                {items.map((r) => (
                  <PlockRow key={r.id} row={r} onToggle={(v) => toggle(r.ean, v)} toned={true} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mail Popup */}
      {mailOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "grid", placeItems: "center", padding: 16, zIndex: 50 }}>
          <div style={{ width: "100%", maxWidth: 450, background: "#fff", borderRadius: 14, padding: 24, boxShadow: "0 10px 40px rgba(0,0,0,0.15)" }}>
            <h2 style={{ marginTop: 0, marginBottom: 16 }}>📧 Skicka plocklista</h2>
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>E-postadress:</label>
              <input
                value={mailTo}
                onChange={(e) => setMailTo(e.target.value)}
                placeholder="exempel@mail.com"
                type="email"
                style={{ width: "100%", padding: 10, borderRadius: 6, border: "2px solid #ddd", fontSize: "0.95em", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>Visa favoriter först:</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 200, overflowY: "auto" }}>
                {categories.map((cat) => (
                  <label key={cat.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={favorites.includes(cat.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const updated = [...favorites, cat.id];
                          setFavorites(updated);
                          localStorage.setItem("plock_favorites", JSON.stringify(updated));
                        } else {
                          const updated = favorites.filter((id) => id !== cat.id);
                          setFavorites(updated);
                          localStorage.setItem("plock_favorites", JSON.stringify(updated));
                        }
                      }}
                    />
                    {cat.name}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => {
                  if (!mailTo.trim()) return alert("Skriv en e-postadress");
                  // Generate HTML with filtered favorites
                  let filteredRows = todo;
                  if (favorites.length > 0) {
                    const favRows = todo.filter((r) => favorites.includes(r.category_id));
                    const otherRows = todo.filter((r) => !favorites.includes(r.category_id));
                    filteredRows = [...favRows, ...otherRows];
                  }
                  const html = generatePickListPDF(filteredRows, categories);
                  const subject = `Plocklista - ${new Date().toLocaleString("sv-SE")}`;
                  const body = `Se bifogad HTML-fil för plocklistan.`;
                  // Open default mail client with link
                  window.location.href = `mailto:${mailTo}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                  setMailOpen(false);
                  setMailTo("");
                }}
                style={{ flex: 1, padding: 12, fontSize: "1em", fontWeight: 600, background: "#4CAF50", color: "white", border: "none", borderRadius: 8, cursor: "pointer" }}
              >
                Skicka
              </button>
              <button
                onClick={() => setMailOpen(false)}
                style={{ flex: 1, padding: 12, fontSize: "1em", fontWeight: 600, background: "#999", color: "white", border: "none", borderRadius: 8, cursor: "pointer" }}
              >
                Avbryt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {settingsOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "grid", placeItems: "center", padding: 16, zIndex: 50 }}>
          <div style={{ width: "100%", maxWidth: 450, background: "#fff", borderRadius: 14, padding: 24, boxShadow: "0 10px 40px rgba(0,0,0,0.15)" }}>
            <h2 style={{ marginTop: 0, marginBottom: 16 }}>⚙️ Inställningar</h2>
            
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: "1.05em" }}>Favorit-kategorier</h3>
              <p style={{ color: "#666", fontSize: "0.9em", marginBottom: 12 }}>Välj vilka kategorier som ska visas först på plocklistor:</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 200, overflowY: "auto" }}>
                {categories.map((cat) => (
                  <label key={cat.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "8px", background: "#f5f5f5", borderRadius: 6 }}>
                    <input
                      type="checkbox"
                      checked={favorites.includes(cat.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const updated = [...favorites, cat.id];
                          setFavorites(updated);
                          localStorage.setItem("plock_favorites", JSON.stringify(updated));
                        } else {
                          const updated = favorites.filter((id) => id !== cat.id);
                          setFavorites(updated);
                          localStorage.setItem("plock_favorites", JSON.stringify(updated));
                        }
                      }}
                      style={{ cursor: "pointer" }}
                    />
                    <span style={{ fontWeight: 500 }}>{cat.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={() => setSettingsOpen(false)}
              style={{ width: "100%", padding: 12, fontSize: "1em", fontWeight: 600, background: "#666", color: "white", border: "none", borderRadius: 8, cursor: "pointer" }}
            >
              Stäng inställningar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PlockRow({ row, onToggle, toned }: { row: OrderRow; onToggle: (v: boolean) => void; toned: boolean }) {
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  return (
    <>
      <label
        style={{
          border: toned ? "2px solid #e0e0e0" : "2px solid #E4002B",
          borderRadius: 12,
          padding: "clamp(12px, 3vw, 14px)",
          display: "flex",
          gap: "clamp(12px, 3vw, 14px)",
          alignItems: "flex-start",
          textDecoration: toned ? "line-through" : "none",
          opacity: toned ? 0.5 : 1,
          background: toned ? "#f5f5f5" : "#fafafa",
          transition: "all 0.2s",
          cursor: "pointer",
          flexWrap: "wrap"
        }}
      >
        <input type="checkbox" checked={row.is_picked} onChange={(e) => onToggle(e.target.checked)} style={{ transform: "scale(1.4)", cursor: "pointer", accentColor: "#E4002B", minWidth: "24px", marginTop: "2px" }} />
        
        {(row.product as any)?.image_url && (
          <div style={{ flex: "0 0 auto", marginRight: "4px" }}>
            <img 
              src={(row.product as any).image_url} 
              alt={row.product?.name}
              style={{ width: "100px", height: "130px", objectFit: "contain", borderRadius: 6, background: "white", cursor: "pointer", transition: "all 0.2s" }}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setExpandedImage(row.product?.image_url || null);
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLImageElement).style.boxShadow = "0 4px 12px rgba(228, 0, 43, 0.3)";
                (e.target as HTMLImageElement).style.transform = "scale(1.05)";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLImageElement).style.boxShadow = "none";
                (e.target as HTMLImageElement).style.transform = "scale(1)";
              }}
            />
          </div>
        )}
      
      <div style={{ flex: "1 1 200px", minWidth: "150px" }}>
        <div style={{ fontSize: "clamp(1em, 2vw, 1.1em)", fontWeight: 600, color: toned ? "#999" : "#222" }}>{row.product?.name ?? "Okänd artikel"}</div>
        {(row.product as any)?.brand && (
          <div style={{ color: toned ? "#999" : "#666", fontSize: "clamp(0.8em, 1.5vw, 0.85em)", marginBottom: 4 }}>Märke: {(row.product as any).brand}</div>
        )}
        {(row.product as any)?.weight && (
          <div style={{ color: "#000", fontSize: "clamp(0.85em, 1.5vw, 0.95em)", fontWeight: 700, marginBottom: 4 }}>{(row.product as any).weight}</div>
        )}
        <div style={{ opacity: 0.6, fontSize: "clamp(0.8em, 1.5vw, 0.85em)", color: "#666", marginBottom: 4 }}>EAN: {row.ean}</div>
        {row.created_at && (
          <div style={{ opacity: 0.4, fontSize: "clamp(0.75em, 1.3vw, 0.8em)", color: "#666" }}>
            Tillagd: {new Date(row.created_at).toLocaleString("sv-SE")}
          </div>
        )}
        {row.picked_at && (
          <div style={{ opacity: 0.4, fontSize: "clamp(0.75em, 1.3vw, 0.8em)", color: "#666" }}>
            Plockat: {new Date(row.picked_at).toLocaleString("sv-SE")}
          </div>
        )}
      </div>
      <div style={{ fontSize: "clamp(1.2em, 3vw, 1.4em)", fontWeight: 700, color: "#E4002B", minWidth: 50, textAlign: "right", flex: "0 0 auto" }}>×{row.qty}</div>
      </label>

      {expandedImage && (
        <div 
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "clamp(16px, 4vw, 24px)",
            cursor: "pointer"
          }}
          onClick={() => setExpandedImage(null)}
        >
          <div 
            style={{
              position: "relative",
              background: "white",
              borderRadius: 12,
              padding: "clamp(16px, 4vw, 24px)",
              maxWidth: "90vw",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              cursor: "default"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={(row.product as any).image_url}
              alt={row.product?.name}
              style={{
                maxWidth: "100%",
                maxHeight: "70vh",
                objectFit: "contain",
                borderRadius: 8,
                marginBottom: "clamp(16px, 3vw, 20px)"
              }}
            />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "clamp(1.1em, 2.5vw, 1.3em)", fontWeight: 600, marginBottom: 8 }}>{row.product?.name}</div>
              <div style={{ fontSize: "clamp(0.85em, 1.5vw, 0.95em)", color: "#666", marginBottom: 8 }}>EAN: {row.ean}</div>
              <button
                onClick={() => setExpandedImage(null)}
                style={{
                  padding: "clamp(10px, 2vw, 12px) clamp(20px, 3vw, 28px)",
                  background: "#E4002B",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "clamp(0.85em, 1.5vw, 0.95em)",
                  transition: "all 0.2s"
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "#C40024";
                  (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.05)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "#E4002B";
                  (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
                }}
              >
                Stäng
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
