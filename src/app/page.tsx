"use client";

import Link from "next/link";

export default function Home() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "20px" }}>
      <div style={{ maxWidth: 500, width: "100%", maxHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ textAlign: "center", marginBottom: "clamp(30px, 8vw, 40px)" }}>
          <img 
            src="/ica-logo.webp" 
            alt="ICA Logo" 
            style={{ height: "clamp(60px, 15vw, 100px)", marginBottom: "20px", objectFit: "contain" }}
          />
          <p style={{ fontSize: "clamp(1em, 3vw, 1.2em)", color: "#666", fontWeight: 500 }}>Plocklista mellan butiker</p>
        </div>
        <div style={{ display: "grid", gap: "clamp(12px, 3vw, 16px)" }}>
          <Link 
            href="/togo" 
            style={{ 
              padding: "clamp(20px, 5vw, 24px)", 
              background: "linear-gradient(135deg, #E4002B, #C40024)",
              color: "white",
              borderRadius: 12,
              textDecoration: "none",
              textAlign: "center",
              fontSize: "clamp(1.1em, 3vw, 1.3em)",
              fontWeight: 600,
              boxShadow: "0 4px 12px rgba(228, 0, 43, 0.25)",
              transition: "all 0.3s ease",
              border: "none",
              minHeight: "52px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-4px)", e.currentTarget.style.boxShadow = "0 8px 24px rgba(228, 0, 43, 0.35)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)", e.currentTarget.style.boxShadow = "0 4px 12px rgba(228, 0, 43, 0.25)")}
          >
            Beställning
          </Link>
          <Link 
            href="/plock" 
            style={{ 
              padding: "clamp(20px, 5vw, 24px)", 
              background: "linear-gradient(135deg, #666, #444)",
              color: "white",
              borderRadius: 12,
              textDecoration: "none",
              textAlign: "center",
              fontSize: "clamp(1.1em, 3vw, 1.3em)",
              fontWeight: 600,
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
              transition: "all 0.3s ease",
              border: "none",
              minHeight: "52px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-4px)", e.currentTarget.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.25)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)", e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.15)")}
          >
            Plocklista
          </Link>
        </div>
      </div>
    </div>
  );
}
