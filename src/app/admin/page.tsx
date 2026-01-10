"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Store {
  id: string;
  name: string;
  logo_url?: string;
}

export default function AdminPage() {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [newStoreName, setNewStoreName] = useState("");
  const [newStorePassword, setNewStorePassword] = useState("");
  const [newStoreLogoUrl, setNewStoreLogoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingPassword, setEditingPassword] = useState("");
  const [editingLogoUrl, setEditingLogoUrl] = useState("");

  useEffect(() => {
    // Check if admin is authenticated
    const adminToken = localStorage.getItem("adminToken");
    if (!adminToken) {
      router.push("/login");
      return;
    }

    loadStores();
  }, [router]);

  const loadStores = async () => {
    try {
      const response = await fetch("/api/stores");
      const data = await response.json();
      if (Array.isArray(data)) {
        setStores(data);
      } else {
        console.error("Invalid stores response:", data);
        setStores([]);
        setError("Kunde inte ladda butiker (ogiltig respons)");
      }
    } catch (err) {
      console.error("Failed to load stores:", err);
      setError("Kunde inte ladda butiker");
      setStores([]);
    }
  };

  const handleAddStore = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      if (!newStoreName.trim() || !newStorePassword.trim()) {
        setError("Namn och lösenord krävs");
        return;
      }

      const response = await fetch("/api/admin/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newStoreName.trim(),
          password: newStorePassword.trim(),
          logo_url: newStoreLogoUrl.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Kunde inte lägga till butik");
        return;
      }

      setSuccess(`Butik "${newStoreName}" har lagts till`);
      setNewStoreName("");
      setNewStorePassword("");
      setNewStoreLogoUrl("");
      loadStores();
    } catch (err) {
      setError("Ett fel uppstod");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    router.push("/login");
  };

  const handleEditStore = (store: Store) => {
    setEditingStoreId(store.id);
    setEditingName(store.name);
    setEditingPassword("");
    setEditingLogoUrl(store.logo_url || "");
  };

  const handleSaveEdit = async () => {
    if (!editingName.trim()) {
      setError("Butiknamn kan inte vara tomt");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/admin/stores", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: editingStoreId,
          name: editingName.trim(),
          password: editingPassword || undefined,
          logo_url: editingLogoUrl.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Kunde inte uppdatera butik");
        return;
      }

      setSuccess(`Butik uppdaterad`);
      setEditingStoreId(null);
      setEditingName("");
      setEditingPassword("");
      setEditingLogoUrl("");
      loadStores();
    } catch (err) {
      setError("Ett fel uppstod");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingStoreId(null);
    setEditingName("");
    setEditingPassword("");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", padding: "20px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 30 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#E4002B" }}>
            Admin - Butikadministration
          </h1>
          <button
            onClick={handleLogout}
            style={{
              padding: "10px 16px",
              background: "#ccc",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Logga ut
          </button>
        </div>

        {/* Add Store Form */}
        <div style={{ background: "white", padding: "24px", borderRadius: 12, marginBottom: 30, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>
            Lägg till ny butik
          </h2>

          {error && (
            <div style={{
              background: "#fee",
              border: "1px solid #fcc",
              color: "#c00",
              padding: "12px 16px",
              borderRadius: 6,
              marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          {success && (
            <div style={{
              background: "#efe",
              border: "1px solid #cfc",
              color: "#060",
              padding: "12px 16px",
              borderRadius: 6,
              marginBottom: 16,
            }}>
              {success}
            </div>
          )}

          <form onSubmit={handleAddStore}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
                Butiknamn
              </label>
              <input
                type="text"
                value={newStoreName}
                onChange={(e) => setNewStoreName(e.target.value)}
                placeholder="T.ex. Agunnaryd"
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

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
                Lösenord
              </label>
              <input
                type="password"
                value={newStorePassword}
                onChange={(e) => setNewStorePassword(e.target.value)}
                placeholder="T.ex. AG123"
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

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
                Logo URL (valfritt)
              </label>
              <input
                type="text"
                value={newStoreLogoUrl}
                onChange={(e) => setNewStoreLogoUrl(e.target.value)}
                placeholder="T.ex. https://..."
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
                padding: "12px 24px",
                background: loading ? "#ccc" : "#E4002B",
                color: "white",
                border: "none",
                borderRadius: 6,
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: 16,
              }}
            >
              {loading ? "Lägger till..." : "Lägg till butik"}
            </button>
          </form>
        </div>

        {/* Stores List */}
        <div style={{ background: "white", padding: "24px", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>
            Befintliga butiker ({stores.length})
          </h2>

          {stores.length === 0 ? (
            <p style={{ color: "#666" }}>Inga butiker ännu</p>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {stores.map(store => (
                <div
                  key={store.id}
                  style={{
                    background: "#f9f9f9",
                    padding: "16px",
                    borderRadius: 8,
                    border: "1px solid #eee",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  {editingStoreId === store.id ? (
                    <>
                      <div style={{ flex: 1, marginRight: 16 }}>
                        <div style={{ marginBottom: 12 }}>
                          <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600 }}>
                            Butiknamn
                          </label>
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            style={{
                              width: "100%",
                              padding: "8px",
                              border: "1px solid #ddd",
                              borderRadius: 4,
                              fontSize: 14,
                              boxSizing: "border-box",
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600 }}>
                            Nytt lösenord (lämna tomt för att behålla)
                          </label>
                          <input
                            type="password"
                            value={editingPassword}
                            onChange={(e) => setEditingPassword(e.target.value)}
                            placeholder="Lämna tomt för att behålla"
                            style={{
                              width: "100%",
                              padding: "8px",
                              border: "1px solid #ddd",
                              borderRadius: 4,
                              fontSize: 14,
                              boxSizing: "border-box",
                            }}
                          />
                        </div>
                        <div style={{ marginTop: 12 }}>
                          <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600 }}>
                            Logo URL (valfritt)
                          </label>
                          <input
                            type="text"
                            value={editingLogoUrl}
                            onChange={(e) => setEditingLogoUrl(e.target.value)}
                            placeholder="T.ex. https://..."
                            style={{
                              width: "100%",
                              padding: "8px",
                              border: "1px solid #ddd",
                              borderRadius: 4,
                              fontSize: 14,
                              boxSizing: "border-box",
                            }}
                          />
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          onClick={handleSaveEdit}
                          disabled={loading}
                          style={{
                            padding: "8px 12px",
                            background: loading ? "#ccc" : "#4CAF50",
                            color: "white",
                            border: "none",
                            borderRadius: 4,
                            cursor: loading ? "not-allowed" : "pointer",
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          Spara
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          style={{
                            padding: "8px 12px",
                            background: "#999",
                            color: "white",
                            border: "none",
                            borderRadius: 4,
                            cursor: "pointer",
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          Avbryt
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>
                          {store.name}
                        </p>
                        <p style={{ fontSize: 12, color: "#666" }}>
                          ID: {store.id.substring(0, 8)}...
                        </p>
                      </div>
                      <button
                        onClick={() => handleEditStore(store)}
                        style={{
                          padding: "8px 12px",
                          background: "#2196F3",
                          color: "white",
                          border: "none",
                          borderRadius: 4,
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        Redigera
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
