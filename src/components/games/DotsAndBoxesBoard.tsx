"use client";

import React, { useState } from "react";
import { RotateCcw, Sparkles, Trophy, Users } from "lucide-react";
import { CARD_SHADOW } from "@/lib/constants";
import {
  boxIndex,
  createInitialDotsAndBoxesState,
  hEdgeIndex,
  isDotsAndBoxesState,
  vEdgeIndex,
  type DotsAndBoxesMove,
} from "@/lib/games/dotsAndBoxes";
import { useMembers } from "@/components/MembersContext";
import { AvatarDot } from "@/components/ui/Primitives";
import type { FamilyGame, MemberId } from "@/types/family";

export function DotsAndBoxesBoard({
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
  onMakeMove: (move: DotsAndBoxesMove) => void;
  onRematch: () => void;
  onBack: () => void;
}) {
  const { memberById } = useMembers();
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const state = isDotsAndBoxesState(game.state)
    ? game.state
    : createInitialDotsAndBoxesState(game.players);

  const [player1Id, player2Id] = game.players;
  const player1 = memberById(player1Id);
  const player2 = memberById(player2Id);
  const p1Score = state.scores[player1Id] ?? 0;
  const p2Score = state.scores[player2Id] ?? 0;
  const totalBoxes = state.rows * state.cols;
  const boxesLeft = Math.max(0, totalBoxes - (p1Score + p2Score));

  const isPassAndPlay = game.mode === "pass_and_play";
  const isParticipant = game.players.includes(currentUser);
  const isActive = game.status === "active";
  const isCompleted = game.status === "completed";
  const canMoveNow =
    isActive &&
    !submitting &&
    isParticipant &&
    (isPassAndPlay || game.currentTurnId === currentUser);

  const effectiveHoveredKey = canMoveNow ? hoveredKey : null;
  const lastClaimedBoxes = Array.isArray(state.lastMove?.claimedBoxes)
    ? state.lastMove.claimedBoxes
    : [];

  const activeTurnMember = game.currentTurnId
    ? memberById(game.currentTurnId)
    : null;
  const activeColor = activeTurnMember?.color || "var(--accent)";
  const winnerMember = game.winnerId ? memberById(game.winnerId) : null;

  let statusBannerText = "";
  let statusBannerTone: "turn" | "wait" | "win" | "draw" = "wait";

  if (isCompleted) {
    if (game.outcome === "draw") {
      statusBannerText = `It's a draw (${p1Score}–${p2Score})! Great match.`;
      statusBannerTone = "draw";
    } else if (game.outcome === "forfeit" && winnerMember) {
      statusBannerText =
        winnerMember.id === currentUser && !isPassAndPlay
          ? "You won by forfeit!"
          : `${winnerMember.name} won by forfeit`;
      statusBannerTone = "win";
    } else if (winnerMember) {
      const winScore = Math.max(p1Score, p2Score);
      const loseScore = Math.min(p1Score, p2Score);
      statusBannerText =
        winnerMember.id === currentUser && !isPassAndPlay
          ? `You win ${winScore}–${loseScore}! 🎉`
          : `${winnerMember.name} wins ${winScore}–${loseScore}! 🎉`;
      statusBannerTone = "win";
    }
  } else if (isActive && activeTurnMember) {
    const bonusClaimedCount =
      state.lastMove?.keptTurn && state.lastMove.by === activeTurnMember.id
        ? lastClaimedBoxes.length
        : 0;
    const boxWord = bonusClaimedCount === 1 ? "box" : "boxes";

    if (isPassAndPlay) {
      statusBannerText =
        bonusClaimedCount > 0
          ? `${activeTurnMember.name} claimed ${bonusClaimedCount} ${boxWord} — bonus turn!`
          : `${activeTurnMember.name}'s turn — draw a line`;
      statusBannerTone = "turn";
    } else if (game.currentTurnId === currentUser) {
      statusBannerText =
        bonusClaimedCount > 0
          ? `Nice! Claimed ${bonusClaimedCount} ${boxWord} — your turn again!`
          : "Your turn — draw a line";
      statusBannerTone = "turn";
    } else {
      statusBannerText =
        bonusClaimedCount > 0
          ? `${activeTurnMember.name} claimed ${bonusClaimedCount} ${boxWord} — bonus turn…`
          : `Waiting for ${activeTurnMember.name}…`;
      statusBannerTone = "wait";
    }
  } else if (game.status === "pending") {
    statusBannerText =
      game.opponentId === currentUser
        ? "Accept the challenge above to start playing"
        : `Waiting for ${memberById(game.opponentId).name} to accept…`;
  }

  const gridCount = state.rows * 2 + 1;
  const dotSize = state.rows === 5 ? 10 : state.rows === 4 ? 12 : 14;
  const lineThickness = state.rows === 5 ? 5 : 6;
  const avatarSize = state.rows === 5 ? 24 : state.rows === 4 ? 32 : 40;
  const boardMaxWidth = state.rows === 3 ? 332 : state.rows === 4 ? 364 : 384;

  const trackTemplate = Array.from({ length: gridCount }, (_, i) =>
    i % 2 === 0 ? `${dotSize}px` : "minmax(0, 1fr)"
  ).join(" ");

  const gridCells: React.ReactNode[] = [];
  for (let gr = 0; gr < gridCount; gr += 1) {
    for (let gc = 0; gc < gridCount; gc += 1) {
      const isEvenRow = gr % 2 === 0;
      const isEvenCol = gc % 2 === 0;

      if (isEvenRow && isEvenCol) {
        gridCells.push(
          <div
            key={`dot-${gr}-${gc}`}
            aria-hidden="true"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              zIndex: 3,
              pointerEvents: "none",
            }}
          >
            <span
              style={{
                width: dotSize,
                height: dotSize,
                borderRadius: "50%",
                background: "var(--text-primary)",
                opacity: 0.82,
                boxShadow: "0 1px 2px rgba(0, 0, 0, 0.14)",
              }}
            />
          </div>
        );
        continue;
      }

      if (isEvenRow && !isEvenCol) {
        const edgeRow = gr / 2;
        const edgeCol = (gc - 1) / 2;
        const edgeIdx = hEdgeIndex(state.cols, edgeRow, edgeCol);
        const ownerId = state.horizontalEdges[edgeIdx];
        const owner = ownerId ? memberById(ownerId) : null;
        const edgeKey = `h:${edgeRow}:${edgeCol}`;
        const isLastEdge =
          state.lastMove?.orientation === "h" &&
          state.lastMove.row === edgeRow &&
          state.lastMove.col === edgeCol;
        const isHovered = effectiveHoveredKey === edgeKey;
        const playable = canMoveNow && ownerId === null;

        gridCells.push(
          <div
            key={edgeKey}
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {owner ? (
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: -2,
                  right: -2,
                  height: isLastEdge ? lineThickness + 1 : lineThickness,
                  borderRadius: 999,
                  background: owner.color,
                  boxShadow: isLastEdge
                    ? `0 0 0 2.5px ${owner.color}40, 0 2px 6px ${owner.color}55`
                    : "none",
                  pointerEvents: "none",
                  zIndex: 1,
                  transition: "background-color 0.15s ease",
                }}
              />
            ) : isHovered && playable ? (
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: -2,
                  right: -2,
                  height: lineThickness,
                  borderRadius: 999,
                  background: activeColor,
                  opacity: 0.55,
                  pointerEvents: "none",
                  zIndex: 1,
                }}
              />
            ) : (
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: 2,
                  right: 2,
                  height: 0,
                  borderTop: "2px dashed var(--border-muted)",
                  opacity: playable ? 0.72 : 0.36,
                  pointerEvents: "none",
                  zIndex: 1,
                }}
              />
            )}

            <button
              type="button"
              disabled={!playable}
              onClick={() => {
                if (!playable) return;
                setHoveredKey(null);
                onMakeMove({ orientation: "h", row: edgeRow, col: edgeCol });
              }}
              onPointerEnter={(e) => {
                if (playable && e.pointerType === "mouse") {
                  setHoveredKey(edgeKey);
                }
              }}
              onPointerLeave={() => {
                setHoveredKey((prev) => (prev === edgeKey ? null : prev));
              }}
              onFocus={() => {
                if (playable) setHoveredKey(edgeKey);
              }}
              onBlur={() => {
                setHoveredKey((prev) => (prev === edgeKey ? null : prev));
              }}
              aria-label={`Horizontal line row ${edgeRow + 1}, column ${edgeCol + 1}: ${
                owner ? `claimed by ${owner.name}` : "open"
              }`}
              style={{
                position: "absolute",
                top: -9,
                bottom: -9,
                left: 4,
                right: 4,
                background: "transparent",
                border: "none",
                padding: 0,
                margin: 0,
                cursor: playable ? "pointer" : "default",
                zIndex: 2,
                borderRadius: 8,
              }}
            />
          </div>
        );
        continue;
      }

      if (!isEvenRow && isEvenCol) {
        const edgeRow = (gr - 1) / 2;
        const edgeCol = gc / 2;
        const edgeIdx = vEdgeIndex(state.cols, edgeRow, edgeCol);
        const ownerId = state.verticalEdges[edgeIdx];
        const owner = ownerId ? memberById(ownerId) : null;
        const edgeKey = `v:${edgeRow}:${edgeCol}`;
        const isLastEdge =
          state.lastMove?.orientation === "v" &&
          state.lastMove.row === edgeRow &&
          state.lastMove.col === edgeCol;
        const isHovered = effectiveHoveredKey === edgeKey;
        const playable = canMoveNow && ownerId === null;

        gridCells.push(
          <div
            key={edgeKey}
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {owner ? (
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: -2,
                  bottom: -2,
                  width: isLastEdge ? lineThickness + 1 : lineThickness,
                  borderRadius: 999,
                  background: owner.color,
                  boxShadow: isLastEdge
                    ? `0 0 0 2.5px ${owner.color}40, 0 2px 6px ${owner.color}55`
                    : "none",
                  pointerEvents: "none",
                  zIndex: 1,
                  transition: "background-color 0.15s ease",
                }}
              />
            ) : isHovered && playable ? (
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: -2,
                  bottom: -2,
                  width: lineThickness,
                  borderRadius: 999,
                  background: activeColor,
                  opacity: 0.55,
                  pointerEvents: "none",
                  zIndex: 1,
                }}
              />
            ) : (
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: 2,
                  bottom: 2,
                  width: 0,
                  borderLeft: "2px dashed var(--border-muted)",
                  opacity: playable ? 0.72 : 0.36,
                  pointerEvents: "none",
                  zIndex: 1,
                }}
              />
            )}

            <button
              type="button"
              disabled={!playable}
              onClick={() => {
                if (!playable) return;
                setHoveredKey(null);
                onMakeMove({ orientation: "v", row: edgeRow, col: edgeCol });
              }}
              onPointerEnter={(e) => {
                if (playable && e.pointerType === "mouse") {
                  setHoveredKey(edgeKey);
                }
              }}
              onPointerLeave={() => {
                setHoveredKey((prev) => (prev === edgeKey ? null : prev));
              }}
              onFocus={() => {
                if (playable) setHoveredKey(edgeKey);
              }}
              onBlur={() => {
                setHoveredKey((prev) => (prev === edgeKey ? null : prev));
              }}
              aria-label={`Vertical line row ${edgeRow + 1}, column ${edgeCol + 1}: ${
                owner ? `claimed by ${owner.name}` : "open"
              }`}
              style={{
                position: "absolute",
                left: -9,
                right: -9,
                top: 4,
                bottom: 4,
                background: "transparent",
                border: "none",
                padding: 0,
                margin: 0,
                cursor: playable ? "pointer" : "default",
                zIndex: 2,
                borderRadius: 8,
              }}
            />
          </div>
        );
        continue;
      }

      const bRow = (gr - 1) / 2;
      const bCol = (gc - 1) / 2;
      const bIdx = boxIndex(state.cols, bRow, bCol);
      const ownerId = state.boxes[bIdx];
      const owner = ownerId ? memberById(ownerId) : null;
      const isNewlyClaimed = Boolean(
        ownerId && lastClaimedBoxes.includes(bIdx)
      );

      gridCells.push(
        <div
          key={`box-${bRow}-${bCol}`}
          role="gridcell"
          aria-label={`Box row ${bRow + 1}, column ${bCol + 1}: ${
            owner ? `claimed by ${owner.name}` : "unclaimed"
          }`}
          style={{
            margin: state.rows === 5 ? 3 : 4,
            borderRadius: state.rows === 5 ? 8 : 10,
            background: owner ? `${owner.color}20` : "transparent",
            border: owner
              ? `1.5px solid ${owner.color}4D`
              : "1.5px solid transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background-color 0.2s ease, border-color 0.2s ease",
            minWidth: 0,
            minHeight: 0,
          }}
        >
          {ownerId && (
            <div
              style={{
                animation: isNewlyClaimed ? "pop 0.28s ease" : undefined,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AvatarDot id={ownerId} size={avatarSize} />
            </div>
          )}
        </div>
      );
    }
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
          { member: player1, score: p1Score, orderLabel: "1st up" },
          { member: player2, score: p2Score, orderLabel: "2nd up" },
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
                    whiteSpace: "nowrap",
                  }}
                >
                  {slot.orderLabel}
                </div>
              </div>
              <span
                aria-label={`${slot.score} ${slot.score === 1 ? "box" : "boxes"}`}
                style={{
                  minWidth: 28,
                  height: 28,
                  padding: "0 6px",
                  borderRadius: 9,
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
                {slot.score}
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
            marginBottom: 12,
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

      {/* Board Meta */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          marginBottom: 10,
          fontSize: 11.5,
          fontWeight: 600,
          color: "var(--text-muted)",
        }}
      >
        <span>
          {state.rows}×{state.cols} grid
        </span>
        <span>·</span>
        <span>
          {boxesLeft === 0
            ? `All ${totalBoxes} boxes claimed`
            : `${boxesLeft} ${boxesLeft === 1 ? "box" : "boxes"} left`}
        </span>
      </div>

      {/* Dots & Boxes Interactive Grid */}
      <div
        style={{
          maxWidth: boardMaxWidth,
          margin: "0 auto 18px",
          padding: state.rows === 5 ? 14 : 16,
          borderRadius: 22,
          background: "var(--bg-subtle)",
          border: "1px solid var(--border-subtle)",
          boxShadow: CARD_SHADOW,
        }}
      >
        <div
          role="grid"
          aria-label={`Dots and Boxes ${state.rows} by ${state.cols} board`}
          style={{
            display: "grid",
            gridTemplateColumns: trackTemplate,
            gridTemplateRows: trackTemplate,
            width: "100%",
            aspectRatio: "1 / 1",
            userSelect: "none",
            touchAction: "manipulation",
          }}
        >
          {gridCells}
        </div>
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
          {isParticipant && (
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
          )}
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
