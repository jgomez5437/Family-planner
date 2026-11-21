"use client";

import React, { useState } from "react";
import {
  Bell,
  Check,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  Copy,
  LogOut,
  Monitor,
  Moon,
  Pencil,
  RefreshCw,
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
  MEMBER_EMOJIS,
} from "@/lib/constants";
import { useMembers } from "@/components/MembersContext";
import type { Member, MemberId } from "@/types/family";
import { AvatarDot, FieldLabel } from "@/components/ui/Primitives";
import { MemberModal, type MemberFormData } from "./MemberModal";

export type SettingsSubScreen =
  | "root"
  | "family"
  | "notifications"
  | "account"
  | "appearance";

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
  const me = memberById(currentUserId);

  const [screen, setScreen] = useState<SettingsSubScreen>(initialScreen);
  const [editingName, setEditingName] = useState(familyName);
  const trimmedName = editingName.trim();
  const canSaveName = trimmedName.length > 0 && trimmedName !== familyName;
  function saveName() {
    if (canSaveName) onRenameFamily(trimmedName);
  }

  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [memberModalState, setMemberModalState] = useState<
    { mode: "add" } | { mode: "edit"; member: Member } | null
  >(null);

  // Account edit state
  const [accountName, setAccountName] = useState(me.name);
  const [accountEmail, setAccountEmail] = useState(me.email || "");
  const [accountEmoji, setAccountEmoji] = useState(me.emoji);
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

  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({
    Events: true,
    Tasks: true,
    Announcements: true,
    Changes: true,
    Reminders: true,
  });
  const [appearance, setAppearance] = useState("system");

  async function copyInviteCode() {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      /* clipboard blocked */
    }
  }

  async function handleRegenerateCode() {
    setRegenerating(true);
    await onRegenerateInviteCode();
    setRegenerating(false);
  }

  async function handleSaveAccount(e: React.FormEvent) {
    e.preventDefault();
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
          padding: "14px 16px",
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

            <FieldLabel>Family Invite Code</FieldLabel>
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
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    fontFamily: "monospace",
                    fontSize: 18,
                    fontWeight: 800,
                    letterSpacing: 1.5,
                    color: "#2B2622",
                  }}
                >
                  {inviteCode}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={copyInviteCode}
                    style={{
                      border: "1.5px solid #EFE4D2",
                      background: copied ? "#E4F1EC" : "#FFF9F0",
                      color: copied ? "#155C4A" : "#2B2622",
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
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <button
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
              <div
                style={{
                  fontSize: 11.5,
                  color: "#8A7F70",
                  marginTop: 8,
                  lineHeight: 1.4,
                }}
              >
                Share this code with your partner or family members. They can enter it
                when creating their account to join {familyName}.
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
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: `linear-gradient(145deg, ${(MEMBER_COLOR_PALETTES[accountPaletteIdx] || MEMBER_COLOR_PALETTES[0]).light}, #fff)`,
                  border: `2px solid ${(MEMBER_COLOR_PALETTES[accountPaletteIdx] || MEMBER_COLOR_PALETTES[0]).color}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 24,
                  flexShrink: 0,
                }}
              >
                {accountEmoji}
              </div>
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
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {MEMBER_EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setAccountEmoji(em)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    border:
                      accountEmoji === em
                        ? `2px solid ${(MEMBER_COLOR_PALETTES[accountPaletteIdx] || MEMBER_COLOR_PALETTES[0]).color}`
                        : "1.5px solid #EFE4D2",
                    background:
                      accountEmoji === em
                        ? (MEMBER_COLOR_PALETTES[accountPaletteIdx] ||
                            MEMBER_COLOR_PALETTES[0]).light
                        : "#fff",
                    fontSize: 18,
                    cursor: "pointer",
                  }}
                >
                  {em}
                </button>
              ))}
            </div>

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
              disabled={accountSaving}
              style={{
                ...btnStyle,
                width: "100%",
                marginTop: 18,
                background: "#E8622C",
                color: "#fff",
                opacity: accountSaving ? 0.65 : 1,
              }}
            >
              {accountSaving ? "Saving..." : "Save Changes"}
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
