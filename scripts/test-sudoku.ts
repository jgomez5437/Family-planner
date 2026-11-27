/* eslint-disable no-console */
/**
 * Versus Sudoku engine tests.
 * Run: npx tsx scripts/test-sudoku.ts
 */
import {
  countClues,
  countSolutions,
  generatePuzzle,
  isValidSolvedGrid,
  SUDOKU_CLUE_TARGETS,
} from "../src/lib/games/sudokuGenerator";
import {
  createInitialSudokuState,
  sudokuGame,
  type SudokuState,
} from "../src/lib/games/sudoku";
import type { FamilyGame } from "../src/types/family";

let failures = 0;
let passes = 0;
function check(cond: unknown, msg: string) {
  if (cond) {
    passes += 1;
  } else {
    failures += 1;
    console.error("  ✗", msg);
  }
}

const A = "alice";
const B = "bob";
const players: [string, string] = [A, B];

/* ---------- Generator ---------- */
console.log("Generator…");
for (const diff of ["easy", "medium", "hard"] as const) {
  const t0 = Date.now();
  const N = 20;
  for (let i = 0; i < N; i += 1) {
    const { puzzle, solution } = generatePuzzle(diff);
    check(isValidSolvedGrid(solution), `${diff}: solution valid`);
    check(countSolutions(puzzle, 2) === 1, `${diff}: unique solution`);
    const clues = countClues(puzzle);
    const { min, max } = SUDOKU_CLUE_TARGETS[diff];
    check(
      clues >= min - 2 && clues <= max + 2,
      `${diff}: clue count ${clues} near [${min}, ${max}]`
    );
    check(
      puzzle.every((v, idx) => v === 0 || v === solution[idx]),
      `${diff}: clues match solution`
    );
  }
  console.log(`  ${diff}: ${N} puzzles in ${Date.now() - t0}ms`);
}

/* ---------- Helpers ---------- */
function started(mode: "shared" | "separate", minutes = 10): SudokuState {
  const s = createInitialSudokuState(players, {
    difficulty: "easy",
    boardMode: mode,
    timeLimitMinutes: minutes,
  });
  return sudokuGame.onActivate!(s, new Date());
}
function emptyCells(s: SudokuState) {
  return s.puzzle.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);
}

/* ---------- Shared board ---------- */
console.log("Shared board…");
{
  let s = started("shared");
  const cells = emptyCells(s);
  const sol = s.solution!;

  // Not started
  const pending = createInitialSudokuState(players, { boardMode: "shared" });
  check(
    !sudokuGame.validateAndApplyMove({
      state: pending,
      move: { kind: "guess", cell: cells[0], value: 1 },
      playerId: A,
      players,
    }).ok,
    "rejects moves before accept"
  );

  // Clue cell rejected
  const clueCell = s.puzzle.findIndex((v) => v !== 0);
  check(
    !sudokuGame.validateAndApplyMove({
      state: s,
      move: { kind: "guess", cell: clueCell, value: 1 },
      playerId: A,
      players,
    }).ok,
    "rejects clue cells"
  );

  check(sudokuGame.rulesSummary === "", "rulesSummary removed");

  // Wrong guess -> lockout
  const wrongVal = (sol[cells[0]] % 9) + 1;
  const now = new Date();
  let r = sudokuGame.validateAndApplyMove({
    state: s,
    move: { kind: "guess", cell: cells[0], value: wrongVal },
    playerId: A,
    players,
    now,
  });
  check(r.ok && r.nextState.misses[A] === 1, "wrong guess counted");
  check(r.ok && r.nextState.lockouts[A], "wrong guess locks out");
  if (r.ok) s = r.nextState;
  r = sudokuGame.validateAndApplyMove({
    state: s,
    move: { kind: "guess", cell: cells[0], value: sol[cells[0]] },
    playerId: A,
    players,
    now: new Date(now.getTime() + 2500),
  });
  check(!r.ok, "locked player cannot guess before grace window");

  // Correct guess by B
  r = sudokuGame.validateAndApplyMove({
    state: s,
    move: { kind: "guess", cell: cells[0], value: sol[cells[0]] },
    playerId: B,
    players,
  });
  check(r.ok && r.nextState.scores[B] === 1, "correct guess scores");
  check(r.ok && r.nextState.claims[cells[0]] === B, "cell claimed by B");
  if (r.ok) s = r.nextState;

  // Taken cell for A after lockout
  r = sudokuGame.validateAndApplyMove({
    state: s,
    move: { kind: "guess", cell: cells[0], value: sol[cells[0]] },
    playerId: A,
    players,
    now: new Date(now.getTime() + 4000),
  });
  check(!r.ok, "taken cell rejected");

  // Guess right as 3s lockout ends (within 250ms grace window) succeeds and clears lockout
  r = sudokuGame.validateAndApplyMove({
    state: s,
    move: { kind: "guess", cell: cells[1], value: sol[cells[1]] },
    playerId: A,
    players,
    now: new Date(now.getTime() + 2850),
  });
  check(
    r.ok && r.nextState.lockouts[A] === null,
    "guess at end of 3s lockout succeeds and clears lockout"
  );
  if (r.ok) s = r.nextState;

  // Fill the rest: A takes 60%, B the rest -> A wins on board full
  const later = new Date(now.getTime() + 5000);
  let completed = false;
  for (let k = 2; k < cells.length; k += 1) {
    const who = k % 5 < 3 ? A : B;
    r = sudokuGame.validateAndApplyMove({
      state: s,
      move: { kind: "guess", cell: cells[k], value: sol[cells[k]] },
      playerId: who,
      players,
      now: later,
    });
    check(r.ok, `fill cell ${k}`);
    if (r.ok) {
      s = r.nextState;
      if (r.completed) {
        completed = true;
        const winner = (s.scores[A] ?? 0) > (s.scores[B] ?? 0) ? A : B;
        check(r.winnerId === winner, "board-full winner = higher score");
        check(k === cells.length - 1, "completes only when full");
      }
    }
  }
  check(completed, "shared game completes when board full");
}

{
  // Shared draw on timeout
  const s = started("shared", 5);
  const res = sudokuGame.resolveTimeout!(
    s,
    players,
    new Date(Date.now() + 6 * 60_000)
  );
  check(res && res.outcome === "draw", "shared timeout 0–0 is draw");
  check(
    sudokuGame.resolveTimeout!(s, players, new Date()) === null,
    "no timeout before endsAt"
  );
  const late = sudokuGame.validateAndApplyMove({
    state: s,
    move: { kind: "guess", cell: emptyCells(s)[0], value: 1 },
    playerId: A,
    players,
    now: new Date(Date.now() + 6 * 60_000),
  });
  check(!late.ok, "rejects moves after time is up");
}

/* ---------- Separate boards ---------- */
console.log("Separate boards…");
{
  let s = started("separate");
  const cells = emptyCells(s);
  const sol = s.solution!;

  // B fills 3 correct cells
  for (let k = 0; k < 3; k += 1) {
    const r = sudokuGame.validateAndApplyMove({
      state: s,
      move: { kind: "set", cell: cells[k], value: sol[cells[k]] },
      playerId: B,
      players,
    });
    check(r.ok, "B set cell");
    if (r.ok) s = r.nextState;
  }
  check(s.filled[B] === 3, "filled count tracked");

  // A fills everything but one wrong
  for (let k = 0; k < cells.length; k += 1) {
    const val = k === 0 ? (sol[cells[0]] % 9) + 1 : sol[cells[k]];
    const r = sudokuGame.validateAndApplyMove({
      state: s,
      move: { kind: "set", cell: cells[k], value: val },
      playerId: A,
      players,
    });
    check(r.ok && !r.completed, "A set cell (not done)");
    if (r.ok) s = r.nextState;
  }
  check(s.fullButWrong[A] === 1, "full-but-wrong reports 1 wrong cell");

  // clear + fix
  let r = sudokuGame.validateAndApplyMove({
    state: s,
    move: { kind: "set", cell: cells[0], value: 0 },
    playerId: A,
    players,
  });
  check(r.ok && r.nextState.fullButWrong[A] === undefined, "clear removes full-but-wrong");
  if (r.ok) s = r.nextState;

  // Sanitization while live
  const game: FamilyGame<SudokuState> = {
    id: "g1",
    familyId: "f",
    gameType: "sudoku",
    mode: "remote",
    status: "active",
    challengerId: A,
    opponentId: B,
    players,
    currentTurnId: null,
    winnerId: null,
    outcome: null,
    state: s,
    moves: [
      { by: A, move: { kind: "set", cell: 1, value: 5 }, at: "" },
      { by: B, move: { kind: "set", cell: 2, value: 6 }, at: "" },
    ],
    createdAt: "",
    updatedAt: "",
  };
  const forB = sudokuGame.sanitizeForViewer!(game, B);
  check(forB.state.solution === undefined, "solution stripped");
  check(forB.state.boards[A] === undefined, "opponent board stripped");
  check(Array.isArray(forB.state.boards[B]), "own board kept");
  check(forB.moves[0].move === null, "opponent move details hidden");
  check(forB.moves[1].move !== null, "own moves kept");
  check(s.solution !== undefined, "sanitize does not mutate original");
  const pendingSanitized = sudokuGame.sanitizeForViewer!(
    { ...game, status: "pending" },
    A
  );
  check(
    pendingSanitized.state.puzzle.every((v) => v === 0),
    "pending game hides puzzle clues until accepted"
  );
  const done = sudokuGame.sanitizeForViewer!({ ...game, status: "completed" }, B);
  check(done.state.solution !== undefined, "solution revealed when completed");

  // Timeout: A has more correct than B
  const res = sudokuGame.resolveTimeout!(
    s,
    players,
    new Date(Date.now() + 11 * 60_000)
  );
  check(res && res.winnerId === A, "separate timeout: more correct wins");

  r = sudokuGame.validateAndApplyMove({
    state: s,
    move: { kind: "set", cell: cells[0], value: sol[cells[0]] },
    playerId: A,
    players,
  });
  check(r.ok && r.completed && r.winnerId === A, "first correct finish wins");
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
