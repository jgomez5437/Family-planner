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
import {
  ACTIVE_NOTIFICATION_CATEGORIES,
  getBrowserNotificationPermission,
  isBrowserNotificationSupported,
  NOTIFICATION_CATEGORIES,
  requestBrowserNotificationPermission,
  type NotificationPreferences,
} from "@/lib/notifications";
import { useMembers } from "@/components/MembersContext";
import { usePwa } from "@/components/pwa/PwaContext";
import { useTheme } from "@/components/ThemeContext";
import type { ThemePreference } from "@/lib/theme";
import type { Member, MemberId, NotificationCategory } from "@/types/family";
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
  notificationPreferences,
  onUpdateNotificationPreferences,
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
  notificationPreferences: NotificationPreferences;
  onUpdateNotificationPreferences: (next: NotificationPreferences) => void;
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
  const { isStandalone, isInstalled, isIos, canInstallNative, triggerInstall } =
    usePwa();
  const {
    preference: appearance,
    resolvedTheme,
    setPreference: setAppearance,
  } = useTheme();
  const me = memberById(currentUserId);

  const [screen, setScreen] = useState<SettingsSubScreen>(initialScreen);
  const [accountBackScreen, setAccountBackScreen] =
    useState<SettingsSubScreen>("root");
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

  useEffect(() => {
    setAccountMessage(null);
  }, [screen]);

  const [browserPermission, setBrowserPermission] = useState<
    NotificationPermission | "unsupported"
  >(() => getBrowserNotificationPermission());

  useEffect(() => {
    function syncPermission() {
      setBrowserPermission(getBrowserNotificationPermission());
    }
    syncPermission();
    window.addEventListener("focus", syncPermission);
    return () => window.removeEventListener("focus", syncPermission);
  }, [screen]);

  async function handleToggleBrowserNotifications(next: boolean) {
    if (!next) {
      onUpdateNotificationPreferences({
        ...notificationPreferences,
        browserEnabled: false,
      });
      return;
    }
    const perm = await requestBrowserNotificationPermission();
    setBrowserPermission(perm);
    if (perm === "granted") {
      onUpdateNotificationPreferences({
        ...notificationPreferences,
        browserEnabled: true,
      });
    } else {
      onUpdateNotificationPreferences({
        ...notificationPreferences,
        browserEnabled: false,
      });
    }
  }

  function handleToggleCategory(category: NotificationCategory, next: boolean) {
    onUpdateNotificationPreferences({
      ...notificationPreferences,
      categories: {
        ...notificationPreferences.categories,
        [category]: next,
      },
    });
  }

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
    const trimmedEmail = accountEmail.trim();
    if (me.hasAccount !== false && (!trimmedEmail || !trimmedEmail.includes("@"))) {
      setAccountMessage({
        tone: "error",
        text: "Please enter a valid email address.",
      });
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
      email: trimmedEmail || null,
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
        background: "var(--bg-app)",
        color: "var(--text-primary)",
        zIndex: 150,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "calc(14px + env(safe-area-inset-top)) 16px 14px",
          borderBottom: "1px solid var(--border-default)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        {screen !== "root" ? (
          <button
            onClick={() =>
              setScreen(screen === "account" ? accountBackScreen : "root")
            }
            style={iconBtnStyle}
          >
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

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 16px calc(24px + env(safe-area-inset-bottom))",
        }}
      >
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
              onClick={() => {
                setAccountBackScreen("root");
                setScreen("account");
              }}
            />
            <SettingsRow
              icon={Bell}
              label="Notifications"
              sub={
                notificationPreferences.browserEnabled &&
                browserPermission === "granted"
                  ? "In-app & device alerts enabled"
                  : "In-app alerts active"
              }
              onClick={() => setScreen("notifications")}
            />
            <SettingsRow
              icon={resolvedTheme === "dark" ? Moon : Sun}
              label="Appearance"
              sub={
                appearance === "system"
                  ? `System (${resolvedTheme === "dark" ? "Dark" : "Light"})`
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
                isInstalled
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
                background: "var(--bg-surface)",
                border: "1.5px solid var(--danger-border)",
                color: "var(--danger)",
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
                  background: "var(--accent)",
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
                color: "var(--text-faint)",
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
                background: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
                boxShadow: CARD_SHADOW,
                borderRadius: 14,
                padding: 14,
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  fontSize: 12.5,
                  color: "var(--text-secondary)",
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
                    background: "var(--accent)",
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
                    border: "1.5px solid var(--border-default)",
                    background: copiedLink ? "var(--success-soft)" : "var(--bg-app)",
                    color: copiedLink ? "var(--success-ink)" : "var(--text-primary)",
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
                    background: "var(--bg-app)",
                    border: "1px solid var(--border-default)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--text-muted)",
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
                        border: "1px solid var(--border-default)",
                        background: "var(--bg-surface)",
                        color: "var(--text-primary)",
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
                      <MessageSquare size={13} color="var(--success)" /> Text
                    </a>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(
                        `${getShareMessage()} ${getInviteLink()}`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        textDecoration: "none",
                        border: "1px solid var(--border-default)",
                        background: "var(--bg-surface)",
                        color: "var(--text-primary)",
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
                        border: "1px solid var(--border-default)",
                        background: "var(--bg-surface)",
                        color: "var(--text-primary)",
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
                      <Mail size={13} color="var(--accent)" /> Email
                    </a>
                  </div>
                </div>
              )}

              <div
                style={{
                  borderTop: "1px solid var(--border-divider)",
                  marginTop: 12,
                  paddingTop: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--text-muted)",
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
                      color: "var(--text-primary)",
                    }}
                  >
                    {inviteCode}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      onClick={copyInviteCode}
                      style={{
                        border: "1.5px solid var(--border-default)",
                        background: copiedCode ? "var(--success-soft)" : "var(--bg-app)",
                        color: copiedCode ? "var(--success-ink)" : "var(--text-primary)",
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
                        border: "1.5px solid var(--border-default)",
                        background: "var(--bg-surface)",
                        color: "var(--text-secondary)",
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
                background: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
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
                      i === members.length - 1 ? "none" : "1px solid var(--border-divider)",
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
                            color: "var(--success-ink)",
                            background: "var(--success-soft)",
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
                          color: m.isChild ? "#5E8AF0" : "var(--text-muted)",
                          background: m.isChild ? "var(--info-soft)" : "var(--bg-subtle-alt)",
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
                      {!m.isChild && m.hasAccount === false && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: "#C9972B",
                            background: "var(--bg-warning-soft)",
                            borderRadius: 999,
                            padding: "2px 7px",
                          }}
                        >
                          Pending
                        </span>
                      )}
                    </div>
                    {m.email && (
                      <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 1 }}>
                        {m.email}
                      </div>
                    )}
                  </div>
                  {(m.isChild ||
                    m.hasAccount === false ||
                    m.id === currentUserId) && (
                    <button
                      onClick={() => {
                        if (m.id === currentUserId) {
                          setAccountBackScreen("family");
                          setScreen("account");
                        } else {
                          setMemberModalState({ mode: "edit", member: m });
                        }
                      }}
                      aria-label={`Edit ${m.name}`}
                      style={iconBtnStyle}
                    >
                      <Pencil size={14} color="var(--text-secondary)" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={() => setMemberModalState({ mode: "add" })}
              style={{
                ...btnStyle,
                width: "100%",
                background: "var(--accent)",
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
                color: "var(--text-faint)",
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
            <FieldLabel>Device &amp; Browser Alerts</FieldLabel>
            <ToggleRow
              label="Browser & PWA Notifications"
              description={
                !isBrowserNotificationSupported()
                  ? "This browser does not support device notifications. In-app alerts still work."
                  : browserPermission === "denied"
                    ? "Blocked in browser settings. Enable notifications for this site to turn this on."
                    : "Show a notification banner on this device when family members post updates."
              }
              checked={
                notificationPreferences.browserEnabled &&
                browserPermission === "granted"
              }
              disabled={
                !isBrowserNotificationSupported() ||
                browserPermission === "denied"
              }
              onChange={(v) => void handleToggleBrowserNotifications(v)}
            />

            <FieldLabel style={{ marginTop: 18 }}>Notify Me About</FieldLabel>
            {ACTIVE_NOTIFICATION_CATEGORIES.map((cat) => (
              <ToggleRow
                key={cat.id}
                label={`${cat.emoji} ${cat.label}`}
                description={cat.description}
                checked={notificationPreferences.categories[cat.id] !== false}
                onChange={(v) => handleToggleCategory(cat.id, v)}
              />
            ))}

            {NOTIFICATION_CATEGORIES.some((c) => !c.active) && (
              <>
                <FieldLabel style={{ marginTop: 18 }}>
                  Coming Soon
                </FieldLabel>
                <div
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-subtle)",
                    boxShadow: CARD_SHADOW,
                    borderRadius: 14,
                    padding: "4px 14px",
                  }}
                >
                  {NOTIFICATION_CATEGORIES.filter((c) => !c.active).map(
                    (cat, idx, arr) => (
                      <div
                        key={cat.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          padding: "11px 0",
                          borderBottom:
                            idx === arr.length - 1
                              ? "none"
                              : "1px solid var(--border-divider)",
                          opacity: 0.72,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                            {cat.emoji} {cat.label}
                          </div>
                          <div
                            style={{
                              fontSize: 11.5,
                              color: "var(--text-muted)",
                              marginTop: 2,
                            }}
                          >
                            {cat.description}
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: "var(--text-muted)",
                            background: "var(--bg-subtle-alt)",
                            borderRadius: 999,
                            padding: "3px 8px",
                            flexShrink: 0,
                          }}
                        >
                          Soon
                        </span>
                      </div>
                    )
                  )}
                </div>
              </>
            )}
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
                background: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
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
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
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
              <span style={{ fontWeight: 400, color: "var(--text-faint)" }}>
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
                        ? "3px solid var(--text-primary)"
                        : "2px solid var(--bg-surface)",
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
                    accountMessage.tone === "ok"
                      ? "var(--success)"
                      : "var(--danger)",
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
                background: "var(--accent)",
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
                background: "var(--bg-surface)",
                border: "1.5px solid var(--danger-border)",
                color: "var(--danger)",
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
            {(
              [
                {
                  id: "light",
                  label: "Light",
                  sub: "Warm cream canvas",
                  icon: Sun,
                },
                {
                  id: "dark",
                  label: "Dark",
                  sub: "Low-glare dark canvas",
                  icon: Moon,
                },
                {
                  id: "system",
                  label: "System",
                  sub: `Follows device (${resolvedTheme === "dark" ? "Dark" : "Light"})`,
                  icon: Monitor,
                },
              ] as Array<{
                id: ThemePreference;
                label: string;
                sub: string;
                icon: LucideIcon;
              }>
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={appearance === opt.id}
                onClick={() => setAppearance(opt.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  background: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  border: `1.5px solid ${appearance === opt.id ? "var(--accent)" : "var(--border-default)"}`,
                  borderRadius: 12,
                  padding: "12px 14px",
                  marginBottom: 8,
                  cursor: "pointer",
                }}
              >
                <opt.icon
                  size={16}
                  color={
                    appearance === opt.id
                      ? "var(--accent)"
                      : "var(--text-secondary)"
                  }
                />
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                    {opt.sub}
                  </div>
                </div>
                {appearance === opt.id && (
                  <Check size={16} color="var(--accent)" />
                )}
              </button>
            ))}
          </div>
        )}

        {screen === "install" && (
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
            <div
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
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
                    color: "var(--text-secondary)",
                    marginTop: 3,
                    lineHeight: 1.4,
                  }}
                >
                  Install on your phone for full-screen access, faster launches,
                  and quick home-screen shortcuts.
                </div>
              </div>
            </div>

            {isInstalled ? (
              <div
                style={{
                  background: "var(--success-soft)",
                  border: "1px solid var(--success-border)",
                  borderRadius: 14,
                  padding: "14px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  color: "var(--success-ink)",
                  fontSize: 13.5,
                  fontWeight: 600,
                  marginBottom: 16,
                }}
              >
                <CheckCircle2 size={20} />
                <span>
                  {isStandalone
                    ? "Family Planner is installed and running in app mode on this device."
                    : "Family Planner has been installed! You can now open it from your Home Screen."}
                </span>
              </div>
            ) : canInstallNative ? (
              <button
                type="button"
                onClick={() => void triggerInstall()}
                style={{
                  ...btnStyle,
                  width: "100%",
                  background: "var(--accent)",
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
                background: "var(--bg-surface)",
                border: `1.5px solid ${isIos ? "var(--accent)" : "var(--border-subtle)"}`,
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
                  color: isIos ? "var(--accent-ink)" : "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 10,
                }}
              >
                iPhone &amp; iPad (Safari / Chrome){isIos ? " · This device" : ""}
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
                  color: "var(--text-primary)",
                }}
              >
                <li>
                  Tap the{" "}
                  <span style={installBadgeStyle}>
                    <Share size={12} /> Share
                  </span>{" "}
                  button (at the bottom in Safari, or top-right in Chrome).
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
              <div
                style={{
                  fontSize: 11.5,
                  color: "var(--text-muted)",
                  marginTop: 10,
                  lineHeight: 1.4,
                }}
              >
                Opened from Messages or WhatsApp? Tap{" "}
                <strong>Open in Safari</strong> first if you don&apos;t see Add
                to Home Screen.
              </div>
            </div>

            <div
              style={{
                background: "var(--bg-surface)",
                border: `1.5px solid ${!isIos ? "var(--accent)" : "var(--border-subtle)"}`,
                boxShadow: CARD_SHADOW,
                borderRadius: 14,
                padding: 15,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: !isIos ? "var(--accent-ink)" : "var(--text-muted)",
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
                  color: "var(--text-primary)",
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
        background: "var(--bg-surface)",
        color: "var(--text-primary)",
        border: "1px solid var(--border-subtle)",
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
          background: "var(--accent-soft)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={16} color="var(--accent)" />
      </div>
      <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
        {sub && (
          <div
            style={{
              fontSize: 11.5,
              color: "var(--text-faint)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {sub}
          </div>
        )}
      </div>
      <ChevronRightIcon size={16} color="var(--border-muted)" />
    </button>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        boxShadow: CARD_SHADOW,
        borderRadius: 14,
        padding: "13px 14px",
        marginBottom: 8,
        opacity: disabled ? 0.65 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
        {description && (
          <div
            style={{
              fontSize: 11.5,
              color: "var(--text-muted)",
              marginTop: 2,
              lineHeight: 1.35,
            }}
          >
            {description}
          </div>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        style={{
          width: 42,
          height: 24,
          borderRadius: 999,
          border: "none",
          cursor: disabled ? "default" : "pointer",
          background: checked ? "var(--accent)" : "var(--border-strong)",
          position: "relative",
          transition: "background 0.15s",
          flexShrink: 0,
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
  background: "var(--accent-soft)",
  color: "var(--accent-ink)",
  borderRadius: 6,
  padding: "1px 7px",
  fontSize: 12.5,
  fontWeight: 700,
  verticalAlign: "middle",
};

