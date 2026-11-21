"use client";

import React, { useState } from "react";
import {
  Bell,
  Check,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  Monitor,
  Moon,
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
  MEMBERS,
} from "@/lib/constants";
import { AvatarDot, FieldLabel } from "@/components/ui/Primitives";

export function SettingsScreen({
  onClose,
  familyName,
  onRenameFamily,
  online,
  onToggleOffline,
}: {
  onClose: () => void;
  familyName: string;
  onRenameFamily: (name: string) => void;
  online: boolean;
  onToggleOffline: () => void;
}) {
  const [screen, setScreen] = useState<
    "root" | "family" | "notifications" | "account" | "appearance"
  >("root");
  const [editingName, setEditingName] = useState(familyName);
  const trimmedName = editingName.trim();
  const canSaveName = trimmedName.length > 0 && trimmedName !== familyName;
  function saveName() {
    if (canSaveName) onRenameFamily(trimmedName);
  }
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({
    Events: true,
    Tasks: true,
    Announcements: true,
    Changes: true,
    Reminders: true,
  });
  const [appearance, setAppearance] = useState("system");

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
              family: "Family",
              notifications: "Notifications",
              account: "Account",
              appearance: "Appearance",
            }[screen]
          }
        </div>
        <button onClick={onClose} style={iconBtnStyle}>
          <X size={18} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        {screen === "root" && (
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
            <SettingsRow
              icon={Users}
              label="Family"
              sub={familyName}
              onClick={() => setScreen("family")}
            />
            <SettingsRow
              icon={Bell}
              label="Notifications"
              onClick={() => setScreen("notifications")}
            />
            <SettingsRow
              icon={User}
              label="Account"
              onClick={() => setScreen("account")}
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
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: "#A69C8E",
                letterSpacing: 0.5,
                margin: "20px 2px 8px",
              }}
            >
              DEMO TOOLS
            </div>
            <ToggleRow
              label="Simulate offline"
              checked={!online}
              onChange={() => onToggleOffline()}
            />
            <div
              style={{
                fontSize: 11.5,
                color: "#A69C8E",
                margin: "2px 4px 0",
                lineHeight: 1.4,
              }}
            >
              Shows the &quot;You&apos;re offline&quot; banner so you can see how the app
              behaves without a connection.
            </div>
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
                placeholder="e.g. The Martinez Family"
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
              <span>Type anything you like. Shorter names fit better on a phone.</span>
              <span style={{ flexShrink: 0 }}>{editingName.length}/32</span>
            </div>

            <FieldLabel>Members</FieldLabel>
            <div
              style={{
                background: "#fff",
                border: "1px solid #F1E8D9",
                boxShadow: CARD_SHADOW,
                borderRadius: 14,
                padding: "4px 14px",
                marginBottom: 20,
              }}
            >
              {MEMBERS.map((m, i) => (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "11px 0",
                    borderBottom:
                      i === MEMBERS.length - 1 ? "none" : "1px solid #F3ECE0",
                  }}
                >
                  <AvatarDot id={m.id} size={30} />
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{m.name}</div>
                </div>
              ))}
            </div>

            <button
              style={{
                ...btnStyle,
                width: "100%",
                background: "#fff",
                border: "1.5px solid #EFE4D2",
                color: "#2B2622",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <UserPlus size={16} /> Invite Family Member
            </button>
            <div
              style={{
                fontSize: 11.5,
                color: "#A69C8E",
                textAlign: "center",
                marginTop: 8,
              }}
            >
              Invite by email or share a link — they&apos;ll join {familyName} once they
              accept.
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
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
            <FieldLabel>Name</FieldLabel>
            <input defaultValue="Dad" style={inputStyle} />
            <FieldLabel style={{ marginTop: 12 }}>Email</FieldLabel>
            <input defaultValue="dad@martinezfamily.example" style={inputStyle} />
            <FieldLabel style={{ marginTop: 12 }}>Profile photo</FieldLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <AvatarDot id="dad" size={44} />
              <button
                style={{
                  ...btnStyle,
                  background: "#fff",
                  border: "1.5px solid #EFE4D2",
                  color: "#2B2622",
                }}
              >
                Change
              </button>
            </div>
          </div>
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
      <div style={{ flex: 1, textAlign: "left" }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
        {sub && <div style={{ fontSize: 11.5, color: "#A69C8E" }}>{sub}</div>}
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
