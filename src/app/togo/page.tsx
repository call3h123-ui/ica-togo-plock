"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Category, OrderRow } from "@/lib/types";
import { createProduct, ensureProduct, getCategories, getOrderRows, rpcIncrement, rpcSetQty, updateProduct, createCategory, updateCategory, deleteCategory } from "@/lib/data";
import { BrowserMultiFormatReader } from "@zxing/browser";
import * as XLSX from "xlsx";

function cleanEan(raw: string) {
  return raw.trim().replace(/\s/g, "");
}

function compressImage(dataUrl: string, callback: (compressedDataUrl: string) => void) {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    let width = img.width;
    let height = img.height;

    // Resize to max 600px width while maintaining aspect ratio
    const maxWidth = 600;
    if (width > maxWidth) {
      height = Math.round((height * maxWidth) / width);
      width = maxWidth;
    }

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(img, 0, 0, width, height);
    }

    // Compress to JPEG with quality 0.75
    canvas.toBlob(
      (blob) => {
        if (blob) {
          const reader = new FileReader();
          reader.onload = (e) => {
            callback(e.target?.result as string);
          };
          reader.readAsDataURL(blob);
        }
      },
      "image/jpeg",
      0.75
    );
  };
  img.src = dataUrl;
}

export default function ToGoPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [scanValue, setScanValue] = useState("");
  const [storeId, setStoreId] = useState<string>("");
  const [storeName, setStoreName] = useState<string>("");
  const scanRef = useRef<HTMLInputElement | null>(null);
  const modalScanRef = useRef<HTMLInputElement | null>(null);

  // Ny artikel modal
  const [modalOpen, setModalOpen] = useState(false);
  const [newEan, setNewEan] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [newImage, setNewImage] = useState("");
  const [newWeight, setNewWeight] = useState<string | null>(null);
  const [newQty, setNewQty] = useState<number>(1);
  const [newCat, setNewCat] = useState<string>("");
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  // Bild från kamera för produkt
  const [cameraForImage, setCameraForImage] = useState(false);
  const imageCameraRef = useRef<HTMLVideoElement | null>(null);
  const imageCameraStreamRef = useRef<MediaStream | null>(null);

  // Settings modal
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState("");
  const [newCatName, setNewCatName] = useState("");

  // Redigeringsfält visibility
  const [expandedEditFields, setExpandedEditFields] = useState(false);

  // Banner för redan befintlig vara
  const [alreadyExistsBanner, setAlreadyExistsBanner] = useState(false);

  // Excel import
  const [excelLoading, setExcelLoading] = useState(false);

  const defaultCatId = useMemo(() => categories[0]?.id ?? "", [categories]);

  async function handleExcelUpload(file: File) {
    try {
      setExcelLoading(true);
      
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = e.target?.result;
          if (!data) return;
          
          const workbook = XLSX.read(data, { type: "array" });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          
          console.log("Total rows in Excel:", rows.length);
          console.log("All rows:", rows);
          
          let createdCount = 0;
          let updatedCount = 0;
          
          // Gå igenom varje rad (börja från rad 0)
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const ean = String(row[0] || "").trim();
            const productName = String(row[1] || "").trim();
            const brand = String(row[2] || "").trim();
            const weight = String(row[3] || "").trim();
            const categoryName = String(row[4] || "").trim();
            
            console.log(`Row ${i}:`, { ean, productName, brand, weight, categoryName });
            
            // Hoppa över tomma rader
            if (!ean || !productName) {
              console.log(`Row ${i} skipped - EAN: "${ean}", ProductName: "${productName}"`);
              continue;
            }
            
            // Hitta kategori-ID baserat på namn
            let categoryId = defaultCatId;
            if (categoryName) {
              const cat = categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
              if (cat) {
                categoryId = cat.id;
              }
            }
            
            try {
              const existing = await ensureProduct(ean);
              
              // Försök hämta bild från API om produkten är ny
              let imageUrl: string | null = null;
              try {
                const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${ean}.json`);
                if (response.ok) {
                  const data = await response.json();
                  if (data.product) {
                    if (data.product.image_url) {
                      imageUrl = data.product.image_url;
                    } else if (data.product.image_front_url) {
                      imageUrl = data.product.image_front_url;
                    }
                  }
                }
              } catch (err) {
                console.log(`Kunde inte hämta bild för ${ean}:`, err);
              }
              
              if (!existing) {
                await createProduct({
                  ean,
                  name: productName,
                  brand: brand || null,
                  default_category_id: categoryId,
                  weight: weight || null,
                  image_url: imageUrl
                });
                createdCount++;
                console.log(`Created: ${productName}${imageUrl ? ' (with image)' : ''}`);
              } else {
                // Vid uppdatering: behåll befintlig bild om den finns, annars använd ny från API
                const updateObj: any = {
                  name: productName,
                  brand: brand || null,
                  weight: weight || null,
                  default_category_id: categoryId
                };
                // Lägg till bild från API endast om produkten inte redan har en
                if (imageUrl && !existing.image_url) {
                  updateObj.image_url = imageUrl;
                }
                await updateProduct(ean, updateObj);
                updatedCount++;
                console.log(`Updated: ${productName}`);
              }
            } catch (err) {
              console.error(`Kunde inte importera produkt ${productName}:`, err);
            }
          }
          
          const message = `Importerat ${createdCount} nya och uppdaterat ${updatedCount} befintliga produkter`;
          alert(message);
          console.log(message);
          
          await refresh();
          setExcelLoading(false);
        } catch (err) {
          console.error("Excel parsing error:", err);
          alert("Fel vid läsning av Excel-filen");
          setExcelLoading(false);
        }
      };
      
      reader.readAsArrayBuffer(file);
    } catch (err) {
      console.error("Excel upload error:", err);
      alert("Fel vid uppladdning av Excel-filen");
      setExcelLoading(false);
    }
  }

  async function refresh() {
    const [cats, ord] = await Promise.all([
      getCategories(storeId),
      getOrderRows(storeId)
    ]);
    setCategories(cats);
    setRows(ord);
    // Återhämta sparad kategori från localStorage eller använd första
    const savedCatId = typeof window !== "undefined" ? localStorage.getItem("lastSelectedCatId") : null;
    if (!newCat && savedCatId && cats.find(c => c.id === savedCatId)) {
      setNewCat(savedCatId);
    } else if (!newCat && cats[0]) {
      setNewCat(cats[0].id);
    }
  }

  useEffect(() => {
    // Read storeId from localStorage
    if (typeof window !== "undefined") {
      const savedStoreId = localStorage.getItem("storeId");
      const savedStoreName = localStorage.getItem("storeName");
      if (savedStoreId) {
        setStoreId(savedStoreId);
        setStoreName(savedStoreName || "");
      }
    }
  }, []);

  // Separate effect for refresh that depends on storeId
  useEffect(() => {
    if (!storeId) return;

    refresh();
    scanRef.current?.focus();

    const ch = supabase
      .channel("order_items_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, () => refresh())
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // Start camera for image capture when cameraForImage is true
  useEffect(() => {
    if (cameraForImage && imageCameraRef.current) {
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: "environment" } })
        .then((stream) => {
          if (imageCameraRef.current) {
            imageCameraRef.current.srcObject = stream;
            imageCameraStreamRef.current = stream;
          }
        })
        .catch((err) => {
          console.error("Error accessing camera:", err);
          alert("Kunde inte komma åt kameran");
          setCameraForImage(false);
        });
    } else {
      // Stop camera stream when not in use
      if (imageCameraStreamRef.current) {
        imageCameraStreamRef.current.getTracks().forEach((track) => track.stop());
        imageCameraStreamRef.current = null;
      }
    }

    return () => {
      if (imageCameraStreamRef.current) {
        imageCameraStreamRef.current.getTracks().forEach((track) => track.stop());
        imageCameraStreamRef.current = null;
      }
    };
  }, [cameraForImage]);

  // Auto-restart camera when modal opens (after scanning a product)
  useEffect(() => {
  }, []);

  async function handleScanSubmit(value: string) {
    try {
      const ean = cleanEan(value);
      console.log("handleScanSubmit -> ean:", ean);
      if (!ean) {
        return;
      }

      // Rensa scanValue direkt - användaren kan scanna nästa vara direkt
      setScanValue("");

      // If modal is open (modalOpen is true), save the current product first
      if (modalOpen && newEan && newName.trim() && newBrand.trim() && newWeight) {
        console.log("handleScanSubmit -> modal open, saving current product first");
        const catId = newCat || defaultCatId;
        // Check if product exists
        const existing = await ensureProduct(newEan);
        if (!existing) {
          // New product - create it
          await createProduct({ ean: newEan, name: newName.trim(), brand: newBrand.trim() || null, default_category_id: catId, image_url: newImage || null, weight: newWeight ?? null });
        } else {
          // Product exists - update it
          await updateProduct(newEan, { name: newName.trim(), brand: newBrand.trim() || null, image_url: newImage || null, weight: newWeight ?? null });
        }
        await rpcIncrement(newEan, catId, newQty, storeId);
        await refresh();
        // Reset modal fields for new product
        setNewName("");
        setNewBrand("");
        setNewImage("");
        setNewQty(1);
        setNewWeight(null);
      }

      const product = await ensureProduct(ean);
      console.log("handleScanSubmit -> ensureProduct returned:", product);
      if (!product) {
        console.log("handleScanSubmit -> product not found, opening modal");
        setModalOpen(true);
        setExpandedEditFields(false);
        setNewEan(ean);
        setNewName("");
        setNewBrand("");
        setNewImage("");
        setNewCat(defaultCatId);

        // Focus modalScanRef when modal opens (for next scan)
        setTimeout(() => {
          modalScanRef.current?.focus();
        }, 100);

        // Försök hämta produktinfo från extern API (Open Food Facts)
        setLoadingProduct(true);
        try {
          const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${ean}.json`);
          if (response.ok) {
            const data = await response.json();
            if (data.product) {
              const prod = data.product;
              setNewName(prod.product_name || prod.name || "");
              setNewBrand(prod.brands || "");
              if (prod.image_url) {
                setNewImage(prod.image_url);
              } else if (prod.image_front_url) {
                setNewImage(prod.image_front_url);
              }
              // fetch weight/quantity if available
              const w = prod.quantity || prod.serving_size || prod.nutriments?.serving_size || null;
              setNewWeight(w ?? null);
            }
          }
        } catch (e) {
          console.log("Kunde inte hämta produktinfo från API:", e);
        }
        setLoadingProduct(false);
        return;
      }

      // Product exists - check if already in order
      const existingOrder = rows.find(r => r.ean === ean && r.qty > 0);
      
      if (existingOrder) {
        // Vara redan i orderlistan - visa banner och fyll in med befintlig data
        console.log("handleScanSubmit -> product already in order, showing banner");
        setAlreadyExistsBanner(true);
        setTimeout(() => setAlreadyExistsBanner(false), 4000);
        
        setModalOpen(true);
        setExpandedEditFields(false);
        setNewEan(ean);
        setNewName(existingOrder.product?.name || "");
        setNewBrand(existingOrder.product?.brand || "");
        setNewImage(existingOrder.product?.image_url || "");
        setNewWeight((existingOrder.product as any)?.weight || null);
        setNewCat(existingOrder.category_id);
        setNewQty(existingOrder.qty); // Använd befintlig mängd
      } else {
        // Ny vara - normalt flöde
        console.log("handleScanSubmit -> product exists, opening modal with existing product");
        setModalOpen(true);
        setExpandedEditFields(false);
        setNewEan(ean);
        setNewName(product.name);
        setNewBrand(product.brand || "");
        setNewImage(product.image_url || "");
        setNewWeight((product as any).weight || null);
        setNewCat(product.default_category_id || defaultCatId);
        setNewQty(1); // Reset quantity for new addition
      }

      scanRef.current?.focus();
    } catch (err) {
      console.error("handleScanSubmit error:", err);
      let msg = "Okänt fel vid sökning";
      if (err instanceof Error) msg = err.message;
      else if (err && typeof err === "object") {
        // @ts-ignore
        msg = err.message || JSON.stringify(err);
      }
      alert("Fel vid sökning: " + msg);
    }
  }

  async function saveNewProduct() {
    if (!newName.trim()) return alert("Skriv produktnamn.");
    if (!newBrand.trim()) return alert("Skriv varumärke.");
    if (!newWeight) return alert("Skriv vikt.");

    const catId = newCat || defaultCatId;
    try {
      // If there's an EAN, handle as usual (with product lookup/creation)
      if (newEan) {
        // Check if product already exists in order
        const existingOrderItem = rows.find(r => r.ean === newEan && r.qty > 0);
        
        // Check if product already exists in database
        const existing = await ensureProduct(newEan);
        if (!existing) {
          // New product - create it
          await createProduct({ ean: newEan, name: newName.trim(), brand: newBrand.trim() || null, default_category_id: catId, image_url: newImage || null, weight: newWeight ?? null });
        } else {
          // Product exists - update it with new details (including category)
          await updateProduct(newEan, { name: newName.trim(), brand: newBrand.trim() || null, image_url: newImage || null, weight: newWeight ?? null, default_category_id: catId });
        }
        
        // If product already in order, update quantity instead of incrementing
        if (existingOrderItem) {
          await rpcSetQty(newEan, catId, newQty, storeId);
        } else {
          // New to order - increment quantity
          await rpcIncrement(newEan, catId, newQty, storeId);
        }
      } else {
        // No EAN - create a manual order item without product database entry
        // This allows adding items without scanning
        const { data, error } = await supabase
          .from("order_items")
          .insert([
            {
              ean: "MANUAL_" + Date.now(), // Temporary unique identifier
              qty: newQty,
              category_id: catId,
              is_picked: false,
              created_at: new Date().toISOString()
            }
          ])
          .select();

        if (error) throw error;

        // If insert succeeded, we need to create or get a product for display
        // Create a product with special "MANUAL_" prefix
        const manualEan = "MANUAL_" + Date.now();
        await createProduct({ 
          ean: manualEan, 
          name: newName.trim(), 
          brand: newBrand.trim() || null, 
          default_category_id: catId, 
          image_url: newImage || null, 
          weight: newWeight ?? null 
        });
      }

      await refresh();

      // Reset form but keep modal open for next scan
      setNewEan(null);
      setNewName("");
      setNewBrand("");
      setNewImage("");
      setNewQty(1);
      setNewWeight(null);
      setScanValue(""); // Töm EAN-fältet
      
      setTimeout(() => {
        scanRef.current?.focus();
      }, 100);
    } catch (err) {
      console.error("saveNewProduct error:", err);
      let msg = "Fel vid sparande";
      if (err instanceof Error) msg = err.message;
      else if (err && typeof err === "object") {
        // try common fields
        // @ts-ignore
        if (typeof err.message === "string") msg = err.message;
        else {
          try {
            msg = JSON.stringify(err);
          } catch (e) {
            msg = String(err);
          }
        }
      } else {
        msg = String(err);
      }
      alert(msg);
    }
  }



  const unpicked = rows.filter((r) => !r.is_picked && r.qty > 0);
  const picked = rows.filter((r) => r.is_picked && r.qty > 0);

  // Group unpicked items by category
  const groupedByCategory = useMemo(() => {
    const groups: { [key: string]: OrderRow[] } = {};
    unpicked.forEach((row) => {
      const catId = row.category_id || "uncategorized";
      if (!groups[catId]) groups[catId] = [];
      groups[catId].push(row);
    });
    return groups;
  }, [unpicked]);

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "clamp(16px, 4vw, 24px)", minHeight: "100vh" }}>
      <style>{`
        @keyframes fadeOut {
          0% { opacity: 1; }
          80% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "clamp(12px, 3vw, 20px)", marginBottom: "clamp(20px, 5vw, 30px)", paddingBottom: "clamp(12px, 3vw, 16px)", borderBottom: "2px solid #f0f0f0", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <h1 style={{ margin: 0, marginBottom: "4px", fontSize: "clamp(1.2em, 3vw, 1.5em)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>🛒 ToGo – Skanna & beställ</h1>
          <p style={{ color: "#666", fontSize: "clamp(0.85em, 2vw, 0.95em)", margin: 0 }}>Lägg till produkter genom att scanna eller skriva EAN</p>
        </div>
        <div style={{ display: "flex", gap: "clamp(8px, 2vw, 12px)", flexWrap: "wrap", justifyContent: "flex-end" }}>
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

      <div style={{ display: modalOpen ? "none" : "flex", gap: "clamp(8px, 2vw, 12px)", flexWrap: "wrap", alignItems: "center", background: "#f9f9f9", padding: "clamp(12px, 3vw, 16px)", borderRadius: 12, marginBottom: "clamp(16px, 4vw, 24px)", position: "relative", zIndex: 100 }}>
        <input
          ref={scanRef}
          value={scanValue}
          onChange={(e) => {
            // Only allow numeric characters
            const numericValue = e.target.value.replace(/[^0-9]/g, "");
            setScanValue(numericValue);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              // use current input value to avoid stale closure
              handleScanSubmit((e.target as HTMLInputElement).value);
            }
          }}
          placeholder="Skanna EAN här"
          type="tel"
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]*"
          style={{ flex: "1 1 280px", minWidth: "200px", padding: "clamp(10px, 2vw, 12px)", fontSize: "clamp(14px, 2vw, 16px)", borderRadius: 8, border: "2px solid #E4002B" }}
        />

        <button 
          onClick={() => {
            setModalOpen(true);
            setNewEan(null);
            setNewName("");
            setNewBrand("");
            setNewImage("");
            setNewWeight(null);
            setNewQty(1);
            setExpandedEditFields(true); // Öppna redigering automatiskt
            const savedCatId = typeof window !== "undefined" ? localStorage.getItem("lastSelectedCatId") : null;
            setNewCat(savedCatId && categories.find(c => c.id === savedCatId) ? savedCatId : (categories[0]?.id || ""));
            // Fokusera på modalScanRef när modal öppnas
            setTimeout(() => {
              modalScanRef.current?.focus();
            }, 100);
          }}
          style={{ padding: "clamp(10px, 2vw, 12px) clamp(12px, 2vw, 16px)", fontSize: "clamp(0.85em, 2vw, 0.9em)", whiteSpace: "nowrap", flex: "1 1 auto", minWidth: "100px", background: "#E4002B", color: "white", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          ➕ Manuell artikel
        </button>
      </div>

      <div style={{ marginBottom: "clamp(16px, 4vw, 24px)" }}>
        <h2 style={{ marginBottom: "clamp(12px, 3vw, 16px)" }}>Tillagda artiklar ({unpicked.length})</h2>
        {unpicked.length === 0 ? (
          <div style={{ background: "#f9f9f9", padding: "clamp(16px, 4vw, 24px)", borderRadius: 12, textAlign: "center", color: "#999" }}>
            <p style={{ fontSize: "clamp(0.9em, 2vw, 1em)" }}>Ingen artikel tillagd än. Börja skanna!</p>
          </div>
        ) : (
          <div>
            {Object.entries(groupedByCategory).map(([catId, items]) => {
              const category = categories.find((c) => c.id === catId);
              const catName = category?.name || "Okategoriserad";
              return (
                <div key={catId} style={{ marginBottom: "clamp(16px, 4vw, 24px)" }}>
                  <h3 style={{ marginBottom: "clamp(8px, 2vw, 12px)", fontSize: "clamp(0.95em, 2vw, 1.05em)", color: "#666" }}>{catName}</h3>
                  <div style={{ display: "grid", gap: "clamp(8px, 2vw, 12px)" }}>
                    {items.map((r) => (
                      <RowCard key={r.id} row={r} categories={categories} onChanged={refresh} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {picked.length > 0 && (
        <div style={{ marginTop: "clamp(20px, 5vw, 32px)" }}>
          <h2 style={{ marginBottom: "clamp(12px, 3vw, 16px)", opacity: 0.7 }}>
            ✓ Plockat
          </h2>
          <div style={{ display: "grid", gap: "clamp(8px, 2vw, 10px)" }}>
            {picked.map((r) => (
              <div key={r.id} style={{ border: "2px solid #e0e0e0", borderRadius: 12, padding: "clamp(12px, 3vw, 16px)", display: "flex", gap: "clamp(12px, 3vw, 16px)", alignItems: "flex-start", background: "#f5f5f5", opacity: 0.65, textDecoration: "line-through", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 200px", minWidth: "150px" }}>
                  <div style={{ fontSize: "clamp(1em, 2vw, 1.1em)", fontWeight: 600, color: "#999", marginBottom: 6 }}>{r.product?.name ?? "Okänd artikel"}</div>
                  <div style={{ opacity: 0.5, fontSize: "clamp(0.8em, 1.5vw, 0.85em)", color: "#666", marginBottom: 4 }}>EAN: {r.ean}</div>
                  {r.created_at && (
                    <div style={{ opacity: 0.4, fontSize: "clamp(0.75em, 1.3vw, 0.8em)", color: "#666" }}>
                      Tillagd: {new Date(r.created_at).toLocaleString("sv-SE")}
                    </div>
                  )}
                  {r.picked_at && (
                    <div style={{ opacity: 0.4, fontSize: "clamp(0.75em, 1.3vw, 0.8em)", color: "#666" }}>
                      Plockat: {new Date(r.picked_at).toLocaleString("sv-SE")}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 auto", justifyContent: "flex-end" }}>
                  <div style={{ fontSize: "clamp(1.2em, 3vw, 1.4em)", fontWeight: 700, color: "#999", minWidth: 50, textAlign: "right" }}>×{r.qty}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {modalOpen && (
        <div style={modalStyle.overlay}>
          <div style={modalStyle.card}>
            {/* Banner för redan befintlig vara - innanför modal */}
            {alreadyExistsBanner && (
              <div style={{
                background: "#fff3cd",
                border: "1px solid #ffc107",
                color: "#856404",
                padding: "12px 16px",
                borderRadius: 8,
                marginBottom: 16,
                fontSize: "0.95em",
                fontWeight: 500,
                animation: "fadeOut 2s ease-in-out forwards"
              }}>
                ℹ️ Denna vara är redan lagd i plocklistan
              </div>
            )}
            
            {/* Liten EAN-info och kamera innanför modalen */}
            <div style={{ display: "flex", gap: "clamp(8px, 2vw, 12px)", flexWrap: "wrap", alignItems: "center", marginBottom: 12, background: "#f9f9f9", padding: "clamp(8px, 2vw, 12px)", borderRadius: 8 }}>
            <input
              ref={modalScanRef}
              value={scanValue}
              onChange={(e) => {
                // Only allow numeric characters
                const numericValue = e.target.value.replace(/[^0-9]/g, "");
                setScanValue(numericValue);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  handleScanSubmit((e.target as HTMLInputElement).value);
                }
              }}
              placeholder="Scanna ny vara"
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              pattern="[0-9]*"
              style={{ flex: "1 1 150px", minWidth: "120px", padding: "clamp(6px, 1.5vw, 8px)", fontSize: "clamp(12px, 1.5vw, 14px)", borderRadius: 6, border: "1px solid #E4002B" }}
            />
            <button
              onClick={() => {
                setModalOpen(false);
                scanRef.current?.focus();
              }}
              style={{ padding: "6px 10px", background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#666", minWidth: "auto", lineHeight: 1 }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#E4002B")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#666")}
              title="Stäng"
            >
              ✕
            </button>
          </div>

            {loadingProduct && (
              <div style={{ background: "#e8f4f8", padding: 12, borderRadius: 8, marginBottom: 12, textAlign: "center", color: "#0066cc", fontSize: "0.9em" }}>
                Hämtar produktinfo...
              </div>
            )}

            {/* Produktinfo-rad: Bild + Info + Edit button */}
            <div style={{ display: "flex", gap: "clamp(12px, 3vw, 16px)", marginBottom: 16, alignItems: "flex-start" }}>
              {/* Liten produktbild */}
              {newImage && (
                <div style={{ flex: "0 0 auto" }}>
                  <img 
                    src={newImage} 
                    alt="Produktbild" 
                    style={{ width: 80, height: 100, objectFit: "contain", borderRadius: 6, background: "#f5f5f5", cursor: "pointer", transition: "all 0.2s" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setExpandedImage(newImage);
                    }}
                  />
                </div>
              )}
              
              {/* Produktinfo: namn, märke, vikt, kategori */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "clamp(1.05em, 2vw, 1.15em)", fontWeight: 700, color: "#222", marginBottom: 4, wordBreak: "break-word" }}>
                  {newName || "Produktnamn"}
                </div>
                {newBrand && (
                  <div style={{ fontSize: "clamp(0.85em, 1.5vw, 0.9em)", color: "#666", marginBottom: 4 }}>
                    {newBrand}
                  </div>
                )}
                {newWeight && (
                  <div style={{ fontSize: "clamp(0.9em, 1.5vw, 0.95em)", fontWeight: 600, color: "#E4002B", marginBottom: 4 }}>
                    {newWeight}
                  </div>
                )}
                {newCat && categories.find(c => c.id === newCat) && (
                  <div style={{ fontSize: "clamp(0.85em, 1.5vw, 0.9em)", color: "#0066cc", marginBottom: 4, fontWeight: 500 }}>
                    Kategori: {categories.find(c => c.id === newCat)?.name}
                  </div>
                )}
              </div>

              {/* Kugghjul-knapp för att visa/dölja redigeringsfält */}
              <button
                type="button"
                onClick={() => setExpandedEditFields(!expandedEditFields)}
                style={{
                  flex: "0 0 auto",
                  background: expandedEditFields ? "#E4002B" : "#ddd",
                  color: expandedEditFields ? "white" : "#333",
                  border: "none",
                  borderRadius: 6,
                  padding: "8px 10px",
                  cursor: "pointer",
                  fontSize: "1.2em",
                  transition: "all 0.2s"
                }}
                title="Redigera produktinfo"
              >
                ⚙️
              </button>
            </div>

            {/* Antalet - prominent */}
            <div style={{ marginBottom: 16, background: "#fff3e0", padding: "clamp(12px, 2vw, 16px)", borderRadius: 10, border: "2px solid #E4002B" }}>
              <label style={{ display: "block", marginBottom: 8, fontWeight: 600, color: "#333", fontSize: "clamp(0.95em, 1.5vw, 1em)" }}>Antal</label>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button 
                    onClick={() => setNewQty(Math.max(1, (newQty || 1) - 1))} 
                    style={{ padding: "8px 12px", fontSize: 18, minWidth: 44, minHeight: 44, fontWeight: 700, background: "#E4002B", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}
                  >−</button>
                  <input value={newQty} onChange={(e) => setNewQty(Math.max(1, Number(e.target.value || 1)))} style={{ width: 60, textAlign: "center", padding: 10, fontSize: 18, fontWeight: 700, border: "2px solid #E4002B", borderRadius: 6 }} inputMode="numeric" />
                  <button 
                    onClick={() => setNewQty((newQty || 1) + 1)} 
                    style={{ padding: "8px 12px", fontSize: 18, minWidth: 44, minHeight: 44, fontWeight: 700, background: "#E4002B", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}
                  >+</button>
                </div>
                <div style={{ fontSize: "1.8em", fontWeight: 700, color: "#E4002B" }}>×{newQty}</div>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                {[3, 4, 5, 6].map((num) => (
                  <button
                    key={num}
                    onClick={() => setNewQty(num)}
                    style={{
                      flex: 1,
                      padding: "6px",
                      fontSize: "0.85em",
                      fontWeight: 600,
                      background: newQty === num ? "#E4002B" : "#ddd",
                      color: newQty === num ? "white" : "#333",
                      border: "none",
                      borderRadius: 4,
                      cursor: "pointer"
                    }}
                  >
                    {num}
                  </button>
                ))}
              </div>

              {/* Spara & lägg till button under antalet */}
              <button 
                onClick={() => {
                  saveNewProduct();
                  // Fokusera på modalScanRef efter spara för att kunna scanna nästa produkt
                  setTimeout(() => {
                    modalScanRef.current?.focus();
                  }, 100);
                }}
                style={{ width: "100%", padding: 14, marginTop: 12, fontSize: 16, fontWeight: 600, background: "#E4002B", color: "white", border: "none", borderRadius: 8, cursor: "pointer" }}
              >
                ✓ Lägg till
              </button>
            </div>

            {/* Redigerbara fält - döljas bakom kugghjul-knapp */}
            {expandedEditFields && (
              <div style={{ marginBottom: 12, background: "#f9f9f9", padding: 12, borderRadius: 8, border: "1px solid #e0e0e0" }}>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", marginBottom: 4, fontWeight: 600, color: "#333", fontSize: "0.9em" }}>Produktnamn *</label>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="T.ex. Mellanmjölk 1L"
                    style={{ width: "100%", padding: 8, fontSize: 14, borderRadius: 6, border: "1px solid #ddd" }}
                  />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", marginBottom: 4, fontWeight: 600, color: "#333", fontSize: "0.9em" }}>Varumärke</label>
                  <input
                    value={newBrand}
                    onChange={(e) => setNewBrand(e.target.value)}
                    placeholder="T.ex. Arla"
                    style={{ width: "100%", padding: 8, fontSize: 14, borderRadius: 6, border: "1px solid #ddd" }}
                  />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", marginBottom: 4, fontWeight: 600, color: "#333", fontSize: "0.9em" }}>Vikt</label>
                  <input
                    value={newWeight ?? ""}
                    onChange={(e) => setNewWeight(e.target.value ? e.target.value : null)}
                    placeholder="T.ex. 1kg"
                    style={{ width: "100%", padding: 8, fontSize: 14, borderRadius: 6, border: "1px solid #ddd" }}
                  />
                </div>

                {/* Bild-upload */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", marginBottom: 6, fontWeight: 600, color: "#333", fontSize: "0.9em" }}>Bild</label>
                  {!cameraForImage ? (
                    <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (evt) => {
                              const dataUrl = evt.target?.result as string;
                              compressImage(dataUrl, (compressed) => {
                                setNewImage(compressed);
                              });
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                        style={{ padding: 8, fontSize: 13, borderRadius: 6, border: "1px solid #ddd" }}
                      />
                      <button
                        type="button"
                        onClick={() => setCameraForImage(true)}
                        style={{
                          padding: "8px 12px",
                          background: "#E4002B",
                          color: "white",
                          border: "none",
                          borderRadius: 6,
                          fontWeight: 600,
                          cursor: "pointer",
                          fontSize: "0.9em"
                        }}
                      >
                        📷 Ta kort
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
                      <video
                        ref={imageCameraRef}
                        style={{
                          width: "100%",
                          maxWidth: "350px",
                          borderRadius: 8,
                          border: "2px solid #E4002B",
                          marginBottom: 8
                        }}
                        autoPlay
                        playsInline
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          onClick={async () => {
                            const video = imageCameraRef.current;
                            if (video) {
                              const canvas = document.createElement("canvas");
                              canvas.width = video.videoWidth;
                              canvas.height = video.videoHeight;
                              const ctx = canvas.getContext("2d");
                              if (ctx) {
                                ctx.drawImage(video, 0, 0);
                                const dataUrl = canvas.toDataURL("image/jpeg");
                                compressImage(dataUrl, (compressed) => {
                                  setNewImage(compressed);
                                  setCameraForImage(false);
                                  if (imageCameraStreamRef.current) {
                                    imageCameraStreamRef.current.getTracks().forEach((track) => track.stop());
                                    imageCameraStreamRef.current = null;
                                  }
                                });
                              }
                            }
                          }}
                          style={{
                            flex: 1,
                            padding: "8px",
                            background: "#4CAF50",
                            color: "white",
                            border: "none",
                            borderRadius: 6,
                            fontWeight: 600,
                            cursor: "pointer",
                            fontSize: "0.9em"
                          }}
                        >
                          ✓ Ta kort
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCameraForImage(false);
                            if (imageCameraStreamRef.current) {
                              imageCameraStreamRef.current.getTracks().forEach((track) => track.stop());
                              imageCameraStreamRef.current = null;
                            }
                          }}
                          style={{
                            flex: 1,
                            padding: "8px",
                            background: "#999",
                            color: "white",
                            border: "none",
                            borderRadius: 6,
                            fontWeight: 600,
                            cursor: "pointer",
                            fontSize: "0.9em"
                          }}
                        >
                          ✕ Avbryt
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Kategori */}
                <div style={{ marginBottom: 0 }}>
                  <label style={{ display: "block", marginBottom: 6, fontWeight: 600, color: "#333", fontSize: "0.9em" }}>Kategori</label>
                  <select value={newCat} onChange={(e) => {
                    setNewCat(e.target.value);
                    localStorage.setItem("lastSelectedCatId", e.target.value);
                  }} style={{ width: "100%", padding: 10, fontSize: 14, borderRadius: 6, border: "1px solid #ddd", background: "white" }}>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Stäng - längst ned */}
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => {
                  setModalOpen(false);
                  scanRef.current?.focus();
                }}
                style={{ padding: 14, width: "100%", background: "#E4002B", color: "white", fontWeight: 600, borderRadius: 8, border: "none", cursor: "pointer", fontSize: 16, transition: "all 0.2s" }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                ✕ Stäng
              </button>
            </div>

            <p style={{ marginTop: 14, fontSize: 13, opacity: 0.6, fontStyle: "italic" }}>
              💡 Produktinfo hämtas automatiskt från EAN-kod när möjligt
            </p>
          </div>
        </div>
      )}

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
              src={expandedImage}
              alt="Produktbild större"
              style={{
                maxWidth: "100%",
                maxHeight: "70vh",
                objectFit: "contain",
                borderRadius: 8,
                marginBottom: "clamp(16px, 3vw, 20px)"
              }}
            />
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
      )}

      {/* Settings Modal */}
      {settingsOpen && (
        <div style={modalStyle.overlay as React.CSSProperties}>
          <div style={modalStyle.card as React.CSSProperties}>
            <h2 style={{ marginTop: 0, marginBottom: 20 }}>⚙️ Allmänna inställningar</h2>

            {/* Avdelningar/Kategorier Section */}
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: "1.1em" }}>Avdelningar</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {categories.map((cat) => (
                  <div key={cat.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "12px", background: "#f5f5f5", borderRadius: 8 }}>
                    {editingCatId === cat.id ? (
                      <>
                        <input
                          value={editingCatName}
                          onChange={(e) => setEditingCatName(e.target.value)}
                          style={{ flex: 1, padding: "8px", borderRadius: 4, border: "1px solid #ddd", fontSize: "0.95em" }}
                          autoFocus
                        />
                        <button
                          onClick={async () => {
                            try {
                              await updateCategory(cat.id, editingCatName);
                              await refresh();
                              setEditingCatId(null);
                            } catch (err) {
                              alert("Kunde inte uppdatera avdelning");
                            }
                          }}
                          style={{ padding: "8px 12px", fontSize: "0.85em", background: "#4CAF50", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}
                        >
                          Spara
                        </button>
                        <button
                          onClick={() => setEditingCatId(null)}
                          style={{ padding: "8px 12px", fontSize: "0.85em", background: "#999", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}
                        >
                          Avbryt
                        </button>
                      </>
                    ) : (
                      <>
                        <span style={{ flex: 1 }}>{cat.name}</span>
                        <button
                          onClick={() => {
                            setEditingCatId(cat.id);
                            setEditingCatName(cat.name);
                          }}
                          style={{ padding: "6px 10px", fontSize: "0.8em", background: "#2196F3", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}
                        >
                          Redigera
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm(`Ta bort avdelning "${cat.name}"?`)) return;
                            try {
                              await deleteCategory(cat.id);
                              await refresh();
                            } catch (err) {
                              alert("Kunde inte ta bort avdelning");
                            }
                          }}
                          style={{ padding: "6px 10px", fontSize: "0.8em", background: "#E4002B", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}
                        >
                          Ta bort
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* Add new category */}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <input
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Ny avdelningsnamn"
                  style={{ flex: 1, padding: "10px", borderRadius: 4, border: "2px solid #E4002B", fontSize: "0.95em" }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      // Skapa kategori via onclick nedan
                    }
                  }}
                />
                <button
                  onClick={async () => {
                    if (!newCatName.trim()) return alert("Skriv avdelningsnamn");
                    try {
                      await createCategory(newCatName, storeId);
                      await refresh();
                      setNewCatName("");
                    } catch (err) {
                      alert("Kunde inte lägga till avdelning");
                    }
                  }}
                  style={{ padding: "10px 16px", fontSize: "0.85em", background: "#4CAF50", color: "white", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 500 }}
                >
                  + Lägg till
                </button>
              </div>
            </div>

            {/* Excel Import Section */}
            <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid #ddd" }}>
              <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: "1.1em" }}>Importera från Excel</h3>
              <div style={{ padding: "12px", background: "#f9f9f9", borderRadius: 8, marginBottom: 12 }}>
                <p style={{ margin: "0 0 10px 0", fontSize: "0.9em", color: "#666" }}>
                  Ladda upp en Excel-fil med följande kolumner:<br/>
                  <strong>A:</strong> EAN | <strong>B:</strong> Produktnamn | <strong>C:</strong> Varumärke | <strong>D:</strong> Vikt | <strong>E:</strong> Avdelning
                </p>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleExcelUpload(file);
                      // Rensa file input
                      (e.target as HTMLInputElement).value = "";
                    }
                  }}
                  disabled={excelLoading}
                  style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: 4,
                    border: "1px solid #ddd",
                    fontSize: "0.9em",
                    cursor: excelLoading ? "not-allowed" : "pointer",
                    opacity: excelLoading ? 0.6 : 1
                  }}
                />
                {excelLoading && (
                  <div style={{ marginTop: 8, fontSize: "0.85em", color: "#0066cc" }}>
                    ⏳ Importerar produkter...
                  </div>
                )}
              </div>
            </div>

            {/* Stäng modal */}
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

function RowCard({ row, categories, onChanged }: { row: OrderRow; categories: Category[]; onChanged: () => void }) {
  const [qty, setQty] = useState<number>(row.qty);
  const [catId, setCatId] = useState<string>(row.category_id);

  useEffect(() => {
    setQty(row.qty);
    setCatId(row.category_id);
  }, [row.qty, row.category_id]);

  async function inc(delta: number) {
    await rpcIncrement(row.ean, catId, delta);
    onChanged();
  }

  async function setExact(v: number) {
    const n = Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
    setQty(n);
    await rpcSetQty(row.ean, catId, n);
    onChanged();
  }

  async function changeCategory(newId: string) {
    setCatId(newId);
    // Update the order item's category
    await rpcSetQty(row.ean, newId, qty);
    // Also update the product's default category for future use
    await updateProduct(row.ean, { default_category_id: newId });
    onChanged();
  }

  return (
    <div style={{ border: "2px solid #e5e5e5", borderRadius: 12, padding: "clamp(12px, 3vw, 16px)", display: "flex", gap: "clamp(12px, 3vw, 16px)", alignItems: "center", background: "#fafafa", transition: "all 0.2s", flexWrap: "wrap" }}>
      {row.product?.image_url && (
        <img src={row.product.image_url} alt="Produktbild" style={{ width: "80px", height: "100px", objectFit: "cover", borderRadius: 8 }} />
      )}
      <div style={{ flex: "1 1 200px", minWidth: "150px" }}>
        <div style={{ fontSize: "clamp(1.1em, 2.2vw, 1.15em)", fontWeight: 600, color: "#222", marginBottom: 4 }}>{row.product?.name ?? "Okänd artikel"}</div>
        {(row.product as any)?.brand && (
          <div style={{ color: "#222", fontSize: "clamp(0.75em, 1.3vw, 0.8em)", marginBottom: 3 }}>{(row.product as any).brand}</div>
        )}
        { (row.product as any)?.weight && (
          <div style={{ color: "#222", fontSize: "clamp(0.75em, 1.3vw, 0.8em)", marginBottom: 4 }}>{(row.product as any).weight}</div>
        )}
        <div style={{ opacity: 0.6, fontSize: "clamp(0.8em, 1.5vw, 0.85em)", color: "#666" }}>EAN: {row.ean}</div>
      </div>

      <select value={catId} onChange={(e) => changeCategory(e.target.value)} style={{ padding: "clamp(6px, 1.5vw, 8px)", fontSize: "clamp(0.8em, 1.5vw, 0.85em)", borderRadius: 6, border: "2px solid #ddd", background: "white", flex: "1 1 150px", minWidth: "120px" }}>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <div style={{ display: "flex", gap: "clamp(6px, 1.5vw, 10px)", alignItems: "center", flex: "1 1 auto", justifyContent: "flex-end" }}>
        <button onClick={() => inc(-1)} style={{ padding: "clamp(8px, 2vw, 10px) clamp(10px, 2vw, 12px)", fontSize: "clamp(1em, 2vw, 1.2em)", minWidth: "44px", minHeight: "44px" }}>
          −
        </button>
        <input
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
          onBlur={() => setExact(qty)}
          style={{ width: "clamp(50px, 10vw, 60px)", textAlign: "center", padding: "clamp(6px, 1.5vw, 8px)", fontSize: "clamp(1em, 1.5vw, 1em)", fontWeight: 600 }}
          inputMode="numeric"
        />
        <button onClick={() => inc(+1)} style={{ padding: "clamp(8px, 2vw, 10px) clamp(10px, 2vw, 12px)", fontSize: "clamp(1em, 2vw, 1.2em)", minWidth: "44px", minHeight: "44px" }}>
          +
        </button>
        <button
          onClick={async () => {
            if (!confirm("Ta bort denna rad?")) return;
            await rpcSetQty(row.ean, catId, 0);
            onChanged();
          }}
          aria-label="Ta bort"
          title="Ta bort"
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "#C40024";
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.04)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "#E4002B";
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
          }}
          style={{ padding: "8px 10px", background: "#E4002B", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 120ms ease" }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
            <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

const modalStyle = {
  overlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "grid",
    placeItems: "center",
    padding: 16,
    zIndex: 200,
    overflowY: "auto" as const,
  },
  card: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "90vh",
    overflowY: "auto" as const,
    background: "#fff",
    borderRadius: 14,
    padding: 24,
    boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
  },
};
