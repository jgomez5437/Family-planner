"use client";

import React, { useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Gamepad2,
  Plus,
  RotateCcw,
  Smartphone,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import { CARD_SHADOW } from "@/lib/constants";
import { formatRelativeTime } from "@/lib/dates";
import {
  computeFamilyScoreboard,
  getGameDefinition,
} from "@/lib/games/registry";
import { useMembers } from "@/components/MembersContext";
import {
  AvatarDot,
  EmptyState,
  SectionLabel,
} from "@/components/ui/Primitives";
import { TicTacToeBoard } from "@/components/games/TicTacToeBoard";
import { PoolBoard } from "@/components/games/PoolBoard";
import { DotsAndBoxesBoard } from "@/components/games/DotsAndBoxesBoard";
import { NewGameModal } from "@/components/games/NewGameModal";
import { isDotsAndBoxesState } from "@/lib/games/dotsAndBoxes";
import type {
  FamilyGame,
  GameMode,
  GameTypeId,
  MemberId,
} from "@/types/family";

export function GamesTab({
  games,
  currentUser,
  selectedGameId,
  onSelectGame,
  onCreateGame,
  onRespondInvite,
  onMakeMove,
  onForfeitGame,
  onOpenFamilySettings,
}: {
  games: FamilyGame[];
  currentUser: MemberId;
  selectedGameId: string | null;
  onSelectGame: (gameId: string | null) => void;
  onCreateGame: (input: {
    gameType: GameTypeId;
    opponentId: MemberId;
    mode: GameMode;
    rematchOfId?: string | null;
    options?: Record<string, unknown>;
  }) => Promise<string | null>;
  onRespondInvite: (
    gameId: string,
    decision: "accept" | "decline" | "cancel"
  ) => Promise<void>;
  onMakeMove: (gameId: string, move: unknown) => Promise<void>;
  onForfeitGame: (gameId: string) => Promise<void>;
  onOpenFamilySettings: () => void;
}) {
  const { members, memberById } = useMembers();
  const [newGameOpen, setNewGameOpen] = useState(false);
  const [busyGameId, setBusyGameId] = useState<string | null>(null);
  const [confirmForfeitId, setConfirmForfeitId] = useState<string | null>(null);

  const selectedGame = useMemo(
    () => (selectedGameId ? games.find((g) => g.id === selectedGameId) || null : null),
    [games, selectedGameId]
  );

  const incomingInvites = useMemo(
    () =>
      games.filter(
        (g) => g.status === "pending" && g.opponentId === currentUser
      ),
    [games, currentUser]
  );

  const sentInvites = useMemo(
    () =>
      games.filter(
        (g) => g.status === "pending" && g.challengerId === currentUser
      ),
    [games, currentUser]
  );

  const activeGames = useMemo(() => {
    const mine = games.filter(
      (g) => g.status === "active" && g.players.includes(currentUser)
    );
    return [...mine].sort((a, b) => {
      const aMyTurn = a.mode === "remote" && a.currentTurnId === currentUser ? 0 : a.mode === "pass_and_play" ? 1 : 2;
      const bMyTurn = b.mode === "remote" && b.currentTurnId === currentUser ? 0 : b.mode === "pass_and_play" ? 1 : 2;
      if (aMyTurn !== bMyTurn) return aMyTurn - bMyTurn;
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });
  }, [games, currentUser]);

  const completedGames = useMemo(
    () =>
      games
        .filter((g) => g.status === "completed")
        .sort(
          (a, b) =>
            Date.parse(b.completedAt || b.updatedAt) -
            Date.parse(a.completedAt || a.updatedAt)
        )
        .slice(0, 15),
    [games]
  );

  const scoreboard = useMemo(
    () => computeFamilyScoreboard(games, members),
    [games, members]
  );

  async function handleInviteAction(
    gameId: string,
    decision: "accept" | "decline" | "cancel"
  ) {
    setBusyGameId(gameId);
    try {
      await onRespondInvite(gameId, decision);
      if (decision === "accept") {
        onSelectGame(gameId);
      } else if (selectedGameId === gameId) {
        onSelectGame(null);
      }
    } finally {
      setBusyGameId(null);
    }
  }

  async function handleMove(gameId: string, move: unknown) {
    setBusyGameId(gameId);
    try {
      await onMakeMove(gameId, move);
    } finally {
      setBusyGameId(null);
    }
  }

  async function handleRematch(game: FamilyGame) {
    const otherPlayerId =
      game.players[0] === currentUser ? game.players[1] : game.players[0];
    setBusyGameId(game.id);
    try {
      await onCreateGame({
        gameType: game.gameType,
        opponentId: otherPlayerId,
        mode: game.mode,
        rematchOfId: game.id,
      });
    } finally {
      setBusyGameId(null);
    }
  }

  async function handleForfeit(gameId: string) {
    setBusyGameId(gameId);
    setConfirmForfeitId(null);
    try {
      await onForfeitGame(gameId);
    } finally {
      setBusyGameId(null);
    }
  }

  /* ---- FOCUSED MATCH ARENA ---- */
  if (selectedGame) {
    if (selectedGame.gameType === "pool") {
      return (
        <PoolBoard
          key={selectedGame.id}
          game={selectedGame}
          currentUser={currentUser}
          submitting={busyGameId === selectedGame.id}
          onMakeMove={(move) => void handleMove(selectedGame.id, move)}
          onRespondInvite={(decision) =>
            void handleInviteAction(selectedGame.id, decision)
          }
          onForfeit={() => void handleForfeit(selectedGame.id)}
          onRematch={() => void handleRematch(selectedGame)}
          onBack={() => {
            setConfirmForfeitId(null);
            onSelectGame(null);
          }}
        />
      );
    }

    const def = getGameDefinition(selectedGame.gameType);
    const isParticipant = selectedGame.players.includes(currentUser);
    const isPendingForMe =
      selectedGame.status === "pending" &&
      selectedGame.opponentId === currentUser;
    const isPendingByMe =
      selectedGame.status === "pending" &&
      selectedGame.challengerId === currentUser;

    return (
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 14,
          }}
        >
          <button
            type="button"
            onClick={() => {
              setConfirmForfeitId(null);
              onSelectGame(null);
            }}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 11,
              padding: "7px 12px 7px 8px",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 13,
              fontWeight: 700,
              color: "var(--text-primary)",
              cursor: "pointer",
            }}
          >
            <ChevronLeft size={16} /> All Games
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {selectedGame.mode === "pass_and_play" && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "4px 9px",
                  borderRadius: 999,
                  background: "var(--cat-blue-soft)",
                  color: "var(--cat-blue)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Smartphone size={11} /> Pass &amp; Play
              </span>
            )}
            {selectedGame.status === "active" && isParticipant && (
              confirmForfeitId === selectedGame.id ? (
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <button
                    type="button"
                    disabled={busyGameId === selectedGame.id}
                    onClick={() => void handleForfeit(selectedGame.id)}
                    style={{
                      background: "var(--danger)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 9,
                      padding: "6px 10px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Confirm Forfeit
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmForfeitId(null)}
                    style={{
                      background: "var(--bg-subtle)",
                      color: "var(--text-secondary)",
                      border: "1px solid var(--border-default)",
                      borderRadius: 9,
                      padding: "6px 9px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmForfeitId(selectedGame.id)}
                  style={{
                    background: "none",
                    border: "1px solid var(--border-default)",
                    borderRadius: 10,
                    padding: "6px 10px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    cursor: "pointer",
                  }}
                >
                  <Flag size={12} /> Forfeit
                </button>
              )
            )}
          </div>
        </div>

        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 22,
            padding: "18px 16px 20px",
            boxShadow: CARD_SHADOW,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 22 }}>{def?.emoji || "🎮"}</span>
              <div>
                <div
                  style={{
                    fontFamily: "'Baloo 2', sans-serif",
                    fontSize: 19,
                    fontWeight: 700,
                    lineHeight: 1.15,
                  }}
                >
                  {def?.name || "Game"}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {def?.rulesSummary}
                </div>
              </div>
            </div>
            <div
              suppressHydrationWarning
              style={{
                fontSize: 11.5,
                color: "var(--text-faint)",
                fontWeight: 500,
                flexShrink: 0,
              }}
            >
              {formatRelativeTime(selectedGame.updatedAt) || "Just now"}
            </div>
          </div>

          {isPendingForMe && (
            <div
              style={{
                background: "var(--accent-soft)",
                border: "1px solid var(--accent-border)",
                borderRadius: 14,
                padding: "12px 14px",
                marginBottom: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--accent-ink)",
                }}
              >
                {memberById(selectedGame.challengerId).name} invited you to play!
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  disabled={busyGameId === selectedGame.id}
                  onClick={() =>
                    void handleInviteAction(selectedGame.id, "accept")
                  }
                  style={{
                    background: "var(--accent)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    padding: "8px 14px",
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Check size={14} strokeWidth={2.8} /> Accept
                </button>
                <button
                  type="button"
                  disabled={busyGameId === selectedGame.id}
                  onClick={() =>
                    void handleInviteAction(selectedGame.id, "decline")
                  }
                  style={{
                    background: "var(--bg-surface)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border-default)",
                    borderRadius: 10,
                    padding: "8px 12px",
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Decline
                </button>
              </div>
            </div>
          )}

          {isPendingByMe && (
            <div
              style={{
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 14,
                padding: "11px 14px",
                marginBottom: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                }}
              >
                Waiting for {memberById(selectedGame.opponentId).name} to accept
                your invite…
              </div>
              <button
                type="button"
                disabled={busyGameId === selectedGame.id}
                onClick={() =>
                  void handleInviteAction(selectedGame.id, "cancel")
                }
                style={{
                  background: "none",
                  border: "1px solid var(--border-default)",
                  borderRadius: 9,
                  padding: "6px 10px",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          )}

          {(selectedGame.status === "declined" ||
            selectedGame.status === "cancelled") && (
            <div
              style={{
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 14,
                padding: "18px 14px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  marginBottom: 4,
                }}
              >
                {selectedGame.status === "declined"
                  ? `${memberById(selectedGame.opponentId).name} declined this game request.`
                  : `${memberById(selectedGame.challengerId).name} cancelled this game request.`}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  marginBottom: 14,
                }}
              >
                You can start a new challenge anytime from the Games lobby.
              </div>
              <button
                type="button"
                onClick={() => onSelectGame(null)}
                style={{
                  background: "var(--accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  padding: "9px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Back to Games
              </button>
            </div>
          )}

          {selectedGame.status !== "declined" &&
            selectedGame.status !== "cancelled" &&
            selectedGame.gameType === "tic_tac_toe" && (
              <TicTacToeBoard
                game={selectedGame}
                currentUser={currentUser}
                submitting={busyGameId === selectedGame.id}
                onMakeMove={(move) => void handleMove(selectedGame.id, move)}
                onRematch={() => void handleRematch(selectedGame)}
                onBack={() => onSelectGame(null)}
              />
            )}

          {selectedGame.status !== "declined" &&
            selectedGame.status !== "cancelled" &&
            selectedGame.gameType === "dots_and_boxes" && (
              <DotsAndBoxesBoard
                key={selectedGame.id}
                game={selectedGame}
                currentUser={currentUser}
                submitting={busyGameId === selectedGame.id}
                onMakeMove={(move) => void handleMove(selectedGame.id, move)}
                onRematch={() => void handleRematch(selectedGame)}
                onBack={() => onSelectGame(null)}
              />
            )}
        </div>
      </div>
    );
  }

  /* ---- LOBBY VIEW ---- */
  const hasInvites = incomingInvites.length > 0 || sentInvites.length > 0;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "'Baloo 2', sans-serif",
              fontSize: 22,
              fontWeight: 700,
              lineHeight: 1.15,
            }}
          >
            Family Games
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Challenge family members to turn-based matches.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setNewGameOpen(true)}
          style={{
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: 12,
            padding: "10px 14px",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
            boxShadow: "0 4px 12px rgba(232,98,44,0.28)",
          }}
        >
          <Plus size={16} strokeWidth={2.5} /> New Game
        </button>
      </div>

      {/* Pending Invites */}
      {hasInvites && (
        <div style={{ marginBottom: 20 }}>
          <SectionLabel text="Game Requests" />

          {incomingInvites.map((g) => {
            const challenger = memberById(g.challengerId);
            const def = getGameDefinition(g.gameType);
            const busy = busyGameId === g.id;
            return (
              <div
                key={g.id}
                style={{
                  background: "var(--bg-surface)",
                  border: "1.5px solid var(--accent-border)",
                  boxShadow: CARD_SHADOW,
                  borderRadius: 16,
                  padding: "13px 14px",
                  marginBottom: 9,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    minWidth: 0,
                    flex: "1 1 180px",
                  }}
                >
                  <AvatarDot id={challenger.id} size={38} />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13.5,
                        fontWeight: 700,
                        color: "var(--text-primary)",
                      }}
                    >
                      {challenger.name} challenged you
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--text-muted)",
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        marginTop: 2,
                      }}
                    >
                      <span>
                        {def?.emoji} {def?.name}
                        {g.gameType === "dots_and_boxes" &&
                        isDotsAndBoxesState(g.state)
                          ? ` (${g.state.rows}×${g.state.cols})`
                          : ""}
                        {g.rematchOfId ? " · Rematch" : ""}
                      </span>
                      <span>·</span>
                      <span suppressHydrationWarning>
                        {formatRelativeTime(g.createdAt) || "Just now"}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 7, flexShrink: 0 }}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleInviteAction(g.id, "accept")}
                    style={{
                      background: "var(--accent)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 10,
                      padding: "8px 13px",
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: busy ? "wait" : "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Check size={14} strokeWidth={2.8} /> Accept
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleInviteAction(g.id, "decline")}
                    style={{
                      background: "var(--bg-subtle)",
                      color: "var(--text-secondary)",
                      border: "1px solid var(--border-default)",
                      borderRadius: 10,
                      padding: "8px 11px",
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: busy ? "wait" : "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    <X size={13} /> Decline
                  </button>
                </div>
              </div>
            );
          })}

          {sentInvites.map((g) => {
            const opponent = memberById(g.opponentId);
            const def = getGameDefinition(g.gameType);
            const busy = busyGameId === g.id;
            return (
              <div
                key={g.id}
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                  boxShadow: CARD_SHADOW,
                  borderRadius: 16,
                  padding: "12px 14px",
                  marginBottom: 9,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    minWidth: 0,
                  }}
                >
                  <AvatarDot id={opponent.id} size={34} />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13.5,
                        fontWeight: 700,
                        color: "var(--text-primary)",
                      }}
                    >
                      Waiting for {opponent.name}…
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--text-muted)",
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        marginTop: 2,
                      }}
                    >
                      <span>
                        {def?.emoji} {def?.name}
                        {g.gameType === "dots_and_boxes" &&
                        isDotsAndBoxesState(g.state)
                          ? ` (${g.state.rows}×${g.state.cols})`
                          : ""}
                      </span>
                      <span>·</span>
                      <span suppressHydrationWarning>
                        Sent {formatRelativeTime(g.createdAt) || "just now"}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleInviteAction(g.id, "cancel")}
                  style={{
                    background: "var(--bg-subtle)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border-default)",
                    borderRadius: 9,
                    padding: "6px 11px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: busy ? "wait" : "pointer",
                    flexShrink: 0,
                  }}
                >
                  Cancel
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Active Games */}
      <div style={{ marginBottom: 22 }}>
        <SectionLabel text="Active Matches" />

        {activeGames.length === 0 ? (
          <EmptyState
            text="No active games right now"
            sub="Challenge a family member to Tic-Tac-Toe, 8-Ball Pool, or Dots & Boxes, or start a Pass & Play round."
            actionLabel="Start a Game"
            onAction={() => setNewGameOpen(true)}
          />
        ) : (
          activeGames.map((g) => {
            const def = getGameDefinition(g.gameType);
            const otherId =
              g.players[0] === currentUser ? g.players[1] : g.players[0];
            const other = memberById(otherId);
            const isPassAndPlay = g.mode === "pass_and_play";
            const isMyTurn = !isPassAndPlay && g.currentTurnId === currentUser;
            const turnMember = g.currentTurnId
              ? memberById(g.currentTurnId)
              : null;

            return (
              <button
                key={g.id}
                type="button"
                onClick={() => onSelectGame(g.id)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: "var(--bg-surface)",
                  border: isMyTurn
                    ? "1.5px solid var(--accent)"
                    : "1px solid var(--border-subtle)",
                  boxShadow: CARD_SHADOW,
                  borderRadius: 16,
                  padding: "13px 14px",
                  marginBottom: 9,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  <AvatarDot id={other.id} size={38} />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "var(--text-primary)",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        flexWrap: "wrap",
                      }}
                    >
                      <span>
                        {def?.emoji} {def?.name} vs {other.name}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--text-muted)",
                        marginTop: 2,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {g.gameType === "dots_and_boxes" &&
                        isDotsAndBoxesState(g.state) && (
                          <>
                            <span>
                              {g.state.rows}×{g.state.cols}
                            </span>
                            <span>·</span>
                          </>
                        )}
                      <span>
                        {g.moves.length}{" "}
                        {g.gameType === "pool"
                          ? g.moves.length === 1
                            ? "shot"
                            : "shots"
                          : g.gameType === "dots_and_boxes"
                            ? g.moves.length === 1
                              ? "line"
                              : "lines"
                            : g.moves.length === 1
                              ? "move"
                              : "moves"}
                      </span>
                      <span>·</span>
                      <span suppressHydrationWarning>
                        {formatRelativeTime(g.updatedAt) || "Just now"}
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexShrink: 0,
                  }}
                >
                  {isPassAndPlay ? (
                    <span
                      style={{
                        fontSize: 11.5,
                        fontWeight: 700,
                        padding: "4px 9px",
                        borderRadius: 999,
                        background: "var(--cat-blue-soft)",
                        color: "var(--cat-blue)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Smartphone size={11} />
                      {turnMember ? `${turnMember.name}'s turn` : "Pass & Play"}
                    </span>
                  ) : isMyTurn ? (
                    <span
                      style={{
                        fontSize: 11.5,
                        fontWeight: 700,
                        padding: "4px 10px",
                        borderRadius: 999,
                        background: "var(--accent)",
                        color: "#fff",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Sparkles size={11} /> Your Turn
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: 11.5,
                        fontWeight: 600,
                        padding: "4px 9px",
                        borderRadius: 999,
                        background: "var(--bg-subtle)",
                        color: "var(--text-muted)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Clock size={11} /> {other.name}&apos;s turn
                    </span>
                  )}
                  <ChevronRight size={16} color="var(--text-faint)" />
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Family Scoreboard */}
      <div style={{ marginBottom: 22 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <SectionLabel text="Family Scoreboard" />
          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
            Head-to-head remote matches
          </span>
        </div>

        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            boxShadow: CARD_SHADOW,
            borderRadius: 16,
            overflow: "hidden",
          }}
        >
          {scoreboard.length === 0 ? (
            <div
              style={{
                padding: "20px 16px",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: 12.5,
              }}
            >
              <Trophy
                size={20}
                color="var(--text-faint)"
                style={{ marginBottom: 6 }}
              />
              <div>
                Finish a remote head-to-head match to see your family&apos;s
                W / L / D rankings here!
              </div>
            </div>
          ) : (
            <div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "28px 1fr 40px 40px 40px 52px",
                  alignItems: "center",
                  padding: "9px 14px",
                  background: "var(--bg-surface-warm)",
                  borderBottom: "1px solid var(--border-divider)",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--text-faint)",
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                }}
              >
                <span>#</span>
                <span>Player</span>
                <span style={{ textAlign: "center" }}>W</span>
                <span style={{ textAlign: "center" }}>D</span>
                <span style={{ textAlign: "center" }}>L</span>
                <span style={{ textAlign: "right" }}>Win %</span>
              </div>
              {scoreboard.map((row, idx) => {
                const member = memberById(row.memberId);
                const medal =
                  idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}`;
                return (
                  <div
                    key={row.memberId}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "28px 1fr 40px 40px 40px 52px",
                      alignItems: "center",
                      padding: "10px 14px",
                      borderBottom:
                        idx === scoreboard.length - 1
                          ? "none"
                          : "1px solid var(--border-divider)",
                      background:
                        row.memberId === currentUser
                          ? "var(--bg-tint-unread)"
                          : "transparent",
                    }}
                  >
                    <span
                      style={{
                        fontSize: idx < 3 ? 15 : 12,
                        fontWeight: 700,
                        color: "var(--text-muted)",
                      }}
                    >
                      {medal}
                    </span>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        minWidth: 0,
                      }}
                    >
                      <AvatarDot id={row.memberId} size={26} />
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: "var(--text-primary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {member.name}
                      </span>
                    </div>
                    <span
                      style={{
                        textAlign: "center",
                        fontSize: 13,
                        fontWeight: 800,
                        color: "var(--success)",
                      }}
                    >
                      {row.wins}
                    </span>
                    <span
                      style={{
                        textAlign: "center",
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--text-secondary)",
                      }}
                    >
                      {row.draws}
                    </span>
                    <span
                      style={{
                        textAlign: "center",
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--text-muted)",
                      }}
                    >
                      {row.losses}
                    </span>
                    <span
                      style={{
                        textAlign: "right",
                        fontSize: 12,
                        fontWeight: 700,
                        color: "var(--text-primary)",
                      }}
                    >
                      {row.winRate}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent Completed Matches */}
      {completedGames.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <SectionLabel text="Recent Matches" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {completedGames.map((g) => {
              const def = getGameDefinition(g.gameType);
              const [p1Id, p2Id] = g.players;
              const p1 = memberById(p1Id);
              const p2 = memberById(p2Id);
              const winner = g.winnerId ? memberById(g.winnerId) : null;
              const isParticipant = g.players.includes(currentUser);
              const isPassAndPlay = g.mode === "pass_and_play";

              let outcomeLabel = "Draw";
              let outcomeBg = "var(--cat-ochre-soft)";
              let outcomeColor = "var(--cat-ochre)";
              if (g.outcome === "win" || g.outcome === "forfeit") {
                if (!isPassAndPlay && isParticipant) {
                  if (g.winnerId === currentUser) {
                    outcomeLabel =
                      g.outcome === "forfeit" ? "Won (Forfeit)" : "You Won";
                    outcomeBg = "var(--success-soft)";
                    outcomeColor = "var(--success-ink)";
                  } else {
                    outcomeLabel =
                      g.outcome === "forfeit" ? "Forfeited" : "Lost";
                    outcomeBg = "var(--bg-subtle)";
                    outcomeColor = "var(--text-muted)";
                  }
                } else if (winner) {
                  outcomeLabel = `${winner.name} won`;
                  outcomeBg = "var(--success-soft)";
                  outcomeColor = "var(--success-ink)";
                }
              }

              return (
                <div
                  key={g.id}
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-subtle)",
                    boxShadow: CARD_SHADOW,
                    borderRadius: 15,
                    padding: "11px 13px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onSelectGame(g.id)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      textAlign: "left",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flex: "1 1 180px",
                      minWidth: 0,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <AvatarDot id={p1.id} size={28} />
                      <div style={{ marginLeft: -8 }}>
                        <AvatarDot id={p2.id} size={28} />
                      </div>
                    </div>
                    <div style={{ minWidth: 0 }}>
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
                        {def?.emoji} {p1.name} vs {p2.name}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          marginTop: 3,
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: 999,
                            background: outcomeBg,
                            color: outcomeColor,
                          }}
                        >
                          {outcomeLabel}
                        </span>
                        {g.gameType === "dots_and_boxes" &&
                          isDotsAndBoxesState(g.state) && (
                            <span
                              style={{
                                fontSize: 10.5,
                                fontWeight: 600,
                                padding: "2px 7px",
                                borderRadius: 999,
                                background: "var(--bg-subtle)",
                                color: "var(--text-secondary)",
                              }}
                            >
                              {g.state.rows}×{g.state.cols} ·{" "}
                              {g.state.scores[p1Id] ?? 0}–
                              {g.state.scores[p2Id] ?? 0}
                            </span>
                          )}
                        {isPassAndPlay && (
                          <span
                            style={{
                              fontSize: 10.5,
                              fontWeight: 600,
                              padding: "2px 7px",
                              borderRadius: 999,
                              background: "var(--cat-blue-soft)",
                              color: "var(--cat-blue)",
                            }}
                          >
                            Pass &amp; Play
                          </span>
                        )}
                        <span
                          suppressHydrationWarning
                          style={{
                            fontSize: 11,
                            color: "var(--text-faint)",
                          }}
                        >
                          {formatRelativeTime(g.completedAt || g.updatedAt) ||
                            "Just now"}
                        </span>
                      </div>
                    </div>
                  </button>

                  {isParticipant && (
                    <button
                      type="button"
                      disabled={busyGameId === g.id}
                      onClick={() => void handleRematch(g)}
                      style={{
                        background: "var(--accent-soft)",
                        color: "var(--accent-ink)",
                        border: "1px solid var(--accent-border)",
                        borderRadius: 10,
                        padding: "7px 11px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: busyGameId === g.id ? "wait" : "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        flexShrink: 0,
                      }}
                    >
                      <RotateCcw size={12} /> Rematch
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Subtle footer note about extensibility */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          padding: "8px 0 4px",
          fontSize: 12,
          color: "var(--text-faint)",
        }}
      >
        <Gamepad2 size={14} />
        <span>
          Tic-Tac-Toe, 8-Ball Pool &amp; Dots &amp; Boxes are live — more family
          games coming soon!
        </span>
      </div>

      {newGameOpen && (
        <NewGameModal
          currentUser={currentUser}
          onClose={() => setNewGameOpen(false)}
          onCreateGame={async (input) => {
            const err = await onCreateGame(input);
            return err;
          }}
          onOpenFamilySettings={onOpenFamilySettings}
        />
      )}
    </div>
  );
}
