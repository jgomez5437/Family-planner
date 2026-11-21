"use client";

import React from "react";
import { Check, X } from "lucide-react";
import {
  CATEGORY_META,
  overlayStyle,
  pillStyle,
  sheetStyle,
} from "@/lib/constants";
import { useMembers } from "@/components/MembersContext";
import type { MemberId } from "@/types/family";

export function AvatarDot({ id, size = 22 }: { id?: MemberId | null; size?: number }) {
  const { memberById } = useMembers();
  const m = memberById(id);
  return (
    <div
      title={m.name}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `linear-gradient(145deg, ${m.light}, #fff)`,
        border: `${size >= 28 ? 2 : 1.5}px solid ${m.color}`,
        boxShadow: size >= 28 ? `0 2px 6px ${m.color}33` : "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.55,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {m.avatarUrl ? (
        <img
          src={m.avatarUrl}
          alt={m.name}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : (
        m.emoji
      )}
    </div>
  );
}

export function AvatarStack({ ids = [] }: { ids?: MemberId[] }) {
  if (!ids.length) return null;
  return (
    <div style={{ display: "flex" }}>
      {ids.map((id, i) => (
        <div
          key={id}
          style={{
            marginLeft: i === 0 ? 0 : -8,
            zIndex: ids.length - i,
            borderRadius: "50%",
            boxShadow: "0 0 0 2px #fff",
          }}
        >
          <AvatarDot id={id} size={24} />
        </div>
      ))}
    </div>
  );
}

export function CategoryBadge({ category }: { category: string }) {
  const meta = CATEGORY_META[category] || CATEGORY_META.Other;
  const Icon = meta.icon;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 8px 3px 6px",
        borderRadius: 999,
        background: `${meta.color}15`,
        color: meta.color,
        letterSpacing: 0.2,
      }}
    >
      <Icon size={11} strokeWidth={2.5} />
      {category}
    </span>
  );
}

export function LiveToast({ toast }: { toast: string | null }) {
  if (!toast) return null;
  return (
    <div
      style={{
        position: "fixed",
        top: 72,
        left: "50%",
        transform: "translateX(-50%)",
        background: "#2B2622",
        color: "#FFF9F0",
        padding: "9px 16px",
        borderRadius: 12,
        fontSize: 13,
        fontWeight: 600,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        gap: 7,
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
        maxWidth: "88%",
        animation: "slideDown 0.25s ease",
      }}
    >
      <Check size={14} color="#7FD9A8" strokeWidth={3} />
      {toast}
    </div>
  );
}

export function ModalShell({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={sheetStyle} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            width: 36,
            height: 4,
            background: "#E4D9C6",
            borderRadius: 4,
            margin: "0 auto 16px",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <div style={{ fontFamily: "'Baloo 2', sans-serif", fontSize: 17, fontWeight: 700 }}>
            {title}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "#F5EFE3",
              border: "none",
              borderRadius: "50%",
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <X size={15} />
          </button>
        </div>
        <div style={{ maxHeight: "62vh", overflowY: "auto" }}>{children}</div>
      </div>
    </div>
  );
}

export function FieldLabel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ fontSize: 12, fontWeight: 700, color: "#6B6259", marginBottom: 6, ...style }}>
      {children}
    </div>
  );
}

export function EmptyState({
  text,
  sub,
  actionLabel,
  onAction,
}: {
  text: string;
  sub?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px dashed #E4D9C6",
        borderRadius: 14,
        padding: "22px 16px",
        textAlign: "center",
        marginBottom: 10,
      }}
    >
      <div style={{ fontSize: 13.5, fontWeight: 600, color: "#6B6259" }}>{text}</div>
      {sub && <div style={{ fontSize: 12.5, color: "#A69C8E", marginTop: 3 }}>{sub}</div>}
      {actionLabel && (
        <button
          onClick={onAction}
          style={{
            marginTop: 12,
            background: "#E8622C",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            padding: "8px 16px",
            fontSize: 12.5,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function SectionLabel({
  text,
  style,
}: {
  text: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        fontSize: 13,
        fontWeight: 700,
        color: "#6B6259",
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginBottom: 8,
        ...style,
      }}
    >
      {text}
    </div>
  );
}

export function EmptyRow({ text }: { text: string }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px dashed #E4D9C6",
        borderRadius: 14,
        padding: "16px",
        textAlign: "center",
        color: "#A69C8E",
        fontSize: 13,
        marginBottom: 10,
      }}
    >
      {text}
    </div>
  );
}

export function CategoryPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {Object.keys(CATEGORY_META).map((c) => (
        <button key={c} onClick={() => onChange(c)} style={pillStyle(value === c)}>
          {c}
        </button>
      ))}
    </div>
  );
}

export function MemberPicker({
  selected,
  onToggle,
}: {
  selected: MemberId[];
  onToggle: (id: MemberId) => void;
}) {
  const { members } = useMembers();
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {members.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onToggle(m.id)}
          style={{
            ...pillStyle(selected.includes(m.id)),
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <AvatarDot id={m.id} size={18} />
          {m.name}
        </button>
      ))}
    </div>
  );
}
