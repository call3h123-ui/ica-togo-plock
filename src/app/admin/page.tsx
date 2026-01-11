"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getGlobalCategories, createGlobalCategory, updateGlobalCategory, deleteGlobalCategory, moveGlobalCategoryUp, moveGlobalCategoryDown } from "@/lib/data";
import type { Category } from "@/lib/types";

interface Store {
  id: string;
  name: string;
  logo_url?: string;
  email?: string;
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
  const [editingEmail, setEditingEmail] = useState("");
  
  // Delete confirmation
  const [deleteStore, setDeleteStore] = useState<Store | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  
  // Global settings
  const [globalLoginLogo, setGlobalLoginLogo] = useState("");
  
  // Global categories
  const [globalCategories, setGlobalCategories] = useState<Category[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState("");

  const handleFileToDataUrl = (file: File, setter: (val: string) => void) => {
    const reader = new FileReader();
    reader.onloadend = () => setter(reader.result as string);
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    // Check if admin is authenticated
    const adminToken = localStorage.getItem("adminToken");
    if (!adminToken) {
      router.push("/login");
      return;
    }

    loadStores();
    loadGlobalSettings();
    loadGlobalCategories();
  }, [router]);

  const loadGlobalCategories = async () => {
    try {
      const cats = await getGlobalCategories();
      setGlobalCategories(cats);
    } catch (err) {
      console.error("Failed to load global categories:", err);
    }
  };

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

  const loadGlobalSettings = async () => {
    try {
      const response = await fetch("/api/admin/settings");
      if (response.ok) {
        const data = await response.json();
        setGlobalLoginLogo(data.login_logo_url || "");
      }
    } catch (err) {
      console.error("Failed to load global settings:", err);
    }
  };

  const handleSaveGlobalSettings = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login_logo_url: globalLoginLogo.trim() || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.message || "Kunde inte spara inställningar");
        return;
      }

      setSuccess("Allmänna inställningar sparade");
    } catch (err) {
      setError("Ett fel uppstod");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddGlobalCategory = async () => {
    if (!newCategoryName.trim()) {
      setError("Kategornamn kan inte vara tomt");
      return;
    }
    
    setLoading(true);
    setError("");
    try {
      await createGlobalCategory(newCategoryName.trim());
      setNewCategoryName("");
      setSuccess("Kategori skapad");
      loadGlobalCategories();
    } catch (err) {
      setError("Kunde inte skapa kategori");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGlobalCategory = async (catId: string) => {
    if (!editingCatName.trim()) {
      setError("Kategornamn kan inte vara tomt");
      return;
    }
    
    setLoading(true);
    setError("");
    try {
      await updateGlobalCategory(catId, editingCatName.trim());
      setEditingCatId(null);
      setEditingCatName("");
      setSuccess("Kategori uppdaterad");
      loadGlobalCategories();
    } catch (err) {
      setError("Kunde inte uppdatera kategori");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGlobalCategory = async (catId: string) => {
    if (!confirm("Är du säker på att du vill radera denna kategori?")) return;
    
    setLoading(true);
    setError("");
    try {
      await deleteGlobalCategory(catId);
      setSuccess("Kategori raderad");
      loadGlobalCategories();
    } catch (err) {
      setError("Kunde inte radera kategori");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleMoveCategoryUp = async (catId: string, sortIndex: number) => {
    setLoading(true);
    try {
      await moveGlobalCategoryUp(catId, sortIndex);
      loadGlobalCategories();
    } catch (err) {
      setError("Kunde inte flytta kategori");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleMoveCategoryDown = async (catId: string, sortIndex: number) => {
    setLoading(true);
    try {
      await moveGlobalCategoryDown(catId, sortIndex);
      loadGlobalCategories();
    } catch (err) {
      setError("Kunde inte flytta kategori");
      console.error(err);
    } finally {
      setLoading(false);
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

      setSuccess(`Butik "${newStoreName}" har lagts till med standardkategorier`);
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
    setEditingEmail(store.email || "");
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
          email: editingEmail.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Kunde inte uppdatera butik");
        return;
      }

      // If we just updated the currently logged-in store, refresh cached logo
      if (typeof window !== "undefined" && editingStoreId && localStorage.getItem("storeId") === editingStoreId) {
        const newLogo = editingLogoUrl.trim() || "";
        localStorage.setItem("storeLogo", newLogo);
        localStorage.setItem("storeLogoUpdated", Date.now().toString());
      }

      setSuccess(`Butik uppdaterad`);
      setEditingStoreId(null);
      setEditingName("");
      setEditingPassword("");
      setEditingLogoUrl("");
      setEditingEmail("");
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
    setEditingLogoUrl("");
    setEditingEmail("");
  };

  const handleDeleteStore = async () => {
    if (!deleteStore || deleteConfirmName !== deleteStore.name) {
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/stores?storeId=${deleteStore.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.message || "Kunde inte radera butik");
        return;
      }

      setSuccess(`Butik "${deleteStore.name}" har raderats`);
      setDeleteStore(null);
      setDeleteConfirmName("");
      loadStores();
    } catch (err) {
      setError("Ett fel uppstod vid radering");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelDelete = () => {
    setDeleteStore(null);
    setDeleteConfirmName("");
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

        {/* Global Settings */}
        <div style={{ background: "white", padding: "24px", borderRadius: 12, marginBottom: 30, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>
            🌐 Allmänna inställningar
          </h2>
          
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
              Logo på inloggningssidan & startsidan
            </label>
            <input
              type="text"
              value={globalLoginLogo}
              onChange={(e) => setGlobalLoginLogo(e.target.value)}
              placeholder="URL till logo (t.ex. https://...)"
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #ddd",
                borderRadius: 6,
                fontSize: 14,
                boxSizing: "border-box",
              }}
            />
            <div style={{ marginTop: 8 }}>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                eller ladda upp bild
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleFileToDataUrl(file, setGlobalLoginLogo);
                  }
                }}
              />
              {globalLoginLogo && (
                <div style={{ marginTop: 8 }}>
                  <img src={globalLoginLogo} alt="Logo preview" style={{ height: 60, objectFit: "contain" }} />
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handleSaveGlobalSettings}
            disabled={loading}
            style={{
              padding: "10px 20px",
              background: loading ? "#ccc" : "#4CAF50",
              color: "white",
              border: "none",
              borderRadius: 6,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: 14,
            }}
          >
            {loading ? "Sparar..." : "Spara allmänna inställningar"}
          </button>
        </div>

        {/* Global Categories */}
        <div style={{ background: "white", padding: "24px", borderRadius: 12, marginBottom: 30, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>
            📂 Globala avdelningar
          </h2>
          
          <p style={{ fontSize: 14, color: "#666", marginBottom: 16 }}>
            Dessa avdelningar är gemensamma för alla butiker. Varje butik kan själv välja sortering.
          </p>

          <div style={{ display: "grid", gap: 12, marginBottom: 20 }}>
            {globalCategories.map((cat) => (
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
                      onClick={() => handleSaveGlobalCategory(cat.id)}
                      disabled={loading}
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
                      onClick={() => handleMoveCategoryUp(cat.id, cat.sort_index)}
                      title="Flytta upp"
                      style={{ padding: "6px 10px", fontSize: "0.8em", background: "#9C27B0", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => handleMoveCategoryDown(cat.id, cat.sort_index)}
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
                      onClick={() => handleDeleteGlobalCategory(cat.id)}
                      style={{ padding: "6px 10px", fontSize: "0.8em", background: "#E4002B", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}
                    >
                      Ta bort
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Ny avdelningsnamn"
              style={{ flex: 1, padding: "10px", borderRadius: 4, border: "2px solid #E4002B", fontSize: "0.95em" }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddGlobalCategory();
                }
              }}
            />
            <button
              onClick={handleAddGlobalCategory}
              disabled={loading}
              style={{ padding: "10px 16px", fontSize: "0.85em", background: loading ? "#ccc" : "#4CAF50", color: "white", border: "none", borderRadius: 4, cursor: loading ? "not-allowed" : "pointer", fontWeight: 500 }}
            >
              + Lägg till
            </button>
          </div>
        </div>

        {/* Add Store Form */}
        <div style={{ background: "white", padding: "24px", borderRadius: 12, marginBottom: 30, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>
            ➕ Lägg till ny butik
          </h2>

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

            <div style={{ marginBottom: 16 }}>
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
                Butiklogo (valfritt)
              </label>
              <input
                type="text"
                value={newStoreLogoUrl}
                onChange={(e) => setNewStoreLogoUrl(e.target.value)}
                placeholder="URL till logo (t.ex. https://...)"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  fontSize: 14,
                  boxSizing: "border-box",
                }}
              />
              <div style={{ marginTop: 8 }}>
                <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                  eller ladda upp bild
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleFileToDataUrl(file, setNewStoreLogoUrl);
                    }
                  }}
                />
                {newStoreLogoUrl && (
                  <div style={{ marginTop: 8 }}>
                    <img src={newStoreLogoUrl} alt="Logo preview" style={{ height: 48, objectFit: "contain" }} />
                  </div>
                )}
              </div>
            </div>

            <p style={{ fontSize: 12, color: "#666", marginBottom: 16 }}>
              💡 Nya butiker får automatiskt standardkategorier: Kolonial, Kött/Chark, Frukt & Grönt
            </p>

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
            🏪 Befintliga butiker ({stores.length})
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
                        <div style={{ marginBottom: 12 }}>
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
                        <div style={{ marginBottom: 12 }}>
                          <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600 }}>
                            E-post
                          </label>
                          <input
                            type="email"
                            value={editingEmail}
                            onChange={(e) => setEditingEmail(e.target.value)}
                            placeholder="butik@email.se"
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
                            Butiklogo (valfritt)
                          </label>
                          <input
                            type="text"
                            value={editingLogoUrl}
                            onChange={(e) => setEditingLogoUrl(e.target.value)}
                            placeholder="URL till logo (t.ex. https://...)"
                            style={{
                              width: "100%",
                              padding: "8px",
                              border: "1px solid #ddd",
                              borderRadius: 4,
                              fontSize: 14,
                              boxSizing: "border-box",
                            }}
                          />
                          <div style={{ marginTop: 8 }}>
                            <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600 }}>
                              eller ladda upp bild
                            </label>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleFileToDataUrl(file, setEditingLogoUrl);
                                }
                              }}
                            />
                            {editingLogoUrl && (
                              <div style={{ marginTop: 8 }}>
                                <img src={editingLogoUrl} alt="Logo preview" style={{ height: 48, objectFit: "contain" }} />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
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
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        {store.logo_url && (
                          <img src={store.logo_url} alt="" style={{ height: 32, objectFit: "contain" }} />
                        )}
                        <div>
                          <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>
                            {store.name}
                          </p>
                          {store.email && (
                            <p style={{ fontSize: 13, color: "#555", marginBottom: 2 }}>
                              📧 {store.email}
                            </p>
                          )}
                          <p style={{ fontSize: 12, color: "#666" }}>
                            ID: {store.id.substring(0, 8)}...
                          </p>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
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
                        <button
                          onClick={() => setDeleteStore(store)}
                          style={{
                            padding: "8px 12px",
                            background: "#c00",
                            color: "white",
                            border: "none",
                            borderRadius: 4,
                            cursor: "pointer",
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          Radera
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteStore && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={handleCancelDelete}
        >
          <div
            style={{
              background: "white",
              padding: "24px",
              borderRadius: 12,
              maxWidth: 400,
              width: "90%",
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ color: "#c00", marginBottom: 16, fontSize: 20 }}>
              ⚠️ Radera butik
            </h3>
            <p style={{ marginBottom: 16, lineHeight: 1.5 }}>
              Är du säker på att du vill radera butiken <strong>"{deleteStore.name}"</strong>?
            </p>
            <p style={{ marginBottom: 16, color: "#666", fontSize: 14 }}>
              Detta kommer att radera butiken och all tillhörande data (kategorier, ordrar, etc.) och kan inte ångras.
            </p>
            <p style={{ marginBottom: 12, fontWeight: 600 }}>
              Skriv butikens namn för att bekräfta:
            </p>
            <input
              type="text"
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              placeholder={deleteStore.name}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "2px solid #ddd",
                borderRadius: 6,
                fontSize: 14,
                marginBottom: 16,
                boxSizing: "border-box",
              }}
              autoFocus
            />
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                onClick={handleCancelDelete}
                style={{
                  padding: "10px 16px",
                  background: "#ccc",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Avbryt
              </button>
              <button
                onClick={handleDeleteStore}
                disabled={deleteConfirmName !== deleteStore.name || loading}
                style={{
                  padding: "10px 16px",
                  background: deleteConfirmName === deleteStore.name && !loading ? "#c00" : "#ddd",
                  color: deleteConfirmName === deleteStore.name && !loading ? "white" : "#999",
                  border: "none",
                  borderRadius: 6,
                  cursor: deleteConfirmName === deleteStore.name && !loading ? "pointer" : "not-allowed",
                  fontWeight: 600,
                }}
              >
                {loading ? "Raderar..." : "Radera butik"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
