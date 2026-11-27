"use client";

import React, { useMemo, useState } from "react";
import { Check, Send, Smartphone, Users } from "lucide-react";
import { btnStyle } from "@/lib/constants";
import {
  DEFAULT_DOTS_AND_BOXES_SIZE,
  DOTS_AND_BOXES_SIZE_OPTIONS,
  type DotsAndBoxesSize,
} from "@/lib/games/dotsAndBoxes";
import { GAME_DEFINITIONS } from "@/lib/games/registry";
import { useMembers } from "@/components/MembersContext";
import { AvatarDot, FieldLabel, ModalShell } from "@/components/ui/Primitives";
import type { GameMode, GameTypeId, MemberId } from "@/types/family";

export function NewGameModal({
  currentUser,
  onClose,
  onCreateGame,
  onOpenFamilySettings,
}: {
  currentUser: MemberId;
  onClose: () => void;
  onCreateGame: (input: {
    gameType: GameTypeId;
    opponentId: MemberId;
    mode: GameMode;
    options?: Record<string, unknown>;
  }) => Promise<string | null>;
  onOpenFamilySettings: () => void;
}) {
  const { members } = useMembers();
  const [gameType, setGameType] = useState<GameTypeId>("tic_tac_toe");
  const [dotsBoardSize, setDotsBoardSize] = useState<DotsAndBoxesSize>(
    DEFAULT_DOTS_AND_BOXES_SIZE
  );

  const otherMembers = useMemo(
    () => members.filter((m) => m.id !== currentUser),
    [members, currentUser]
  );
  const remoteOpponents = useMemo(
    () => otherMembers.filter((m) => m.hasAccount),
    [otherMembers]
  );

  const [mode, setMode] = useState<GameMode>(
    remoteOpponents.length > 0 ? "remote" : "pass_and_play"
  );

  const availableOpponents =
    mode === "remote" ? remoteOpponents : otherMembers;

  const [opponentId, setOpponentId] = useState<MemberId>(
    availableOpponents[0]?.id || ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveOpponentId = availableOpponents.some(
    (m) => m.id === opponentId
  )
    ? opponentId
    : availableOpponents[0]?.id || "";

  async function handleSubmit() {
    if (!effectiveOpponentId) {
      setError("Please select an opponent.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const err = await onCreateGame({
      gameType,
      opponentId: effectiveOpponentId,
      mode,
      options:
        gameType === "dots_and_boxes" ? { size: dotsBoardSize } : undefined,
    });
    setSubmitting(false);
    if (err) {
      setError(err);
      return;
    }
    onClose();
  }

  return (
    <ModalShell title="Start a Game" onClose={onClose}>
      <div style={{ paddingBottom: 4 }}>
        {/* Game Picker */}
        <FieldLabel>Choose a game</FieldLabel>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(125px, 1fr))",
            gap: 8,
            marginBottom: 16,
          }}
        >
          {GAME_DEFINITIONS.map((g) => {
            const selected = g.id === gameType;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setGameType(g.id)}
                style={{
                  textAlign: "left",
                  padding: "11px 12px",
                  borderRadius: 14,
                  background: selected
                    ? "var(--accent-soft)"
                    : "var(--bg-surface)",
                  border: `1.5px solid ${
                    selected ? "var(--accent)" : "var(--border-default)"
                  }`,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ fontSize: 20 }}>{g.emoji}</span>
                  {selected && (
                    <span
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        background: "var(--accent)",
                        color: "#fff",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Check size={11} strokeWidth={3} />
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                  }}
                >
                  {g.name}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--text-muted)",
                    lineHeight: 1.35,
                  }}
                >
                  {g.shortDescription}
                </div>
              </button>
            );
          })}
        </div>

        {/* Dots & Boxes Board Size Picker */}
        {gameType === "dots_and_boxes" && (
          <div style={{ marginBottom: 16 }}>
            <FieldLabel>Board size</FieldLabel>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 8,
              }}
            >
              {DOTS_AND_BOXES_SIZE_OPTIONS.map((opt) => {
                const selected = dotsBoardSize === opt.size;
                return (
                  <button
                    key={opt.size}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setDotsBoardSize(opt.size)}
                    style={{
                      padding: "9px 10px",
                      borderRadius: 12,
                      background: selected
                        ? "var(--accent-soft)"
                        : "var(--bg-surface)",
                      border: `1.5px solid ${
                        selected ? "var(--accent)" : "var(--border-default)"
                      }`,
                      cursor: "pointer",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13.5,
                        fontWeight: 800,
                        color: selected
                          ? "var(--accent-ink)"
                          : "var(--text-primary)",
                      }}
                    >
                      {opt.label}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        marginTop: 2,
                      }}
                    >
                      {opt.subtitle}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Play Mode Toggle */}
        <FieldLabel>How do you want to play?</FieldLabel>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            marginBottom: 16,
          }}
        >
          <button
            type="button"
            onClick={() => {
              setMode("remote");
              setError(null);
            }}
            style={{
              padding: "10px 12px",
              borderRadius: 13,
              background:
                mode === "remote" ? "var(--accent-soft)" : "var(--bg-surface)",
              border: `1.5px solid ${
                mode === "remote" ? "var(--accent)" : "var(--border-default)"
              }`,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                fontWeight: 700,
                color:
                  mode === "remote"
                    ? "var(--accent-ink)"
                    : "var(--text-primary)",
              }}
            >
              <Send size={14} /> Send Challenge
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                marginTop: 3,
                lineHeight: 1.3,
              }}
            >
              Notifies them to accept &amp; take turns on their own device.
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode("pass_and_play");
              setError(null);
            }}
            style={{
              padding: "10px 12px",
              borderRadius: 13,
              background:
                mode === "pass_and_play"
                  ? "var(--accent-soft)"
                  : "var(--bg-surface)",
              border: `1.5px solid ${
                mode === "pass_and_play"
                  ? "var(--accent)"
                  : "var(--border-default)"
              }`,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                fontWeight: 700,
                color:
                  mode === "pass_and_play"
                    ? "var(--accent-ink)"
                    : "var(--text-primary)",
              }}
            >
              <Smartphone size={14} /> Pass &amp; Play
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                marginTop: 3,
                lineHeight: 1.3,
              }}
            >
              Play together on this device — great for kids without logins.
            </div>
          </button>
        </div>

        {/* Opponent Picker */}
        <FieldLabel>
          {mode === "remote" ? "Challenge a family member" : "Play with"}
        </FieldLabel>

        {availableOpponents.length === 0 ? (
          <div
            style={{
              background: "var(--bg-subtle)",
              border: "1px dashed var(--border-strong)",
              borderRadius: 14,
              padding: "16px 14px",
              textAlign: "center",
              marginBottom: 14,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--text-primary)",
                marginBottom: 4,
              }}
            >
              {mode === "remote"
                ? "No other signed-in accounts yet"
                : "No other family members added yet"}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                lineHeight: 1.4,
                marginBottom: 12,
              }}
            >
              {mode === "remote"
                ? "Share your Family Invite Code so another family member can sign in, or switch to Pass & Play to play with any profile on this device."
                : "Add a family member or child profile in Settings → Family & Members to start playing together."}
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              {mode === "remote" && otherMembers.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMode("pass_and_play")}
                  style={{
                    background: "var(--accent)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    padding: "8px 12px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Switch to Pass &amp; Play
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenFamilySettings();
                }}
                style={{
                  background: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 10,
                  padding: "8px 12px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <Users size={13} /> Family &amp; Members
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 7,
              marginBottom: 16,
            }}
          >
            {availableOpponents.map((m) => {
              const selected = m.id === effectiveOpponentId;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setOpponentId(m.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 13,
                    background: selected
                      ? "var(--accent-soft)"
                      : "var(--bg-surface)",
                    border: `1.5px solid ${
                      selected ? "var(--accent)" : "var(--border-default)"
                    }`,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <AvatarDot id={m.id} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13.5,
                        fontWeight: 700,
                        color: "var(--text-primary)",
                      }}
                    >
                      {m.name}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                      {m.isChild
                        ? "Child profile"
                        : m.hasAccount
                          ? "Has sign-in account"
                          : "Profile only"}
                    </div>
                  </div>
                  {selected && (
                    <span
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        background: "var(--accent)",
                        color: "#fff",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Check size={13} strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {error && (
          <div
            style={{
              background: "var(--danger-soft)",
              color: "var(--danger-ink)",
              border: "1px solid var(--danger-border)",
              borderRadius: 10,
              padding: "9px 12px",
              fontSize: 12.5,
              fontWeight: 600,
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        <button
          type="button"
          disabled={submitting || !effectiveOpponentId}
          onClick={() => void handleSubmit()}
          style={{
            ...btnStyle,
            width: "100%",
            background: "var(--accent)",
            color: "#fff",
            opacity: submitting || !effectiveOpponentId ? 0.55 : 1,
            cursor:
              submitting || !effectiveOpponentId ? "not-allowed" : "pointer",
            boxShadow: "0 4px 14px rgba(232,98,44,0.3)",
          }}
        >
          {submitting
            ? "Starting…"
            : mode === "remote"
              ? "Send Game Request"
              : "Start Pass & Play"}
        </button>
      </div>
    </ModalShell>
  );
}
