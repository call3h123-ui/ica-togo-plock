"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Category, OrderRow } from "@/lib/types";
import { createProduct, ensureProduct, getCategories, getOrderRows, rpcIncrement, rpcSetQty, updateProduct, createCategory, updateCategory, deleteCategory, moveCategoryUp, moveCategoryDown } from "@/lib/data";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import * as XLSX from "xlsx";

function cleanEan(raw: string) {
  return raw.trim().replace(/\s/g, "");
}

function padEan(ean: string): string {
  // Pad EAN code with zeros to make it 13 digits
  return ean.padStart(13, '0');
}

function getIcaImageUrl(ean: string): string {
  // Generate ICA asset image URL using EAN code
  const paddedEan = padEan(ean);
  return `https://assets.icanet.se/t_minbutik_preview,f_auto/${paddedEan}.jpg`;
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
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [scanValue, setScanValue] = useState("");
  const [storeId, setStoreId] = useState<string>("");
  const [storeName, setStoreName] = useState<string>("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scanRef = useRef<HTMLInputElement | null>(null);
  const modalScanRef = useRef<HTMLInputElement | null>(null);
  
  // Ref för att undvika stale closures i kameraskanning
  const handleScanRef = useRef<(value: string) => Promise<void>>();

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
  
  // Scanner mode: 'handheld' = handskanner, 'camera' = mobilkamera, 'manual' = manuell inmatning
  const [scannerMode, setScannerMode] = useState<'handheld' | 'camera' | 'manual'>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("scannerMode");
      if (saved === 'handheld' || saved === 'camera' || saved === 'manual') {
        return saved;
      }
    }
    return 'handheld';
  });

  // Kameraskanning
  const [cameraActive, setCameraActive] = useState(false);

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
            let ean = String(row[0] || "").trim();
            const productName = String(row[1] || "").trim();
            const brand = String(row[2] || "").trim();
            const weight = String(row[3] || "").trim();
            const categoryName = String(row[4] || "").trim();
            
            // Pad EAN with zeros if shorter than 13 digits
            if (ean) {
              ean = padEan(ean);
            }
            
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
              
              // Use ICA asset image URL
              const imageUrl = getIcaImageUrl(ean);
              
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
                console.log(`Created: ${productName} (with image)`);
              } else {
                // Vid uppdatering: behåll befintlig bild om den finns, annars använd ICA asset
                const updateObj: any = {
                  name: productName,
                  brand: brand || null,
                  weight: weight || null,
                  default_category_id: categoryId
                };
                // Lägg till bild från ICA endast om produkten inte redan har en
                if (!existing.image_url) {
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
    setCameraError(null); // Nollställ fel varje gång vi försöker starta kameran
    // Timeout: visa fel om ingen video syns inom 2 sekunder
    let timeout: NodeJS.Timeout | null = null;
    if (cameraActive) {
      timeout = setTimeout(() => {
        const video = document.querySelector('#html5-qrcode-scanner-modal video');
        if (!video) {
          setCameraError('Kunde inte starta kameran (ingen video hittades). Kontrollera behörigheter och försök igen.');
        }
      }, 2000);
    }
    // Read storeId from localStorage
    if (typeof window !== "undefined") {
      const savedStoreId = localStorage.getItem("storeId");
      const savedStoreName = localStorage.getItem("storeName");
      if (savedStoreId) {
        setStoreId(savedStoreId);
        setStoreName(savedStoreName || "");
        setIsAuthorized(true);
      } else {
        router.push("/login");
      }
    }
  }, [router]);

  // Save scanner mode to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("scannerMode", scannerMode);
    }
  }, [scannerMode]);

  // Ref för att hålla koll på senast skannade EAN (undvik dubbelskanning)
  const lastScannedRef = useRef<string>("");
  const lastScannedTimeRef = useRef<number>(0);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [availableCameras, setAvailableCameras] = useState<{id: string, label: string}[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("selectedCameraId") || "";
    }
    return "";
  });

  // Hämta tillgängliga kameror
  useEffect(() => {
    Html5Qrcode.getCameras().then(cameras => {
      console.log("Tillgängliga kameror:", cameras);
      setAvailableCameras(cameras);
      
      // Kontrollera om sparad kamera finns i listan
      const savedCameraExists = selectedCameraId && cameras.some(c => c.id === selectedCameraId);
      
      if (!savedCameraExists && cameras.length > 0) {
        // Sparad kamera finns inte - välj ny automatiskt
        // Prioritera "back" eller "environment" kamera
        const backCamera = cameras.find(c => 
          c.label.toLowerCase().includes('back') || 
          c.label.toLowerCase().includes('rear') ||
          c.label.toLowerCase().includes('environment') ||
          c.label.includes('0')
        );
        const cameraToUse = backCamera || cameras[0];
        console.log("Väljer kamera automatiskt:", cameraToUse.label);
        setSelectedCameraId(cameraToUse.id);
        localStorage.setItem("selectedCameraId", cameraToUse.id);
      } else if (!selectedCameraId && cameras.length === 0) {
        // Inga kameror hittades - nollställ för facingMode fallback
        console.log("Inga kameror hittades, använder facingMode fallback");
        setSelectedCameraId("");
        localStorage.removeItem("selectedCameraId");
      }
    }).catch(err => {
      console.log("Kunde inte hämta kameror:", err);
      // Vid fel, nollställ för facingMode fallback
      setSelectedCameraId("");
      localStorage.removeItem("selectedCameraId");
    });
  }, []);

  // Slå på/av ficklampa (torch) - hjälper med läsbarhet
  async function toggleTorch() {
    try {
      const videoElement = document.querySelector('#html5-qrcode-scanner video, #html5-qrcode-scanner-modal video') as HTMLVideoElement;
      if (!videoElement || !videoElement.srcObject) return;
      
      const stream = videoElement.srcObject as MediaStream;
      const track = stream.getVideoTracks()[0];
      if (!track) return;
      
      const newTorchState = !torchOn;
      // @ts-ignore - torch stöds av de flesta mobiler
      await track.applyConstraints({ advanced: [{ torch: newTorchState }] });
      setTorchOn(newTorchState);
      if (navigator.vibrate) navigator.vibrate(50);
    } catch (err) {
      console.log("Torch fel:", err);
    }
  }

  // Start/stop camera barcode scanning med html5-qrcode
  useEffect(() => {
    let isActive = true;
    let timeout: NodeJS.Timeout | null = null;

    async function startScanning() {
      if (!cameraActive) {
        console.log("startScanning avbruten: cameraActive är false");
        return;
      }

      console.log("startScanning startar, väntar på DOM...");
      
      // Vänta lite så DOM hinner renderas
      await new Promise(resolve => setTimeout(resolve, 500));

      if (!isActive) {
        console.log("startScanning avbruten: isActive är false");
        return;
      }

      // Försök hitta scanner-element (huvudvy eller modal)
      let scannerId = "html5-qrcode-scanner";
      let scannerElement = document.getElementById(scannerId);
      
      if (!scannerElement) {
        scannerId = "html5-qrcode-scanner-modal";
        scannerElement = document.getElementById(scannerId);
      }
      
      if (!scannerElement) {
        console.error("Scanner element hittades inte (varken huvud eller modal)");
        // Försök igen efter ytterligare delay
        await new Promise(resolve => setTimeout(resolve, 300));
        scannerElement = document.getElementById("html5-qrcode-scanner-modal") || document.getElementById("html5-qrcode-scanner");
        if (!scannerElement) {
          console.error("Scanner element hittades fortfarande inte efter extra väntan");
          return;
        }
        scannerId = scannerElement.id;
      }

      console.log("Använder scanner-element:", scannerId);

      try {
        // Stoppa eventuell befintlig scanner först
        if (html5QrCodeRef.current) {
          try {
            await html5QrCodeRef.current.stop();
            console.log("Befintlig scanner stoppad");
          } catch (e) {
            console.log("Stop error (ignoreras):", e);
          }
          html5QrCodeRef.current = null;
        }

        // VIKTIGT: Rensa DOM-elementet helt innan vi skapar ny scanner
        // html5-qrcode kan ha problem med att återanvända element
        if (scannerElement) {
          scannerElement.innerHTML = '';
          console.log("Scanner-element rensat");
        }

        // Specificera alla streckkodsformat för bättre avläsning
        const formatsToSupport = [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.ITF,
        ];

        const html5QrCode = new Html5Qrcode(scannerId, { 
          formatsToSupport,
          verbose: false 
        });
        html5QrCodeRef.current = html5QrCode;

        // Konfig utan qrbox = hela bilden analyseras (bättre för små koder)
        const config = {
          fps: 20,
          aspectRatio: 1.5,
          disableFlip: false,
        };

        // Callback för lyckad skanning
        const onScanSuccess = (decodedText: string) => {
          if (!isActive) return;
          
          const ean = cleanEan(decodedText);
          const now = Date.now();
          
          // Undvik dubbelskanning av samma kod inom 2 sekunder
          if (ean && (ean !== lastScannedRef.current || now - lastScannedTimeRef.current > 2000)) {
            lastScannedRef.current = ean;
            lastScannedTimeRef.current = now;
            
            console.log("Skannade streckkod:", ean);
            
            // Vibrera om möjligt för feedback
            if (navigator.vibrate) navigator.vibrate(100);
            
            // STOPPA kameran efter lyckad skanning för att undvika dubbelskanning
            setCameraActive(false);
            
            // Använd ref för att undvika stale closure
            if (handleScanRef.current) {
              handleScanRef.current(ean);
            }
          }
        };

        const onScanError = () => {
          // Ignorera - inget hittat i denna frame
        };

        // Använd specifikt kamera-ID om det finns, annars fallback till facingMode
        let cameraIdOrConfig: string | object;
        if (selectedCameraId) {
          cameraIdOrConfig = selectedCameraId;
          console.log("Använder specifik kamera:", selectedCameraId);
        } else {
          cameraIdOrConfig = { facingMode: "environment" };
          console.log("Använder facingMode: environment");
        }

        // Starta kamera
        console.log("Försöker starta kamera med config:", cameraIdOrConfig);
        try {
          await html5QrCode.start(
            cameraIdOrConfig,
            config,
            onScanSuccess,
            onScanError
          );
          console.log("html5-qrcode skanning startad!");
        } catch (startErr) {
          console.error("Kunde inte starta med vald kamera, försöker med facingMode:", startErr);
          // Fallback till facingMode om specifikt kamera-ID misslyckades
          if (selectedCameraId) {
            await html5QrCode.start(
              { facingMode: "environment" },
              config,
              onScanSuccess,
              onScanError
            );
            console.log("html5-qrcode startad med facingMode fallback");
          } else {
            throw startErr;
          }
        }
        
        // Försök aktivera autofokus efter start
        setTimeout(async () => {
          try {
            const videoElement = document.querySelector(`#${scannerId} video`) as HTMLVideoElement;
            if (videoElement && videoElement.srcObject) {
              const stream = videoElement.srcObject as MediaStream;
              const track = stream.getVideoTracks()[0];
              if (track) {
                const capabilities = track.getCapabilities?.();
                console.log("Kamera capabilities:", capabilities);
                
                // @ts-ignore - focusMode finns på de flesta mobiler
                if (capabilities?.focusMode?.includes('continuous')) {
                  // @ts-ignore
                  await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
                  console.log("Autofokus aktiverat via track constraints");
                }
              }
            }
          } catch (focusErr) {
            console.log("Kunde inte konfigurera kamera:", focusErr);
          }
        }, 500);
        
      } catch (err) {
        console.error("Kunde inte starta kameraskanning:", err);
        if (isActive) {
          setCameraError("Kunde inte starta kameran. Kontrollera att du gett tillåtelse och att sidan använder HTTPS. Om du har flera kameror, testa att byta kamera i inställningarna.");
          setCameraActive(false);
        }
      }
    }

    startScanning();

    return () => {
      isActive = false;
      if (timeout) clearTimeout(timeout);
      // Stoppa html5-qrcode
      if (html5QrCodeRef.current) {
        html5QrCodeRef.current.stop().catch(e => console.log("Stop error:", e));
        html5QrCodeRef.current = null;
      }
    };
  }, [cameraActive, selectedCameraId]);

  // Säker funktion för att starta om kameran
  const restartCamera = useCallback(async () => {
    console.log("restartCamera called, cameraActive:", cameraActive);
    
    // Stoppa befintlig kamera först
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        console.log("Kamera stoppad via html5QrCode.stop()");
      } catch (e) {
        console.log("Stop error:", e);
      }
      html5QrCodeRef.current = null;
    }
    
    // Om kameran redan är av, starta den direkt
    if (!cameraActive) {
      console.log("Kameran var av, startar direkt");
      setCameraActive(true);
      return;
    }
    
    // Annars stäng av och starta om
    setCameraActive(false);
    
    // Vänta så att React hinner uppdatera DOM
    setTimeout(() => {
      console.log("Startar kameran igen");
      setCameraActive(true);
    }, 500);
  }, [cameraActive]);

  // Stoppa kamera när man byter läge från kamera
  useEffect(() => {
    if (scannerMode !== 'camera' && cameraActive) {
      setCameraActive(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannerMode]);

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
      // Kamera-constraints med autofokus
      const videoConstraints: MediaTrackConstraints = {
        facingMode: "environment",
        // @ts-ignore - focusMode stöds av de flesta mobiler men finns inte i TS-typer
        focusMode: "continuous"
      };
      navigator.mediaDevices
        .getUserMedia({ video: videoConstraints })
        .then(async (stream) => {
          if (imageCameraRef.current) {
            imageCameraRef.current.srcObject = stream;
            imageCameraStreamRef.current = stream;
            
            // Försök aktivera autofokus via track (fallback)
            try {
              const track = stream.getVideoTracks()[0];
              if (track) {
                const capabilities = track.getCapabilities?.();
                // @ts-ignore
                if (capabilities?.focusMode?.includes('continuous')) {
                  // @ts-ignore
                  await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
                  console.log("Bildkamera: autofokus aktiverat");
                }
              }
            } catch (e) {
              console.log("Bildkamera: kunde inte aktivera autofokus via track");
            }
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
      let ean = cleanEan(value);
      // Pad EAN with zeros if shorter than 13 digits
      ean = padEan(ean);
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
          // New product - create it and verify it was created
          await createProduct({ ean: newEan, name: newName.trim(), brand: newBrand.trim() || null, default_category_id: catId, image_url: newImage || null, weight: newWeight ?? null });
          // Verify product was created
          const verifyProduct = await ensureProduct(newEan);
          if (!verifyProduct) {
            throw new Error("Kunde inte skapa produkten. Försök igen.");
          }
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
        // OBS: Bild hämtas ENDAST från ICA assets, inte från Open Food Facts
        setLoadingProduct(true);
        try {
          // Set image from ICA assets (används alltid för bilder)
          setNewImage(getIcaImageUrl(ean));
          
          const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${ean}.json`);
          if (response.ok) {
            const data = await response.json();
            if (data.product) {
              const prod = data.product;
              // Hämta endast metadata från OFF: namn, varumärke, vikt
              // Bild kommer alltid från ICA assets
              setNewName(prod.product_name || prod.name || "");
              setNewBrand(prod.brands || "");
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

      // Product exists - check if already in order AND NOT picked
      const existingOrder = rows.find(r => r.ean === ean && r.qty > 0 && !r.is_picked);
      
      if (existingOrder) {
        // Vara redan i orderlistan (ej plockat) - visa banner och fyll in med befintlig data
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
        // Ny vara (eller plockat vara) - normalt flöde med kvantitet 1
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

  // Uppdatera ref för kameraskanning
  useEffect(() => {
    handleScanRef.current = handleScanSubmit;
  });
  async function saveNewProduct() {
    if (!newName.trim()) return alert("Skriv produktnamn.");
    if (!newBrand.trim()) return alert("Skriv varumärke.");
    if (!newWeight) return alert("Skriv vikt.");

    const catId = newCat || defaultCatId;
    try {
      // If there's an EAN, handle as usual (with product lookup/creation)
      if (newEan) {
        // Ensure image is set from ICA assets if not already set
        const imageToSave = newImage || getIcaImageUrl(newEan);
        
        // Check if product already exists in order (only active, not picked items)
        const existingOrderItem = rows.find(r => r.ean === newEan && r.qty > 0 && !r.is_picked);
        
        // Check if product already exists in database
        const existing = await ensureProduct(newEan);
        if (!existing) {
          // New product - create it and verify it was created before continuing
          await createProduct({ ean: newEan, name: newName.trim(), brand: newBrand.trim() || null, default_category_id: catId, image_url: imageToSave, weight: newWeight ?? null });
          // Verify product was created by checking again
          const verifyProduct = await ensureProduct(newEan);
          if (!verifyProduct) {
            throw new Error("Kunde inte skapa produkten. Försök igen.");
          }
        } else {
          // Product exists - update it with new details (including category)
          await updateProduct(newEan, { name: newName.trim(), brand: newBrand.trim() || null, image_url: imageToSave, weight: newWeight ?? null, default_category_id: catId });
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

  if (!isAuthorized) {
    return null;
  }

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
          <h1 style={{ margin: 0, marginBottom: "4px", fontSize: "clamp(1.2em, 3vw, 1.5em)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>🛒 Beställning</h1>
          <p style={{ color: "#666", fontSize: "clamp(0.85em, 2vw, 0.95em)", margin: 0 }}>Lägg till produkter genom att scanna eller skriva EAN</p>
        </div>
        <div style={{ display: "flex", gap: "clamp(8px, 2vw, 12px)", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div style={{ display: "flex", gap: 4, background: "#f0f0f0", borderRadius: 8, padding: 4 }}>
            <button 
              onClick={() => setScannerMode('handheld')}
              style={{ 
                padding: "8px 12px", 
                background: scannerMode === 'handheld' ? "#E4002B" : "transparent", 
                color: scannerMode === 'handheld' ? "white" : "#333", 
                border: "none",
                borderRadius: 6, 
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.2s",
                whiteSpace: "nowrap",
                minHeight: "36px",
                display: "flex",
                alignItems: "center",
                fontSize: "clamp(0.8em, 1.8vw, 0.9em)"
              }}
              title="Handskanner (utan tangentbord)"
            >
              🔫 Skanner
            </button>
            <button 
              onClick={() => {
                setScannerMode('camera');
                setCameraActive(true);
              }}
              style={{ 
                padding: "8px 12px", 
                background: scannerMode === 'camera' ? "#E4002B" : "transparent", 
                color: scannerMode === 'camera' ? "white" : "#333", 
                border: "none",
                borderRadius: 6, 
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.2s",
                whiteSpace: "nowrap",
                minHeight: "36px",
                display: "flex",
                alignItems: "center",
                fontSize: "clamp(0.8em, 1.8vw, 0.9em)"
              }}
              title="Mobilkamera"
            >
              📷 Kamera
            </button>
            <button 
              onClick={() => setScannerMode('manual')}
              style={{ 
                padding: "8px 12px", 
                background: scannerMode === 'manual' ? "#E4002B" : "transparent", 
                color: scannerMode === 'manual' ? "white" : "#333", 
                border: "none",
                borderRadius: 6, 
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.2s",
                whiteSpace: "nowrap",
                minHeight: "36px",
                display: "flex",
                alignItems: "center",
                fontSize: "clamp(0.8em, 1.8vw, 0.9em)"
              }}
              title="Manuell EAN-inmatning"
            >
              ⌨️ Manuell
            </button>
          </div>
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
            href="/plock" 
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
            ⇄ Plocklista
          </Link>
        </div>
      </div>

      <div style={{ display: modalOpen ? "none" : "flex", flexDirection: "column", gap: "clamp(8px, 2vw, 12px)", background: "#f9f9f9", padding: "clamp(12px, 3vw, 16px)", borderRadius: 12, marginBottom: "clamp(16px, 4vw, 24px)", position: "relative", zIndex: 100 }}>
        
        {/* Kameraväljare om flera kameror finns */}
        {scannerMode === 'camera' && availableCameras.length > 1 && (
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: "0.85em", color: "#666", marginRight: 8 }}>📷 Kamera:</label>
            <select 
              value={selectedCameraId}
              onChange={(e) => {
                setSelectedCameraId(e.target.value);
                localStorage.setItem("selectedCameraId", e.target.value);
                // Starta om kameran med ny kamera
                if (cameraActive) {
                  setCameraActive(false);
                  setTimeout(() => setCameraActive(true), 100);
                }
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid #ccc",
                fontSize: "0.85em"
              }}
            >
              {availableCameras.map(cam => (
                <option key={cam.id} value={cam.id}>
                  {cam.label || cam.id}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Kamera-vy om kameraläge är aktivt - använder html5-qrcode */}
        {scannerMode === 'camera' && cameraActive && (
          <div style={{ position: "relative", width: "100%", maxWidth: 400, margin: "0 auto" }}>
            <div 
              id="html5-qrcode-scanner"
              style={{
                width: "100%",
                borderRadius: 8,
                border: "3px solid #E4002B",
                overflow: "hidden"
              }}
            />
            <style>{`
              #html5-qrcode-scanner video {
                border-radius: 8px;
              }
              #html5-qrcode-scanner__scan_region {
                background: #000 !important;
              }
              #html5-qrcode-scanner__dashboard_section {
                display: none !important;
              }
              #html5-qrcode-scanner__dashboard_section_csr {
                display: none !important;
              }
            `}</style>
            <button
              onClick={() => setCameraActive(false)}
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                padding: "6px 10px",
                background: "rgba(0,0,0,0.7)",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: "0.85em",
                zIndex: 10
              }}
            >
              ✕ Stäng
            </button>
            <div style={{
              position: "absolute",
              bottom: 8,
              left: 8,
              right: 8,
              padding: "8px",
              background: "rgba(0,0,0,0.7)",
              color: "white",
              borderRadius: 6,
              textAlign: "center",
              fontSize: "0.85em",
              zIndex: 10
            }}>
              📷 Rikta kameran mot streckkoden
            </div>
          </div>
        )}

        {/* Knapp för att starta kameran igen om den stängts */}
        {scannerMode === 'camera' && !cameraActive && (
          <button
            onClick={() => setCameraActive(true)}
            style={{
              padding: "16px 24px",
              background: "#E4002B",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              cursor: "pointer",
              fontSize: "1em",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8
            }}
          >
            📷 Starta kameraskanning
          </button>
        )}

        {/* Input-fält för handskanner och manuell inmatning */}
        {scannerMode !== 'camera' && (
          <div style={{ display: "flex", gap: "clamp(8px, 2vw, 12px)", flexWrap: "wrap", alignItems: "center" }}>
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
              placeholder={scannerMode === 'handheld' ? "Skanna med handskanner..." : "Skriv EAN-kod här"}
              type="text"
              inputMode={scannerMode === 'handheld' ? "none" : "numeric"}
              readOnly={scannerMode === 'handheld'}
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              autoCapitalize="off"
              pattern="[0-9]*"
              style={{ 
                flex: "1 1 280px", 
                minWidth: "200px", 
                padding: "clamp(10px, 2vw, 12px)", 
                fontSize: "clamp(14px, 2vw, 16px)", 
                borderRadius: 8, 
                border: "2px solid #E4002B",
                background: scannerMode === 'handheld' ? "#f5f5f5" : "white",
                caretColor: scannerMode === 'handheld' ? "transparent" : "auto"
              }}
            />
            {scannerMode === 'handheld' && (
              <div style={{ fontSize: "0.85em", color: "#666", padding: "4px 8px", background: "#e8f4e8", borderRadius: 4 }}>
                🔫 Handskanner aktiv
              </div>
            )}
          </div>
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
            {categories
              .map((cat) => ({ cat, items: groupedByCategory[cat.id] }))
              .filter(({ items }) => items && items.length > 0)
              .map(({ cat, items }) => (
                <div key={cat.id} style={{ marginBottom: "clamp(16px, 4vw, 24px)" }}>
                  <h3 style={{ marginBottom: "clamp(8px, 2vw, 12px)", fontSize: "clamp(0.95em, 2vw, 1.05em)", color: "#666" }}>{cat.name}</h3>
                  <div style={{ display: "grid", gap: "clamp(8px, 2vw, 12px)" }}>
                    {items!.map((r) => (
                      <RowCard key={r.id} row={r} categories={categories} storeId={storeId} onChanged={refresh} />
                    ))}
                  </div>
                </div>
              ))}
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
          <div style={{ ...modalStyle.card, position: "relative" }}>
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
            <div style={{ display: "flex", flexDirection: "column", gap: "clamp(8px, 2vw, 12px)", marginBottom: 12, background: "#f9f9f9", padding: "clamp(8px, 2vw, 12px)", borderRadius: 8 }}>
              
              {/* Lägesväljare inuti modal */}
              <div style={{ display: "flex", gap: 4, background: "#e0e0e0", borderRadius: 6, padding: 3, width: "fit-content" }}>
                <button 
                  onClick={() => { setScannerMode('handheld'); setCameraActive(false); }}
                  style={{ 
                    padding: "4px 8px", 
                    background: scannerMode === 'handheld' ? "#E4002B" : "transparent", 
                    color: scannerMode === 'handheld' ? "white" : "#666", 
                    border: "none",
                    borderRadius: 4, 
                    fontWeight: 500,
                    cursor: "pointer",
                    fontSize: "0.75em"
                  }}
                >
                  🔫
                </button>
                <button 
                  onClick={() => { setScannerMode('camera'); setCameraActive(true); }}
                  style={{ 
                    padding: "4px 8px", 
                    background: scannerMode === 'camera' ? "#E4002B" : "transparent", 
                    color: scannerMode === 'camera' ? "white" : "#666", 
                    border: "none",
                    borderRadius: 4, 
                    fontWeight: 500,
                    cursor: "pointer",
                    fontSize: "0.75em"
                  }}
                >
                  📷
                </button>
                <button 
                  onClick={() => { setScannerMode('manual'); setCameraActive(false); }}
                  style={{ 
                    padding: "4px 8px", 
                    background: scannerMode === 'manual' ? "#E4002B" : "transparent", 
                    color: scannerMode === 'manual' ? "white" : "#666", 
                    border: "none",
                    borderRadius: 4, 
                    fontWeight: 500,
                    cursor: "pointer",
                    fontSize: "0.75em"
                  }}
                >
                  ⌨️
                </button>
              </div>

              {/* Kamera-vy i modal - använder html5-qrcode */}
              {scannerMode === 'camera' && (
                <div style={{ position: "relative", width: "100%" }}>
                  {/* Rendera alltid DOM-elementet men visa/göm baserat på cameraActive */}
                  <div 
                    id="html5-qrcode-scanner-modal"
                    style={{
                      width: "100%",
                      maxHeight: cameraActive ? 200 : 0,
                      minHeight: cameraActive ? 150 : 0,
                      borderRadius: 6,
                      border: cameraActive ? "2px solid #E4002B" : "none",
                      overflow: "hidden",
                      display: cameraActive ? "block" : "none"
                    }}
                  />
                  {cameraActive && (
                    <>
                      <style>{`
                        #html5-qrcode-scanner-modal video {
                          max-height: 200px !important;
                          object-fit: cover;
                        }
                        #html5-qrcode-scanner-modal__dashboard_section {
                          display: none !important;
                        }
                      `}</style>
                      {/* Instruktion om avstånd */}
                      <div style={{
                        position: "absolute",
                        bottom: 4,
                        left: "50%",
                        transform: "translateX(-50%)",
                        background: "rgba(0,0,0,0.7)",
                        color: "white",
                        padding: "4px 10px",
                        borderRadius: 4,
                        fontSize: "0.75em",
                        zIndex: 10
                      }}>
                        📏 ~20 cm avstånd
                      </div>
                      {cameraError && (
                        <div style={{
                          background: '#fff3cd',
                          border: '1px solid #ffc107',
                          color: '#856404',
                          padding: '12px 16px',
                          borderRadius: 8,
                          marginTop: 16,
                          fontSize: '0.95em',
                          fontWeight: 500
                        }}>
                          {cameraError}
                        </div>
                      )}
                    </>
                  )}
                  {!cameraActive && (
                    <button
                      onClick={() => {
                        console.log("Starta kamera-knapp klickad");
                        setCameraActive(true);
                      }}
                      style={{
                        width: "100%",
                        padding: "20px",
                        background: "#E4002B",
                        color: "white",
                        border: "none",
                        borderRadius: 6,
                        fontSize: "1em",
                        fontWeight: 600,
                        cursor: "pointer"
                      }}
                    >
                      📷 Starta kamera
                    </button>
                  )}
                </div>
              )}

              {/* Input för handskanner/manuell */}
              {scannerMode !== 'camera' && (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    ref={modalScanRef}
                    value={scanValue}
                    onChange={(e) => {
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
                    placeholder={scannerMode === 'handheld' ? "Skanna..." : "Skriv EAN"}
                    type="text"
                    inputMode={scannerMode === 'handheld' ? "none" : "numeric"}
                    readOnly={scannerMode === 'handheld'}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck="false"
                    autoCapitalize="off"
                    pattern="[0-9]*"
                    style={{ 
                      flex: "1 1 150px", 
                      minWidth: "120px", 
                      padding: "clamp(6px, 1.5vw, 8px)", 
                      fontSize: "clamp(12px, 1.5vw, 14px)", 
                      borderRadius: 6, 
                      border: "1px solid #E4002B",
                      background: scannerMode === 'handheld' ? "#f0f0f0" : "white",
                      caretColor: scannerMode === 'handheld' ? "transparent" : "auto"
                    }}
                  />
                  {scannerMode === 'handheld' && (
                    <span style={{ fontSize: "0.7em", color: "#666" }}>🔫</span>
                  )}
                </div>
              )}

              {/* Stäng-knapp */}
              <button
                onClick={() => {
                  setModalOpen(false);
                  setCameraActive(false);
                  scanRef.current?.focus();
                }}
                style={{ 
                  position: "absolute", 
                  top: 8, 
                  right: 8, 
                  padding: "6px 10px", 
                  background: "none", 
                  border: "none", 
                  fontSize: 18, 
                  cursor: "pointer", 
                  color: "#666", 
                  minWidth: "auto", 
                  lineHeight: 1,
                  zIndex: 10
                }}
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

            {/* Knapp för att skanna ny artikel med kamera */}
            {scannerMode === 'camera' && (
              <button
                onClick={restartCamera}
                style={{ 
                  padding: 14, 
                  width: "100%", 
                  background: "#2563eb", 
                  color: "white", 
                  fontWeight: 600, 
                  borderRadius: 8, 
                  border: "none", 
                  cursor: "pointer", 
                  fontSize: 16, 
                  transition: "all 0.2s",
                  marginBottom: 8
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                📷 Skanna ny artikel
              </button>
            )}

            {/* Stäng - längst ned */}
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => {
                  setModalOpen(false);
                  setCameraActive(false);
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
                              await updateCategory(cat.id, editingCatName, storeId);
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
                          onClick={async () => {
                            try {
                              await moveCategoryUp(cat.id, cat.sort_index, storeId);
                              await refresh();
                            } catch (err) {
                              alert("Kunde inte flytta avdelning");
                            }
                          }}
                          title="Flytta upp"
                          style={{ padding: "6px 10px", fontSize: "0.8em", background: "#9C27B0", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}
                        >
                          ▲
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              await moveCategoryDown(cat.id, cat.sort_index, storeId);
                              await refresh();
                            } catch (err) {
                              alert("Kunde inte flytta avdelning");
                            }
                          }}
                          title="Flytta ned"
                          style={{ padding: "6px 10px", fontSize: "0.8em", background: "#9C27B0", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}
                        >
                          ▼
                        </button>
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
                              await deleteCategory(cat.id, storeId);
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

            {/* Logout Section */}
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid #ddd" }}>
              <button
                onClick={() => {
                  localStorage.removeItem("storeId");
                  localStorage.removeItem("storeName");
                  window.location.href = "/login";
                }}
                style={{ width: "100%", padding: 12, fontSize: "1em", fontWeight: 600, background: "#E4002B", color: "white", border: "none", borderRadius: 8, cursor: "pointer", marginBottom: 12 }}
              >
                🚪 Logga ut
              </button>
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

function RowCard({ row, categories, storeId, onChanged }: { row: OrderRow; categories: Category[]; storeId: string; onChanged: () => void }) {
  const [qty, setQty] = useState<number>(row.qty);
  const [catId, setCatId] = useState<string>(row.category_id);

  useEffect(() => {
    setQty(row.qty);
    setCatId(row.category_id);
  }, [row.qty, row.category_id]);

  async function inc(delta: number) {
    await rpcIncrement(row.ean, catId, delta, storeId);
    onChanged();
  }

  async function setExact(v: number) {
    const n = Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
    setQty(n);
    await rpcSetQty(row.ean, catId, n, storeId);
    onChanged();
  }

  async function changeCategory(newId: string) {
    setCatId(newId);
    // Update the order item's category
    await rpcSetQty(row.ean, newId, qty, storeId);
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
            await rpcSetQty(row.ean, catId, 0, storeId);
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
