"use client";

import { useEffect, useState } from "react";

export function VersionGate({ children }: { children: React.ReactNode }) {
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    let mounted = true;
    let timer: NodeJS.Timeout;

    const fetchVersion = async () => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) throw new Error("Version API svarade inte");
        const data = (await res.json()) as { version?: string };
        const ver = data.version || "unknown";
        if (!currentVersion) {
          setCurrentVersion(ver);
          setLatestVersion(ver);
        } else if (ver !== currentVersion) {
          setLatestVersion(ver);
          setShowPrompt(true);
        }
      } catch (err) {
        // Svälj fel; nästa poll försöker igen
        console.warn("Kunde inte hämta version", err);
      }
    };

    fetchVersion();
    timer = setInterval(fetchVersion, 30000);

    return () => {
      mounted = false;
      if (timer) clearInterval(timer);
    };
  }, [currentVersion]);

  return (
    <>
      {children}
      {showPrompt && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 9999, display: "grid", placeItems: "center", padding: 16 }}>
          <div style={{ background: "white", borderRadius: 12, padding: 24, maxWidth: 420, width: "100%", boxShadow: "0 12px 40px rgba(0,0,0,0.25)", textAlign: "center" }}>
            <h2 style={{ marginTop: 0, marginBottom: 12 }}>Ny version finns</h2>
            <p style={{ margin: "0 0 16px 0", color: "#444", lineHeight: 1.5 }}>
              Appen har uppdaterats. Ladda om för att få senaste ändringarna.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{ width: "100%", padding: "12px 16px", fontWeight: 700 }}
            >
              🔄 Ladda om nu
            </button>
          </div>
        </div>
      )}
    </>
  );
}
