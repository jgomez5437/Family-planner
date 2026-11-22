import React from "react";
import { RefreshCw, WifiOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, #FFE8D4 0%, #FFF9F0 48%, #F8EFE0 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding:
          "calc(24px + env(safe-area-inset-top)) 20px calc(24px + env(safe-area-inset-bottom))",
        fontFamily: "'Inter', system-ui, sans-serif",
        color: "#2B2622",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: "#fff",
          border: "1px solid #F1E8D9",
          borderRadius: 22,
          boxShadow:
            "0 1px 2px rgba(74,50,24,0.05), 0 6px 18px rgba(74,50,24,0.06)",
          padding: "28px 22px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 58,
            height: 58,
            borderRadius: 18,
            background: "#FCE9DF",
            color: "#E8622C",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 14,
          }}
        >
          <WifiOff size={28} strokeWidth={2.2} />
        </div>
        <h1
          style={{
            fontFamily: "'Baloo 2', sans-serif",
            fontSize: 24,
            fontWeight: 800,
            margin: "0 0 8px",
            color: "#2B2622",
          }}
        >
          You&apos;re offline
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "#6B6259",
            lineHeight: 1.5,
            margin: "0 0 22px",
          }}
        >
          Family Planner needs an internet connection to sync your latest family
          schedules, medications, tasks, and wall updates.
        </p>
        <a
          href="/"
          style={{
            width: "100%",
            textDecoration: "none",
            border: "none",
            borderRadius: 12,
            padding: "12px 18px",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            background: "#E8622C",
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            boxShadow: "0 4px 14px rgba(232,98,44,0.28)",
          }}
        >
          <RefreshCw size={16} /> Try Again
        </a>
      </div>
    </div>
  );
}
