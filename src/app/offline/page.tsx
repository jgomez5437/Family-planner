import React from "react";
import { RefreshCw, WifiOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-auth-gradient)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding:
          "calc(24px + env(safe-area-inset-top)) 20px calc(24px + env(safe-area-inset-bottom))",
        fontFamily: "'Inter', system-ui, sans-serif",
        color: "var(--text-primary)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 22,
          boxShadow: "var(--card-shadow)",
          padding: "28px 22px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 58,
            height: 58,
            borderRadius: 18,
            background: "var(--accent-soft)",
            color: "var(--accent)",
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
            color: "var(--text-primary)",
          }}
        >
          You&apos;re offline
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "var(--text-secondary)",
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
            background: "var(--accent)",
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
