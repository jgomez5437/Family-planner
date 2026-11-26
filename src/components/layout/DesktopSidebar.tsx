"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  LogOut,
  Plus,
  Settings,
  User,
  Users,
} from "lucide-react";
import { TABS } from "@/lib/constants";
import { useMembers } from "@/components/MembersContext";
import type { MemberId } from "@/types/family";
import { AvatarDot } from "@/components/ui/Primitives";

export function DesktopSidebar({
  familyName,
  tab,
  setTab,
  tabBadges,
  currentUser,
  onQuickAdd,
  onOpenSettings,
  onSignOut,
}: {
  familyName: string;
  tab: string;
  setTab: (tab: string) => void;
  tabBadges?: Partial<Record<string, number>>;
  currentUser: MemberId;
  onQuickAdd: () => void;
  onOpenSettings: (screen?: "root" | "family" | "account") => void;
  onSignOut: () => void;
}) {
  const { memberById } = useMembers();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  const me = memberById(currentUser);

  useEffect(() => {
    if (!menuOpen) return;
    function handleOutside(event: MouseEvent) {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <div
      style={{
        width: 232,
        flexShrink: 0,
        background: "var(--bg-surface-warm)",
        borderRight: "1px solid var(--border-default)",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "sticky",
        top: 0,
      }}
    >
      <div
        style={{
          padding: "22px 20px 18px",
          fontFamily: "'Baloo 2', sans-serif",
          fontSize: 18,
          fontWeight: 700,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={familyName}
      >
        {familyName}
      </div>

      <button
        onClick={onQuickAdd}
        style={{
          margin: "0 16px 18px",
          background: "var(--accent)",
          color: "#fff",
          border: "none",
          borderRadius: 12,
          padding: "10px 14px",
          fontSize: 13.5,
          fontWeight: 700,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
          boxShadow: "0 4px 14px rgba(232,98,44,0.3)",
        }}
      >
        <Plus size={16} strokeWidth={2.5} /> Quick Add
      </button>

      <div style={{ flex: 1, padding: "0 12px" }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          const badge = tabBadges?.[t.id] || 0;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                width: "100%",
                background: active ? "var(--accent-soft)" : "transparent",
                border: "none",
                borderRadius: 11,
                padding: "10px 12px",
                marginBottom: 3,
                cursor: "pointer",
                color: active ? "var(--accent-ink)" : "var(--text-secondary)",
                textAlign: "left",
              }}
            >
              <Icon size={17} strokeWidth={active ? 2.4 : 2} />
              <span
                style={{
                  fontSize: 13.5,
                  fontWeight: active ? 700 : 500,
                  flex: 1,
                }}
              >
                {t.label}
              </span>
              {badge > 0 && (
                <span
                  aria-label={`${badge} awaiting your action`}
                  style={{
                    minWidth: 20,
                    height: 20,
                    padding: "0 6px",
                    borderRadius: 999,
                    background: "var(--accent)",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 800,
                    lineHeight: "20px",
                    textAlign: "center",
                    flexShrink: 0,
                  }}
                >
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        ref={menuContainerRef}
        style={{
          padding: 12,
          borderTop: "1px solid var(--border-default)",
          position: "relative",
        }}
      >
        <div
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            color: "var(--text-faint)",
            letterSpacing: 0.5,
            padding: "0 2px 5px",
          }}
        >
          SIGNED IN AS
        </div>
        <button
          onClick={() => setMenuOpen((s) => !s)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            background: "var(--bg-surface-warm)",
            color: "var(--text-primary)",
            border: `1.5px solid ${me.color}55`,
            borderRadius: 12,
            padding: "8px 10px",
            cursor: "pointer",
          }}
        >
          <AvatarDot id={currentUser} size={26} />
          <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {me.name}
            </div>
            {me.email && (
              <div
                style={{
                  fontSize: 10.5,
                  color: "var(--text-muted)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {me.email}
              </div>
            )}
          </div>
          <ChevronDown size={13} color="var(--text-muted)" />
        </button>

        {menuOpen && (
          <div
            style={{
              position: "absolute",
              left: 12,
              right: 12,
              bottom: "108%",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 14,
              boxShadow: "var(--menu-shadow)",
              padding: 6,
              zIndex: 60,
            }}
          >
            <button
              onClick={() => {
                setMenuOpen(false);
                onOpenSettings("account");
              }}
              style={menuItemStyle}
            >
              <User size={15} color="var(--text-secondary)" /> Account
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                onOpenSettings("family");
              }}
              style={menuItemStyle}
            >
              <Users size={15} color="var(--text-secondary)" /> Family &amp; Members
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                onOpenSettings("root");
              }}
              style={menuItemStyle}
            >
              <Settings size={15} color="var(--text-secondary)" /> Settings
            </button>
            <div
              style={{
                height: 1,
                background: "var(--border-divider)",
                margin: "4px 6px",
              }}
            />
            <button
              onClick={() => {
                setMenuOpen(false);
                onSignOut();
              }}
              style={{ ...menuItemStyle, color: "var(--danger)" }}
            >
              <LogOut size={15} color="var(--danger)" /> Sign Out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  background: "transparent",
  border: "none",
  borderRadius: 10,
  padding: "9px 10px",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--text-primary)",
  textAlign: "left",
};
