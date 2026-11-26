"use client";

import React from "react";
import { RotateCcw, Sparkles, Trophy, Users } from "lucide-react";
import { CARD_SHADOW } from "@/lib/constants";
import {
  createInitialTicTacToeState,
  isTicTacToeState,
  type TicTacToeMove,
} from "@/lib/games/ticTacToe";
import { useMembers } from "@/components/MembersContext";
import { AvatarDot } from "@/components/ui/Primitives";
import type { FamilyGame, MemberId } from "@/types/family";

export function TicTacToeBoard({
  game,
  currentUser,
  submitting,
  onMakeMove,
  onRematch,
  onBack,
}: {
  game: FamilyGame;
  currentUser: MemberId;
  submitting: boolean;
  onMakeMove: (move: TicTacToeMove) => void;
  onRematch: () => void;
  onBack: () => void;
}) {
  const { memberById } = useMembers();
  const state = isTicTacToeState(game.state)
    ? game.state
    : createInitialTicTacToeState(game.players);

  const [playerXId, playerOId] = game.players;
  const playerX = memberById(playerXId);
  const playerO = memberById(playerOId);

  const isPassAndPlay = game.mode === "pass_and_play";
  const isActive = game.status === "active";
  const isCompleted = game.status === "completed";
  const canMoveNow =
    isActive &&
    !submitting &&
    (isPassAndPlay || game.currentTurnId === currentUser);

  const activeTurnMember = game.currentTurnId
    ? memberById(game.currentTurnId)
    : null;
  const winnerMember = game.winnerId ? memberById(game.winnerId) : null;
  const winningSet = new Set(state.winningLine || []);

  const markColor = (mark: "X" | "O") =>
    mark === "X" ? playerX.color : playerO.color;

  let statusBannerText = "";
  let statusBannerTone: "turn" | "wait" | "win" | "draw" = "wait";
  if (isCompleted) {
    if (game.outcome === "draw") {
      statusBannerText = "It's a draw! Great match.";
      statusBannerTone = "draw";
    } else if (game.outcome === "forfeit" && winnerMember) {
      statusBannerText =
        winnerMember.id === currentUser && !isPassAndPlay
          ? "You won by forfeit!"
          : `${winnerMember.name} won by forfeit`;
      statusBannerTone = "win";
    } else if (winnerMember) {
      statusBannerText =
        winnerMember.id === currentUser && !isPassAndPlay
          ? "You win! 🎉"
          : `${winnerMember.name} wins! 🎉`;
      statusBannerTone = "win";
    }
  } else if (isActive && activeTurnMember) {
    if (isPassAndPlay) {
      const activeMark = state.marks[activeTurnMember.id] || "X";
      statusBannerText = `${activeTurnMember.name}'s turn (${activeMark})`;
      statusBannerTone = "turn";
    } else if (game.currentTurnId === currentUser) {
      const myMark = state.marks[currentUser] || "X";
      statusBannerText = `Your turn — place your ${myMark}`;
      statusBannerTone = "turn";
    } else {
      statusBannerText = `Waiting for ${activeTurnMember.name}…`;
      statusBannerTone = "wait";
    }
  } else if (game.status === "pending") {
    statusBannerText =
      game.opponentId === currentUser
        ? "Accept the challenge above to start playing"
        : `Waiting for ${memberById(game.opponentId).name} to accept…`;
  }

  return (
    <div>
      {/* Player Matchup Strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: 10,
          marginBottom: 14,
        }}
      >
        {[
          { member: playerX, mark: "X" as const },
          { member: playerO, mark: "O" as const },
        ].map((slot, idx) => {
          const isTurn = isActive && game.currentTurnId === slot.member.id;
          const isWinner = isCompleted && game.winnerId === slot.member.id;
          const card = (
            <div
              key={slot.member.id}
              style={{
                background: isWinner
                  ? "var(--success-soft)"
                  : isTurn
                    ? "var(--accent-soft)"
                    : "var(--bg-subtle)",
                border: `1.5px solid ${
                  isWinner
                    ? "var(--success)"
                    : isTurn
                      ? "var(--accent)"
                      : "var(--border-subtle)"
                }`,
                borderRadius: 14,
                padding: "9px 10px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                minWidth: 0,
                transition: "all 0.2s ease",
              }}
            >
              <AvatarDot id={slot.member.id} size={30} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {slot.member.id === currentUser && !isPassAndPlay
                    ? "You"
                    : slot.member.name}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: slot.member.color,
                  }}
                >
                  Plays {slot.mark}
                </div>
              </div>
              <span
                aria-hidden="true"
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  background: "var(--bg-surface)",
                  border: `1.5px solid ${slot.member.color}55`,
                  color: slot.member.color,
                  fontFamily: "'Baloo 2', sans-serif",
                  fontSize: 16,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {slot.mark}
              </span>
            </div>
          );

          if (idx === 0) {
            return (
              <React.Fragment key={slot.member.id}>
                {card}
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: "var(--text-faint)",
                    letterSpacing: 0.6,
                  }}
                >
                  VS
                </div>
              </React.Fragment>
            );
          }
          return card;
        })}
      </div>

      {/* Turn / Outcome Status Banner */}
      {statusBannerText && (
        <div
          role="status"
          aria-live="polite"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            padding: "9px 14px",
            borderRadius: 12,
            marginBottom: 16,
            fontSize: 13.5,
            fontWeight: 700,
            background:
              statusBannerTone === "win"
                ? "var(--success-soft)"
                : statusBannerTone === "turn"
                  ? "var(--accent-soft)"
                  : statusBannerTone === "draw"
                    ? "var(--cat-ochre-soft)"
                    : "var(--bg-subtle)",
            color:
              statusBannerTone === "win"
                ? "var(--success-ink)"
                : statusBannerTone === "turn"
                  ? "var(--accent-ink)"
                  : statusBannerTone === "draw"
                    ? "var(--cat-ochre)"
                    : "var(--text-secondary)",
            border: `1px solid ${
              statusBannerTone === "win"
                ? "var(--success-border)"
                : statusBannerTone === "turn"
                  ? "var(--accent-border)"
                  : "var(--border-subtle)"
            }`,
          }}
        >
          {statusBannerTone === "win" && <Trophy size={15} />}
          {statusBannerTone === "turn" && <Sparkles size={15} />}
          {isPassAndPlay && isActive && <Users size={14} />}
          <span>{statusBannerText}</span>
        </div>
      )}

      {/* 3x3 Game Grid */}
      <div
        role="grid"
        aria-label="Tic-Tac-Toe board"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 10,
          maxWidth: 336,
          margin: "0 auto 18px",
          padding: 12,
          borderRadius: 22,
          background: "var(--bg-subtle)",
          border: "1px solid var(--border-subtle)",
          boxShadow: CARD_SHADOW,
        }}
      >
        {state.board.map((cell, index) => {
          const row = Math.floor(index / 3) + 1;
          const col = (index % 3) + 1;
          const isWinningCell = winningSet.has(index);
          const isLastMove = state.lastMoveIndex === index;
          const playable = canMoveNow && cell === null;
          const cellColor = cell ? markColor(cell) : "var(--text-primary)";

          return (
            <button
              key={index}
              type="button"
              disabled={!playable}
              onClick={() => {
                if (playable) onMakeMove({ index });
              }}
              aria-label={`Row ${row}, Column ${col}: ${cell ? cell : "empty"}`}
              style={{
                aspectRatio: "1 / 1",
                minHeight: 82,
                borderRadius: 16,
                background: isWinningCell
                  ? "var(--success-soft)"
                  : "var(--bg-surface)",
                border: isWinningCell
                  ? "2.5px solid var(--success)"
                  : isLastMove
                    ? `2px solid ${cellColor}88`
                    : "1.5px solid var(--border-default)",
                boxShadow: playable
                  ? "0 2px 6px rgba(74, 50, 24, 0.06)"
                  : "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: playable ? "pointer" : "default",
                fontFamily: "'Baloo 2', sans-serif",
                fontSize: 44,
                fontWeight: 800,
                lineHeight: 1,
                color: cellColor,
                opacity:
                  isCompleted && winningSet.size > 0 && !isWinningCell
                    ? 0.55
                    : 1,
                position: "relative",
              }}
            >
              {cell && (
                <span
                  style={{
                    display: "inline-block",
                    animation: "pop 0.2s ease",
                  }}
                >
                  {cell}
                </span>
              )}
              {isLastMove && !isWinningCell && cell && (
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: cellColor,
                    opacity: 0.75,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Post-game actions */}
      {isCompleted && (
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            disabled={submitting}
            onClick={onRematch}
            style={{
              flex: "1 1 160px",
              maxWidth: 220,
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              padding: "11px 16px",
              fontSize: 13.5,
              fontWeight: 700,
              cursor: submitting ? "wait" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              boxShadow: "0 4px 12px rgba(232,98,44,0.28)",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            <RotateCcw size={15} />
            {isPassAndPlay ? "Play Again" : "Send Rematch"}
          </button>
          <button
            type="button"
            onClick={onBack}
            style={{
              flex: "0 1 auto",
              background: "var(--bg-subtle)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
              borderRadius: 12,
              padding: "11px 16px",
              fontSize: 13.5,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Back to Games
          </button>
        </div>
      )}
    </div>
  );
}
