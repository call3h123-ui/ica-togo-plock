"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_LOGO = "https://assets.icanet.se/image/upload/t_MinButik_Mediabank_preview/nx8cd2yadrnpl49hqiwc.webp";

export default function LoginPage() {
  const router = useRouter();
  const [storeName, setStoreName] = useState("");
  const [storePassword, setStorePassword] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"store" | "admin">("store");
  const [showAdmin, setShowAdmin] = useState(false);
  const [logoClickCount, setLogoClickCount] = useState(0);
  const [loginLogo, setLoginLogo] = useState(DEFAULT_LOGO);

  // Fetch global login logo
  useEffect(() => {
    fetch("/api/admin/settings")
      .then(res => res.json())
      .then(data => {
        if (data.login_logo_url) {
          setLoginLogo(data.login_logo_url);
        }
      })
      .catch(err => console.error("Failed to fetch login logo:", err));
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
          storeName: storeName,
          password: storePassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Inloggning misslyckades");
        return;
      }

      // Clear old store data first, then store new auth info
      localStorage.removeItem("storeLogo");
      localStorage.setItem("storeId", data.storeId);
      localStorage.setItem("storeName", data.storeName);
      if (data.logoUrl) {
        localStorage.setItem("storeLogo", data.logoUrl);
      }

      // Redirect to home page to select between beställning/plocklista
      router.push("/");
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
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#e3000b", padding: "20px" }}>
      <div style={{ width: "100%", maxWidth: 400, background: "white", padding: "40px", borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.2)" }}>
        
        <img 
          src={loginLogo} 
          alt="ICA Logo" 
          onClick={() => {
            setLogoClickCount(logoClickCount + 1);
            if (logoClickCount + 1 >= 5) {
              setShowAdmin(!showAdmin);
              setLogoClickCount(0);
            }
          }}
          style={{ height: "clamp(60px, 15vw, 100px)", marginBottom: "30px", display: "block", margin: "0 auto 30px", objectFit: "contain", cursor: "pointer" }}
        />

        {/* Mode toggle - Only show if admin mode is unlocked */}
        {showAdmin && (
          <div style={{ display: "flex", gap: 10, marginBottom: 30 }}>
            <button
              onClick={() => setMode("store")}
              style={{
                flex: 1,
                padding: "10px 16px",
                background: mode === "store" ? "#e3000b" : "#f0f0f0",
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
                background: mode === "admin" ? "#e3000b" : "#f0f0f0",
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
        )}

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
        {/* Store Login Form */}
        {mode === "store" && (
          <form onSubmit={handleStoreLogin}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", marginBottom: 8, fontWeight: 600, fontSize: 14 }}>
                Butiknamn
              </label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="Ange butiknamn"
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
              disabled={loading || !storeName}
              style={{
                width: "100%",
                padding: "12px 16px",
                background: loading || !storeName ? "#ccc" : "#e3000b",
                color: "white",
                border: "none",
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 16,
                cursor: loading || !storeName ? "not-allowed" : "pointer",
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
                background: loading ? "#ccc" : "#e3000b",
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
