"use client";

import React, { useState } from "react";
import { ChevronDown, LogOut, Plus, Settings, Users } from "lucide-react";
import { TABS } from "@/lib/constants";
import { useMembers } from "@/components/MembersContext";
import type { MemberId } from "@/types/family";
import { AvatarDot } from "@/components/ui/Primitives";

export function DesktopSidebar({
  familyName,
  tab,
  setTab,
  currentUser,
  onQuickAdd,
  onOpenSettings,
  onSignOut,
}: {
  familyName: string;
  tab: string;
  setTab: (tab: string) => void;
  currentUser: MemberId;
  onQuickAdd: () => void;
  onOpenSettings: (screen?: "root" | "family" | "account") => void;
  onSignOut: () => void;
}) {
  const { memberById } = useMembers();
  const [menuOpen, setMenuOpen] = useState(false);
  const me = memberById(currentUser);

  return (
    <div
      style={{
        width: 232,
        flexShrink: 0,
        background: "#FFFDF9",
        borderRight: "1px solid #EFE4D2",
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
          background: "#E8622C",
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
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                width: "100%",
                background: active ? "#FCE9DF" : "transparent",
                border: "none",
                borderRadius: 11,
                padding: "10px 12px",
                marginBottom: 3,
                cursor: "pointer",
                color: active ? "#B24A1D" : "#6B6259",
                textAlign: "left",
              }}
            >
              <Icon size={17} strokeWidth={active ? 2.4 : 2} />
              <span style={{ fontSize: 13.5, fontWeight: active ? 700 : 500 }}>
                {t.label}
              </span>
            </button>
          );
        })}
      </div>

      <div
        style={{
          padding: 12,
          borderTop: "1px solid #EFE4D2",
          position: "relative",
        }}
      >
        <div
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            color: "#A69C8E",
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
            background: "#FFFDF9",
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
                color: "#2B2622",
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
                  color: "#948C80",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {me.email}
              </div>
            )}
          </div>
          <ChevronDown size={13} color="#8A7F70" />
        </button>

        {menuOpen && (
          <div
            style={{
              position: "absolute",
              left: 12,
              right: 12,
              bottom: "108%",
              background: "#fff",
              border: "1px solid #F1E8D9",
              borderRadius: 14,
              boxShadow: "0 8px 28px rgba(0,0,0,0.14)",
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
              <Settings size={15} color="#6B6259" /> Account Settings
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                onOpenSettings("family");
              }}
              style={menuItemStyle}
            >
              <Users size={15} color="#6B6259" /> Family &amp; Members
            </button>
            <div
              style={{
                height: 1,
                background: "#F3ECE0",
                margin: "4px 6px",
              }}
            />
            <button
              onClick={() => {
                setMenuOpen(false);
                onSignOut();
              }}
              style={{ ...menuItemStyle, color: "#C4402A" }}
            >
              <LogOut size={15} color="#C4402A" /> Sign Out
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
  color: "#2B2622",
  textAlign: "left",
};
