"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  Clock,
  Eraser,
  Eye,
  EyeOff,
  Flag,
  Lock,
  Pencil,
  RotateCcw,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import {
  createInitialSudokuState,
  formatSudokuSettings,
  isSudokuState,
  SUDOKU_WRONG_GUESS_LOCKOUT_MS,
  type SudokuMove,
  type SudokuState,
} from "@/lib/games/sudoku";
import { useMembers } from "@/components/MembersContext";
import { AvatarDot } from "@/components/ui/Primitives";
import type { FamilyGame, MemberId } from "@/types/family";

export interface SudokuMoveResult {
  ok: boolean;
  error?: string;
}

function formatCountdown(ms: number): string {
  const clamped = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function sameUnit(a: number, b: number): boolean {
  const ar = Math.floor(a / 9);
  const ac = a % 9;
  const br = Math.floor(b / 9);
  const bc = b % 9;
  if (ar === br || ac === bc) return true;
  return (
    Math.floor(ar / 3) === Math.floor(br / 3) &&
    Math.floor(ac / 3) === Math.floor(bc / 3)
  );
}

export function SudokuBoard({
  game,
  currentUser,
  submitting = false,
  serverClockOffsetMs = 0,
  onMakeMove,
  onSyncNow,
  onRespondInvite,
  onForfeit,
  onRematch,
  onBack,
}: {
  game: FamilyGame;
  currentUser: MemberId;
  submitting?: boolean;
  serverClockOffsetMs?: number;
  onMakeMove: (move: SudokuMove) => Promise<SudokuMoveResult | void>;
  onSyncNow?: () => void;
  onRespondInvite: (decision: "accept" | "decline" | "cancel") => void;
  onForfeit: () => void;
  onRematch: () => void;
  onBack: () => void;
}) {
  const { memberById } = useMembers();

  const state: SudokuState = useMemo(
    () =>
      isSudokuState(game.state)
        ? game.state
        : createInitialSudokuState(game.players),
    [game.state, game.players]
  );

  const [player1Id, player2Id] = game.players;
  const player1 = memberById(player1Id);
  const player2 = memberById(player2Id);

  const isParticipant = game.players.includes(currentUser);
  const isActive = game.status === "active";
  const isPending = game.status === "pending";
  const isPendingForMe = isPending && game.opponentId === currentUser;
  const isPendingByMe = isPending && game.challengerId === currentUser;
  const isClosedInvite =
    game.status === "declined" || game.status === "cancelled";
  const isCompleted = game.status === "completed";
  const isShared = state.boardMode === "shared";

  const [selectedCell, setSelectedCell] = useState<number | null>(null);
  const [notesMode, setNotesMode] = useState(false);
  const [notes, setNotes] = useState<Record<number, number[]>>({});
  const [pendingEntry, setPendingEntry] = useState<{
    cell: number;
    value: number;
  } | null>(null);
  const [wrongFlash, setWrongFlash] = useState<{
    cell: number;
    value: number;
  } | null>(null);
  const [popCells, setPopCells] = useState<number[]>([]);
  const [inlineNotice, setInlineNotice] = useState<string | null>(null);
  const [showSolution, setShowSolution] = useState(
    () => isCompleted && !isParticipant && !isShared
  );
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const lastAttemptRef = useRef<{ cell: number; value: number } | null>(null);
  const lastEventAtRef = useRef<string | null>(state.lastEvent?.at || null);
  const prevClaimsRef = useRef<(MemberId | null)[]>(state.claims);
  const syncedTimeoutRef = useRef(false);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = useCallback((msg: string) => {
    setInlineNotice(msg);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setInlineNotice(null), 2400);
  }, []);

  // Clean up local timers on unmount
  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      if (popTimerRef.current) clearTimeout(popTimerRef.current);
    };
  }, []);

  // Reset forfeit confirmation if game is no longer active
  useEffect(() => {
    if (!isActive) setConfirmForfeit(false);
  }, [isActive]);

  // Estimate server clock using the synced offset so timers & lockouts match the server
  const estimatedServerNowMs = nowMs + serverClockOffsetMs;

  const myLockoutUntilMs =
    isShared && state.lockouts[currentUser]
      ? Date.parse(state.lockouts[currentUser]!)
      : 0;
  const lockoutRemainingMs =
    isActive && myLockoutUntilMs > estimatedServerNowMs
      ? myLockoutUntilMs - estimatedServerNowMs
      : 0;
  const isLockedOut = lockoutRemainingMs > 0;

  // Tick faster (100ms) while locked out for a smooth, accurate 3.0s unlock
  useEffect(() => {
    if (!isActive) return;
    setNowMs(Date.now());
    const intervalMs = isLockedOut ? 100 : 250;
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [isActive, isLockedOut]);

  const endsAtMs = state.endsAt ? Date.parse(state.endsAt) : null;
  const remainingMs = isPending
    ? state.timeLimitMinutes * 60_000
    : endsAtMs !== null
      ? Math.max(0, endsAtMs - estimatedServerNowMs)
      : 0;

  // Trigger an immediate server poll once the countdown reaches 0
  useEffect(() => {
    if (!isActive || endsAtMs === null) {
      syncedTimeoutRef.current = false;
      return;
    }
    if (remainingMs <= 0 && !syncedTimeoutRef.current) {
      syncedTimeoutRef.current = true;
      onSyncNow?.();
    }
  }, [isActive, endsAtMs, remainingMs, onSyncNow]);

  // React to wrong-guess feedback from the server
  useEffect(() => {
    const ev = state.lastEvent;
    if (!ev || ev.at === lastEventAtRef.current) return;
    lastEventAtRef.current = ev.at;

    if (ev.result === "wrong" && ev.by === currentUser) {
      setNowMs(Date.now());
      const attempted =
        lastAttemptRef.current && lastAttemptRef.current.cell === ev.cell
          ? lastAttemptRef.current.value
          : 0;
      setWrongFlash({ cell: ev.cell, value: attempted });
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setWrongFlash(null), 650);
    }
  }, [state.lastEvent, currentUser]);

  // Detect all newly claimed cells (even if multiple arrive in one poll) for pop & note cleanup
  useEffect(() => {
    if (!isShared) {
      prevClaimsRef.current = state.claims;
      return;
    }
    const prev = prevClaimsRef.current;
    const newlyClaimed: number[] = [];
    for (let i = 0; i < 81; i += 1) {
      if (!prev[i] && state.claims[i]) newlyClaimed.push(i);
    }
    prevClaimsRef.current = state.claims;
    if (newlyClaimed.length === 0) return;

    setPopCells(newlyClaimed);
    if (popTimerRef.current) clearTimeout(popTimerRef.current);
    popTimerRef.current = setTimeout(() => setPopCells([]), 420);

    setNotes((cur) => {
      if (Object.keys(cur).length === 0) return cur;
      let next = cur;
      for (const cell of newlyClaimed) {
        const placedVal = state.sharedValues[cell];
        const updated: Record<number, number[]> = {};
        for (const [k, arr] of Object.entries(next)) {
          const idx = Number(k);
          if (idx === cell) continue;
          if (placedVal && sameUnit(idx, cell)) {
            const filtered = arr.filter((d) => d !== placedVal);
            if (filtered.length > 0) updated[idx] = filtered;
          } else {
            updated[idx] = arr;
          }
        }
        next = updated;
      }
      return next;
    });
  }, [isShared, state.claims, state.sharedValues]);

  // Current displayed values for the 81 cells
  const mySeparateBoard = state.boards[currentUser];
  const displayValues = useMemo(() => {
    const out = new Array<number>(81).fill(0);
    for (let i = 0; i < 81; i += 1) {
      if (state.puzzle[i]) {
        out[i] = state.puzzle[i];
      } else if (isCompleted && showSolution && state.solution?.[i]) {
        out[i] = state.solution[i];
      } else if (isShared) {
        out[i] = state.sharedValues[i] || 0;
      } else {
        out[i] = mySeparateBoard?.[i] || 0;
      }
    }
    if (pendingEntry && !state.puzzle[pendingEntry.cell]) {
      const canOverlay = isShared ? !state.claims[pendingEntry.cell] : true;
      if (canOverlay) {
        out[pendingEntry.cell] = pendingEntry.value;
      }
    }
    return out;
  }, [
    state.puzzle,
    state.solution,
    state.sharedValues,
    state.claims,
    mySeparateBoard,
    isShared,
    isCompleted,
    showSolution,
    pendingEntry,
  ]);

  // Count how many times each digit 1..9 appears on the current board
  const digitCounts = useMemo(() => {
    const counts = new Array<number>(10).fill(0);
    for (let i = 0; i < 81; i += 1) {
      const v = displayValues[i];
      if (v >= 1 && v <= 9) counts[v] += 1;
    }
    return counts;
  }, [displayValues]);

  const canInteract =
    isActive && isParticipant && remainingMs > 0 && !pendingEntry;

  const toggleNote = useCallback((cell: number, digit: number) => {
    setNotes((prev) => {
      const existing = prev[cell] || [];
      const nextArr = existing.includes(digit)
        ? existing.filter((d) => d !== digit)
        : [...existing, digit].sort((a, b) => a - b);
      const next = { ...prev };
      if (nextArr.length === 0) delete next[cell];
      else next[cell] = nextArr;
      return next;
    });
  }, []);

  const submitDigit = useCallback(
    async (digit: number) => {
      if (selectedCell === null) {
        showNotice("Tap an empty cell first");
        return;
      }
      if (!isActive || !isParticipant || remainingMs <= 0) return;
      if (state.puzzle[selectedCell] !== 0) return;
      if (isShared && state.claims[selectedCell]) return;

      if (notesMode) {
        if (digit >= 1 && digit <= 9) {
          if (!isShared && (mySeparateBoard?.[selectedCell] || 0) !== 0) {
            return;
          }
          toggleNote(selectedCell, digit);
        }
        return;
      }

      if (isShared) {
        if (digit < 1 || digit > 9) return;
        if (isLockedOut) {
          showNotice("Locked out — wait a moment!");
          return;
        }
        if (pendingEntry) return;
        lastAttemptRef.current = { cell: selectedCell, value: digit };
        setPendingEntry({ cell: selectedCell, value: digit });
        try {
          const res = await onMakeMove({
            kind: "guess",
            cell: selectedCell,
            value: digit,
          });
          if (res && !res.ok && res.error) {
            showNotice(res.error);
          }
        } finally {
          setPendingEntry(null);
        }
        return;
      }

      // Separate boards mode: set (1..9) or clear (0)
      const currentVal = mySeparateBoard?.[selectedCell] || 0;
      if (currentVal === digit) return;
      if (pendingEntry) return;

      setNotes((prev) => {
        const next: Record<number, number[]> = {};
        for (const [k, arr] of Object.entries(prev)) {
          const idx = Number(k);
          if (idx === selectedCell) continue;
          if (digit >= 1 && digit <= 9 && sameUnit(idx, selectedCell)) {
            const filtered = arr.filter((d) => d !== digit);
            if (filtered.length > 0) next[idx] = filtered;
          } else {
            next[idx] = arr;
          }
        }
        return next;
      });

      setPendingEntry({ cell: selectedCell, value: digit });
      try {
        const res = await onMakeMove({
          kind: "set",
          cell: selectedCell,
          value: digit,
        });
        if (res && !res.ok && res.error) {
          showNotice(res.error);
        }
      } finally {
        setPendingEntry(null);
      }
    },
    [
      selectedCell,
      isActive,
      isParticipant,
      remainingMs,
      state.puzzle,
      state.claims,
      isShared,
      notesMode,
      mySeparateBoard,
      toggleNote,
      isLockedOut,
      pendingEntry,
      onMakeMove,
      showNotice,
    ]
  );

  const handleErase = useCallback(() => {
    if (selectedCell === null || !isActive || !isParticipant) return;
    if (state.puzzle[selectedCell] !== 0) return;
    if (isShared) {
      setNotes((prev) => {
        if (!prev[selectedCell]) return prev;
        const next = { ...prev };
        delete next[selectedCell];
        return next;
      });
      return;
    }
    if ((mySeparateBoard?.[selectedCell] || 0) !== 0) {
      void submitDigit(0);
    } else if (notes[selectedCell]) {
      setNotes((prev) => {
        const next = { ...prev };
        delete next[selectedCell];
        return next;
      });
    }
  }, [
    selectedCell,
    isActive,
    isParticipant,
    state.puzzle,
    isShared,
    mySeparateBoard,
    notes,
    submitDigit,
  ]);

  // Keyboard support: arrows, 1-9, Backspace/Delete, N for notes
  useEffect(() => {
    if (!isActive || !isParticipant) return;
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        void submitDigit(Number(e.key));
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
        e.preventDefault();
        handleErase();
        return;
      }
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setNotesMode((v) => !v);
        return;
      }
      if (
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight"
      ) {
        e.preventDefault();
        setSelectedCell((cur) => {
          if (cur === null) return 40;
          let r = Math.floor(cur / 9);
          let c = cur % 9;
          if (e.key === "ArrowUp") r = (r + 8) % 9;
          if (e.key === "ArrowDown") r = (r + 1) % 9;
          if (e.key === "ArrowLeft") c = (c + 8) % 9;
          if (e.key === "ArrowRight") c = (c + 1) % 9;
          return r * 9 + c;
        });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isActive, isParticipant, submitDigit, handleErase]);

  const selectedValue =
    selectedCell !== null ? displayValues[selectedCell] : 0;

  const totalEmpty = Math.max(1, state.emptyCount || 1);
  const completedCorrectCount = (pid: MemberId): number => {
    if (state.finalCorrect) return state.finalCorrect[pid] ?? 0;
    if (isShared) return state.scores[pid] ?? 0;
    const sol = state.solution;
    const board = state.boards[pid];
    if (sol && board) {
      let n = 0;
      for (let i = 0; i < 81; i += 1) {
        if (board[i] && board[i] === sol[i]) n += 1;
      }
      return n;
    }
    return state.filled[pid] ?? 0;
  };
  const p1Primary = isCompleted
    ? completedCorrectCount(player1Id)
    : isShared
      ? state.scores[player1Id] ?? 0
      : state.filled[player1Id] ?? 0;
  const p2Primary = isCompleted
    ? completedCorrectCount(player2Id)
    : isShared
      ? state.scores[player2Id] ?? 0
      : state.filled[player2Id] ?? 0;

  const winnerMember = game.winnerId ? memberById(game.winnerId) : null;
  const myFullButWrong = !isShared ? state.fullButWrong?.[currentUser] || 0 : 0;
  const isUrgent = isActive && remainingMs > 0 && remainingMs <= 30_000;

  let completionHeadline = "";
  let completionSub = "";
  if (isCompleted) {
    if (game.outcome === "draw") {
      completionHeadline = `Tie (${p1Primary}–${p2Primary})`;
      completionSub = state.timedOut
        ? "Time ran out dead even."
        : "Every square solved in a tie.";
    } else if (game.outcome === "forfeit" && winnerMember) {
      completionHeadline =
        winnerMember.id === currentUser
          ? "You won by forfeit!"
          : `${winnerMember.name} won by forfeit`;
    } else if (winnerMember) {
      const iWon = winnerMember.id === currentUser;
      completionHeadline = iWon
        ? "You win! 🎉"
        : `${winnerMember.name} wins! 🎉`;
      if (state.timedOut) {
        completionSub = `Time's up · ${player1.name} ${p1Primary}–${p2Primary} ${player2.name}`;
      } else if (isShared) {
        completionSub = `${player1.name} ${p1Primary}–${p2Primary} ${player2.name}`;
      } else {
        completionSub = iWon
          ? "Solved first!"
          : `${winnerMember.name} solved first!`;
      }
    }
  }

  const canErase =
    selectedCell !== null &&
    state.puzzle[selectedCell] === 0 &&
    (isShared
      ? !state.claims[selectedCell] && Boolean(notes[selectedCell]?.length)
      : (mySeparateBoard?.[selectedCell] || 0) !== 0 ||
        Boolean(notes[selectedCell]?.length));

  const showOverlay = isPending || isClosedInvite;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100dvh",
        zIndex: 120,
        background: "var(--bg-app)",
        color: "var(--text-primary)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        overscrollBehavior: "none",
      }}
    >
      {/* Compact Top Bar */}
      <div
        style={{
          flexShrink: 0,
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--border-subtle)",
          padding: "calc(8px + env(safe-area-inset-top)) 12px 8px",
        }}
      >
        <div
          style={{
            maxWidth: 560,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              minWidth: 0,
            }}
          >
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to Games"
              style={{
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-default)",
                borderRadius: 10,
                width: 34,
                height: 34,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-primary)",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <ChevronLeft size={18} />
            </button>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "'Baloo 2', sans-serif",
                  fontSize: 16,
                  fontWeight: 800,
                  lineHeight: 1.1,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                🔢 Versus Sudoku
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {formatSudokuSettings(state)}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexShrink: 0,
            }}
          >
            {/* Countdown Clock */}
            <div
              aria-live="off"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 10px",
                borderRadius: 999,
                background: isUrgent
                  ? "var(--danger-soft)"
                  : isActive
                    ? "var(--accent-soft)"
                    : "var(--bg-subtle)",
                border: `1.5px solid ${
                  isUrgent
                    ? "var(--danger)"
                    : isActive
                      ? "var(--accent-border)"
                      : "var(--border-default)"
                }`,
                color: isUrgent
                  ? "var(--danger)"
                  : isActive
                    ? "var(--accent-ink)"
                    : "var(--text-muted)",
                fontFamily: "'Baloo 2', sans-serif",
                fontSize: 15,
                fontWeight: 800,
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1.1,
              }}
            >
              <Clock size={13} strokeWidth={2.5} />
              <span>
                {isCompleted
                  ? state.timedOut
                    ? "0:00"
                    : "Done"
                  : formatCountdown(remainingMs)}
              </span>
            </div>

            {isActive && isParticipant && (
              confirmForfeit ? (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={onForfeit}
                    style={{
                      background: "var(--danger)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 9,
                      padding: "6px 9px",
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Forfeit
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmForfeit(false)}
                    aria-label="Cancel forfeit"
                    style={{
                      background: "var(--bg-subtle)",
                      color: "var(--text-secondary)",
                      border: "1px solid var(--border-default)",
                      borderRadius: 9,
                      width: 28,
                      height: 28,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmForfeit(true)}
                  aria-label="Forfeit match"
                  title="Forfeit match"
                  style={{
                    background: "var(--bg-subtle)",
                    border: "1px solid var(--border-default)",
                    borderRadius: 10,
                    width: 32,
                    height: 32,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                  }}
                >
                  <Flag size={13} />
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* Main Centered Zero-Scroll Column */}
      <div
        style={{
          flex: "1 1 0",
          minHeight: 0,
          width: "100%",
          maxWidth: 560,
          margin: "0 auto",
          padding:
            "8px 12px max(10px, env(safe-area-inset-bottom))",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          overflow: "hidden",
        }}
      >
        {/* Compact Player Score / Progress Strip */}
        <div
          style={{
            flexShrink: 0,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
          }}
        >
          {[
            { member: player1, count: p1Primary, id: player1Id },
            { member: player2, count: p2Primary, id: player2Id },
          ].map(({ member, count, id }) => {
            const isMe = id === currentUser;
            const pct = Math.min(100, Math.round((count / totalEmpty) * 100));
            const misses = state.misses?.[id] ?? 0;
            const playerLocked =
              isActive &&
              isShared &&
              state.lockouts?.[id] &&
              Date.parse(state.lockouts[id]!) > estimatedServerNowMs;
            const isWinner = isCompleted && game.winnerId === id;

            return (
              <div
                key={id}
                style={{
                  background: isWinner
                    ? "var(--success-soft)"
                    : "var(--bg-surface)",
                  border: `1.5px solid ${
                    isWinner
                      ? "var(--success-border)"
                      : isMe
                        ? "var(--border-strong)"
                        : "var(--border-subtle)"
                  }`,
                  borderRadius: 12,
                  padding: "6px 9px",
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      minWidth: 0,
                    }}
                  >
                    <AvatarDot id={member.id} size={22} />
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: "var(--text-primary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {member.name}
                        {isMe ? " (you)" : ""}
                      </div>
                      <div
                        style={{
                          fontSize: 10.5,
                          color: playerLocked
                            ? "var(--danger)"
                            : "var(--text-muted)",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          lineHeight: 1.15,
                        }}
                      >
                        {playerLocked ? (
                          <>
                            <Lock size={9} /> Locked…
                          </>
                        ) : isShared ? (
                          <>
                            <span
                              style={{
                                width: 7,
                                height: 7,
                                borderRadius: "50%",
                                background: member.color,
                                display: "inline-block",
                              }}
                            />
                            {misses > 0
                              ? `${misses} miss${misses === 1 ? "" : "es"}`
                              : "Racing"}
                          </>
                        ) : isCompleted ? (
                          `${count}/${totalEmpty} right`
                        ) : (
                          `${count}/${totalEmpty}`
                        )}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      fontFamily: "'Baloo 2', sans-serif",
                      fontSize: 20,
                      fontWeight: 800,
                      color: isShared ? member.color : "var(--text-primary)",
                      fontVariantNumeric: "tabular-nums",
                      lineHeight: 1,
                      flexShrink: 0,
                    }}
                  >
                    {isShared ? count : `${pct}%`}
                  </div>
                </div>

                {!isShared && (
                  <div
                    style={{
                      marginTop: 5,
                      height: 4,
                      borderRadius: 999,
                      background: "var(--bg-muted)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        borderRadius: 999,
                        background: member.color,
                        transition: "width 0.25s ease",
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Auto-fitting Flexible Stage for the 9x9 Grid */}
        <div
          style={{
            flex: "1 1 0",
            minHeight: 0,
            width: "100%",
            position: "relative",
            containerType: "size",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              position: "relative",
              width: "min(100cqw, 100cqh, 520px)",
              height: "min(100cqw, 100cqh, 520px)",
              maxWidth: "100%",
              maxHeight: "100%",
              aspectRatio: "1 / 1",
              containerType: "inline-size",
            }}
          >
            <div
              role="grid"
              aria-label="9 by 9 Sudoku board"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(9, minmax(0, 1fr))",
                gridTemplateRows: "repeat(9, minmax(0, 1fr))",
                width: "100%",
                height: "100%",
                border: "2.5px solid var(--text-primary)",
                borderRadius: 12,
                overflow: "hidden",
                background: "var(--bg-surface)",
                userSelect: "none",
                opacity: showOverlay ? 0.38 : 1,
                boxShadow: "var(--card-shadow)",
              }}
            >
              {Array.from({ length: 81 }, (_, idx) => {
                const row = Math.floor(idx / 9);
                const col = idx % 9;
                const isClue = state.puzzle[idx] !== 0;
                const claimerId = isShared ? state.claims[idx] : null;
                const claimer = claimerId ? memberById(claimerId) : null;
                const val = displayValues[idx];
                const isPendingCell = pendingEntry?.cell === idx;
                const isWrongFlashing = wrongFlash?.cell === idx;
                const isPopping = popCells.includes(idx);
                const isSelected = selectedCell === idx;
                const isPeer =
                  selectedCell !== null &&
                  selectedCell !== idx &&
                  sameUnit(selectedCell, idx);
                const isSameDigit =
                  selectedValue !== 0 && val === selectedValue && !isSelected;

                const isCompletedWrong =
                  isCompleted &&
                  !isShared &&
                  !showSolution &&
                  !isClue &&
                  val !== 0 &&
                  state.solution &&
                  val !== state.solution[idx];

                const isRevealedAnswer =
                  isCompleted &&
                  showSolution &&
                  !isClue &&
                  (isShared
                    ? !claimerId
                    : mySeparateBoard?.[idx] !== state.solution?.[idx]);

                let bg = "var(--bg-surface)";
                if (isClue) bg = "var(--bg-surface-warm)";
                if (isPeer) bg = "var(--bg-subtle)";
                if (claimer) bg = `${claimer.color}20`;
                if (isSameDigit) bg = "var(--highlight-bg)";
                if (isSelected) bg = "var(--accent-soft)";
                if (isCompletedWrong || isWrongFlashing) {
                  bg = "var(--danger-soft)";
                }

                let textColor = "var(--text-primary)";
                if (isWrongFlashing || isCompletedWrong) {
                  textColor = "var(--danger)";
                } else if (isRevealedAnswer) {
                  textColor = "var(--success)";
                } else if (claimer) {
                  textColor = claimer.color;
                } else if (!isClue) {
                  textColor = "var(--cat-blue)";
                }

                const borderRight =
                  col === 8
                    ? "none"
                    : col === 2 || col === 5
                      ? "2px solid var(--text-primary)"
                      : "1px solid var(--border-strong)";
                const borderBottom =
                  row === 8
                    ? "none"
                    : row === 2 || row === 5
                      ? "2px solid var(--text-primary)"
                      : "1px solid var(--border-strong)";

                const cellNotes = notes[idx];
                const shownDigit = isWrongFlashing
                  ? wrongFlash.value || val
                  : val;

                return (
                  <button
                    key={idx}
                    type="button"
                    role="gridcell"
                    aria-label={`Row ${row + 1} Column ${col + 1}${
                      val ? `, ${val}` : ", empty"
                    }`}
                    aria-selected={isSelected}
                    disabled={showOverlay}
                    onClick={() => setSelectedCell(idx)}
                    className={
                      isWrongFlashing
                        ? "sudoku-shake"
                        : isPopping
                          ? "sudoku-pop"
                          : undefined
                    }
                    style={{
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 0,
                      margin: 0,
                      border: "none",
                      borderRight,
                      borderBottom,
                      borderRadius: 0,
                      background: bg,
                      boxShadow: isSelected
                        ? "inset 0 0 0 2px var(--accent)"
                        : "none",
                      cursor: showOverlay ? "default" : "pointer",
                      fontFamily: "'Baloo 2', sans-serif",
                      fontSize: "clamp(13px, 5.8cqw, 25px)",
                      fontWeight: isClue ? 800 : 700,
                      color: textColor,
                      lineHeight: 1,
                      opacity: isPendingCell ? 0.55 : 1,
                      transition: "background-color 0.12s ease",
                    }}
                  >
                    {shownDigit ? (
                      <span>{shownDigit}</span>
                    ) : cellNotes && cellNotes.length > 0 ? (
                      <div
                        aria-hidden="true"
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(3, 1fr)",
                          gridTemplateRows: "repeat(3, 1fr)",
                          width: "92%",
                          height: "92%",
                          alignItems: "center",
                          justifyItems: "center",
                          fontFamily: "'Inter', sans-serif",
                          fontSize: "clamp(6.5px, 2.2cqw, 10px)",
                          fontWeight: 700,
                          color: "var(--text-muted)",
                          lineHeight: 1,
                        }}
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                          <span key={d}>
                            {cellNotes.includes(d) ? d : ""}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {claimer && !isSelected && (
                      <span
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          top: 2,
                          right: 2,
                          width: 4.5,
                          height: 4.5,
                          borderRadius: "50%",
                          background: claimer.color,
                          opacity: 0.75,
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Floating Pending / Declined / Cancelled Overlay */}
            {showOverlay && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 16,
                }}
              >
                <div
                  style={{
                    background: "var(--bg-surface)",
                    border: "1.5px solid var(--border-strong)",
                    borderRadius: 16,
                    padding: "16px 18px",
                    textAlign: "center",
                    boxShadow: "var(--menu-shadow)",
                    maxWidth: 290,
                    width: "100%",
                  }}
                >
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      background: "var(--accent-soft)",
                      color: "var(--accent)",
                      marginBottom: 8,
                    }}
                  >
                    <Zap size={18} />
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: "var(--text-primary)",
                    }}
                  >
                    {isPendingForMe
                      ? `${memberById(game.challengerId).name} invited you to play!`
                      : isPendingByMe
                        ? `Waiting for ${memberById(game.opponentId).name}…`
                        : game.status === "declined"
                          ? `${memberById(game.opponentId).name} declined`
                          : `${memberById(game.challengerId).name} cancelled`}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      marginTop: 4,
                      marginBottom: 14,
                      lineHeight: 1.35,
                    }}
                  >
                    {isPending
                      ? `The board unlocks and the ${state.timeLimitMinutes}-minute clock starts when accepted.`
                      : "Start a new challenge anytime from the Games lobby."}
                  </div>

                  {isPendingForMe ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => onRespondInvite("accept")}
                        style={{
                          flex: 1,
                          background: "var(--accent)",
                          color: "#fff",
                          border: "none",
                          borderRadius: 10,
                          padding: "9px 12px",
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: submitting ? "wait" : "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 4,
                        }}
                      >
                        <Check size={14} strokeWidth={2.8} /> Accept
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => onRespondInvite("decline")}
                        style={{
                          flex: 1,
                          background: "var(--bg-subtle)",
                          color: "var(--text-secondary)",
                          border: "1px solid var(--border-default)",
                          borderRadius: 10,
                          padding: "9px 12px",
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: submitting ? "wait" : "pointer",
                        }}
                      >
                        Decline
                      </button>
                    </div>
                  ) : isPendingByMe ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        onClick={onBack}
                        style={{
                          flex: 1,
                          background: "var(--bg-subtle)",
                          color: "var(--text-primary)",
                          border: "1px solid var(--border-default)",
                          borderRadius: 10,
                          padding: "8px 12px",
                          fontSize: 12.5,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        All Games
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => onRespondInvite("cancel")}
                        style={{
                          background: "none",
                          color: "var(--text-muted)",
                          border: "1px solid var(--border-default)",
                          borderRadius: 10,
                          padding: "8px 12px",
                          fontSize: 12.5,
                          fontWeight: 700,
                          cursor: submitting ? "wait" : "pointer",
                        }}
                      >
                        Cancel Invite
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={onBack}
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
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Dock: Active Keypad OR Completed Summary */}
        {isCompleted ? (
          <div
            style={{
              flexShrink: 0,
              background:
                game.outcome === "draw"
                  ? "var(--cat-ochre-soft)"
                  : "var(--success-soft)",
              border: `1px solid ${
                game.outcome === "draw"
                  ? "var(--border-strong)"
                  : "var(--success-border)"
              }`,
              borderRadius: 14,
              padding: "10px 12px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontFamily: "'Baloo 2', sans-serif",
                  fontSize: 17,
                  fontWeight: 800,
                  color:
                    game.outcome === "draw"
                      ? "var(--cat-ochre)"
                      : "var(--success-ink)",
                }}
              >
                <Trophy size={16} /> {completionHeadline}
              </span>
              {completionSub && (
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  · {completionSub}
                </span>
              )}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 7,
                flexWrap: "wrap",
              }}
            >
              {isParticipant && (
                <button
                  type="button"
                  onClick={onRematch}
                  style={{
                    background: "var(--accent)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    padding: "7px 13px",
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <RotateCcw size={13} /> Rematch
                </button>
              )}
              {state.solution && (
                <button
                  type="button"
                  onClick={() => setShowSolution((v) => !v)}
                  style={{
                    background: "var(--bg-surface)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-default)",
                    borderRadius: 10,
                    padding: "7px 11px",
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  {showSolution ? <EyeOff size={13} /> : <Eye size={13} />}
                  {showSolution ? "Hide Solution" : "Show Solution"}
                </button>
              )}
              <button
                type="button"
                onClick={onBack}
                style={{
                  background: "var(--bg-surface)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 10,
                  padding: "7px 11px",
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                All Games
              </button>
            </div>
          </div>
        ) : isActive && isParticipant ? (
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {/* Fixed-height Status / Lockout / Mismatch Slot (prevents board resize jump) */}
            <div
              style={{
                height: 26,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {isLockedOut ? (
                <div
                  role="status"
                  style={{
                    width: "100%",
                    background: "var(--danger-soft)",
                    border: "1px solid var(--danger-border)",
                    borderRadius: 9,
                    padding: "4px 10px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: "var(--danger-ink)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    <Lock size={11} /> Locked for{" "}
                    {(lockoutRemainingMs / 1000).toFixed(1)}s
                  </span>
                  <div
                    style={{
                      width: 76,
                      height: 5,
                      borderRadius: 999,
                      background: "var(--danger-border)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(
                          100,
                          (lockoutRemainingMs / SUDOKU_WRONG_GUESS_LOCKOUT_MS) *
                            100
                        )}%`,
                        height: "100%",
                        background: "var(--danger)",
                        transition: "width 0.09s linear",
                      }}
                    />
                  </div>
                </div>
              ) : myFullButWrong > 0 ? (
                <div
                  role="status"
                  style={{
                    width: "100%",
                    background: "var(--danger-soft)",
                    border: "1px solid var(--danger-border)",
                    color: "var(--danger-ink)",
                    borderRadius: 9,
                    padding: "4px 10px",
                    fontSize: 11.5,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <AlertCircle size={13} />
                  <span>
                    Not quite — {myFullButWrong}{" "}
                    {myFullButWrong === 1 ? "cell doesn't" : "cells don't"}{" "}
                    match yet.
                  </span>
                </div>
              ) : inlineNotice ? (
                <div
                  role="status"
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: "var(--accent-ink)",
                    background: "var(--accent-soft)",
                    padding: "3px 10px",
                    borderRadius: 999,
                  }}
                >
                  {inlineNotice}
                </div>
              ) : null}
            </div>

            {/* Notes & Erase Row */}
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                aria-pressed={notesMode}
                onClick={() => setNotesMode((v) => !v)}
                style={{
                  flex: 1,
                  padding: "7px 10px",
                  borderRadius: 10,
                  border: `1.5px solid ${
                    notesMode ? "var(--accent)" : "var(--border-default)"
                  }`,
                  background: notesMode
                    ? "var(--accent-soft)"
                    : "var(--bg-surface)",
                  color: notesMode
                    ? "var(--accent-ink)"
                    : "var(--text-secondary)",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                }}
              >
                <Pencil size={12} />
                <span>Notes {notesMode ? "On" : "Off"}</span>
              </button>

              <button
                type="button"
                onClick={handleErase}
                disabled={!canErase}
                style={{
                  flex: 1,
                  padding: "7px 10px",
                  borderRadius: 10,
                  border: "1.5px solid var(--border-default)",
                  background: "var(--bg-surface)",
                  color: "var(--text-secondary)",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: !canErase ? "not-allowed" : "pointer",
                  opacity: !canErase ? 0.5 : 1,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                }}
              >
                <Eraser size={12} />
                <span>{isShared ? "Clear Notes" : "Erase"}</span>
              </button>
            </div>

            {/* 1-9 Digit Pad */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(9, minmax(0, 1fr))",
                gap: 4,
              }}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => {
                const left = Math.max(0, 9 - digitCounts[digit]);
                const doneInShared = isShared && !notesMode && left === 0;
                const disabled =
                  !canInteract ||
                  (!notesMode && isLockedOut) ||
                  doneInShared;
                return (
                  <button
                    key={digit}
                    type="button"
                    disabled={disabled}
                    onClick={() => void submitDigit(digit)}
                    style={{
                      padding: "7px 0 5px",
                      borderRadius: 10,
                      border: "1.5px solid var(--border-default)",
                      background: notesMode
                        ? "var(--bg-surface-warm)"
                        : "var(--bg-surface)",
                      boxShadow: disabled
                        ? "none"
                        : "0 1px 2px rgba(0,0,0,0.05)",
                      cursor: disabled ? "not-allowed" : "pointer",
                      opacity: doneInShared ? 0.32 : disabled ? 0.5 : 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 1,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'Baloo 2', sans-serif",
                        fontSize: 18,
                        fontWeight: 800,
                        color: notesMode
                          ? "var(--text-secondary)"
                          : "var(--text-primary)",
                        lineHeight: 1.05,
                      }}
                    >
                      {digit}
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: "var(--text-faint)",
                        lineHeight: 1,
                      }}
                    >
                      {left}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
