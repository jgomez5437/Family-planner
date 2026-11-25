"use client";

import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  KeyRound,
  LogIn,
  UserPlus,
  Users,
} from "lucide-react";
import {
  btnStyle,
  CARD_SHADOW,
  inputStyle,
  MEMBER_COLOR_PALETTES,
  MEMBER_EMOJIS,
} from "@/lib/constants";
import type { FamilyStatePayload } from "@/types/family";
import { AvatarPicker, AvatarPreview } from "@/components/ui/AvatarPicker";

export function AuthScreen({
  onAuthenticated,
  initialInviteCode = null,
  invitedFamilyName = null,
  initialInviteInvalid = false,
}: {
  onAuthenticated: (state: FamilyStatePayload) => void;
  initialInviteCode?: string | null;
  invitedFamilyName?: string | null;
  initialInviteInvalid?: boolean;
}) {
  const normalizedInitialInvite = (initialInviteCode || "").trim().toUpperCase();
  const [tab, setTab] = useState<"login" | "register">(
    normalizedInitialInvite ? "register" : "login"
  );
  const [familyMode, setFamilyMode] = useState<"create" | "join">(
    normalizedInitialInvite ? "join" : "create"
  );
  const [inviteLinkActive, setInviteLinkActive] = useState<boolean>(
    Boolean(normalizedInitialInvite) && !initialInviteInvalid
  );

  // Login fields
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emoji, setEmoji] = useState<string>(MEMBER_EMOJIS[0]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarProcessing, setAvatarProcessing] = useState(false);
  const [paletteIdx, setPaletteIdx] = useState(0);
  const [familyName, setFamilyName] = useState("");
  const [inviteCode, setInviteCode] = useState(normalizedInitialInvite);

  const [error, setError] = useState<string | null>(
    initialInviteInvalid
      ? "This invite link is no longer valid or has expired. Ask a family member for a new link or enter a valid code below."
      : null
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (normalizedInitialInvite || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const urlCode = (params.get("invite") || params.get("code") || "")
      .trim()
      .toUpperCase();
    if (urlCode) {
      setInviteCode(urlCode);
      setFamilyMode("join");
      setTab("register");
      setInviteLinkActive(true);
    }
  }, [normalizedInitialInvite]);

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
    if (avatarProcessing) return;
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
          avatarUrl,
          color: selectedPalette.color,
          light: selectedPalette.light,
          mode: familyMode,
          familyName: familyMode === "create" ? familyName : undefined,
          inviteCode: familyMode === "join" ? inviteCode : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 404 && familyMode === "join") {
          setInviteLinkActive(false);
        }
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
        background: "var(--bg-auth-gradient)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding:
          "calc(28px + env(safe-area-inset-top)) 16px calc(28px + env(safe-area-inset-bottom))",
        fontFamily: "'Inter', system-ui, sans-serif",
        color: "var(--text-primary)",
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
              color: "var(--text-primary)",
            }}
          >
            Family Planner
          </div>
          <div style={{ fontSize: 13.5, color: "var(--text-muted)", marginTop: 4 }}>
            Schedules, tasks, medications, and updates — all in one private place.
          </div>
        </div>

        {/* Auth Card */}
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
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
              background: "var(--bg-subtle-alt)",
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
                background: tab === "login" ? "var(--bg-surface)" : "transparent",
                color: tab === "login" ? "var(--text-primary)" : "var(--text-muted)",
                boxShadow:
                  tab === "login" ? "0 1px 4px rgba(0,0,0,0.14)" : "none",
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
                background: tab === "register" ? "var(--bg-surface)" : "transparent",
                color: tab === "register" ? "var(--text-primary)" : "var(--text-muted)",
                boxShadow:
                  tab === "register" ? "0 1px 4px rgba(0,0,0,0.14)" : "none",
              }}
            >
              <UserPlus size={15} /> Create Account
            </button>
          </div>

          {error && (
            <div
              role="alert"
              style={{
                background: "var(--accent-soft)",
                border: "1px solid var(--accent-border)",
                color: "var(--danger)",
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
                  background: "var(--accent)",
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
                  color: "var(--text-muted)",
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
                    color: "var(--accent)",
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
              {inviteLinkActive && familyMode === "join" && inviteCode.trim() && (
                <div
                  style={{
                    background: "var(--success-soft)",
                    border: "1px solid var(--success-border)",
                    borderRadius: 14,
                    padding: "11px 13px",
                    marginBottom: 14,
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                  }}
                >
                  <CheckCircle2
                    size={18}
                    color="var(--success-ink)"
                    style={{ flexShrink: 0, marginTop: 1 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--success-ink)",
                        lineHeight: 1.3,
                      }}
                    >
                      {invitedFamilyName
                        ? `You're invited to join ${invitedFamilyName}`
                        : "You're joining via an invite link"}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: "var(--success)",
                        marginTop: 3,
                        lineHeight: 1.35,
                      }}
                    >
                      Invite code{" "}
                      <strong style={{ fontFamily: "monospace" }}>
                        {inviteCode.trim().toUpperCase()}
                      </strong>{" "}
                      is already applied — just create your account below.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInviteLinkActive(false)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--success-ink)",
                      fontSize: 11.5,
                      fontWeight: 700,
                      textDecoration: "underline",
                      cursor: "pointer",
                      padding: 0,
                      flexShrink: 0,
                    }}
                  >
                    Change
                  </button>
                </div>
              )}

              {/* Live Avatar Preview */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  background: "var(--bg-app)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 14,
                  padding: "10px 12px",
                  marginBottom: 14,
                }}
              >
                <AvatarPreview
                  emoji={emoji}
                  avatarUrl={avatarUrl}
                  color={selectedPalette.color}
                  light={selectedPalette.light}
                  size={46}
                  name={name.trim() || "Your Profile"}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>
                    {name.trim() || "Your Profile"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {familyMode === "create"
                      ? familyName.trim() || "Starting a new family"
                      : inviteLinkActive && invitedFamilyName
                        ? `Joining ${invitedFamilyName}`
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

              {/* Avatar / Photo Picker */}
              <label style={{ ...labelStyle, marginTop: 14 }}>Avatar</label>
              <AvatarPicker
                emoji={emoji}
                avatarUrl={avatarUrl}
                color={selectedPalette.color}
                light={selectedPalette.light}
                onEmojiChange={setEmoji}
                onAvatarUrlChange={setAvatarUrl}
                onProcessingChange={setAvatarProcessing}
              />

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
                          ? "3px solid var(--text-primary)"
                          : "2px solid var(--bg-surface)",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
                      cursor: "pointer",
                    }}
                  />
                ))}
              </div>

              {/* Family setup mode (hidden when joining via invite link unless user clicks Change) */}
              {!inviteLinkActive && (
                <>
                  <label style={{ ...labelStyle, marginTop: 14 }}>
                    Household
                  </label>
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
                          familyMode === "create"
                            ? "var(--accent)"
                            : "var(--border-default)"
                        }`,
                        background:
                          familyMode === "create"
                            ? "var(--accent-soft)"
                            : "var(--bg-surface)",
                        color:
                          familyMode === "create"
                            ? "var(--accent-ink)"
                            : "var(--text-secondary)",
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
                          familyMode === "join"
                            ? "var(--accent)"
                            : "var(--border-default)"
                        }`,
                        background:
                          familyMode === "join"
                            ? "var(--accent-soft)"
                            : "var(--bg-surface)",
                        color:
                          familyMode === "join"
                            ? "var(--accent-ink)"
                            : "var(--text-secondary)",
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
                        onChange={(e) =>
                          setInviteCode(e.target.value.toUpperCase())
                        }
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
                          color: "var(--text-muted)",
                          marginTop: 5,
                        }}
                      >
                        Ask a family member for their invite code or invite link
                        in Settings → Family.
                      </div>
                    </>
                  )}
                </>
              )}

              <button
                type="submit"
                disabled={submitting || avatarProcessing}
                style={{
                  ...btnStyle,
                  width: "100%",
                  marginTop: 18,
                  background: "var(--accent)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  opacity: submitting || avatarProcessing ? 0.65 : 1,
                  boxShadow: "0 4px 14px rgba(232,98,44,0.3)",
                }}
              >
                {submitting
                  ? "Creating account..."
                  : avatarProcessing
                    ? "Processing photo..."
                    : familyMode === "create"
                      ? "Create Family & Continue"
                      : inviteLinkActive && invitedFamilyName
                        ? `Join ${invitedFamilyName}`
                        : "Join Family & Continue"}
                {!submitting && !avatarProcessing && <ArrowRight size={16} />}
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
  color: "var(--text-secondary)",
  marginBottom: 6,
};
