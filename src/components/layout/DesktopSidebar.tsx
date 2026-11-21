"use client";

import React, { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { MEMBERS, memberById, TABS } from "@/lib/constants";
import type { MemberId } from "@/types/family";
import { AvatarDot } from "@/components/ui/Primitives";

export function DesktopSidebar({
  familyName,
  tab,
  setTab,
  currentUser,
  setCurrentUser,
  onQuickAdd,
}: {
  familyName: string;
  tab: string;
  setTab: (tab: string) => void;
  currentUser: MemberId;
  setCurrentUser: (id: MemberId) => void;
  onQuickAdd: () => void;
}) {
  const [switcherOpen, setSwitcherOpen] = useState(false);
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
        }}
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
              <span style={{ fontSize: 13.5, fontWeight: active ? 700 : 500 }}>{t.label}</span>
            </button>
          );
        })}
      </div>

      <div style={{ padding: 12, borderTop: "1px solid #EFE4D2", position: "relative" }}>
        <div
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            color: "#C9BEAC",
            letterSpacing: 0.5,
            padding: "0 2px 5px",
          }}
        >
          VIEWING AS · DEMO
        </div>
        <button
          onClick={() => setSwitcherOpen((s) => !s)}
          title="Demo tool — not real sign-in"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            background: "#FFFDF9",
            border: `1.5px dashed ${memberById(currentUser).color}`,
            borderRadius: 12,
            padding: "8px 10px",
            cursor: "pointer",
          }}
        >
          <AvatarDot id={currentUser} size={24} />
          <span style={{ fontSize: 13, fontWeight: 600, flex: 1, textAlign: "left" }}>
            {memberById(currentUser).name}
          </span>
          <ChevronDown size={13} />
        </button>
        {switcherOpen && (
          <div
            style={{
              position: "absolute",
              left: 12,
              right: 12,
              bottom: "108%",
              background: "#fff",
              borderRadius: 14,
              boxShadow: "0 8px 28px rgba(0,0,0,0.15)",
              padding: 6,
              zIndex: 60,
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                color: "#A69C8E",
                padding: "7px 10px 6px",
                lineHeight: 1.4,
                borderBottom: "1px solid #F3ECE0",
                marginBottom: 4,
              }}
            >
              <span style={{ fontWeight: 700, color: "#6B6259" }}>Demo tool</span> — switches whose
              view you&apos;re testing. Not real sign-in.
            </div>
            {MEMBERS.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setCurrentUser(m.id);
                  setSwitcherOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  background: currentUser === m.id ? m.light : "transparent",
                  border: "none",
                  borderRadius: 10,
                  padding: "8px 10px",
                  cursor: "pointer",
                  fontSize: 13.5,
                  fontWeight: 500,
                }}
              >
                <AvatarDot id={m.id} size={20} /> {m.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
