"use client";

import React, { useState } from "react";
import {
  btnStyle,
  inputStyle,
  MEMBER_COLOR_PALETTES,
} from "@/lib/constants";
import type { Member } from "@/types/family";
import { AvatarPicker, AvatarPreview } from "@/components/ui/AvatarPicker";
import { FieldLabel, ModalShell } from "@/components/ui/Primitives";

export interface MemberFormData {
  name: string;
  emoji: string;
  avatarUrl?: string | null;
  color: string;
  light: string;
  isChild: boolean;
  email?: string | null;
}

export function MemberModal({
  member,
  defaultIsChild = false,
  onClose,
  onSave,
  onDelete,
}: {
  member?: Member | null;
  defaultIsChild?: boolean;
  onClose: () => void;
  onSave: (data: MemberFormData) => Promise<string | null>;
  onDelete?: () => Promise<string | null>;
}) {
  const isEdit = Boolean(member);
  const initialPaletteIdx = member
    ? Math.max(
        0,
        MEMBER_COLOR_PALETTES.findIndex((p) => p.color === member.color)
      )
    : defaultIsChild
      ? 2
      : 0;

  const [name, setName] = useState(member?.name || "");
  const [isChild, setIsChild] = useState(
    member ? Boolean(member.isChild) : defaultIsChild
  );
  const [emoji, setEmoji] = useState(
    member?.emoji || (defaultIsChild ? "🧒" : "🧑")
  );
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    member?.avatarUrl || null
  );
  const [avatarProcessing, setAvatarProcessing] = useState(false);
  const [paletteIdx, setPaletteIdx] = useState(initialPaletteIdx);
  const [email, setEmail] = useState(member?.email || "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const palette =
    MEMBER_COLOR_PALETTES[paletteIdx] || MEMBER_COLOR_PALETTES[0];

  async function handleSave() {
    if (avatarProcessing) return;
    if (!name.trim()) {
      setError("Please enter a name.");
      return;
    }
    setError(null);
    setSaving(true);
    const err = await onSave({
      name: name.trim(),
      emoji,
      avatarUrl,
      color: palette.color,
      light: palette.light,
      isChild,
      email: isChild ? null : email.trim() || null,
    });
    setSaving(false);
    if (err) setError(err);
    else onClose();
  }

  async function handleDelete() {
    if (!onDelete) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setError(null);
    setSaving(true);
    const err = await onDelete();
    setSaving(false);
    if (err) setError(err);
    else onClose();
  }

  return (
    <ModalShell
      onClose={onClose}
      title={
        isEdit
          ? `Edit ${member?.name}`
          : defaultIsChild
            ? "Add a Child"
            : "Add Family Member"
      }
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 14,
          padding: "10px 12px",
          marginBottom: 14,
        }}
      >
        <AvatarPreview
          emoji={emoji}
          avatarUrl={avatarUrl}
          color={palette.color}
          light={palette.light}
          size={44}
          name={name.trim() || "Member"}
        />
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            {name.trim() || (isChild ? "Child Profile" : "Family Member")}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {isChild
              ? "Appears in Family Manager, Medications & Caregiver Sheets"
              : "Appears across Events, Tasks & Family Wall"}
          </div>
        </div>
      </div>

      <FieldLabel>Name</FieldLabel>
      <input
        autoFocus
        placeholder={isChild ? "e.g. Alex, Mia" : "e.g. Jordan, Grandma"}
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={inputStyle}
      />

      {!member?.hasAccount && member?.role !== "admin" && (
        <>
          <FieldLabel style={{ marginTop: 12 }}>Member Type</FieldLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button
              type="button"
              onClick={() => setIsChild(false)}
              style={{
                border: `1.5px solid ${!isChild ? "var(--accent)" : "var(--border-default)"}`,
                background: !isChild ? "var(--accent-soft)" : "var(--bg-surface)",
                color: !isChild ? "var(--accent-ink)" : "var(--text-secondary)",
                borderRadius: 12,
                padding: "9px 10px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Adult / Parent
            </button>
            <button
              type="button"
              onClick={() => setIsChild(true)}
              style={{
                border: `1.5px solid ${isChild ? "var(--accent)" : "var(--border-default)"}`,
                background: isChild ? "var(--accent-soft)" : "var(--bg-surface)",
                color: isChild ? "var(--accent-ink)" : "var(--text-secondary)",
                borderRadius: 12,
                padding: "9px 10px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Child
            </button>
          </div>
        </>
      )}

      {!isChild && (
        <>
          <FieldLabel style={{ marginTop: 12 }}>
            Email{" "}
            <span style={{ fontWeight: 400, color: "var(--text-faint)" }}>
              (optional — lets them claim this profile when joining)
            </span>
          </FieldLabel>
          <input
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
        </>
      )}

      <FieldLabel style={{ marginTop: 12 }}>Avatar</FieldLabel>
      <AvatarPicker
        emoji={emoji}
        avatarUrl={avatarUrl}
        color={palette.color}
        light={palette.light}
        onEmojiChange={setEmoji}
        onAvatarUrlChange={setAvatarUrl}
        onProcessingChange={setAvatarProcessing}
      />

      <FieldLabel style={{ marginTop: 12 }}>Color</FieldLabel>
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

      {error && (
        <div
          role="alert"
          style={{
            marginTop: 12,
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--danger)",
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
        {isEdit && onDelete && (
          <button
            type="button"
            disabled={saving}
            onClick={handleDelete}
            style={{
              ...btnStyle,
              background: confirmDelete ? "var(--danger)" : "var(--bg-surface)",
              color: confirmDelete ? "#fff" : "var(--danger)",
              border: "1.5px solid var(--danger-border)",
            }}
          >
            {confirmDelete ? "Tap again to remove" : "Remove"}
          </button>
        )}
        <button
          type="button"
          disabled={saving || avatarProcessing}
          onClick={handleSave}
          style={{
            ...btnStyle,
            flex: 1,
            background: "var(--accent)",
            color: "#fff",
            opacity: saving || avatarProcessing ? 0.65 : 1,
          }}
        >
          {saving
            ? "Saving..."
            : avatarProcessing
              ? "Processing photo..."
              : isEdit
                ? "Save Changes"
                : "Add Member"}
        </button>
      </div>
    </ModalShell>
  );
}
