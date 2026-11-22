"use client";

import React, { useEffect, useState } from "react";
import {
  Bell,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  Copy,
  Download,
  Link2,
  LogOut,
  Mail,
  MessageSquare,
  Monitor,
  Moon,
  MoreVertical,
  Pencil,
  PlusSquare,
  RefreshCw,
  Share,
  Share2,
  Smartphone,
  Sun,
  User,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  btnStyle,
  CARD_SHADOW,
  iconBtnStyle,
  inputStyle,
  MEMBER_COLOR_PALETTES,
} from "@/lib/constants";
import { useMembers } from "@/components/MembersContext";
import { usePwa } from "@/components/pwa/PwaContext";
import type { Member, MemberId } from "@/types/family";
import { AvatarPicker, AvatarPreview } from "@/components/ui/AvatarPicker";
import { AvatarDot, FieldLabel } from "@/components/ui/Primitives";
import { MemberModal, type MemberFormData } from "./MemberModal";

export type SettingsSubScreen =
  | "root"
  | "family"
  | "notifications"
  | "account"
  | "appearance"
  | "install";

export function SettingsScreen({
  initialScreen = "root",
  onClose,
  familyName,
  inviteCode,
  currentUserId,
  onRenameFamily,
  onRegenerateInviteCode,
  onAddMember,
  onUpdateMember,
  onDeleteMember,
  onSignOut,
}: {
  initialScreen?: SettingsSubScreen;
  onClose: () => void;
  familyName: string;
  inviteCode: string;
  currentUserId: MemberId;
  onRenameFamily: (name: string) => void;
  onRegenerateInviteCode: () => Promise<void>;
  onAddMember: (data: MemberFormData) => Promise<string | null>;
  onUpdateMember: (
    memberId: MemberId,
    data: Partial<MemberFormData> & { password?: string }
  ) => Promise<string | null>;
  onDeleteMember: (memberId: MemberId) => Promise<string | null>;
  onSignOut: () => void;
}) {
  const { members, memberById } = useMembers();
  const { isStandalone, isIos, canInstallNative, triggerInstall } = usePwa();
  const me = memberById(currentUserId);

  const [screen, setScreen] = useState<SettingsSubScreen>(initialScreen);
  const [editingName, setEditingName] = useState(familyName);
  const trimmedName = editingName.trim();
  const canSaveName = trimmedName.length > 0 && trimmedName !== familyName;
  function saveName() {
    if (canSaveName) onRenameFamily(trimmedName);
  }

  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showShareFallback, setShowShareFallback] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [memberModalState, setMemberModalState] = useState<
    { mode: "add" } | { mode: "edit"; member: Member } | null
  >(null);

  // Account edit state
  const [accountName, setAccountName] = useState(me.name);
  const [accountEmail, setAccountEmail] = useState(me.email || "");
  const [accountEmoji, setAccountEmoji] = useState(me.emoji);
  const [accountAvatarUrl, setAccountAvatarUrl] = useState<string | null>(
    me.avatarUrl || null
  );
  const [accountAvatarProcessing, setAccountAvatarProcessing] = useState(false);
  const [accountPaletteIdx, setAccountPaletteIdx] = useState(
    Math.max(
      0,
      MEMBER_COLOR_PALETTES.findIndex((p) => p.color === me.color)
    )
  );
  const [newPassword, setNewPassword] = useState("");
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountMessage, setAccountMessage] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    setAccountName(me.name);
    setAccountEmail(me.email || "");
    setAccountEmoji(me.emoji);
    setAccountAvatarUrl(me.avatarUrl || null);
    setAccountPaletteIdx(
      Math.max(
        0,
        MEMBER_COLOR_PALETTES.findIndex((p) => p.color === me.color)
      )
    );
  }, [me.name, me.email, me.emoji, me.avatarUrl, me.color]);

  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({
    Events: true,
    Tasks: true,
    Announcements: true,
    Changes: true,
    Reminders: true,
  });
  const [appearance, setAppearance] = useState("system");

  function getInviteLink(): string {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/?invite=${encodeURIComponent(inviteCode)}`;
  }

  function getShareMessage(): string {
    return `Join ${familyName} on Family Planner! Tap this link to create your account (the invite code is already included):`;
  }

  async function copyText(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const el = document.createElement("textarea");
        el.value = text;
        el.setAttribute("readonly", "");
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(el);
        return ok;
      } catch {
        return false;
      }
    }
  }

  async function copyInviteCode() {
    if (await copyText(inviteCode)) {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2200);
    }
  }

  async function copyInviteLink() {
    if (await copyText(getInviteLink())) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    }
  }

  async function handleSendInviteLink() {
    const url = getInviteLink();
    const title = `Join ${familyName} on Family Planner`;
    const text = getShareMessage();

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
      }
    }

    setShowShareFallback((prev) => !prev);
  }

  async function handleRegenerateCode() {
    setRegenerating(true);
    setCopiedCode(false);
    setCopiedLink(false);
    await onRegenerateInviteCode();
    setRegenerating(false);
  }

  async function handleSaveAccount(e: React.FormEvent) {
    e.preventDefault();
    if (accountAvatarProcessing) return;
    setAccountMessage(null);
    if (!accountName.trim()) {
      setAccountMessage({ tone: "error", text: "Name cannot be empty." });
      return;
    }
    if (newPassword && newPassword.length < 6) {
      setAccountMessage({
        tone: "error",
        text: "New password must be at least 6 characters.",
      });
      return;
    }
    const palette =
      MEMBER_COLOR_PALETTES[accountPaletteIdx] || MEMBER_COLOR_PALETTES[0];
    setAccountSaving(true);
    const err = await onUpdateMember(currentUserId, {
      name: accountName.trim(),
      email: accountEmail.trim() || null,
      emoji: accountEmoji,
      avatarUrl: accountAvatarUrl,
      color: palette.color,
      light: palette.light,
      password: newPassword || undefined,
    });
    setAccountSaving(false);
    if (err) {
      setAccountMessage({ tone: "error", text: err });
    } else {
      setNewPassword("");
      setAccountMessage({ tone: "ok", text: "Account updated." });
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#FFF9F0",
        zIndex: 150,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "calc(14px + env(safe-area-inset-top)) 16px 14px",
          borderBottom: "1px solid #EFE4D2",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        {screen !== "root" ? (
          <button onClick={() => setScreen("root")} style={iconBtnStyle}>
            <ChevronLeft size={18} />
          </button>
        ) : (
          <div style={{ width: 32 }} />
        )}
        <div
          style={{
            flex: 1,
            fontFamily: "'Baloo 2', sans-serif",
            fontSize: 17,
            fontWeight: 700,
            textAlign: "center",
          }}
        >
          {
            {
              root: "Settings",
              family: "Family & Members",
              notifications: "Notifications",
              account: "Account",
              appearance: "Appearance",
              install: "Install App",
            }[screen]
          }
        </div>
        <button onClick={onClose} style={iconBtnStyle} aria-label="Close settings">
          <X size={18} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        {screen === "root" && (
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
            <SettingsRow
              icon={Users}
              label="Family & Members"
              sub={`${familyName} · ${members.length} member${members.length === 1 ? "" : "s"}`}
              onClick={() => setScreen("family")}
            />
            <SettingsRow
              icon={User}
              label="Account"
              sub={me.email || me.name}
              onClick={() => setScreen("account")}
            />
            <SettingsRow
              icon={Bell}
              label="Notifications"
              onClick={() => setScreen("notifications")}
            />
            <SettingsRow
              icon={Sun}
              label="Appearance"
              sub={
                appearance === "system"
                  ? "System"
                  : appearance === "light"
                    ? "Light"
                    : "Dark"
              }
              onClick={() => setScreen("appearance")}
            />
            <SettingsRow
              icon={Smartphone}
              label="Install App"
              sub={
                isStandalone
                  ? "Installed on this device"
                  : "Add Family Planner to your phone's Home Screen"
              }
              onClick={() => setScreen("install")}
            />

            <button
              onClick={onSignOut}
              style={{
                ...btnStyle,
                width: "100%",
                marginTop: 18,
                background: "#fff",
                border: "1.5px solid #F3D9D2",
                color: "#C4402A",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <LogOut size={16} /> Sign Out
            </button>
          </div>
        )}

        {screen === "family" && (
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
            <FieldLabel>Name shown at the top of the app</FieldLabel>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                aria-label="Family name"
                value={editingName}
                maxLength={32}
                placeholder="e.g. The Gomez Family"
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveName()}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={saveName}
                disabled={!canSaveName}
                style={{
                  ...btnStyle,
                  background: "#E8622C",
                  color: "#fff",
                  opacity: canSaveName ? 1 : 0.45,
                  cursor: canSaveName ? "pointer" : "default",
                }}
              >
                Save
              </button>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                fontSize: 11.5,
                color: "#A69C8E",
                margin: "6px 2px 20px",
                lineHeight: 1.4,
              }}
            >
              <span>Shorter names fit better on phones.</span>
              <span style={{ flexShrink: 0 }}>{editingName.length}/32</span>
            </div>

            <FieldLabel>Invite Family Members</FieldLabel>
            <div
              style={{
                background: "#fff",
                border: "1px solid #F1E8D9",
                boxShadow: CARD_SHADOW,
                borderRadius: 14,
                padding: 14,
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  fontSize: 12.5,
                  color: "#6B6259",
                  lineHeight: 1.4,
                  marginBottom: 12,
                }}
              >
                Send an invite link so family members can tap it to create an
                account and join <strong>{familyName}</strong> automatically —
                no code entry needed.
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                <button
                  type="button"
                  onClick={handleSendInviteLink}
                  style={{
                    border: "none",
                    background: "#E8622C",
                    color: "#fff",
                    borderRadius: 11,
                    padding: "10px 12px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    boxShadow: "0 3px 10px rgba(232,98,44,0.24)",
                  }}
                >
                  <Share2 size={14} /> Send Link
                </button>
                <button
                  type="button"
                  onClick={copyInviteLink}
                  style={{
                    border: "1.5px solid #EFE4D2",
                    background: copiedLink ? "#E4F1EC" : "#FFF9F0",
                    color: copiedLink ? "#155C4A" : "#2B2622",
                    borderRadius: 11,
                    padding: "10px 12px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  {copiedLink ? <Check size={14} /> : <Link2 size={14} />}
                  {copiedLink ? "Link Copied" : "Copy Link"}
                </button>
              </div>

              {showShareFallback && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    borderRadius: 11,
                    background: "#FFF9F0",
                    border: "1px solid #EFE4D2",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#8A7F70",
                      marginBottom: 8,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    Send invite link via
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: 6,
                    }}
                  >
                    <a
                      href={`sms:?&body=${encodeURIComponent(
                        `${getShareMessage()} ${getInviteLink()}`
                      )}`}
                      style={{
                        textDecoration: "none",
                        border: "1px solid #EFE4D2",
                        background: "#fff",
                        color: "#2B2622",
                        borderRadius: 9,
                        padding: "8px 6px",
                        fontSize: 12,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 5,
                      }}
                    >
                      <MessageSquare size={13} color="#1F6F5C" /> Text
                    </a>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(
                        `${getShareMessage()} ${getInviteLink()}`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        textDecoration: "none",
                        border: "1px solid #EFE4D2",
                        background: "#fff",
                        color: "#2B2622",
                        borderRadius: 9,
                        padding: "8px 6px",
                        fontSize: 12,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 5,
                      }}
                    >
                      <Share2 size={13} color="#25D366" /> WhatsApp
                    </a>
                    <a
                      href={`mailto:?subject=${encodeURIComponent(
                        `Join ${familyName} on Family Planner`
                      )}&body=${encodeURIComponent(
                        `${getShareMessage()}\n\n${getInviteLink()}`
                      )}`}
                      style={{
                        textDecoration: "none",
                        border: "1px solid #EFE4D2",
                        background: "#fff",
                        color: "#2B2622",
                        borderRadius: 9,
                        padding: "8px 6px",
                        fontSize: 12,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 5,
                      }}
                    >
                      <Mail size={13} color="#E8622C" /> Email
                    </a>
                  </div>
                </div>
              )}

              <div
                style={{
                  borderTop: "1px solid #F3ECE0",
                  marginTop: 12,
                  paddingTop: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#8A7F70",
                    marginBottom: 6,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Or copy invite code
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "monospace",
                      fontSize: 17,
                      fontWeight: 800,
                      letterSpacing: 1.5,
                      color: "#2B2622",
                    }}
                  >
                    {inviteCode}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      onClick={copyInviteCode}
                      style={{
                        border: "1.5px solid #EFE4D2",
                        background: copiedCode ? "#E4F1EC" : "#FFF9F0",
                        color: copiedCode ? "#155C4A" : "#2B2622",
                        borderRadius: 10,
                        padding: "7px 11px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      {copiedCode ? <Check size={13} /> : <Copy size={13} />}
                      {copiedCode ? "Copied" : "Copy Code"}
                    </button>
                    <button
                      type="button"
                      onClick={handleRegenerateCode}
                      disabled={regenerating}
                      title="Generate a new invite code"
                      aria-label="Generate a new invite code"
                      style={{
                        border: "1.5px solid #EFE4D2",
                        background: "#fff",
                        color: "#6B6259",
                        borderRadius: 10,
                        padding: "7px 9px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <RefreshCw size={13} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <FieldLabel>Members ({members.length})</FieldLabel>
            <div
              style={{
                background: "#fff",
                border: "1px solid #F1E8D9",
                boxShadow: CARD_SHADOW,
                borderRadius: 14,
                padding: "4px 14px",
                marginBottom: 14,
              }}
            >
              {members.map((m, i) => (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "11px 0",
                    borderBottom:
                      i === members.length - 1 ? "none" : "1px solid #F3ECE0",
                  }}
                >
                  <AvatarDot id={m.id} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={{ fontSize: 13.5, fontWeight: 700 }}>
                        {m.name}
                      </span>
                      {m.id === currentUserId && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: "#1F6F5C",
                            background: "#E4F1EC",
                            borderRadius: 999,
                            padding: "2px 7px",
                          }}
                        >
                          You
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: m.isChild ? "#3E6FD9" : "#8A7F70",
                          background: m.isChild ? "#E6ECFC" : "#F5EFE3",
                          borderRadius: 999,
                          padding: "2px 7px",
                        }}
                      >
                        {m.isChild
                          ? "Child"
                          : m.role === "admin"
                            ? "Admin"
                            : "Adult"}
                      </span>
                    </div>
                    {m.email && (
                      <div style={{ fontSize: 11.5, color: "#948C80", marginTop: 1 }}>
                        {m.email}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setMemberModalState({ mode: "edit", member: m })}
                    aria-label={`Edit ${m.name}`}
                    style={iconBtnStyle}
                  >
                    <Pencil size={14} color="#6B6259" />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={() => setMemberModalState({ mode: "add" })}
              style={{
                ...btnStyle,
                width: "100%",
                background: "#E8622C",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <UserPlus size={16} /> Add Family Member or Child
            </button>
            <div
              style={{
                fontSize: 11.5,
                color: "#A69C8E",
                textAlign: "center",
                marginTop: 8,
              }}
            >
              Add kids for medications &amp; caregiver sheets, or pre-add adults before
              they sign up.
            </div>
          </div>
        )}

        {screen === "notifications" && (
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
            {Object.keys(notifPrefs).map((key) => (
              <ToggleRow
                key={key}
                label={key}
                checked={notifPrefs[key]}
                onChange={(v) => setNotifPrefs((p) => ({ ...p, [key]: v }))}
              />
            ))}
          </div>
        )}

        {screen === "account" && (
          <form
            onSubmit={handleSaveAccount}
            style={{ maxWidth: 480, margin: "0 auto" }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: "#fff",
                border: "1px solid #F1E8D9",
                boxShadow: CARD_SHADOW,
                borderRadius: 14,
                padding: 14,
                marginBottom: 16,
              }}
            >
              <AvatarPreview
                emoji={accountEmoji}
                avatarUrl={accountAvatarUrl}
                color={
                  (
                    MEMBER_COLOR_PALETTES[accountPaletteIdx] ||
                    MEMBER_COLOR_PALETTES[0]
                  ).color
                }
                light={
                  (
                    MEMBER_COLOR_PALETTES[accountPaletteIdx] ||
                    MEMBER_COLOR_PALETTES[0]
                  ).light
                }
                size={48}
                name={accountName || me.name}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  {accountName || me.name}
                </div>
                <div style={{ fontSize: 12, color: "#8A7F70" }}>
                  {accountEmail || "No email"}
                </div>
              </div>
            </div>

            <FieldLabel>Name</FieldLabel>
            <input
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              style={inputStyle}
            />

            <FieldLabel style={{ marginTop: 12 }}>Email</FieldLabel>
            <input
              type="email"
              value={accountEmail}
              onChange={(e) => setAccountEmail(e.target.value)}
              style={inputStyle}
            />

            <FieldLabel style={{ marginTop: 12 }}>
              New Password{" "}
              <span style={{ fontWeight: 400, color: "#A69C8E" }}>
                (leave blank to keep current)
              </span>
            </FieldLabel>
            <input
              type="password"
              placeholder="At least 6 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={inputStyle}
            />

            <FieldLabel style={{ marginTop: 12 }}>Avatar</FieldLabel>
            <AvatarPicker
              emoji={accountEmoji}
              avatarUrl={accountAvatarUrl}
              color={
                (
                  MEMBER_COLOR_PALETTES[accountPaletteIdx] ||
                  MEMBER_COLOR_PALETTES[0]
                ).color
              }
              light={
                (
                  MEMBER_COLOR_PALETTES[accountPaletteIdx] ||
                  MEMBER_COLOR_PALETTES[0]
                ).light
              }
              onEmojiChange={setAccountEmoji}
              onAvatarUrlChange={setAccountAvatarUrl}
              onProcessingChange={setAccountAvatarProcessing}
            />

            <FieldLabel style={{ marginTop: 12 }}>Color</FieldLabel>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {MEMBER_COLOR_PALETTES.map((p, idx) => (
                <button
                  key={p.name}
                  type="button"
                  aria-label={p.name}
                  onClick={() => setAccountPaletteIdx(idx)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: p.color,
                    border:
                      accountPaletteIdx === idx
                        ? "3px solid #2B2622"
                        : "2px solid #fff",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
                    cursor: "pointer",
                  }}
                />
              ))}
            </div>

            {accountMessage && (
              <div
                role="status"
                style={{
                  marginTop: 14,
                  fontSize: 13,
                  fontWeight: 600,
                  color:
                    accountMessage.tone === "ok" ? "#1F6F5C" : "#C4402A",
                }}
              >
                {accountMessage.text}
              </div>
            )}

            <button
              type="submit"
              disabled={accountSaving || accountAvatarProcessing}
              style={{
                ...btnStyle,
                width: "100%",
                marginTop: 18,
                background: "#E8622C",
                color: "#fff",
                opacity: accountSaving || accountAvatarProcessing ? 0.65 : 1,
              }}
            >
              {accountSaving
                ? "Saving..."
                : accountAvatarProcessing
                  ? "Processing photo..."
                  : "Save Changes"}
            </button>

            <button
              type="button"
              onClick={onSignOut}
              style={{
                ...btnStyle,
                width: "100%",
                marginTop: 10,
                background: "#fff",
                border: "1.5px solid #F3D9D2",
                color: "#C4402A",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <LogOut size={16} /> Sign Out
            </button>
          </form>
        )}

        {screen === "appearance" && (
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
            {[
              { id: "light", label: "Light", icon: Sun },
              { id: "dark", label: "Dark", icon: Moon },
              { id: "system", label: "System", icon: Monitor },
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => setAppearance(opt.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  background: "#fff",
                  border: `1.5px solid ${appearance === opt.id ? "#E8622C" : "#EFE4D2"}`,
                  borderRadius: 12,
                  padding: "12px 14px",
                  marginBottom: 8,
                  cursor: "pointer",
                }}
              >
                <opt.icon
                  size={16}
                  color={appearance === opt.id ? "#E8622C" : "#6B6259"}
                />
                <span
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    flex: 1,
                    textAlign: "left",
                  }}
                >
                  {opt.label}
                </span>
                {appearance === opt.id && <Check size={16} color="#E8622C" />}
              </button>
            ))}
          </div>
        )}

        {screen === "install" && (
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
            <div
              style={{
                background: "#fff",
                border: "1px solid #F1E8D9",
                boxShadow: CARD_SHADOW,
                borderRadius: 16,
                padding: 18,
                marginBottom: 14,
                display: "flex",
                alignItems: "center",
                gap: 14,
              }}
            >
              <img
                src="/icons/icon-192.png"
                alt="Family Planner icon"
                width={52}
                height={52}
                style={{
                  borderRadius: 14,
                  flexShrink: 0,
                  boxShadow: "0 4px 12px rgba(232,98,44,0.24)",
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: "'Baloo 2', sans-serif",
                    fontSize: 18,
                    fontWeight: 700,
                    lineHeight: 1.15,
                  }}
                >
                  Family Planner
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "#6B6259",
                    marginTop: 3,
                    lineHeight: 1.4,
                  }}
                >
                  Install on your phone for full-screen access, faster launches,
                  and quick home-screen shortcuts.
                </div>
              </div>
            </div>

            {isStandalone ? (
              <div
                style={{
                  background: "#E4F1EC",
                  border: "1px solid #C6E3D7",
                  borderRadius: 14,
                  padding: "14px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  color: "#155C4A",
                  fontSize: 13.5,
                  fontWeight: 600,
                  marginBottom: 16,
                }}
              >
                <CheckCircle2 size={20} />
                <span>
                  Family Planner is installed and running in app mode on this
                  device.
                </span>
              </div>
            ) : canInstallNative ? (
              <button
                type="button"
                onClick={() => void triggerInstall()}
                style={{
                  ...btnStyle,
                  width: "100%",
                  background: "#E8622C",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  marginBottom: 16,
                  boxShadow: "0 4px 14px rgba(232,98,44,0.28)",
                }}
              >
                <Download size={16} /> Install App Now
              </button>
            ) : null}

            <div
              style={{
                background: "#fff",
                border: `1.5px solid ${isIos ? "#E8622C" : "#F1E8D9"}`,
                boxShadow: CARD_SHADOW,
                borderRadius: 14,
                padding: 15,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: isIos ? "#B24A1D" : "#8A7F70",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 10,
                }}
              >
                iPhone &amp; iPad (Safari){isIos ? " · This device" : ""}
              </div>
              <ol
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  display: "flex",
                  flexDirection: "column",
                  gap: 9,
                  fontSize: 13.5,
                  lineHeight: 1.45,
                  color: "#2B2622",
                }}
              >
                <li>
                  Open Family Planner in <strong>Safari</strong> and tap the{" "}
                  <span style={installBadgeStyle}>
                    <Share size={12} /> Share
                  </span>{" "}
                  button at the bottom of your screen.
                </li>
                <li>
                  Scroll down and tap{" "}
                  <span style={installBadgeStyle}>
                    <PlusSquare size={12} /> Add to Home Screen
                  </span>
                  .
                </li>
                <li>
                  Tap <strong>Add</strong> in the top-right corner to place
                  Family Planner on your Home Screen.
                </li>
              </ol>
            </div>

            <div
              style={{
                background: "#fff",
                border: `1.5px solid ${!isIos ? "#E8622C" : "#F1E8D9"}`,
                boxShadow: CARD_SHADOW,
                borderRadius: 14,
                padding: 15,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: !isIos ? "#B24A1D" : "#8A7F70",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 10,
                }}
              >
                Android (Chrome / Edge){!isIos ? " · This device" : ""}
              </div>
              <ol
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  display: "flex",
                  flexDirection: "column",
                  gap: 9,
                  fontSize: 13.5,
                  lineHeight: 1.45,
                  color: "#2B2622",
                }}
              >
                <li>
                  Tap the browser menu{" "}
                  <span style={installBadgeStyle}>
                    <MoreVertical size={12} /> Menu
                  </span>{" "}
                  in the top-right corner.
                </li>
                <li>
                  Tap{" "}
                  <span style={installBadgeStyle}>
                    <Smartphone size={12} /> Install app
                  </span>{" "}
                  or <strong>Add to Home screen</strong>.
                </li>
                <li>
                  Tap <strong>Install</strong> to add the Family Planner icon
                  to your Home Screen and app drawer.
                </li>
              </ol>
            </div>
          </div>
        )}
      </div>

      {memberModalState && (
        <MemberModal
          member={
            memberModalState.mode === "edit" ? memberModalState.member : null
          }
          onClose={() => setMemberModalState(null)}
          onSave={(data) =>
            memberModalState.mode === "add"
              ? onAddMember(data)
              : onUpdateMember(memberModalState.member.id, data)
          }
          onDelete={
            memberModalState.mode === "edit"
              ? () => onDeleteMember(memberModalState.member.id)
              : undefined
          }
        />
      )}
    </div>
  );
}

function SettingsRow({
  icon: Icon,
  label,
  sub,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  sub?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        background: "#fff",
        border: "1px solid #F1E8D9",
        boxShadow: CARD_SHADOW,
        borderRadius: 14,
        padding: "13px 14px",
        marginBottom: 8,
        cursor: "pointer",
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          background: "#FCE9DF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={16} color="#E8622C" />
      </div>
      <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
        {sub && (
          <div
            style={{
              fontSize: 11.5,
              color: "#A69C8E",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {sub}
          </div>
        )}
      </div>
      <ChevronRightIcon size={16} color="#C9BEAC" />
    </button>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#fff",
        border: "1px solid #F1E8D9",
        boxShadow: CARD_SHADOW,
        borderRadius: 14,
        padding: "13px 14px",
        marginBottom: 8,
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: 42,
          height: 24,
          borderRadius: 999,
          border: "none",
          cursor: "pointer",
          background: checked ? "#E8622C" : "#E4D9C6",
          position: "relative",
          transition: "background 0.15s",
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#fff",
            position: "absolute",
            top: 3,
            left: checked ? 21 : 3,
            transition: "left 0.15s",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          }}
        />
      </button>
    </div>
  );
}

const installBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  background: "#FCE9DF",
  color: "#B24A1D",
  borderRadius: 6,
  padding: "1px 7px",
  fontSize: 12.5,
  fontWeight: 700,
  verticalAlign: "middle",
};

