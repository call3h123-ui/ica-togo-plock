"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [storePassword, setStorePassword] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [selectedStore, setSelectedStore] = useState("");
  const [stores, setStores] = useState<Array<{id: string; name: string}>>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"store" | "admin">("store");

  // Load available stores on mount
  useEffect(() => {
    const loadStores = async () => {
      try {
        const response = await fetch("/api/stores");
        const data = await response.json();
        setStores(data);
      } catch (err) {
        console.error("Failed to load stores:", err);
      }
    };
    loadStores();
  }, []);

  const handleStoreLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: selectedStore,
          password: storePassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Inloggning misslyckades");
        return;
      }

      // Store auth info in localStorage
      localStorage.setItem("storeId", selectedStore);
      localStorage.setItem("storeName", stores.find(s => s.id === selectedStore)?.name || "");

      // Redirect to togo page
      router.push("/togo");
    } catch (err) {
      setError("Ett fel uppstod under inloggning");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: adminPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Admin-inloggning misslyckades");
        return;
      }

      // Store admin token
      localStorage.setItem("adminToken", data.token || "true");

      // Redirect to admin page
      router.push("/admin");
    } catch (err) {
      setError("Ett fel uppstod under admin-inloggning");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f5", padding: "20px" }}>
      <div style={{ width: "100%", maxWidth: 400, background: "white", padding: "40px", borderRadius: 12, boxShadow: "0 2px 10px rgba(0,0,0,0.1)" }}>
        
        
        <img 
          src="/ica-logo.webp" 
          alt="ICA Logo" 
          style={{ height: "clamp(60px, 15vw, 100px)", marginBottom: "30px", display: "block", margin: "0 auto 30px", objectFit: "contain" }}
        />

        {/* Mode toggle */}
        <div style={{ display: "flex", gap: 10, marginBottom: 30 }}>
          <button
            onClick={() => setMode("store")}
            style={{
              flex: 1,
              padding: "10px 16px",
              background: mode === "store" ? "#E4002B" : "#f0f0f0",
              color: mode === "store" ? "white" : "#333",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Butik
          </button>
          <button
            onClick={() => setMode("admin")}
            style={{
              flex: 1,
              padding: "10px 16px",
              background: mode === "admin" ? "#E4002B" : "#f0f0f0",
              color: mode === "admin" ? "white" : "#333",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Admin
          </button>
        </div>

        {error && (
          <div style={{
            background: "#fee",
            border: "1px solid #fcc",
            color: "#c00",
            padding: "12px 16px",
            borderRadius: 6,
            marginBottom: 20,
            fontSize: 14,
          }}>
            {error}
          </div>
        )}

        {/* Store Login */}
        {mode === "store" && (
          <form onSubmit={handleStoreLogin}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", marginBottom: 8, fontWeight: 600, fontSize: 14 }}>
                Välj butik
              </label>
              <select
                value={selectedStore}
                onChange={(e) => setSelectedStore(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  fontSize: 14,
                  fontFamily: "inherit",
                }}
              >
                <option value="">-- Välj butik --</option>
                {stores.map(store => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", marginBottom: 8, fontWeight: 600, fontSize: 14 }}>
                Lösenord
              </label>
              <input
                type="password"
                value={storePassword}
                onChange={(e) => setStorePassword(e.target.value)}
                placeholder="Ange lösenord"
                required
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  fontSize: 14,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !selectedStore}
              style={{
                width: "100%",
                padding: "12px 16px",
                background: loading || !selectedStore ? "#ccc" : "#E4002B",
                color: "white",
                border: "none",
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 16,
                cursor: loading || !selectedStore ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Loggar in..." : "Logga in"}
            </button>
          </form>
        )}

        {/* Admin Login */}
        {mode === "admin" && (
          <form onSubmit={handleAdminLogin}>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", marginBottom: 8, fontWeight: 600, fontSize: 14 }}>
                Admin-lösenord
              </label>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Ange admin-lösenord"
                required
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  fontSize: 14,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px 16px",
                background: loading ? "#ccc" : "#E4002B",
                color: "white",
                border: "none",
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 16,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Loggar in..." : "Logga in som Admin"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
