"use client";

import React, { useState } from "react";
import {
  btnStyle,
  inputStyle,
  MEMBER_COLOR_PALETTES,
  MEMBER_EMOJIS,
} from "@/lib/constants";
import type { Member } from "@/types/family";
import { FieldLabel, ModalShell } from "@/components/ui/Primitives";

export interface MemberFormData {
  name: string;
  emoji: string;
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
  const [paletteIdx, setPaletteIdx] = useState(initialPaletteIdx);
  const [email, setEmail] = useState(member?.email || "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const palette =
    MEMBER_COLOR_PALETTES[paletteIdx] || MEMBER_COLOR_PALETTES[0];

  async function handleSave() {
    if (!name.trim()) {
      setError("Please enter a name.");
      return;
    }
    setError(null);
    setSaving(true);
    const err = await onSave({
      name: name.trim(),
      emoji,
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
          background: "#fff",
          border: "1px solid #F1E8D9",
          borderRadius: 14,
          padding: "10px 12px",
          marginBottom: 14,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: `linear-gradient(145deg, ${palette.light}, #fff)`,
            border: `2px solid ${palette.color}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            flexShrink: 0,
          }}
        >
          {emoji}
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            {name.trim() || (isChild ? "Child Profile" : "Family Member")}
          </div>
          <div style={{ fontSize: 12, color: "#8A7F70" }}>
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

      {member?.role !== "admin" && (
        <>
          <FieldLabel style={{ marginTop: 12 }}>Member Type</FieldLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button
              type="button"
              onClick={() => setIsChild(false)}
              style={{
                border: `1.5px solid ${!isChild ? "#E8622C" : "#EFE4D2"}`,
                background: !isChild ? "#FCE9DF" : "#fff",
                color: !isChild ? "#B24A1D" : "#6B6259",
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
                border: `1.5px solid ${isChild ? "#E8622C" : "#EFE4D2"}`,
                background: isChild ? "#FCE9DF" : "#fff",
                color: isChild ? "#B24A1D" : "#6B6259",
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
            <span style={{ fontWeight: 400, color: "#A69C8E" }}>
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
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {MEMBER_EMOJIS.map((em) => (
          <button
            key={em}
            type="button"
            onClick={() => setEmoji(em)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border:
                emoji === em
                  ? `2px solid ${palette.color}`
                  : "1.5px solid #EFE4D2",
              background: emoji === em ? palette.light : "#fff",
              fontSize: 18,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
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
            onClick={() => setPaletteIdx(idx)}
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: p.color,
              border:
                paletteIdx === idx ? "3px solid #2B2622" : "2px solid #fff",
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
            color: "#C4402A",
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
              background: confirmDelete ? "#C4402A" : "#fff",
              color: confirmDelete ? "#fff" : "#C4402A",
              border: "1.5px solid #F3D9D2",
            }}
          >
            {confirmDelete ? "Tap again to remove" : "Remove"}
          </button>
        )}
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          style={{
            ...btnStyle,
            flex: 1,
            background: "#E8622C",
            color: "#fff",
            opacity: saving ? 0.65 : 1,
          }}
        >
          {saving ? "Saving..." : isEdit ? "Save Changes" : "Add Member"}
        </button>
      </div>
    </ModalShell>
  );
}
