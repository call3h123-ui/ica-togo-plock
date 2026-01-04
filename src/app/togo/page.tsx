"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Category, OrderRow } from "@/lib/types";
import { createProduct, ensureProduct, getCategories, getOrderRows, rpcIncrement, rpcSetQty, updateProduct, createCategory, updateCategory, deleteCategory } from "@/lib/data";
import { BrowserMultiFormatReader } from "@zxing/browser";

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
  const scanRef = useRef<HTMLInputElement | null>(null);

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

  // Kamera
  const [camOn, setCamOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [cameraForImage, setCameraForImage] = useState(false);
  const imageCameraRef = useRef<HTMLVideoElement | null>(null);
  const imageCameraStreamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false); // Track if actively scanning to prevent duplicates

  // Settings modal
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState("");
  const [newCatName, setNewCatName] = useState("");

  // Redigeringsfält visibility
  const [expandedEditFields, setExpandedEditFields] = useState(false);

  // Scanner mode: when enabled, keyboard won't auto-focus after scan
  const [scannerMode, setScannerMode] = useState(true);

  const defaultCatId = useMemo(() => categories[0]?.id ?? "", [categories]);

  async function refresh() {
    const [cats, ord] = await Promise.all([getCategories(), getOrderRows()]);
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
  }, []);

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
    if (modalOpen && camOn && !videoRef.current?.srcObject) {
      console.log("Auto-restarting camera after product scan");
      startCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen]);

  async function handleScanSubmit(value: string) {
    // Prevent duplicate scans - if already scanning, ignore
    if (scanningRef.current) {
      console.log("Scan in progress, ignoring duplicate");
      return;
    }

    try {
      scanningRef.current = true; // Mark as scanning
      const ean = cleanEan(value);
      console.log("handleScanSubmit -> ean:", ean);
      if (!ean) {
        scanningRef.current = false;
        return;
      }

      // Rensa scanValue direkt - användaren kan scanna nästa vara direkt
      setScanValue("");

      // If modal is open (modalOpen is true), save the current product first
      if (modalOpen && newEan && newName.trim()) {
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
        await rpcIncrement(newEan, catId, newQty);
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
        scanningRef.current = false; // Reset scanning flag
        return;
      }

      // Product exists - open modal to let user add quantity
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

      scanRef.current?.focus();
      scanningRef.current = false; // Reset scanning flag
    } catch (err) {
      scanningRef.current = false; // Reset on error
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

    const catId = newCat || defaultCatId;
    try {
      // If there's an EAN, handle as usual (with product lookup/creation)
      if (newEan) {
        // Check if product already exists
        const existing = await ensureProduct(newEan);
        if (!existing) {
          // New product - create it
          await createProduct({ ean: newEan, name: newName.trim(), brand: newBrand.trim() || null, default_category_id: catId, image_url: newImage || null, weight: newWeight ?? null });
        } else {
          // Product exists - update it with new details (including category)
          await updateProduct(newEan, { name: newName.trim(), brand: newBrand.trim() || null, image_url: newImage || null, weight: newWeight ?? null, default_category_id: catId });
        }
        // For both new and existing, increment quantity
        await rpcIncrement(newEan, catId, newQty);
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
      
      // Only auto-focus if NOT in scanner mode
      // In scanner mode, keyboard shouldn't pop up between scans
      if (!scannerMode) {
        setTimeout(() => {
          scanRef.current?.focus();
        }, 100);
      }
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

  async function startCamera() {
    setCamOn(true);

    // Wait for React to render the video element
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      // Get video element
      if (!videoRef.current) {
        alert("Kunde inte hitta videoelement");
        setCamOn(false);
        return;
      }

      // Step 1: Find the best camera to use (prefer rear/back camera on Android)
      let selectedDeviceId: string | undefined = undefined;
      
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoCameras = devices.filter(device => device.kind === 'videoinput');
        
        console.log(`📹 Found ${videoCameras.length} camera(s):`);
        videoCameras.forEach((cam, idx) => {
          console.log(`  ${idx}: ${cam.label || `Camera ${idx + 1}`} (ID: ${cam.deviceId.substring(0, 8)}...)`);
        });

        // Try to find a rear/back camera (not front/selfie)
        // Look for keywords that indicate a rear camera
        const rearCameraKeywords = ['back', 'rear', 'main', 'wide', '0', 'environment'];
        const frontCameraKeywords = ['front', 'selfie', 'user', 'face'];
        
        let rearCamera = videoCameras.find(cam => {
          const label = (cam.label || '').toLowerCase();
          return rearCameraKeywords.some(keyword => label.includes(keyword)) && 
                 !frontCameraKeywords.some(keyword => label.includes(keyword));
        });
        
        // If no rear camera found by label, try using facingMode
        if (!rearCamera && videoCameras.length > 1) {
          // Usually the second camera is rear on phones with front camera first
          rearCamera = videoCameras[1];
        }
        
        // Default to first camera if nothing else found
        if (!rearCamera && videoCameras.length > 0) {
          rearCamera = videoCameras[0];
        }
        
        if (rearCamera) {
          selectedDeviceId = rearCamera.deviceId;
          console.log(`✓ Using rear camera: ${rearCamera.label || 'Main Camera'}`);
        }
      } catch (e) {
        console.log("Could not enumerate devices, will use default");
      }

      // Step 2: Request camera with specific device and aggressive autofocus
      const constraints: any = {
        video: { 
          ...(selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : { facingMode: { ideal: "environment" } }),
          width: { ideal: 1280 },
          height: { ideal: 720 },
          // Try to request autofocus in initial constraints
          advanced: [
            {
              focusMode: 'auto',
              focusDistance: 0
            },
            {
              torch: false
            }
          ]
        }
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log("✓ Camera stream acquired");
      } catch (e) {
        console.log("Primary constraint failed, trying without deviceId:", e);
        // Fallback if specific deviceId fails
        const fallbackConstraints: any = {
          video: { 
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        };
        stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
      }

      videoRef.current.srcObject = stream;
      
      // Step 3: Apply aggressive autofocus to the video track
      const videoTrack = stream.getVideoTracks()[0];
      
      if (videoTrack) {
        console.log(`Using track: ${videoTrack.label}`);
        
        // Get capabilities to see what's supported
        if (videoTrack.getCapabilities) {
          const capabilities = videoTrack.getCapabilities() as any;
          
          console.log("📋 Camera capabilities:", {
            focusMode: capabilities.focusMode,
            torch: capabilities.torch
          });
          
          // Simple focus strategies - just focusMode, no focusDistance (doesn't work reliably)
          const focusStrategies = [
            { focusMode: 'continuous' },
            { focusMode: 'auto' }
          ];
          
          let focusApplied = false;
          
          for (const strategy of focusStrategies) {
            try {
              await videoTrack.applyConstraints({
                advanced: [strategy as any]
              });
              console.log("✓ Focus mode applied:", strategy.focusMode);
              focusApplied = true;
              break;
            } catch (e) {
              console.log("⚠️ Focus mode failed, trying next:", e);
            }
          }
          
          if (!focusApplied) {
            console.log("⚠️ Could not set focus mode");
          }
          
          // Try torch for better lighting
          if (capabilities.torch && capabilities.torch.includes('on')) {
            console.log("💡 Torch available, enabling...");
            try {
              await videoTrack.applyConstraints({
                advanced: [{ torch: true } as any]
              });
              console.log("✓ Torch enabled");
            } catch (e) {
              console.log("⚠️ Could not enable torch:", e);
            }
          }
        } else {
          console.log("⚠️ getCapabilities not supported on this device");
        }
      }

      // Step 4: Start video playback
      videoRef.current.play().catch(err => console.error("Video play error:", err));

      // Short wait for camera to initialize
      console.log("⏳ Camera initializing...");
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log("✓ Camera ready, starting barcode detection");

      readerRef.current = new BrowserMultiFormatReader();
      const reader = readerRef.current;

      // Configure hints for EAN detection
      const hints = new Map();
      hints.set(1, [12, 13]); // BarcodeFormat.EAN_13=13, EAN_8=12
      reader.setHints(hints);

      console.log("Barcode scanner started - scanning for EAN codes...");

      // Continuously scan, but handleScanSubmit prevents duplicates with scanningRef
      const scannerPromise = reader.decodeFromVideoElement(videoRef.current, (result, err) => {
        if (result) {
          console.log("✓ Barcode detected:", result.getText());
          handleScanSubmit(result.getText());
        }
      });

      // Store the scanner promise so we can potentially cancel it
      // For now, let the scan run until camera is stopped
    } catch (err) {
      console.error("Camera error:", err);
      let errorMsg = "Okänt fel";
      if (err instanceof Error) {
        if (err.name === "NotAllowedError") {
          errorMsg = "Tillåta kameratillgång i webbläsarinställningar";
        } else if (err.name === "NotFoundError") {
          errorMsg = "Ingen kamera funnen";
        } else {
          errorMsg = err.message;
        }
      }
      alert("Kunde inte starta kamera: " + errorMsg);
      setCamOn(false);
    }
  }

  async function stopCamera() {
    setCamOn(false);
    scanningRef.current = false; // Stop scanning when camera is stopped
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    if (readerRef.current) {
      readerRef.current = null;
    }
  }

  function handleTapToFocus() {
    if (!videoRef.current?.srcObject) return;
    
    const stream = videoRef.current.srcObject as MediaStream;
    const videoTrack = stream.getVideoTracks()[0];
    
    if (!videoTrack) return;
    
    console.log("🔍 Tap-to-focus triggered");
    
    // Try to apply continuous autofocus
    if (typeof videoTrack.getCapabilities === 'function') {
      try {
        videoTrack.applyConstraints({
          advanced: [{ focusMode: 'auto' } as any]
        }).then(() => {
          console.log("✓ Auto focus triggered");
        }).catch(e => {
          console.log("Could not trigger auto focus:", e);
        });
      } catch (e) {
        console.log("Error in tap to focus:", e);
      }
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "clamp(12px, 3vw, 20px)", marginBottom: "clamp(20px, 5vw, 30px)", paddingBottom: "clamp(12px, 3vw, 16px)", borderBottom: "2px solid #f0f0f0", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <h1 style={{ margin: 0, marginBottom: "4px" }}>📦 ToGo – Skanna & beställ</h1>
          <p style={{ color: "#666", fontSize: "clamp(0.85em, 2vw, 0.95em)", margin: 0 }}>Lägg till produkter genom att scanna eller skriva EAN</p>
        </div>
        <div style={{ display: "flex", gap: "clamp(8px, 2vw, 12px)", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button 
            onClick={() => setScannerMode(!scannerMode)}
            title={scannerMode ? "Scanner-läge: Tangentbordet kommer inte visa sig mellan skanningar" : "Manual-läge: Tangentbordet syns för manuell inmatning"}
            style={{ 
              padding: "10px 16px", 
              background: scannerMode ? "#E4002B" : "#f0f0f0", 
              color: scannerMode ? "white" : "#333", 
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
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            {scannerMode ? "📱 Scanner-läge" : "⌨️ Manual-läge"}
          </button>
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

        {!camOn ? (
          <button onClick={startCamera} style={{ padding: "clamp(10px, 2vw, 12px) clamp(12px, 2vw, 16px)", fontSize: "clamp(0.85em, 2vw, 0.9em)", whiteSpace: "nowrap", flex: "1 1 auto", minWidth: "80px" }}>
            📷 Kamera
          </button>
        ) : (
          <button onClick={stopCamera} style={{ padding: "clamp(10px, 2vw, 12px) clamp(12px, 2vw, 16px)", fontSize: "clamp(0.85em, 2vw, 0.9em)", background: "#666", whiteSpace: "nowrap", flex: "1 1 auto", minWidth: "80px" }}>
            ✕ Stäng
          </button>
        )}

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
          }}
          style={{ padding: "clamp(10px, 2vw, 12px) clamp(12px, 2vw, 16px)", fontSize: "clamp(0.85em, 2vw, 0.9em)", whiteSpace: "nowrap", flex: "1 1 auto", minWidth: "100px", background: "#E4002B", color: "white", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          ➕ Manuell artikel
        </button>
      </div>

      {camOn && !modalOpen && (
        <div style={{ marginBottom: "clamp(16px, 4vw, 24px)", background: "#000", padding: "clamp(16px, 4vw, 20px)", borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative" }}>
          <div style={{ position: "relative", width: "100%", maxWidth: 600, aspectRatio: "16 / 9", overflow: "hidden", borderRadius: 10 }}>
            <video 
              ref={videoRef} 
              autoPlay={true}
              playsInline={true}
              onClick={handleTapToFocus}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", cursor: "pointer" }} 
              muted 
            />
            {/* Scanner frame overlay */}
            <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
              {/* Top bar */}
              <div style={{ position: "absolute", top: "25%", left: 0, right: 0, height: 4, background: "#E4002B", boxShadow: "0 0 20px rgba(228, 0, 43, 0.8)" }} />
              {/* Left line */}
              <div style={{ position: "absolute", top: "15%", bottom: "15%", left: "15%", width: 2, background: "#E4002B", opacity: 0.6 }} />
              {/* Right line */}
              <div style={{ position: "absolute", top: "15%", bottom: "15%", right: "15%", width: 2, background: "#E4002B", opacity: 0.6 }} />
            </div>
          </div>
          <p style={{ color: "#fff", marginTop: "clamp(12px, 3vw, 16px)", fontSize: "clamp(0.9em, 2vw, 1em)", textAlign: "center" }}>Rikta kameran mot streckkoden eller skriv EAN nedan</p>
          
          {/* Manual EAN input during camera */}
          <input
            value={scanValue}
            onChange={(e) => setScanValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                const ean = (e.target as HTMLInputElement).value;
                if (ean.trim()) {
                  handleScanSubmit(ean);
                  setScanValue("");
                }
              }
            }}
            placeholder="Eller mata in EAN här..."
            autoFocus
            style={{ 
              marginTop: "clamp(12px, 3vw, 16px)",
              width: "100%", 
              maxWidth: 400,
              padding: "clamp(10px, 2vw, 12px)", 
              fontSize: "clamp(14px, 2vw, 16px)", 
              borderRadius: 8, 
              border: "2px solid #fff",
              background: "rgba(255,255,255,0.95)",
              textAlign: "center",
              fontWeight: 500
            }}
          />
          <div style={{ marginTop: "clamp(12px, 2vw, 16px)", color: "#ccc", fontSize: "clamp(0.8em, 1.5vw, 0.9em)", textAlign: "center" }}>
            💡 Tips: Tryck på videon för att fokusera manuellt
          </div>
        </div>
      )}

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
            {/* Liten EAN-info och kamera innanför modalen */}
            <div style={{ display: "flex", gap: "clamp(8px, 2vw, 12px)", flexWrap: "wrap", alignItems: "center", marginBottom: 12, background: "#f9f9f9", padding: "clamp(8px, 2vw, 12px)", borderRadius: 8 }}>
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
                  handleScanSubmit((e.target as HTMLInputElement).value);
                }
              }}
              placeholder="Scanna EAN"
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              pattern="[0-9]*"
              style={{ flex: "1 1 150px", minWidth: "120px", padding: "clamp(6px, 1.5vw, 8px)", fontSize: "clamp(12px, 1.5vw, 14px)", borderRadius: 6, border: "1px solid #E4002B" }}
            />
            {!camOn ? (
              <button onClick={startCamera} style={{ padding: "clamp(6px, 1.5vw, 8px) clamp(8px, 1.5vw, 10px)", fontSize: "clamp(0.75em, 1.5vw, 0.8em)", whiteSpace: "nowrap" }}>
                📷
              </button>
            ) : (
              <button onClick={stopCamera} style={{ padding: "clamp(6px, 1.5vw, 8px) clamp(8px, 1.5vw, 10px)", fontSize: "clamp(0.75em, 1.5vw, 0.8em)", background: "#666", color: "white", whiteSpace: "nowrap" }}>
                ✕
              </button>
            )}
          </div>

            {camOn && (
              <div style={{ marginBottom: "clamp(8px, 2vw, 12px)", background: "#f5f5f5", padding: "clamp(8px, 2vw, 10px)", borderRadius: 8 }}>
                <video 
                  ref={videoRef} 
                  autoPlay={true}
                  playsInline={true}
                  style={{ width: "100%", maxWidth: 300, borderRadius: 8, border: "2px solid #E4002B" }} 
                  muted 
                />
              </div>
            )}

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
                onClick={saveNewProduct} 
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
                  // Reset scanning flag when closing modal
                  scanningRef.current = false;
                  scanRef.current?.focus();
                }}
                style={{ padding: 14, width: "100%", background: "#E4002B", color: "white", fontWeight: 600, borderRadius: 8, border: "none", cursor: "pointer", fontSize: 16, transition: "all 0.2s" }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                ✕ Stäng modal
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
            <h2 style={{ marginTop: 0, marginBottom: 20 }}>⚙️ Inställningar</h2>

            {/* Kategorier Section */}
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: "1.1em" }}>Kategorier</h3>
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
                              alert("Kunde inte uppdatera kategori");
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
                            if (!confirm(`Ta bort "${cat.name}"?`)) return;
                            try {
                              await deleteCategory(cat.id);
                              await refresh();
                            } catch (err) {
                              alert("Kunde inte ta bort kategori");
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
                  placeholder="Ny kategorinamn"
                  style={{ flex: 1, padding: "10px", borderRadius: 4, border: "2px solid #E4002B", fontSize: "0.95em" }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      // Add new category
                    }
                  }}
                />
                <button
                  onClick={async () => {
                    if (!newCatName.trim()) return alert("Skriv kategorinamn");
                    try {
                      await createCategory(newCatName);
                      await refresh();
                      setNewCatName("");
                    } catch (err) {
                      alert("Kunde inte lägga till kategori");
                    }
                  }}
                  style={{ padding: "10px 16px", fontSize: "0.85em", background: "#4CAF50", color: "white", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 500 }}
                >
                  + Lägg till
                </button>
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
    await rpcSetQty(row.ean, newId, qty);
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
