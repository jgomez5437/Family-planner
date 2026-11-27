"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { btnStyle, inputStyle } from "@/lib/constants";
import { FieldLabel, ModalShell } from "@/components/ui/Primitives";

export function DeleteAccountModal({
  familyName,
  memberName,
  isLastAccount,
  onClose,
  onConfirmDelete,
}: {
  familyName: string;
  memberName: string;
  isLastAccount: boolean;
  onClose: () => void;
  onConfirmDelete: (password: string) => Promise<string | null>;
}) {
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !deleting) {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [deleting, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (deleting) return;
    if (!password) {
      setError("Please enter your password to confirm account deletion.");
      return;
    }
    setError(null);
    setDeleting(true);
    const err = await onConfirmDelete(password);
    if (err) {
      setError(err);
      setDeleting(false);
    }
  }

  return (
    <ModalShell
      onClose={deleting ? () => {} : onClose}
      title="Delete Account"
    >
      <form onSubmit={handleSubmit}>
        <div
          style={{
            background: "var(--danger-soft)",
            border: "1px solid var(--danger-border)",
            borderRadius: 14,
            padding: "12px 14px",
            marginBottom: 14,
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            color: "var(--danger-ink)",
          }}
        >
          <AlertTriangle
            size={18}
            color="var(--danger)"
            style={{ flexShrink: 0, marginTop: 1 }}
          />
          <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              This permanently erases {memberName}&apos;s account and history
            </div>
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                display: "flex",
                flexDirection: "column",
                gap: 3,
              }}
            >
              <li>Your account profile and active sessions are deleted</li>
              <li>
                All Wall posts, comments, reactions, activity items, games,
                dose logs, and notifications from you are erased
              </li>
              <li>
                All calendar events and tasks you created are deleted, and your
                history is scrubbed from shared items
              </li>
            </ul>
          </div>
        </div>

        {isLastAccount && (
          <div
            style={{
              background: "var(--bg-warning-soft)",
              border: "1px solid var(--danger-border)",
              borderRadius: 12,
              padding: "10px 12px",
              marginBottom: 14,
              fontSize: 12.5,
              lineHeight: 1.45,
              color: "var(--text-primary)",
            }}
          >
            <strong>Warning — Last login account:</strong> Because you are the
            only login account in <strong>{familyName}</strong>, deleting your
            account will also permanently delete the entire family workspace,
            including child profiles, medications, and all shared schedules.
          </div>
        )}

        <FieldLabel>Confirm with your current password</FieldLabel>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Enter your password"
          value={password}
          disabled={deleting}
          onChange={(e) => {
            setPassword(e.target.value);
            if (error) setError(null);
          }}
          style={inputStyle}
        />

        {error && (
          <div
            role="alert"
            style={{
              marginTop: 10,
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--danger)",
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button
            type="button"
            disabled={deleting}
            onClick={onClose}
            style={{
              ...btnStyle,
              flex: 1,
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              border: "1.5px solid var(--border-default)",
              opacity: deleting ? 0.6 : 1,
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={deleting || !password}
            style={{
              ...btnStyle,
              flex: 1.3,
              background: "var(--danger)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              opacity: deleting || !password ? 0.6 : 1,
              cursor: deleting || !password ? "not-allowed" : "pointer",
            }}
          >
            <Trash2 size={15} />
            {deleting
              ? "Deleting..."
              : isLastAccount
                ? "Delete Account & Family"
                : "Delete Account"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
