"use client";

import React, { useState } from "react";
import { ArrowRight, KeyRound, LogIn, UserPlus, Users } from "lucide-react";
import {
  btnStyle,
  CARD_SHADOW,
  inputStyle,
  MEMBER_COLOR_PALETTES,
  MEMBER_EMOJIS,
} from "@/lib/constants";
import type { FamilyStatePayload } from "@/types/family";

export function AuthScreen({
  onAuthenticated,
}: {
  onAuthenticated: (state: FamilyStatePayload) => void;
}) {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [familyMode, setFamilyMode] = useState<"create" | "join">("create");

  // Login fields
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emoji, setEmoji] = useState<string>(MEMBER_EMOJIS[0]);
  const [paletteIdx, setPaletteIdx] = useState(0);
  const [familyName, setFamilyName] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedPalette =
    MEMBER_COLOR_PALETTES[paletteIdx] || MEMBER_COLOR_PALETTES[0];

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Sign in failed.");
        return;
      }
      onAuthenticated(data.state);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          emoji,
          color: selectedPalette.color,
          light: selectedPalette.light,
          mode: familyMode,
          familyName: familyMode === "create" ? familyName : undefined,
          inviteCode: familyMode === "join" ? inviteCode : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create account.");
        return;
      }
      onAuthenticated(data.state);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, #FFE8D4 0%, #FFF9F0 48%, #F8EFE0 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "28px 16px",
        fontFamily: "'Inter', system-ui, sans-serif",
        color: "#2B2622",
      }}
    >
      <div style={{ width: "100%", maxWidth: 440 }}>
        {/* Header / Brand */}
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: 18,
              background: "linear-gradient(145deg, #E8622C, #C84D1D)",
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              boxShadow: "0 8px 22px rgba(232,98,44,0.28)",
              marginBottom: 12,
            }}
          >
            🏡
          </div>
          <div
            style={{
              fontFamily: "'Baloo 2', sans-serif",
              fontSize: 28,
              fontWeight: 800,
              lineHeight: 1.1,
              color: "#2B2622",
            }}
          >
            Family Planner
          </div>
          <div style={{ fontSize: 13.5, color: "#8A7F70", marginTop: 4 }}>
            Schedules, tasks, medications, and updates — all in one private place.
          </div>
        </div>

        {/* Auth Card */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #F1E8D9",
            borderRadius: 22,
            boxShadow: CARD_SHADOW,
            padding: 22,
          }}
        >
          {/* Mode Tabs */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              background: "#F5EFE3",
              borderRadius: 14,
              padding: 4,
              marginBottom: 18,
            }}
          >
            <button
              type="button"
              onClick={() => {
                setTab("login");
                setError(null);
              }}
              style={{
                border: "none",
                borderRadius: 11,
                padding: "9px 12px",
                fontSize: 13.5,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                background: tab === "login" ? "#fff" : "transparent",
                color: tab === "login" ? "#2B2622" : "#7D7366",
                boxShadow:
                  tab === "login" ? "0 1px 4px rgba(43,38,34,0.08)" : "none",
              }}
            >
              <LogIn size={15} /> Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("register");
                setError(null);
              }}
              style={{
                border: "none",
                borderRadius: 11,
                padding: "9px 12px",
                fontSize: 13.5,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                background: tab === "register" ? "#fff" : "transparent",
                color: tab === "register" ? "#2B2622" : "#7D7366",
                boxShadow:
                  tab === "register" ? "0 1px 4px rgba(43,38,34,0.08)" : "none",
              }}
            >
              <UserPlus size={15} /> Create Account
            </button>
          </div>

          {error && (
            <div
              role="alert"
              style={{
                background: "#FCE9DF",
                border: "1px solid #F2C4AF",
                color: "#B23A1D",
                borderRadius: 12,
                padding: "10px 12px",
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 14,
              }}
            >
              {error}
            </div>
          )}

          {tab === "login" ? (
            <form onSubmit={handleLogin}>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                required
                autoFocus
                autoComplete="email"
                placeholder="you@example.com"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                style={inputStyle}
              />

              <label style={{ ...labelStyle, marginTop: 12 }}>Password</label>
              <input
                type="password"
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                style={inputStyle}
              />

              <button
                type="submit"
                disabled={submitting}
                style={{
                  ...btnStyle,
                  width: "100%",
                  marginTop: 18,
                  background: "#E8622C",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  opacity: submitting ? 0.65 : 1,
                  boxShadow: "0 4px 14px rgba(232,98,44,0.3)",
                }}
              >
                {submitting ? "Signing in..." : "Sign In"}
                {!submitting && <ArrowRight size={16} />}
              </button>

              <div
                style={{
                  textAlign: "center",
                  marginTop: 14,
                  fontSize: 12.5,
                  color: "#8A7F70",
                }}
              >
                New here?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setTab("register");
                    setError(null);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#E8622C",
                    fontWeight: 700,
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  Create your family account
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegister}>
              {/* Live Avatar Preview */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  background: "#FFF9F0",
                  border: "1px solid #F1E8D9",
                  borderRadius: 14,
                  padding: "10px 12px",
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: "50%",
                    background: `linear-gradient(145deg, ${selectedPalette.light}, #fff)`,
                    border: `2px solid ${selectedPalette.color}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 24,
                    flexShrink: 0,
                  }}
                >
                  {emoji}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>
                    {name.trim() || "Your Profile"}
                  </div>
                  <div style={{ fontSize: 12, color: "#8A7F70" }}>
                    {familyMode === "create"
                      ? familyName.trim() || "Starting a new family"
                      : inviteCode.trim()
                        ? `Joining ${inviteCode.trim().toUpperCase()}`
                        : "Joining an existing family"}
                  </div>
                </div>
              </div>

              <label style={labelStyle}>Your Name</label>
              <input
                type="text"
                required
                autoFocus
                placeholder="e.g. Jordan, Mom, Dad"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
              />

              <label style={{ ...labelStyle, marginTop: 12 }}>Email</label>
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
              />

              <label style={{ ...labelStyle, marginTop: 12 }}>Password</label>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
              />

              {/* Emoji & Color Picker */}
              <label style={{ ...labelStyle, marginTop: 14 }}>Avatar</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {MEMBER_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setEmoji(em)}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      border:
                        emoji === em
                          ? `2px solid ${selectedPalette.color}`
                          : "1.5px solid #EFE4D2",
                      background:
                        emoji === em ? selectedPalette.light : "#fff",
                      fontSize: 17,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {em}
                  </button>
                ))}
              </div>

              <label style={{ ...labelStyle, marginTop: 12 }}>Color</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {MEMBER_COLOR_PALETTES.map((p, idx) => (
                  <button
                    key={p.name}
                    type="button"
                    aria-label={p.name}
                    onClick={() => setPaletteIdx(idx)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: p.color,
                      border:
                        paletteIdx === idx
                          ? "3px solid #2B2622"
                          : "2px solid #fff",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
                      cursor: "pointer",
                    }}
                  />
                ))}
              </div>

              {/* Family setup mode */}
              <label style={{ ...labelStyle, marginTop: 14 }}>Household</label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                <button
                  type="button"
                  onClick={() => setFamilyMode("create")}
                  style={{
                    border: `1.5px solid ${
                      familyMode === "create" ? "#E8622C" : "#EFE4D2"
                    }`,
                    background: familyMode === "create" ? "#FCE9DF" : "#fff",
                    color: familyMode === "create" ? "#B24A1D" : "#6B6259",
                    borderRadius: 12,
                    padding: "9px 10px",
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <Users size={14} /> New Family
                </button>
                <button
                  type="button"
                  onClick={() => setFamilyMode("join")}
                  style={{
                    border: `1.5px solid ${
                      familyMode === "join" ? "#E8622C" : "#EFE4D2"
                    }`,
                    background: familyMode === "join" ? "#FCE9DF" : "#fff",
                    color: familyMode === "join" ? "#B24A1D" : "#6B6259",
                    borderRadius: 12,
                    padding: "9px 10px",
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <KeyRound size={14} /> Join w/ Code
                </button>
              </div>

              {familyMode === "create" ? (
                <>
                  <label style={labelStyle}>Family Name</label>
                  <input
                    type="text"
                    required
                    maxLength={32}
                    placeholder="e.g. The Gomez Family"
                    value={familyName}
                    onChange={(e) => setFamilyName(e.target.value)}
                    style={inputStyle}
                  />
                </>
              ) : (
                <>
                  <label style={labelStyle}>Family Invite Code</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. FAM-7X9K2P"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    style={{
                      ...inputStyle,
                      textTransform: "uppercase",
                      letterSpacing: 1,
                      fontWeight: 700,
                    }}
                  />
                  <div
                    style={{
                      fontSize: 11.5,
                      color: "#8A7F70",
                      marginTop: 5,
                    }}
                  >
                    Ask a family member for their invite code in Settings → Family.
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={submitting}
                style={{
                  ...btnStyle,
                  width: "100%",
                  marginTop: 18,
                  background: "#E8622C",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  opacity: submitting ? 0.65 : 1,
                  boxShadow: "0 4px 14px rgba(232,98,44,0.3)",
                }}
              >
                {submitting
                  ? "Creating account..."
                  : familyMode === "create"
                    ? "Create Family & Continue"
                    : "Join Family & Continue"}
                {!submitting && <ArrowRight size={16} />}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  color: "#6B6259",
  marginBottom: 6,
};
