import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { getReadyDb } from "./index";
import {
  activities,
  childProfiles,
  doseLogs,
  events,
  families,
  games,
  medications,
  members,
  notifications,
  postComments,
  postReactions,
  posts,
  sessions,
  tasks,
} from "./schema";
import {
  generateInviteCode,
  generateSessionToken,
  getSessionTokenFromCookies,
  hashPassword,
  normalizeEmail,
  SESSION_TTL_MS,
  verifyPassword,
} from "@/lib/auth";
import { MEMBER_COLOR_PALETTES } from "@/lib/constants";
import { fmtShortDate, fmtTime, isIsoTimestamp, uid } from "@/lib/dates";
import {
  getGameDefinition,
  sanitizeGameForViewer,
  sanitizeGamesForViewer,
} from "@/lib/games/registry";
import type {
  GameDefinition,
  MoveValidationResult,
} from "@/lib/games/types";
import type {
  ActivityItem,
  AppTabId,
  ChildProfile,
  DoseLogMap,
  EventHistoryEntry,
  FamilyEvent,
  FamilyGame,
  FamilyNotification,
  FamilyStatePayload,
  FamilyTask,
  GameMode,
  GameOutcome,
  GameStatus,
  GameTypeId,
  Medication,
  Member,
  MemberId,
  MemberRole,
  NotificationCategory,
  NotificationTarget,
  PostComment,
  ProfilesMap,
  TaskOverride,
  TaskUpdateInput,
  WallPost,
} from "@/types/family";

/* ---------------- In-Memory Multi-Family Store (Fallback when no DATABASE_URL) ---------------- */

interface StoredMember extends Member {
  familyId: string;
  passwordHash?: string | null;
}

interface MemoryFamily {
  id: string;
  name: string;
  inviteCode: string;
  members: StoredMember[];
  events: FamilyEvent[];
  tasks: FamilyTask[];
  posts: WallPost[];
  activity: ActivityItem[];
  meds: Medication[];
  doseLog: DoseLogMap;
  profiles: ProfilesMap;
  notifications: FamilyNotification[];
  games: FamilyGame[];
}

interface MemorySession {
  token: string;
  memberId: string;
  familyId: string;
  expiresAt: Date;
}

interface MemoryStore {
  families: Map<string, MemoryFamily>;
  sessions: Map<string, MemorySession>;
}

declare global {
  // eslint-disable-next-line no-var
  var __familyPlannerStore: MemoryStore | undefined;
}

function getMemoryStore(): MemoryStore {
  if (!globalThis.__familyPlannerStore) {
    globalThis.__familyPlannerStore = {
      families: new Map(),
      sessions: new Map(),
    };
  }
  return globalThis.__familyPlannerStore;
}

function toPublicMember(m: {
  id: string;
  name: string;
  emoji: string;
  avatarUrl?: string | null;
  color: string;
  light: string;
  isChild?: boolean | null;
  role?: string | null;
  email?: string | null;
  passwordHash?: string | null;
}): Member {
  return {
    id: m.id,
    name: m.name,
    emoji: m.emoji,
    avatarUrl: m.avatarUrl || null,
    color: m.color,
    light: m.light,
    isChild: Boolean(m.isChild),
    role: (m.role as MemberRole) || (m.isChild ? "child" : "adult"),
    email: m.email || null,
    hasAccount: Boolean(m.passwordHash),
  };
}

async function resolveMemberName(
  familyId: string,
  memberId: MemberId
): Promise<string> {
  const db = await getReadyDb();
  if (db) {
    try {
      const rows = await db
        .select({ name: members.name })
        .from(members)
        .where(and(eq(members.id, memberId), eq(members.familyId, familyId)))
        .limit(1);
      if (rows[0]?.name) return rows[0].name;
    } catch {
      /* fallback to memory */
    }
  }
  const fam = getMemoryStore().families.get(familyId);
  return fam?.members.find((m) => m.id === memberId)?.name || "Someone";
}

/* ---------------- Sessions & Auth ---------------- */

export interface AuthSession {
  token: string;
  familyId: string;
  member: Member;
}

async function createSession(
  memberId: string,
  familyId: string
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const db = await getReadyDb();
  if (db) {
    await db.insert(sessions).values({
      token,
      memberId,
      familyId,
      expiresAt,
    });
  } else {
    getMemoryStore().sessions.set(token, {
      token,
      memberId,
      familyId,
      expiresAt,
    });
  }

  return { token, expiresAt };
}

export async function getSessionContext(
  token: string | null
): Promise<AuthSession | null> {
  if (!token) return null;
  const now = new Date();
  const db = await getReadyDb();

  if (db) {
    try {
      const rows = await db
        .select()
        .from(sessions)
        .where(eq(sessions.token, token))
        .limit(1);
      const sess = rows[0];
      if (!sess) return null;
      if (sess.expiresAt < now) {
        await db.delete(sessions).where(eq(sessions.token, token));
        return null;
      }
      const memberRows = await db
        .select()
        .from(members)
        .where(
          and(eq(members.id, sess.memberId), eq(members.familyId, sess.familyId))
        )
        .limit(1);
      if (!memberRows[0]) return null;
      return {
        token,
        familyId: sess.familyId,
        member: toPublicMember(memberRows[0]),
      };
    } catch (err) {
      console.warn("Error reading session from Neon DB:", err);
      return null;
    }
  }

  const store = getMemoryStore();
  const sess = store.sessions.get(token);
  if (!sess) return null;
  if (sess.expiresAt < now) {
    store.sessions.delete(token);
    return null;
  }
  const fam = store.families.get(sess.familyId);
  const member = fam?.members.find((m) => m.id === sess.memberId);
  if (!fam || !member) return null;

  return {
    token,
    familyId: sess.familyId,
    member: toPublicMember(member),
  };
}

export async function getAuthenticatedSession(): Promise<AuthSession | null> {
  const token = await getSessionTokenFromCookies();
  return getSessionContext(token);
}

export async function deleteSession(token: string | null): Promise<void> {
  if (!token) return;
  const db = await getReadyDb();
  if (db) {
    try {
      await db.delete(sessions).where(eq(sessions.token, token));
    } catch (err) {
      console.warn("Failed deleting session from Neon DB:", err);
    }
    return;
  }
  getMemoryStore().sessions.delete(token);
}

export interface RegisterAccountInput {
  name: string;
  email: string;
  password: string;
  emoji?: string;
  avatarUrl?: string | null;
  color?: string;
  light?: string;
  mode: "create" | "join";
  familyName?: string;
  inviteCode?: string;
}

export async function registerAccount(
  input: RegisterAccountInput
): Promise<
  | { ok: true; token: string; expiresAt: Date; state: FamilyStatePayload }
  | { ok: false; error: string; status: number }
> {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const password = input.password;

  if (!name) return { ok: false, error: "Please enter your name.", status: 400 };
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Please enter a valid email address.", status: 400 };
  }
  if (!password || password.length < 6) {
    return {
      ok: false,
      error: "Password must be at least 6 characters.",
      status: 400,
    };
  }

  const palette =
    MEMBER_COLOR_PALETTES.find((p) => p.color === input.color) ||
    MEMBER_COLOR_PALETTES[0];
  const color = input.color || palette.color;
  const light = input.light || palette.light;
  const emoji = (input.emoji || "🧑").trim() || "🧑";
  const avatarUrl = input.avatarUrl?.trim() ? input.avatarUrl.trim() : null;
  const passwordHash = hashPassword(password);

  const db = await getReadyDb();

  if (db) {
    // Check if an account with this email already has a password
    const existingByEmail = await db
      .select()
      .from(members)
      .where(eq(members.email, email));
    const alreadyRegistered = existingByEmail.find((m) => Boolean(m.passwordHash));
    if (alreadyRegistered) {
      return {
        ok: false,
        error: "An account with this email already exists. Try signing in instead.",
        status: 409,
      };
    }

    let familyId: string;
    let memberId: string;

    if (input.mode === "create") {
      const familyName = (input.familyName || "").trim();
      if (!familyName) {
        return {
          ok: false,
          error: "Please enter a name for your family.",
          status: 400,
        };
      }
      familyId = uid("fam");
      const inviteCode = generateInviteCode();
      await db.insert(families).values({
        id: familyId,
        name: familyName,
        inviteCode,
      });

      memberId = uid("mem");
      await db.insert(members).values({
        id: memberId,
        familyId,
        name,
        emoji,
        avatarUrl,
        color,
        light,
        isChild: false,
        role: "admin",
        email,
        passwordHash,
      });
    } else {
      const code = (input.inviteCode || "").trim().toUpperCase();
      if (!code) {
        return {
          ok: false,
          error: "Please enter a family invite code.",
          status: 400,
        };
      }
      const famRows = await db
        .select()
        .from(families)
        .where(eq(families.inviteCode, code))
        .limit(1);
      if (!famRows[0]) {
        return {
          ok: false,
          error: "We couldn't find a family with that invite code.",
          status: 404,
        };
      }
      familyId = famRows[0].id;

      // If this email was pre-added to this family without a password, claim it
      const invitedMatch = existingByEmail.find(
        (m) => m.familyId === familyId && !m.passwordHash
      );
      if (invitedMatch) {
        memberId = invitedMatch.id;
        await db
          .update(members)
          .set({
            name,
            emoji,
            avatarUrl,
            color,
            light,
            passwordHash,
          })
          .where(eq(members.id, memberId));
      } else {
        memberId = uid("mem");
        await db.insert(members).values({
          id: memberId,
          familyId,
          name,
          emoji,
          avatarUrl,
          color,
          light,
          isChild: false,
          role: "adult",
          email,
          passwordHash,
        });
      }
    }

    const { token, expiresAt } = await createSession(memberId, familyId);
    const state = await getFamilyState(familyId, memberId);
    if (!state) {
      return { ok: false, error: "Could not load family state.", status: 500 };
    }
    return { ok: true, token, expiresAt, state };
  }

  // In-memory fallback
  const store = getMemoryStore();
  for (const fam of store.families.values()) {
    if (fam.members.some((m) => m.email === email && Boolean(m.passwordHash))) {
      return {
        ok: false,
        error: "An account with this email already exists. Try signing in instead.",
        status: 409,
      };
    }
  }

  let targetFamily: MemoryFamily;
  let memberId: string;

  if (input.mode === "create") {
    const familyName = (input.familyName || "").trim();
    if (!familyName) {
      return {
        ok: false,
        error: "Please enter a name for your family.",
        status: 400,
      };
    }
    const familyId = uid("fam");
    const inviteCode = generateInviteCode();
    memberId = uid("mem");
    targetFamily = {
      id: familyId,
      name: familyName,
      inviteCode,
      members: [
        {
          id: memberId,
          familyId,
          name,
          emoji,
          avatarUrl,
          color,
          light,
          isChild: false,
          role: "admin",
          email,
          passwordHash,
        },
      ],
      events: [],
      tasks: [],
      posts: [],
      activity: [],
      meds: [],
      doseLog: {},
      profiles: {},
      notifications: [],
      games: [],
    };
    store.families.set(familyId, targetFamily);
  } else {
    const code = (input.inviteCode || "").trim().toUpperCase();
    if (!code) {
      return {
        ok: false,
        error: "Please enter a family invite code.",
        status: 400,
      };
    }
    const found = [...store.families.values()].find(
      (f) => f.inviteCode.toUpperCase() === code
    );
    if (!found) {
      return {
        ok: false,
        error: "We couldn't find a family with that invite code.",
        status: 404,
      };
    }
    targetFamily = found;
    const invitedMatch = targetFamily.members.find(
      (m) => m.email === email && !m.passwordHash
    );
    if (invitedMatch) {
      memberId = invitedMatch.id;
      invitedMatch.name = name;
      invitedMatch.emoji = emoji;
      invitedMatch.avatarUrl = avatarUrl;
      invitedMatch.color = color;
      invitedMatch.light = light;
      invitedMatch.passwordHash = passwordHash;
    } else {
      memberId = uid("mem");
      targetFamily.members.push({
        id: memberId,
        familyId: targetFamily.id,
        name,
        emoji,
        avatarUrl,
        color,
        light,
        isChild: false,
        role: "adult",
        email,
        passwordHash,
      });
    }
  }

  const { token, expiresAt } = await createSession(memberId, targetFamily.id);
  const state = await getFamilyState(targetFamily.id, memberId);
  if (!state) {
    return { ok: false, error: "Could not load family state.", status: 500 };
  }
  return { ok: true, token, expiresAt, state };
}

export async function loginAccount(
  rawEmail: string,
  password: string
): Promise<
  | { ok: true; token: string; expiresAt: Date; state: FamilyStatePayload }
  | { ok: false; error: string; status: number }
> {
  const email = normalizeEmail(rawEmail);
  if (!email || !password) {
    return {
      ok: false,
      error: "Please enter your email and password.",
      status: 400,
    };
  }

  const db = await getReadyDb();
  if (db) {
    const rows = await db
      .select()
      .from(members)
      .where(eq(members.email, email));
    const account = rows.find((m) => Boolean(m.passwordHash));
    if (!account || !verifyPassword(password, account.passwordHash)) {
      return {
        ok: false,
        error: "Invalid email or password.",
        status: 401,
      };
    }
    const { token, expiresAt } = await createSession(account.id, account.familyId);
    const state = await getFamilyState(account.familyId, account.id);
    if (!state) {
      return { ok: false, error: "Could not load family state.", status: 500 };
    }
    return { ok: true, token, expiresAt, state };
  }

  const store = getMemoryStore();
  let matched: StoredMember | null = null;
  for (const fam of store.families.values()) {
    const found = fam.members.find(
      (m) => m.email === email && Boolean(m.passwordHash)
    );
    if (found) {
      matched = found;
      break;
    }
  }

  if (!matched || !verifyPassword(password, matched.passwordHash)) {
    return { ok: false, error: "Invalid email or password.", status: 401 };
  }

  const { token, expiresAt } = await createSession(matched.id, matched.familyId);
  const state = await getFamilyState(matched.familyId, matched.id);
  if (!state) {
    return { ok: false, error: "Could not load family state.", status: 500 };
  }
  return { ok: true, token, expiresAt, state };
}

export async function getFamilyPreviewByInviteCode(
  rawCode: string
): Promise<{ id: string; name: string; inviteCode: string } | null> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return null;

  const db = await getReadyDb();
  if (db) {
    try {
      const rows = await db
        .select({
          id: families.id,
          name: families.name,
          inviteCode: families.inviteCode,
        })
        .from(families)
        .where(eq(families.inviteCode, code))
        .limit(1);
      return rows[0] || null;
    } catch {
      return null;
    }
  }

  const store = getMemoryStore();
  const found = [...store.families.values()].find(
    (f) => f.inviteCode.toUpperCase() === code
  );
  return found
    ? { id: found.id, name: found.name, inviteCode: found.inviteCode }
    : null;
}

/* ---------------- Family State Loader ---------------- */

export async function getFamilyState(
  familyId: string,
  currentUserId: MemberId
): Promise<FamilyStatePayload | null> {
  const db = await getReadyDb();

  if (db) {
    try {
      const [
        familyRows,
        memberRows,
        profileRows,
        eventRows,
        taskRows,
        medRows,
        doseRows,
        postRows,
        activityRows,
        notificationRows,
        gameRows,
      ] = await Promise.all([
        db.select().from(families).where(eq(families.id, familyId)).limit(1),
        db.select().from(members).where(eq(members.familyId, familyId)),
        db.select().from(childProfiles).where(eq(childProfiles.familyId, familyId)),
        db.select().from(events).where(eq(events.familyId, familyId)),
        db.select().from(tasks).where(eq(tasks.familyId, familyId)),
        db.select().from(medications).where(eq(medications.familyId, familyId)),
        db.select().from(doseLogs).where(eq(doseLogs.familyId, familyId)),
        db
          .select()
          .from(posts)
          .where(eq(posts.familyId, familyId))
          .orderBy(desc(posts.createdAt)),
        db
          .select()
          .from(activities)
          .where(eq(activities.familyId, familyId))
          .orderBy(desc(activities.createdAt))
          .limit(20),
        db
          .select()
          .from(notifications)
          .where(
            and(
              eq(notifications.familyId, familyId),
              eq(notifications.recipientId, currentUserId)
            )
          )
          .orderBy(desc(notifications.createdAt))
          .limit(30),
        db
          .select()
          .from(games)
          .where(eq(games.familyId, familyId))
          .orderBy(desc(games.updatedAt))
          .limit(100),
      ]);

      const familyRow = familyRows[0];
      if (!familyRow) return null;

      const publicMembers = memberRows.map(toPublicMember);
      const currentUser =
        publicMembers.find((m) => m.id === currentUserId) || publicMembers[0];
      if (!currentUser) return null;

      const postIds = postRows.map((p) => p.id);
      const [commentRows, reactionRows] =
        postIds.length > 0
          ? await Promise.all([
              db
                .select()
                .from(postComments)
                .where(inArray(postComments.postId, postIds)),
              db
                .select()
                .from(postReactions)
                .where(inArray(postReactions.postId, postIds)),
            ])
          : [[], []];

      const profiles: ProfilesMap = {};
      for (const p of profileRows) {
        profiles[p.kidId] = {
          allergies: p.allergies,
          doctor: p.doctor,
          contact: p.contact,
          notes: p.notes,
        };
      }

      const toIsoTimestamp = (
        value?: Date | string | null,
        fallback?: string | null
      ): string => {
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
          return value.toISOString();
        }
        if (typeof value === "string" && value.trim()) {
          const parsed = Date.parse(value);
          if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
        }
        if (fallback && fallback.trim()) return fallback;
        return new Date().toISOString();
      };

      const doseLog: DoseLogMap = {};
      for (const d of doseRows) {
        doseLog[d.key] = {
          by: d.givenBy,
          at: isIsoTimestamp(d.givenAt)
            ? d.givenAt
            : toIsoTimestamp(d.createdAt, d.givenAt),
        };
      }

      const formattedEvents: FamilyEvent[] = eventRows.map((e) => {
        const createdIso = toIsoTimestamp(e.createdAt);
        return {
          id: e.id,
          title: e.title,
          description: e.description,
          notes: e.notes,
          date: e.date,
          startTime: e.startTime,
          endTime: e.endTime,
          allDay: e.allDay,
          location: e.location,
          category: e.category,
          participants: e.participants || [],
          createdBy: e.createdBy,
          recurrence: e.recurrence,
          reminder: e.reminder,
          overrides: e.overrides || {},
          exceptions: e.exceptions || [],
          history: (e.history || []).map((h) => ({
            ...h,
            at:
              !h.at || /^just\s*now$/i.test(h.at.trim()) ? createdIso : h.at,
          })),
        };
      });

      const formattedTasks: FamilyTask[] = taskRows.map((t) => ({
        id: t.id,
        title: t.title,
        category: t.category,
        assignedTo: t.assignedTo,
        priority: t.priority,
        dueDate: t.dueDate,
        dueTime: t.dueTime,
        notes: t.notes,
        completed: t.completed,
        completedBy: t.completedBy,
        completedAt: t.completedAt,
        createdBy: t.createdBy,
        linkedEventId: t.linkedEventId || undefined,
        linkedEventTitle: t.linkedEventTitle || undefined,
        recurrence: t.recurrence,
        overrides: t.overrides || {},
        exceptions: t.exceptions || [],
      }));

      const formattedMeds: Medication[] = medRows.map((m) => ({
        id: m.id,
        kidId: m.kidId,
        name: m.name,
        dose: m.dose,
        frequency: m.frequency,
        times: m.times || [],
        startDate: m.startDate,
        endDate: m.endDate,
        instructions: m.instructions,
      }));

      const formattedPosts: WallPost[] = postRows.map((p) => {
        const pComments = commentRows
          .filter((c) => c.postId === p.id)
          .sort(
            (a, b) =>
              (a.createdAt ? a.createdAt.getTime() : 0) -
              (b.createdAt ? b.createdAt.getTime() : 0)
          )
          .map((c) => ({
            id: c.id,
            by: c.by,
            text: c.text,
            at: toIsoTimestamp(c.createdAt, c.at),
          }));

        const reactions: Record<string, MemberId[]> = {
          "❤️": [],
          "👍": [],
          "😂": [],
        };
        for (const r of reactionRows.filter((row) => row.postId === p.id)) {
          if (!reactions[r.emoji]) reactions[r.emoji] = [];
          if (!reactions[r.emoji].includes(r.memberId)) {
            reactions[r.emoji].push(r.memberId);
          }
        }

        return {
          id: p.id,
          author: p.author,
          type: p.type,
          content: p.content,
          images: p.images || [],
          createdAt: toIsoTimestamp(p.createdAt, p.createdAtLabel),
          reactions,
          comments: pComments,
        };
      });

      const LEGACY_CLOCK_RE = /^\d{1,2}:\d{2}\s*[AP]M$/i;
      const formattedActivity: ActivityItem[] = activityRows.map((a) => {
        const isLegacyTaskCompletionClock =
          Boolean(a.sub && LEGACY_CLOCK_RE.test(a.sub.trim())) &&
          /\bcompleted\s+"[^"]+"$/.test(a.text);
        return {
          id: a.id,
          text: a.text,
          sub: isLegacyTaskCompletionClock
            ? toIsoTimestamp(a.createdAt, a.sub)
            : a.sub,
          by: a.by,
          at: toIsoTimestamp(a.createdAt, a.at),
          targetEventId: a.targetEventId,
          target: a.targetEventId
            ? formattedEvents.find((ev) => ev.id === a.targetEventId) || null
            : null,
        };
      });

      const formattedNotifications: FamilyNotification[] = notificationRows.map(
        (n) => ({
          id: n.id,
          familyId: n.familyId,
          recipientId: n.recipientId,
          actorId: n.actorId,
          category: n.category as NotificationCategory,
          title: n.title,
          body: n.body,
          target: {
            tab: (n.targetTab === "tasks" || n.targetTab === "events"
              ? "plan"
              : n.targetTab || "wall") as AppTabId,
            entityId: n.targetEntityId || null,
          },
          read: n.read,
          createdAt: n.createdAt.toISOString(),
        })
      );

      const formattedGames: FamilyGame[] = gameRows.map((g) => ({
        id: g.id,
        familyId: g.familyId,
        gameType: g.gameType as GameTypeId,
        mode: (g.mode === "pass_and_play" ? "pass_and_play" : "remote") as GameMode,
        status: g.status as GameStatus,
        challengerId: g.challengerId,
        opponentId: g.opponentId,
        players: g.players,
        currentTurnId: g.currentTurnId || null,
        winnerId: g.winnerId || null,
        outcome: (g.outcome as GameOutcome) || null,
        state: g.state || {},
        moves: g.moves || [],
        rematchOfId: g.rematchOfId || null,
        createdAt: toIsoTimestamp(g.createdAt),
        updatedAt: toIsoTimestamp(g.updatedAt),
        completedAt: g.completedAt ? toIsoTimestamp(g.completedAt) : null,
      }));

      const settledGames = await settleExpiredGames(formattedGames);

      return {
        familyId: familyRow.id,
        familyName: familyRow.name,
        inviteCode: familyRow.inviteCode,
        currentUser,
        members: publicMembers,
        events: formattedEvents,
        tasks: formattedTasks,
        posts: formattedPosts,
        activity: formattedActivity,
        meds: formattedMeds,
        doseLog,
        profiles,
        notifications: formattedNotifications,
        games: sanitizeGamesForViewer(settledGames, currentUser.id),
        dbConnected: true,
      };
    } catch (err) {
      console.warn("Error reading family state from Neon DB:", err);
      return null;
    }
  }

  const fam = getMemoryStore().families.get(familyId);
  if (!fam) return null;
  const publicMembers = fam.members.map(toPublicMember);
  const currentUser =
    publicMembers.find((m) => m.id === currentUserId) || publicMembers[0];
  if (!currentUser) return null;

  const userNotifications = (fam.notifications || [])
    .filter((n) => n.recipientId === currentUser.id)
    .slice(0, 30);

  const settledMemoryGames = await settleExpiredGames(
    (fam.games || []).slice(0, 100)
  );

  return {
    familyId: fam.id,
    familyName: fam.name,
    inviteCode: fam.inviteCode,
    currentUser,
    members: publicMembers,
    events: fam.events,
    tasks: fam.tasks,
    posts: fam.posts,
    activity: fam.activity,
    meds: fam.meds,
    doseLog: fam.doseLog,
    profiles: fam.profiles,
    notifications: userNotifications,
    games: sanitizeGamesForViewer(settledMemoryGames, currentUser.id),
    dbConnected: false,
  };
}

/* ---------------- Family & Member Mutations ---------------- */

export async function recordActivity(
  familyId: string,
  text: string,
  sub: string | null,
  by: MemberId,
  targetEvent?: FamilyEvent | null
): Promise<ActivityItem> {
  const now = new Date();
  const nowIso = now.toISOString();
  const item: ActivityItem = {
    id: uid("ac"),
    text,
    sub,
    by,
    at: nowIso,
    target: targetEvent || null,
    targetEventId: targetEvent?.id || null,
  };

  const db = await getReadyDb();
  if (db) {
    try {
      await db.insert(activities).values({
        id: item.id,
        familyId,
        text: item.text,
        sub: item.sub || null,
        by: item.by,
        at: nowIso,
        targetEventId: item.targetEventId || null,
        createdAt: now,
      });
    } catch (e) {
      console.warn("Failed to insert activity into Neon:", e);
    }
    return item;
  }

  const fam = getMemoryStore().families.get(familyId);
  if (fam) {
    fam.activity = [item, ...fam.activity].slice(0, 20);
  }
  return item;
}

export async function updateFamilyName(
  familyId: string,
  name: string
): Promise<string> {
  const trimmed = name.trim();
  const db = await getReadyDb();
  if (db) {
    await db
      .update(families)
      .set({ name: trimmed, updatedAt: new Date() })
      .where(eq(families.id, familyId));
    return trimmed;
  }
  const fam = getMemoryStore().families.get(familyId);
  if (fam) fam.name = trimmed;
  return trimmed;
}

export async function regenerateFamilyInviteCode(
  familyId: string
): Promise<string> {
  const nextCode = generateInviteCode();
  const db = await getReadyDb();
  if (db) {
    await db
      .update(families)
      .set({ inviteCode: nextCode, updatedAt: new Date() })
      .where(eq(families.id, familyId));
    return nextCode;
  }
  const fam = getMemoryStore().families.get(familyId);
  if (fam) fam.inviteCode = nextCode;
  return nextCode;
}

export interface AddMemberInput {
  name: string;
  emoji: string;
  avatarUrl?: string | null;
  color: string;
  light: string;
  isChild: boolean;
  email?: string | null;
}

export async function addFamilyMember(
  familyId: string,
  input: AddMemberInput,
  actorId: MemberId
): Promise<{ ok: true; member: Member } | { ok: false; error: string }> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required." };

  const email = input.email?.trim() ? normalizeEmail(input.email) : null;
  const avatarUrl = input.avatarUrl?.trim() ? input.avatarUrl.trim() : null;
  const role: MemberRole = input.isChild ? "child" : "adult";
  const id = uid("mem");
  const newMember: Member = {
    id,
    name,
    emoji: input.emoji || (input.isChild ? "🧒" : "🧑"),
    avatarUrl,
    color: input.color || MEMBER_COLOR_PALETTES[0].color,
    light: input.light || MEMBER_COLOR_PALETTES[0].light,
    isChild: Boolean(input.isChild),
    role,
    email,
    hasAccount: false,
  };

  const db = await getReadyDb();
  if (db) {
    await db.insert(members).values({
      id: newMember.id,
      familyId,
      name: newMember.name,
      emoji: newMember.emoji,
      avatarUrl: newMember.avatarUrl || null,
      color: newMember.color,
      light: newMember.light,
      isChild: Boolean(newMember.isChild),
      role,
      email,
      passwordHash: null,
    });
    if (newMember.isChild) {
      await db.insert(childProfiles).values({
        kidId: newMember.id,
        familyId,
        allergies: "",
        doctor: "",
        contact: "",
        notes: "",
      });
    }
  } else {
    const fam = getMemoryStore().families.get(familyId);
    if (!fam) return { ok: false, error: "Family not found." };
    fam.members.push({ ...newMember, familyId, passwordHash: null });
    if (newMember.isChild) {
      fam.profiles[newMember.id] = {
        allergies: "",
        doctor: "",
        contact: "",
        notes: "",
      };
    }
  }

  const actorName = await resolveMemberName(familyId, actorId);
  await recordActivity(
    familyId,
    `${actorName} added ${newMember.name} to the family`,
    newMember.isChild ? "Child profile" : "Family member",
    actorId
  );

  return { ok: true, member: newMember };
}

export interface UpdateMemberInput {
  name?: string;
  emoji?: string;
  avatarUrl?: string | null;
  color?: string;
  light?: string;
  isChild?: boolean;
  email?: string | null;
  password?: string;
}

export async function updateFamilyMember(
  familyId: string,
  memberId: MemberId,
  updates: UpdateMemberInput,
  actorId: MemberId
): Promise<
  { ok: true; member: Member } | { ok: false; error: string; status?: number }
> {
  const db = await getReadyDb();
  const normalizedEmail =
    updates.email !== undefined
      ? updates.email?.trim()
        ? normalizeEmail(updates.email)
        : null
      : undefined;

  if (
    updates.password !== undefined &&
    updates.password.length > 0 &&
    updates.password.length < 6
  ) {
    return { ok: false, error: "Password must be at least 6 characters." };
  }

  if (db) {
    const rows = await db
      .select()
      .from(members)
      .where(and(eq(members.id, memberId), eq(members.familyId, familyId)))
      .limit(1);
    const existing = rows[0];
    if (!existing) {
      return { ok: false, error: "Member not found.", status: 404 };
    }
    const existingHasAccount = Boolean(existing.passwordHash);
    if (!existing.isChild && existingHasAccount && memberId !== actorId) {
      return {
        ok: false,
        error:
          "Only the account holder can edit their own account information and photo.",
        status: 403,
      };
    }
    if (
      existingHasAccount &&
      normalizedEmail !== undefined &&
      (!normalizedEmail || !normalizedEmail.includes("@"))
    ) {
      return {
        ok: false,
        error: "Please enter a valid email address.",
        status: 400,
      };
    }

    if (normalizedEmail && normalizedEmail !== existing.email) {
      const conflicts = await db
        .select()
        .from(members)
        .where(eq(members.email, normalizedEmail));
      if (conflicts.some((c) => c.id !== memberId && Boolean(c.passwordHash))) {
        return { ok: false, error: "That email is already in use." };
      }
    }

    const nextIsChild =
      memberId === actorId || existingHasAccount
        ? existing.isChild
        : updates.isChild !== undefined
          ? Boolean(updates.isChild)
          : existing.isChild;
    const nextRole =
      existing.role === "admin"
        ? "admin"
        : nextIsChild
          ? "child"
          : "adult";

    const nextName =
      updates.name !== undefined && updates.name.trim()
        ? updates.name.trim()
        : existing.name;
    const nextEmoji = updates.emoji || existing.emoji;
    const nextAvatarUrl =
      updates.avatarUrl !== undefined
        ? updates.avatarUrl?.trim() || null
        : existing.avatarUrl || null;
    const nextColor = updates.color || existing.color;
    const nextLight = updates.light || existing.light;
    const nextEmail =
      normalizedEmail !== undefined ? normalizedEmail : existing.email;
    const nextPasswordHash =
      updates.password && updates.password.length >= 6
        ? hashPassword(updates.password)
        : existing.passwordHash;

    await db
      .update(members)
      .set({
        name: nextName,
        emoji: nextEmoji,
        avatarUrl: nextAvatarUrl,
        color: nextColor,
        light: nextLight,
        isChild: nextIsChild,
        role: nextRole,
        email: nextEmail,
        passwordHash: nextPasswordHash,
      })
      .where(and(eq(members.id, memberId), eq(members.familyId, familyId)));

    if (nextIsChild && !existing.isChild) {
      const prof = await db
        .select()
        .from(childProfiles)
        .where(eq(childProfiles.kidId, memberId))
        .limit(1);
      if (prof.length === 0) {
        await db.insert(childProfiles).values({
          kidId: memberId,
          familyId,
          allergies: "",
          doctor: "",
          contact: "",
          notes: "",
        });
      }
    }

    return {
      ok: true,
      member: toPublicMember({
        id: memberId,
        name: nextName,
        emoji: nextEmoji,
        avatarUrl: nextAvatarUrl,
        color: nextColor,
        light: nextLight,
        isChild: nextIsChild,
        role: nextRole,
        email: nextEmail,
        passwordHash: nextPasswordHash,
      }),
    };
  }

  const store = getMemoryStore();
  const fam = store.families.get(familyId);
  if (!fam) return { ok: false, error: "Family not found.", status: 404 };
  const existing = fam.members.find((m) => m.id === memberId);
  if (!existing) {
    return { ok: false, error: "Member not found.", status: 404 };
  }
  const existingHasAccount = Boolean(existing.passwordHash);
  if (!existing.isChild && existingHasAccount && memberId !== actorId) {
    return {
      ok: false,
      error:
        "Only the account holder can edit their own account information and photo.",
      status: 403,
    };
  }
  if (
    existingHasAccount &&
    normalizedEmail !== undefined &&
    (!normalizedEmail || !normalizedEmail.includes("@"))
  ) {
    return {
      ok: false,
      error: "Please enter a valid email address.",
      status: 400,
    };
  }

  if (normalizedEmail && normalizedEmail !== existing.email) {
    for (const f of store.families.values()) {
      if (
        f.members.some(
          (m) =>
            m.id !== memberId &&
            m.email === normalizedEmail &&
            Boolean(m.passwordHash)
        )
      ) {
        return { ok: false, error: "That email is already in use." };
      }
    }
  }

  if (updates.name !== undefined && updates.name.trim()) {
    existing.name = updates.name.trim();
  }
  if (updates.emoji) existing.emoji = updates.emoji;
  if (updates.avatarUrl !== undefined) {
    existing.avatarUrl = updates.avatarUrl?.trim() || null;
  }
  if (updates.color) existing.color = updates.color;
  if (updates.light) existing.light = updates.light;
  if (
    updates.isChild !== undefined &&
    memberId !== actorId &&
    !existingHasAccount
  ) {
    existing.isChild = Boolean(updates.isChild);
    if (existing.role !== "admin") {
      existing.role = existing.isChild ? "child" : "adult";
    }
    if (existing.isChild && !fam.profiles[memberId]) {
      fam.profiles[memberId] = {
        allergies: "",
        doctor: "",
        contact: "",
        notes: "",
      };
    }
  }
  if (normalizedEmail !== undefined) existing.email = normalizedEmail;
  if (updates.password && updates.password.length >= 6) {
    existing.passwordHash = hashPassword(updates.password);
  }

  return { ok: true, member: toPublicMember(existing) };
}

export async function deleteFamilyMember(
  familyId: string,
  memberId: MemberId,
  actorId: MemberId
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const db = await getReadyDb();
  if (db) {
    const famMembers = await db
      .select()
      .from(members)
      .where(eq(members.familyId, familyId));
    const target = famMembers.find((m) => m.id === memberId);
    if (!target) {
      return { ok: false, error: "Member not found.", status: 404 };
    }
    if (!target.isChild && Boolean(target.passwordHash) && target.id !== actorId) {
      return {
        ok: false,
        error: "Only the account holder can remove their own account.",
        status: 403,
      };
    }
    if (target.passwordHash) {
      return {
        ok: false,
        error:
          "Registered accounts must be deleted from Account settings with password confirmation.",
        status: 400,
      };
    }

    await db
      .delete(members)
      .where(and(eq(members.id, memberId), eq(members.familyId, familyId)));
    return { ok: true };
  }

  const store = getMemoryStore();
  const fam = store.families.get(familyId);
  if (!fam) return { ok: false, error: "Family not found.", status: 404 };
  const target = fam.members.find((m) => m.id === memberId);
  if (!target) {
    return { ok: false, error: "Member not found.", status: 404 };
  }
  if (!target.isChild && Boolean(target.passwordHash) && target.id !== actorId) {
    return {
      ok: false,
      error: "Only the account holder can remove their own account.",
      status: 403,
    };
  }
  if (target.passwordHash) {
    return {
      ok: false,
      error:
        "Registered accounts must be deleted from Account settings with password confirmation.",
      status: 400,
    };
  }

  fam.members = fam.members.filter((m) => m.id !== memberId);
  delete fam.profiles[memberId];
  fam.meds = fam.meds.filter((m) => m.kidId !== memberId);
  fam.notifications = (fam.notifications || []).filter(
    (n) => n.recipientId !== memberId
  );
  fam.games = (fam.games || []).filter(
    (g) => g.challengerId !== memberId && g.opponentId !== memberId
  );
  for (const [token, sess] of store.sessions.entries()) {
    if (sess.memberId === memberId) store.sessions.delete(token);
  }
  return { ok: true };
}

function scrubEventForDeletedMember(
  participants: MemberId[],
  history: EventHistoryEntry[],
  memberId: MemberId
): {
  changed: boolean;
  participants: MemberId[];
  history: EventHistoryEntry[];
} {
  const nextParticipants = participants.filter((id) => id !== memberId);
  const nextHistory = history.filter((h) => h.by !== memberId);
  const changed =
    nextParticipants.length !== participants.length ||
    nextHistory.length !== history.length;
  return { changed, participants: nextParticipants, history: nextHistory };
}

function scrubTaskForDeletedMember(
  task: {
    assignedTo: MemberId | null;
    completedBy?: MemberId | null;
    completedAt?: string | null;
    linkedEventId?: string | null;
    linkedEventTitle?: string | null;
    overrides?: Record<string, TaskOverride> | null;
  },
  memberId: MemberId,
  deletedEventIds: Set<string>
): {
  changed: boolean;
  assignedTo: MemberId | null;
  completedBy: MemberId | null;
  completedAt: string | null;
  linkedEventId: string | null;
  linkedEventTitle: string | null;
  overrides: Record<string, TaskOverride>;
} {
  let changed = false;
  let assignedTo = task.assignedTo ?? null;
  if (assignedTo === memberId) {
    assignedTo = null;
    changed = true;
  }

  let completedBy = task.completedBy ?? null;
  let completedAt = task.completedAt ?? null;
  if (completedBy === memberId) {
    completedBy = null;
    completedAt = null;
    changed = true;
  }

  let linkedEventId = task.linkedEventId ?? null;
  let linkedEventTitle = task.linkedEventTitle ?? null;
  if (linkedEventId && deletedEventIds.has(linkedEventId)) {
    linkedEventId = null;
    linkedEventTitle = null;
    changed = true;
  }

  const rawOverrides = task.overrides || {};
  const nextOverrides: Record<string, TaskOverride> = {};
  for (const [occDate, ov] of Object.entries(rawOverrides)) {
    const nextOv: TaskOverride = { ...ov };
    if (nextOv.assignedTo === memberId) {
      nextOv.assignedTo = null;
      changed = true;
    }
    if (nextOv.completedBy === memberId) {
      nextOv.completedBy = null;
      nextOv.completedAt = null;
      changed = true;
    }
    if (nextOv.linkedEventId && deletedEventIds.has(nextOv.linkedEventId)) {
      nextOv.linkedEventId = null;
      nextOv.linkedEventTitle = null;
      changed = true;
    }
    nextOverrides[occDate] = nextOv;
  }

  return {
    changed,
    assignedTo,
    completedBy,
    completedAt,
    linkedEventId,
    linkedEventTitle,
    overrides: nextOverrides,
  };
}

export async function deleteUserAccount(
  familyId: string,
  memberId: MemberId,
  password: string
): Promise<
  | { ok: true; familyDeleted: boolean }
  | { ok: false; error: string; status: number }
> {
  if (!password) {
    return {
      ok: false,
      error: "Please enter your password to confirm account deletion.",
      status: 400,
    };
  }

  const db = await getReadyDb();
  if (db) {
    const famMembers = await db
      .select()
      .from(members)
      .where(eq(members.familyId, familyId))
      .orderBy(asc(members.createdAt));

    const target = famMembers.find((m) => m.id === memberId);
    if (!target) {
      return { ok: false, error: "Account not found.", status: 404 };
    }
    if (!target.passwordHash || !verifyPassword(password, target.passwordHash)) {
      return {
        ok: false,
        error: "Incorrect password. Please try again.",
        status: 401,
      };
    }

    const otherLoginAccounts = famMembers.filter(
      (m) => m.id !== memberId && Boolean(m.passwordHash)
    );

    if (otherLoginAccounts.length === 0) {
      await db.delete(families).where(eq(families.id, familyId));
      return { ok: true, familyDeleted: true };
    }

    const [famEvents, famTasks, famPosts, famGames] = await Promise.all([
      db.select().from(events).where(eq(events.familyId, familyId)),
      db.select().from(tasks).where(eq(tasks.familyId, familyId)),
      db
        .select({ id: posts.id, author: posts.author })
        .from(posts)
        .where(eq(posts.familyId, familyId)),
      db
        .select({
          id: games.id,
          challengerId: games.challengerId,
          opponentId: games.opponentId,
        })
        .from(games)
        .where(eq(games.familyId, familyId)),
    ]);

    const deletedEventIds = new Set(
      famEvents.filter((e) => e.createdBy === memberId).map((e) => e.id)
    );
    const deletedTaskIds = famTasks
      .filter((t) => t.createdBy === memberId)
      .map((t) => t.id);
    const deletedPlanEntityIds = [...deletedEventIds, ...deletedTaskIds];
    const deletedPostIds = famPosts
      .filter((p) => p.author === memberId)
      .map((p) => p.id);
    const allPostIds = famPosts.map((p) => p.id);
    const deletedGameIds = famGames
      .filter((g) => g.challengerId === memberId || g.opponentId === memberId)
      .map((g) => g.id);

    const ops: BatchItem<"pg">[] = [];

    if (allPostIds.length > 0) {
      ops.push(
        db
          .delete(postComments)
          .where(
            and(
              eq(postComments.by, memberId),
              inArray(postComments.postId, allPostIds)
            )
          )
      );
      ops.push(
        db
          .delete(postReactions)
          .where(
            and(
              eq(postReactions.memberId, memberId),
              inArray(postReactions.postId, allPostIds)
            )
          )
      );
    }

    ops.push(
      db
        .delete(posts)
        .where(and(eq(posts.familyId, familyId), eq(posts.author, memberId)))
    );

    if (deletedEventIds.size > 0) {
      ops.push(
        db
          .delete(activities)
          .where(
            and(
              eq(activities.familyId, familyId),
              or(
                eq(activities.by, memberId),
                inArray(activities.targetEventId, [...deletedEventIds])
              )
            )
          )
      );
    } else {
      ops.push(
        db
          .delete(activities)
          .where(
            and(eq(activities.familyId, familyId), eq(activities.by, memberId))
          )
      );
    }

    const notifConds = [
      eq(notifications.recipientId, memberId),
      eq(notifications.actorId, memberId),
    ];
    if (deletedPostIds.length > 0) {
      notifConds.push(
        and(
          eq(notifications.targetTab, "wall"),
          inArray(notifications.targetEntityId, deletedPostIds)
        )!
      );
    }
    if (deletedPlanEntityIds.length > 0) {
      notifConds.push(
        and(
          inArray(notifications.targetTab, ["plan", "events", "tasks"]),
          inArray(notifications.targetEntityId, deletedPlanEntityIds)
        )!
      );
    }
    if (deletedGameIds.length > 0) {
      notifConds.push(
        and(
          eq(notifications.targetTab, "games"),
          inArray(notifications.targetEntityId, deletedGameIds)
        )!
      );
    }

    ops.push(
      db
        .delete(notifications)
        .where(and(eq(notifications.familyId, familyId), or(...notifConds)))
    );

    ops.push(
      db
        .delete(doseLogs)
        .where(and(eq(doseLogs.familyId, familyId), eq(doseLogs.givenBy, memberId)))
    );

    ops.push(
      db
        .delete(events)
        .where(and(eq(events.familyId, familyId), eq(events.createdBy, memberId)))
    );

    for (const ev of famEvents) {
      if (deletedEventIds.has(ev.id)) continue;
      const scrubbed = scrubEventForDeletedMember(
        ev.participants || [],
        ev.history || [],
        memberId
      );
      if (scrubbed.changed) {
        ops.push(
          db
            .update(events)
            .set({
              participants: scrubbed.participants,
              history: scrubbed.history,
            })
            .where(and(eq(events.id, ev.id), eq(events.familyId, familyId)))
        );
      }
    }

    ops.push(
      db
        .delete(tasks)
        .where(and(eq(tasks.familyId, familyId), eq(tasks.createdBy, memberId)))
    );

    for (const task of famTasks) {
      if (task.createdBy === memberId) continue;
      const scrubbed = scrubTaskForDeletedMember(
        task,
        memberId,
        deletedEventIds
      );
      if (scrubbed.changed) {
        ops.push(
          db
            .update(tasks)
            .set({
              assignedTo: scrubbed.assignedTo,
              completedBy: scrubbed.completedBy,
              completedAt: scrubbed.completedAt,
              linkedEventId: scrubbed.linkedEventId,
              linkedEventTitle: scrubbed.linkedEventTitle,
              overrides: scrubbed.overrides,
            })
            .where(and(eq(tasks.id, task.id), eq(tasks.familyId, familyId)))
        );
      }
    }

    ops.push(
      db
        .delete(games)
        .where(
          and(
            eq(games.familyId, familyId),
            or(
              eq(games.challengerId, memberId),
              eq(games.opponentId, memberId)
            )
          )
        )
    );

    const needsAdminPromotion =
      target.role === "admin" &&
      !otherLoginAccounts.some((m) => m.role === "admin");
    if (needsAdminPromotion) {
      ops.push(
        db
          .update(members)
          .set({ role: "admin" })
          .where(
            and(
              eq(members.id, otherLoginAccounts[0].id),
              eq(members.familyId, familyId)
            )
          )
      );
    }

    ops.push(
      db
        .delete(members)
        .where(and(eq(members.id, memberId), eq(members.familyId, familyId)))
    );

    await db.batch([ops[0], ...ops.slice(1)]);
    return { ok: true, familyDeleted: false };
  }

  // In-memory store fallback
  const store = getMemoryStore();
  const fam = store.families.get(familyId);
  if (!fam) return { ok: false, error: "Family not found.", status: 404 };

  const target = fam.members.find((m) => m.id === memberId);
  if (!target) {
    return { ok: false, error: "Account not found.", status: 404 };
  }
  if (!target.passwordHash || !verifyPassword(password, target.passwordHash)) {
    return {
      ok: false,
      error: "Incorrect password. Please try again.",
      status: 401,
    };
  }

  const otherLoginAccounts = fam.members.filter(
    (m) => m.id !== memberId && Boolean(m.passwordHash)
  );

  if (otherLoginAccounts.length === 0) {
    store.families.delete(familyId);
    for (const [token, sess] of store.sessions.entries()) {
      if (sess.familyId === familyId) store.sessions.delete(token);
    }
    return { ok: true, familyDeleted: true };
  }

  const deletedEventIds = new Set(
    fam.events.filter((e) => e.createdBy === memberId).map((e) => e.id)
  );
  const deletedPlanEntityIds = new Set([
    ...deletedEventIds,
    ...fam.tasks.filter((t) => t.createdBy === memberId).map((t) => t.id),
  ]);
  const deletedPostIds = new Set(
    fam.posts.filter((p) => p.author === memberId).map((p) => p.id)
  );
  const deletedGameIds = new Set(
    (fam.games || [])
      .filter((g) => g.challengerId === memberId || g.opponentId === memberId)
      .map((g) => g.id)
  );

  const needsAdminPromotion =
    target.role === "admin" &&
    !otherLoginAccounts.some((m) => m.role === "admin");
  if (needsAdminPromotion) {
    otherLoginAccounts[0].role = "admin";
  }

  fam.members = fam.members.filter((m) => m.id !== memberId);
  delete fam.profiles[memberId];
  fam.meds = fam.meds.filter((m) => m.kidId !== memberId);

  for (const [key, entry] of Object.entries(fam.doseLog)) {
    if (entry.by === memberId) {
      delete fam.doseLog[key];
    }
  }

  fam.posts = fam.posts
    .filter((p) => p.author !== memberId)
    .map((p) => {
      const nextReactions: Record<string, MemberId[]> = {};
      for (const [emoji, ids] of Object.entries(p.reactions || {})) {
        nextReactions[emoji] = (ids || []).filter((id) => id !== memberId);
      }
      return {
        ...p,
        reactions: nextReactions,
        comments: (p.comments || []).filter((c) => c.by !== memberId),
      };
    });

  fam.events = fam.events
    .filter((e) => e.createdBy !== memberId)
    .map((e) => {
      const scrubbed = scrubEventForDeletedMember(
        e.participants || [],
        e.history || [],
        memberId
      );
      return scrubbed.changed
        ? {
            ...e,
            participants: scrubbed.participants,
            history: scrubbed.history,
          }
        : e;
    });

  fam.tasks = fam.tasks
    .filter((t) => t.createdBy !== memberId)
    .map((t) => {
      const scrubbed = scrubTaskForDeletedMember(t, memberId, deletedEventIds);
      return scrubbed.changed
        ? {
            ...t,
            assignedTo: scrubbed.assignedTo,
            completedBy: scrubbed.completedBy,
            completedAt: scrubbed.completedAt,
            linkedEventId: scrubbed.linkedEventId ?? undefined,
            linkedEventTitle: scrubbed.linkedEventTitle ?? undefined,
            overrides: scrubbed.overrides,
          }
        : t;
    });

  fam.activity = fam.activity.filter(
    (a) =>
      a.by !== memberId &&
      (!a.targetEventId || !deletedEventIds.has(a.targetEventId)) &&
      (!a.target?.id || !deletedEventIds.has(a.target.id))
  );

  fam.notifications = (fam.notifications || []).filter((n) => {
    if (n.recipientId === memberId || n.actorId === memberId) return false;
    if (
      n.target?.tab === "wall" &&
      n.target.entityId &&
      deletedPostIds.has(n.target.entityId)
    ) {
      return false;
    }
    if (
      n.target?.tab === "plan" &&
      n.target.entityId &&
      deletedPlanEntityIds.has(n.target.entityId)
    ) {
      return false;
    }
    if (
      n.target?.tab === "games" &&
      n.target.entityId &&
      deletedGameIds.has(n.target.entityId)
    ) {
      return false;
    }
    return true;
  });

  fam.games = (fam.games || []).filter(
    (g) => g.challengerId !== memberId && g.opponentId !== memberId
  );

  for (const [token, sess] of store.sessions.entries()) {
    if (sess.memberId === memberId) store.sessions.delete(token);
  }

  return { ok: true, familyDeleted: false };
}

/* ---------------- Events ---------------- */

export async function createEventRecord(
  familyId: string,
  ev: Partial<FamilyEvent>,
  currentUser: MemberId
): Promise<FamilyEvent> {
  const nowIso = new Date().toISOString();
  const normalizedHistory =
    ev.history && ev.history.length > 0
      ? ev.history.map((h) => ({
          ...h,
          at: !h.at || /^just\s*now$/i.test(h.at.trim()) ? nowIso : h.at,
        }))
      : [{ by: currentUser, at: nowIso, note: "Created event" }];

  const full: FamilyEvent = {
    id: ev.id || uid("ev"),
    title: ev.title || "Untitled Event",
    description: ev.description || "",
    notes: ev.notes || "",
    date: ev.date || "",
    startTime: ev.allDay ? null : ev.startTime || null,
    endTime: ev.allDay ? null : ev.endTime || null,
    allDay: Boolean(ev.allDay),
    location: ev.location || "",
    category: ev.category || "Family",
    participants: ev.participants || [],
    createdBy: currentUser,
    recurrence: ev.recurrence || null,
    reminder: ev.reminder || null,
    overrides: ev.overrides || {},
    exceptions: ev.exceptions || [],
    history: normalizedHistory,
  };

  const db = await getReadyDb();
  if (db) {
    await db.insert(events).values({
      id: full.id,
      familyId,
      title: full.title,
      description: full.description || "",
      notes: full.notes || "",
      date: full.date,
      startTime: full.startTime,
      endTime: full.endTime,
      allDay: full.allDay,
      location: full.location,
      category: full.category,
      participants: full.participants,
      createdBy: full.createdBy,
      recurrence: full.recurrence || null,
      reminder: full.reminder || null,
      overrides: full.overrides || {},
      exceptions: full.exceptions || [],
      history: full.history,
    });
  } else {
    const fam = getMemoryStore().families.get(familyId);
    if (fam) fam.events.push(full);
  }

  const actorName = await resolveMemberName(familyId, currentUser);
  await recordActivity(
    familyId,
    `${actorName} added "${full.title}"`,
    null,
    currentUser,
    full
  );
  return full;
}

export async function updateEventRecord(
  familyId: string,
  id: string,
  field: string,
  value: string,
  reason: string,
  scope: "instance" | "series",
  currentUser: MemberId
): Promise<FamilyEvent | null> {
  const [masterId, occDate] = id.includes("::") ? id.split("::") : [id, null];
  const db = await getReadyDb();
  const fam = getMemoryStore().families.get(familyId);

  let target: FamilyEvent | undefined;
  if (db) {
    const rows = await db
      .select()
      .from(events)
      .where(and(eq(events.id, masterId), eq(events.familyId, familyId)))
      .limit(1);
    if (rows[0]) {
      target = {
        id: rows[0].id,
        title: rows[0].title,
        description: rows[0].description,
        notes: rows[0].notes,
        date: rows[0].date,
        startTime: rows[0].startTime,
        endTime: rows[0].endTime,
        allDay: rows[0].allDay,
        location: rows[0].location,
        category: rows[0].category,
        participants: rows[0].participants || [],
        createdBy: rows[0].createdBy,
        recurrence: rows[0].recurrence,
        reminder: rows[0].reminder,
        overrides: rows[0].overrides || {},
        exceptions: rows[0].exceptions || [],
        history: rows[0].history || [],
      };
    }
  } else {
    target = fam?.events.find((e) => e.id === masterId);
  }

  if (!target) return null;

  const isRecurring = Boolean(target.recurrence);
  const editingJustThisOne = Boolean(
    isRecurring && occDate && scope === "instance"
  );

  const before = editingJustThisOne
    ? ((target.overrides?.[occDate!]?.[field] as string | undefined) ??
        (target[field as keyof FamilyEvent] as string | undefined))
    : (target[field as keyof FamilyEvent] as string | undefined);

  let note: string;
  if (field === "startTime")
    note = `Time changed from ${fmtTime(before)} to ${fmtTime(value)}`;
  else if (field === "location")
    note = before
      ? `Location changed from "${before}" to "${value}"`
      : `Location set to "${value}"`;
  else note = `${field} updated`;

  const historyEntry = {
    by: currentUser,
    at: new Date().toISOString(),
    note,
    reason,
  };

  let patchedMaster: FamilyEvent;
  if (editingJustThisOne && occDate) {
    const existingOverride = target.overrides?.[occDate] || {};
    patchedMaster = {
      ...target,
      overrides: {
        ...(target.overrides || {}),
        [occDate]: { ...existingOverride, [field]: value },
      },
      history: [
        ...(target.history || []),
        {
          ...historyEntry,
          note: `${historyEntry.note} (${fmtShortDate(occDate)} only)`,
        },
      ],
    };
  } else {
    patchedMaster = {
      ...target,
      [field]: value,
      history: [...(target.history || []), historyEntry],
    };
  }

  if (db) {
    await db
      .update(events)
      .set({
        startTime: patchedMaster.startTime,
        location: patchedMaster.location,
        overrides: patchedMaster.overrides || {},
        history: patchedMaster.history,
      })
      .where(and(eq(events.id, masterId), eq(events.familyId, familyId)));
  } else if (fam) {
    fam.events = fam.events.map((e) => (e.id === masterId ? patchedMaster : e));
  }

  const sub =
    field === "startTime"
      ? fmtTime(value)
      : field === "location"
        ? value
        : null;
  const actorName = await resolveMemberName(familyId, currentUser);
  await recordActivity(
    familyId,
    `${actorName} changed "${patchedMaster.title}"`,
    sub,
    currentUser,
    patchedMaster
  );

  return patchedMaster;
}

export async function deleteEventRecord(
  familyId: string,
  id: string,
  scope: "instance" | "series",
  actorId: MemberId
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const [masterId, occDate] = id.includes("::") ? id.split("::") : [id, null];
  const db = await getReadyDb();
  const fam = getMemoryStore().families.get(familyId);

  if (db) {
    const rows = await db
      .select()
      .from(events)
      .where(and(eq(events.id, masterId), eq(events.familyId, familyId)))
      .limit(1);
    const existing = rows[0];
    if (!existing) {
      return { ok: false, error: "Event not found.", status: 404 };
    }
    if (existing.createdBy !== actorId) {
      return {
        ok: false,
        error: "Only the person who created this event can delete it.",
        status: 403,
      };
    }

    if (occDate && scope === "instance") {
      const currentExceptions = existing.exceptions || [];
      const nextExceptions = currentExceptions.includes(occDate)
        ? currentExceptions
        : [...currentExceptions, occDate];
      await db
        .update(events)
        .set({ exceptions: nextExceptions })
        .where(and(eq(events.id, masterId), eq(events.familyId, familyId)));
    } else {
      await db
        .delete(events)
        .where(and(eq(events.id, masterId), eq(events.familyId, familyId)));
      await db
        .update(tasks)
        .set({ linkedEventId: null, linkedEventTitle: null })
        .where(
          and(eq(tasks.familyId, familyId), eq(tasks.linkedEventId, masterId))
        );
      await db
        .update(activities)
        .set({ targetEventId: null })
        .where(
          and(
            eq(activities.familyId, familyId),
            eq(activities.targetEventId, masterId)
          )
        );
    }
    return { ok: true };
  }

  if (!fam) {
    return { ok: false, error: "Family not found.", status: 404 };
  }
  const existing = fam.events.find((e) => e.id === masterId);
  if (!existing) {
    return { ok: false, error: "Event not found.", status: 404 };
  }
  if (existing.createdBy !== actorId) {
    return {
      ok: false,
      error: "Only the person who created this event can delete it.",
      status: 403,
    };
  }

  if (occDate && scope === "instance") {
    fam.events = fam.events.map((e) => {
      if (e.id !== masterId) return e;
      const currentExceptions = e.exceptions || [];
      return currentExceptions.includes(occDate)
        ? e
        : { ...e, exceptions: [...currentExceptions, occDate] };
    });
  } else {
    fam.events = fam.events.filter((e) => e.id !== masterId);
    fam.tasks = fam.tasks.map((t) =>
      t.linkedEventId === masterId
        ? { ...t, linkedEventId: undefined, linkedEventTitle: undefined }
        : t
    );
    fam.activity = fam.activity.map((a) =>
      a.targetEventId === masterId || a.target?.id === masterId
        ? { ...a, targetEventId: null, target: null }
        : a
    );
  }
  return { ok: true };
}

/* ---------------- Tasks ---------------- */

export async function createTaskRecord(
  familyId: string,
  tk: Partial<FamilyTask>,
  currentUser: MemberId
): Promise<FamilyTask> {
  const full: FamilyTask = {
    id: tk.id || uid("tk"),
    title: tk.title || "Untitled Task",
    category: tk.category || "Household",
    assignedTo: tk.assignedTo || null,
    priority: tk.priority || "Medium",
    dueDate: tk.dueDate || "",
    dueTime: tk.dueTime || null,
    notes: tk.notes || "",
    completed: false,
    completedBy: null,
    completedAt: null,
    createdBy: currentUser,
    linkedEventId: tk.linkedEventId,
    linkedEventTitle: tk.linkedEventTitle,
    recurrence: tk.recurrence || null,
    overrides: tk.overrides || {},
    exceptions: tk.exceptions || [],
  };

  const db = await getReadyDb();
  if (db) {
    await db.insert(tasks).values({
      id: full.id,
      familyId,
      title: full.title,
      category: full.category,
      assignedTo: full.assignedTo,
      priority: full.priority,
      dueDate: full.dueDate,
      dueTime: full.dueTime || null,
      notes: full.notes || "",
      completed: full.completed,
      completedBy: null,
      completedAt: null,
      createdBy: full.createdBy,
      linkedEventId: full.linkedEventId || null,
      linkedEventTitle: full.linkedEventTitle || null,
      recurrence: full.recurrence || null,
      overrides: full.overrides || {},
      exceptions: full.exceptions || [],
    });
  } else {
    const fam = getMemoryStore().families.get(familyId);
    if (fam) fam.tasks.push(full);
  }

  const actorName = await resolveMemberName(familyId, currentUser);
  await recordActivity(
    familyId,
    `${actorName} added "${full.title}"`,
    null,
    currentUser
  );
  return full;
}

const VALID_TASK_PRIORITIES = new Set(["Low", "Medium", "High"]);
const VALID_TASK_RECURRENCES = new Set(["Daily", "Weekly", "Monthly", "Yearly"]);

export async function updateTaskRecord(
  familyId: string,
  id: string,
  updates: TaskUpdateInput,
  scope: "instance" | "series",
  actorId: MemberId
): Promise<
  { ok: true; task: FamilyTask } | { ok: false; error: string; status: number }
> {
  const [masterId, occDate] = id.includes("::") ? id.split("::") : [id, null];
  const db = await getReadyDb();
  const fam = getMemoryStore().families.get(familyId);

  let target: FamilyTask | undefined;
  if (db) {
    const rows = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, masterId), eq(tasks.familyId, familyId)))
      .limit(1);
    if (rows[0]) {
      target = {
        id: rows[0].id,
        title: rows[0].title,
        category: rows[0].category,
        assignedTo: rows[0].assignedTo,
        priority: rows[0].priority,
        dueDate: rows[0].dueDate,
        dueTime: rows[0].dueTime,
        notes: rows[0].notes,
        completed: rows[0].completed,
        completedBy: rows[0].completedBy,
        completedAt: rows[0].completedAt,
        createdBy: rows[0].createdBy,
        linkedEventId: rows[0].linkedEventId || undefined,
        linkedEventTitle: rows[0].linkedEventTitle || undefined,
        recurrence: rows[0].recurrence,
        overrides: rows[0].overrides || {},
        exceptions: rows[0].exceptions || [],
      };
    }
  } else {
    target = fam?.tasks.find((t) => t.id === masterId);
  }

  if (!target) {
    return { ok: false, error: "Task not found.", status: 404 };
  }

  const patch: Partial<TaskOverride> & { recurrence?: string | null } = {};

  if (updates.title !== undefined) {
    const trimmed = updates.title.trim();
    if (!trimmed) {
      return { ok: false, error: "Task title cannot be empty.", status: 400 };
    }
    patch.title = trimmed;
  }

  if (updates.category !== undefined) {
    const trimmed = updates.category.trim();
    patch.category = trimmed || "Household";
  }

  if (updates.priority !== undefined) {
    if (!VALID_TASK_PRIORITIES.has(updates.priority)) {
      return { ok: false, error: "Invalid priority value.", status: 400 };
    }
    patch.priority = updates.priority;
  }

  if (updates.dueDate !== undefined) {
    const trimmed = updates.dueDate.trim();
    if (trimmed && !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return { ok: false, error: "Invalid due date.", status: 400 };
    }
    patch.dueDate = trimmed;
  }

  if (updates.dueTime !== undefined) {
    const trimmed = updates.dueTime ? updates.dueTime.trim() : "";
    if (trimmed && !/^\d{2}:\d{2}$/.test(trimmed)) {
      return { ok: false, error: "Invalid due time.", status: 400 };
    }
    patch.dueTime = trimmed || null;
  }

  if (updates.notes !== undefined) {
    patch.notes = String(updates.notes);
  }

  if (updates.assignedTo !== undefined) {
    const nextAssignee = updates.assignedTo?.trim() || null;
    if (nextAssignee) {
      let memberExists = false;
      if (db) {
        const mRows = await db
          .select({ id: members.id })
          .from(members)
          .where(and(eq(members.id, nextAssignee), eq(members.familyId, familyId)))
          .limit(1);
        memberExists = mRows.length > 0;
      } else {
        memberExists = Boolean(fam?.members.some((m) => m.id === nextAssignee));
      }
      if (!memberExists) {
        return { ok: false, error: "Assigned member not found.", status: 400 };
      }
    }
    patch.assignedTo = nextAssignee;
  }

  if (updates.recurrence !== undefined) {
    const rawRec = updates.recurrence ? updates.recurrence.trim() : "";
    if (!rawRec || rawRec === "None") {
      patch.recurrence = null;
    } else if (!VALID_TASK_RECURRENCES.has(rawRec)) {
      return { ok: false, error: "Invalid recurrence value.", status: 400 };
    } else {
      patch.recurrence = rawRec;
    }
  }

  if (updates.linkedEventId !== undefined) {
    const rawEventId = updates.linkedEventId?.trim() || "";
    if (!rawEventId) {
      patch.linkedEventId = null;
      patch.linkedEventTitle = null;
    } else {
      const eventMasterId = rawEventId.includes("::")
        ? rawEventId.split("::")[0]
        : rawEventId;
      let evTitle: string | null = null;
      if (db) {
        const eRows = await db
          .select({ id: events.id, title: events.title })
          .from(events)
          .where(and(eq(events.id, eventMasterId), eq(events.familyId, familyId)))
          .limit(1);
        if (eRows[0]) evTitle = eRows[0].title;
      } else {
        const foundEv = fam?.events.find((e) => e.id === eventMasterId);
        if (foundEv) evTitle = foundEv.title;
      }
      if (!evTitle) {
        return { ok: false, error: "Linked event not found.", status: 400 };
      }
      patch.linkedEventId = eventMasterId;
      patch.linkedEventTitle = evTitle;
    }
  }

  const isRecurring = Boolean(target.recurrence);
  const editingJustThisOne = Boolean(
    isRecurring && occDate && scope === "instance" && patch.recurrence === undefined
  );

  let updatedMaster: FamilyTask;
  if (editingJustThisOne && occDate) {
    const existingOverride = target.overrides?.[occDate] || {};
    const { recurrence: _ignored, ...overridePatch } = patch;
    updatedMaster = {
      ...target,
      overrides: {
        ...(target.overrides || {}),
        [occDate]: {
          ...existingOverride,
          ...overridePatch,
        },
      },
    };
  } else {
    const clearedKeys = Object.keys(patch).filter(
      (k) => k !== "recurrence" && k !== "dueDate"
    );
    let nextOverrides = target.overrides || {};
    if (clearedKeys.length > 0 && Object.keys(nextOverrides).length > 0) {
      nextOverrides = Object.fromEntries(
        Object.entries(nextOverrides).map(([d, ov]) => {
          const copy: Record<string, unknown> = { ...ov };
          for (const k of clearedKeys) {
            delete copy[k];
          }
          if (clearedKeys.includes("linkedEventId")) {
            delete copy.linkedEventTitle;
          }
          return [d, copy as TaskOverride];
        })
      );
    }
    updatedMaster = {
      ...target,
      ...patch,
      overrides: nextOverrides,
      linkedEventId:
        patch.linkedEventId !== undefined
          ? patch.linkedEventId || undefined
          : target.linkedEventId,
      linkedEventTitle:
        patch.linkedEventTitle !== undefined
          ? patch.linkedEventTitle || undefined
          : target.linkedEventTitle,
    };
  }

  if (db) {
    await db
      .update(tasks)
      .set({
        title: updatedMaster.title,
        category: updatedMaster.category,
        assignedTo: updatedMaster.assignedTo,
        priority: updatedMaster.priority,
        dueDate: updatedMaster.dueDate,
        dueTime: updatedMaster.dueTime || null,
        notes: updatedMaster.notes || "",
        recurrence: updatedMaster.recurrence || null,
        linkedEventId: updatedMaster.linkedEventId || null,
        linkedEventTitle: updatedMaster.linkedEventTitle || null,
        overrides: updatedMaster.overrides || {},
      })
      .where(and(eq(tasks.id, masterId), eq(tasks.familyId, familyId)));
  } else if (fam) {
    fam.tasks = fam.tasks.map((t) => (t.id === masterId ? updatedMaster : t));
  }

  const actorName = await resolveMemberName(familyId, actorId);
  const displayTitle =
    editingJustThisOne && occDate
      ? updatedMaster.overrides?.[occDate]?.title || updatedMaster.title
      : updatedMaster.title;
  await recordActivity(
    familyId,
    `${actorName} updated "${displayTitle}"`,
    null,
    actorId
  );

  return { ok: true, task: updatedMaster };
}

export async function toggleTaskRecord(
  familyId: string,
  id: string,
  currentUser: MemberId
): Promise<FamilyTask | null> {
  const [masterId, occDate] = id.includes("::") ? id.split("::") : [id, null];
  const db = await getReadyDb();
  const fam = getMemoryStore().families.get(familyId);

  let target: FamilyTask | undefined;
  if (db) {
    const rows = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, masterId), eq(tasks.familyId, familyId)))
      .limit(1);
    if (rows[0]) {
      target = {
        id: rows[0].id,
        title: rows[0].title,
        category: rows[0].category,
        assignedTo: rows[0].assignedTo,
        priority: rows[0].priority,
        dueDate: rows[0].dueDate,
        dueTime: rows[0].dueTime,
        notes: rows[0].notes,
        completed: rows[0].completed,
        completedBy: rows[0].completedBy,
        completedAt: rows[0].completedAt,
        createdBy: rows[0].createdBy,
        linkedEventId: rows[0].linkedEventId || undefined,
        linkedEventTitle: rows[0].linkedEventTitle || undefined,
        recurrence: rows[0].recurrence,
        overrides: rows[0].overrides || {},
        exceptions: rows[0].exceptions || [],
      };
    }
  } else {
    target = fam?.tasks.find((t) => t.id === masterId);
  }

  if (!target) return null;

  const completedIso = new Date().toISOString();
  let updated: FamilyTask;
  let nowDone = false;

  if (occDate) {
    const existing = target.overrides?.[occDate] || {};
    nowDone = !existing.completed;
    updated = {
      ...target,
      overrides: {
        ...(target.overrides || {}),
        [occDate]: {
          ...existing,
          completed: nowDone,
          completedBy: nowDone ? currentUser : null,
          completedAt: nowDone ? completedIso : null,
        },
      },
    };
  } else {
    nowDone = !target.completed;
    updated = {
      ...target,
      completed: nowDone,
      completedBy: nowDone ? currentUser : null,
      completedAt: nowDone ? completedIso : null,
    };
  }

  if (db) {
    await db
      .update(tasks)
      .set({
        completed: updated.completed,
        completedBy: updated.completedBy || null,
        completedAt: updated.completedAt || null,
        overrides: updated.overrides || {},
      })
      .where(and(eq(tasks.id, masterId), eq(tasks.familyId, familyId)));
  } else if (fam) {
    fam.tasks = fam.tasks.map((t) => (t.id === masterId ? updated : t));
  }

  if (nowDone) {
    const actorName = await resolveMemberName(familyId, currentUser);
    const displayTitle =
      occDate && updated.overrides?.[occDate]?.title
        ? updated.overrides[occDate].title!
        : updated.title;
    await recordActivity(
      familyId,
      `${actorName} completed "${displayTitle}"`,
      completedIso,
      currentUser
    );
  }
  return updated;
}

export async function deleteTaskRecord(
  familyId: string,
  id: string,
  scope: "instance" | "series",
  actorId: MemberId
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const [masterId, occDate] = id.includes("::") ? id.split("::") : [id, null];
  const db = await getReadyDb();
  const fam = getMemoryStore().families.get(familyId);

  if (db) {
    const rows = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, masterId), eq(tasks.familyId, familyId)))
      .limit(1);
    const existing = rows[0];
    if (!existing) {
      return { ok: false, error: "Task not found.", status: 404 };
    }
    if (existing.createdBy !== actorId) {
      return {
        ok: false,
        error: "Only the person who created this task can delete it.",
        status: 403,
      };
    }

    if (occDate && scope === "instance") {
      const currentExceptions = existing.exceptions || [];
      const nextExceptions = currentExceptions.includes(occDate)
        ? currentExceptions
        : [...currentExceptions, occDate];
      await db
        .update(tasks)
        .set({ exceptions: nextExceptions })
        .where(and(eq(tasks.id, masterId), eq(tasks.familyId, familyId)));
    } else {
      await db
        .delete(tasks)
        .where(and(eq(tasks.id, masterId), eq(tasks.familyId, familyId)));
    }
    return { ok: true };
  }

  if (!fam) {
    return { ok: false, error: "Family not found.", status: 404 };
  }
  const existing = fam.tasks.find((t) => t.id === masterId);
  if (!existing) {
    return { ok: false, error: "Task not found.", status: 404 };
  }
  if (existing.createdBy !== actorId) {
    return {
      ok: false,
      error: "Only the person who created this task can delete it.",
      status: 403,
    };
  }

  if (occDate && scope === "instance") {
    fam.tasks = fam.tasks.map((t) => {
      if (t.id !== masterId) return t;
      const currentExceptions = t.exceptions || [];
      return currentExceptions.includes(occDate)
        ? t
        : { ...t, exceptions: [...currentExceptions, occDate] };
    });
  } else {
    fam.tasks = fam.tasks.filter((t) => t.id !== masterId);
  }
  return { ok: true };
}

/* ---------------- Medications & Care Profiles ---------------- */

export async function saveMedicationRecord(
  familyId: string,
  med: Medication,
  isNew: boolean,
  currentUser: MemberId
): Promise<Medication> {
  const db = await getReadyDb();
  if (db) {
    if (isNew) {
      await db.insert(medications).values({
        id: med.id,
        familyId,
        kidId: med.kidId,
        name: med.name,
        dose: med.dose,
        frequency: med.frequency,
        times: med.times,
        startDate: med.startDate,
        endDate: med.endDate,
        instructions: med.instructions,
      });
    } else {
      await db
        .update(medications)
        .set({
          name: med.name,
          dose: med.dose,
          frequency: med.frequency,
          times: med.times,
          startDate: med.startDate,
          endDate: med.endDate,
          instructions: med.instructions,
        })
        .where(and(eq(medications.id, med.id), eq(medications.familyId, familyId)));
    }
  } else {
    const fam = getMemoryStore().families.get(familyId);
    if (fam) {
      if (isNew) fam.meds.push(med);
      else fam.meds = fam.meds.map((m) => (m.id === med.id ? med : m));
    }
  }

  const [actorName, kidName] = await Promise.all([
    resolveMemberName(familyId, currentUser),
    resolveMemberName(familyId, med.kidId),
  ]);
  await recordActivity(
    familyId,
    `${actorName} ${isNew ? "added" : "changed"} ${med.name} for ${kidName}`,
    med.dose,
    currentUser
  );
  return med;
}

export async function deleteMedicationRecord(
  familyId: string,
  id: string
): Promise<void> {
  const db = await getReadyDb();
  if (db) {
    await db
      .delete(medications)
      .where(and(eq(medications.id, id), eq(medications.familyId, familyId)));
    return;
  }
  const fam = getMemoryStore().families.get(familyId);
  if (fam) {
    fam.meds = fam.meds.filter((m) => m.id !== id);
  }
}

export async function toggleDoseRecord(
  familyId: string,
  key: string,
  medId: string,
  kidId: MemberId,
  medName: string,
  time: string,
  currentUser: MemberId
): Promise<{ given: boolean; entry?: { by: MemberId; at: string } }> {
  const db = await getReadyDb();
  const fam = getMemoryStore().families.get(familyId);

  let wasGiven = Boolean(fam?.doseLog[key]);
  if (db) {
    const rows = await db
      .select()
      .from(doseLogs)
      .where(and(eq(doseLogs.key, key), eq(doseLogs.familyId, familyId)))
      .limit(1);
    wasGiven = rows.length > 0;
  }

  if (wasGiven) {
    if (db) {
      await db
        .delete(doseLogs)
        .where(and(eq(doseLogs.key, key), eq(doseLogs.familyId, familyId)));
    } else if (fam) {
      delete fam.doseLog[key];
    }
    return { given: false };
  }

  const entry = { by: currentUser, at: new Date().toISOString() };
  if (db) {
    await db.insert(doseLogs).values({
      key,
      familyId,
      medId,
      givenBy: entry.by,
      givenAt: entry.at,
    });
  } else if (fam) {
    fam.doseLog[key] = entry;
  }

  const [actorName, kidName] = await Promise.all([
    resolveMemberName(familyId, currentUser),
    resolveMemberName(familyId, kidId),
  ]);
  await recordActivity(
    familyId,
    `${actorName} gave ${kidName} ${medName}`,
    `${fmtTime(time)} dose`,
    currentUser
  );
  return { given: true, entry };
}

export async function saveChildProfileRecord(
  familyId: string,
  kidId: MemberId,
  data: ChildProfile,
  currentUser: MemberId
): Promise<ChildProfile> {
  const db = await getReadyDb();
  if (db) {
    const existing = await db
      .select()
      .from(childProfiles)
      .where(
        and(eq(childProfiles.kidId, kidId), eq(childProfiles.familyId, familyId))
      )
      .limit(1);
    if (existing.length > 0) {
      await db
        .update(childProfiles)
        .set({
          allergies: data.allergies,
          doctor: data.doctor,
          contact: data.contact,
          notes: data.notes,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(childProfiles.kidId, kidId),
            eq(childProfiles.familyId, familyId)
          )
        );
    } else {
      await db.insert(childProfiles).values({
        kidId,
        familyId,
        allergies: data.allergies,
        doctor: data.doctor,
        contact: data.contact,
        notes: data.notes,
      });
    }
  } else {
    const fam = getMemoryStore().families.get(familyId);
    if (fam) fam.profiles[kidId] = data;
  }

  const [actorName, kidName] = await Promise.all([
    resolveMemberName(familyId, currentUser),
    resolveMemberName(familyId, kidId),
  ]);
  await recordActivity(
    familyId,
    `${actorName} updated ${kidName}'s care info`,
    null,
    currentUser
  );
  return data;
}

/* ---------------- Family Wall Posts, Reactions & Comments ---------------- */

export async function createPostRecord(
  familyId: string,
  postInput: { type: string; content: string; images: string[]; id?: string },
  currentUser: MemberId
): Promise<WallPost> {
  const now = new Date();
  const nowIso = now.toISOString();
  const full: WallPost = {
    id: postInput.id || uid("pt"),
    author: currentUser,
    type: postInput.type || "Update",
    content: postInput.content || "",
    images: postInput.images || [],
    createdAt: nowIso,
    reactions: {},
    comments: [],
  };

  const db = await getReadyDb();
  if (db) {
    await db.insert(posts).values({
      id: full.id,
      familyId,
      author: full.author,
      type: full.type,
      content: full.content,
      images: full.images,
      createdAtLabel: nowIso,
      createdAt: now,
    });
  } else {
    const fam = getMemoryStore().families.get(familyId);
    if (fam) fam.posts = [full, ...fam.posts];
  }

  const actorName = await resolveMemberName(familyId, currentUser);
  await recordActivity(
    familyId,
    `${actorName} posted a Family Update`,
    null,
    currentUser
  );

  // Notify other family members about the new Family Wall post
  const titleByType: Record<string, string> = {
    Announcement: `${actorName} shared an Announcement`,
    Reminder: `${actorName} posted a Reminder`,
    Change: `${actorName} shared a Schedule Change`,
    Photo: `${actorName} shared ${
      full.images.length > 1 ? "photos" : "a photo"
    } on the Family Wall`,
  };
  const notifTitle =
    titleByType[full.type] || `${actorName} posted on the Family Wall`;
  const trimmedContent = full.content.trim();
  const notifBody = trimmedContent
    ? trimmedContent.length > 120
      ? `${trimmedContent.slice(0, 117)}…`
      : trimmedContent
    : full.images.length > 0
      ? `Shared ${full.images.length} photo${full.images.length === 1 ? "" : "s"}`
      : "Tap to view on the Family Wall";

  await dispatchFamilyNotification({
    familyId,
    actorId: currentUser,
    category: "wall_post",
    title: notifTitle,
    body: notifBody,
    target: { tab: "wall", entityId: full.id },
  });

  return full;
}

export async function deletePostRecord(
  familyId: string,
  postId: string,
  actorId: MemberId
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const db = await getReadyDb();
  if (db) {
    const rows = await db
      .select()
      .from(posts)
      .where(and(eq(posts.id, postId), eq(posts.familyId, familyId)))
      .limit(1);
    const existing = rows[0];
    if (!existing) {
      return { ok: false, error: "Post not found.", status: 404 };
    }
    if (existing.author !== actorId) {
      return {
        ok: false,
        error: "Only the person who posted this can delete it.",
        status: 403,
      };
    }

    await db
      .delete(posts)
      .where(and(eq(posts.id, postId), eq(posts.familyId, familyId)));
    await db
      .delete(notifications)
      .where(
        and(
          eq(notifications.familyId, familyId),
          eq(notifications.targetEntityId, postId)
        )
      );
    return { ok: true };
  }

  const fam = getMemoryStore().families.get(familyId);
  if (!fam) {
    return { ok: false, error: "Family not found.", status: 404 };
  }
  const existing = fam.posts.find((p) => p.id === postId);
  if (!existing) {
    return { ok: false, error: "Post not found.", status: 404 };
  }
  if (existing.author !== actorId) {
    return {
      ok: false,
      error: "Only the person who posted this can delete it.",
      status: 403,
    };
  }
  fam.posts = fam.posts.filter((p) => p.id !== postId);
  fam.notifications = (fam.notifications || []).filter(
    (n) => n.target?.entityId !== postId
  );
  return { ok: true };
}

export async function togglePostReactionRecord(
  familyId: string,
  postId: string,
  emoji: string,
  currentUser: MemberId
): Promise<void> {
  const db = await getReadyDb();
  if (db) {
    const postRows = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.id, postId), eq(posts.familyId, familyId)))
      .limit(1);
    if (!postRows[0]) return;

    const existing = await db
      .select()
      .from(postReactions)
      .where(
        and(
          eq(postReactions.postId, postId),
          eq(postReactions.emoji, emoji),
          eq(postReactions.memberId, currentUser)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .delete(postReactions)
        .where(eq(postReactions.id, existing[0].id));
    } else {
      await db.insert(postReactions).values({
        postId,
        emoji,
        memberId: currentUser,
      });
    }
    return;
  }

  const fam = getMemoryStore().families.get(familyId);
  if (fam) {
    fam.posts = fam.posts.map((p) => {
      if (p.id !== postId) return p;
      const cur = p.reactions[emoji] || [];
      const has = cur.includes(currentUser);
      const next = has
        ? cur.filter((u) => u !== currentUser)
        : [...cur, currentUser];
      return { ...p, reactions: { ...p.reactions, [emoji]: next } };
    });
  }
}

export async function addPostCommentRecord(
  familyId: string,
  postId: string,
  text: string,
  currentUser: MemberId,
  commentId?: string
): Promise<PostComment | null> {
  const now = new Date();
  const nowIso = now.toISOString();
  const comment: PostComment = {
    id: commentId || uid("cm"),
    by: currentUser,
    text,
    at: nowIso,
  };

  let postAuthor: MemberId | null = null;
  const db = await getReadyDb();

  if (db) {
    const postRows = await db
      .select()
      .from(posts)
      .where(and(eq(posts.id, postId), eq(posts.familyId, familyId)))
      .limit(1);
    if (!postRows[0]) return null;
    postAuthor = postRows[0].author;

    await db.insert(postComments).values({
      id: comment.id,
      postId,
      by: comment.by,
      text: comment.text,
      at: nowIso,
      createdAt: now,
    });
  } else {
    const fam = getMemoryStore().families.get(familyId);
    if (!fam) return null;
    fam.posts = fam.posts.map((p) => {
      if (p.id !== postId) return p;
      postAuthor = p.author;
      return { ...p, comments: [...(p.comments || []), comment] };
    });
  }

  if (postAuthor) {
    const [actorName, authorName] = await Promise.all([
      resolveMemberName(familyId, currentUser),
      resolveMemberName(familyId, postAuthor),
    ]);
    await recordActivity(
      familyId,
      `${actorName} commented on ${authorName}'s post`,
      null,
      currentUser
    );
  }
  return comment;
}

export async function deletePostCommentRecord(
  familyId: string,
  postId: string,
  commentId: string,
  actorId: MemberId
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const db = await getReadyDb();
  if (db) {
    const postRows = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.id, postId), eq(posts.familyId, familyId)))
      .limit(1);
    if (!postRows[0]) {
      return { ok: false, error: "Post not found.", status: 404 };
    }

    const commentRows = await db
      .select()
      .from(postComments)
      .where(
        and(eq(postComments.id, commentId), eq(postComments.postId, postId))
      )
      .limit(1);
    const existing = commentRows[0];
    if (!existing) {
      return { ok: false, error: "Comment not found.", status: 404 };
    }
    if (existing.by !== actorId) {
      return {
        ok: false,
        error: "Only the person who wrote this comment can delete it.",
        status: 403,
      };
    }

    await db
      .delete(postComments)
      .where(
        and(eq(postComments.id, commentId), eq(postComments.postId, postId))
      );
    return { ok: true };
  }

  const fam = getMemoryStore().families.get(familyId);
  if (!fam) {
    return { ok: false, error: "Family not found.", status: 404 };
  }
  const post = fam.posts.find((p) => p.id === postId);
  if (!post) {
    return { ok: false, error: "Post not found.", status: 404 };
  }
  const existing = (post.comments || []).find((c) => c.id === commentId);
  if (!existing) {
    return { ok: false, error: "Comment not found.", status: 404 };
  }
  if (existing.by !== actorId) {
    return {
      ok: false,
      error: "Only the person who wrote this comment can delete it.",
      status: 403,
    };
  }
  fam.posts = fam.posts.map((p) =>
    p.id === postId
      ? { ...p, comments: (p.comments || []).filter((c) => c.id !== commentId) }
      : p
  );
  return { ok: true };
}

/* ---------------- Extensible Notifications ---------------- */

export interface DispatchNotificationInput {
  familyId: string;
  actorId: MemberId;
  category: NotificationCategory;
  title: string;
  body?: string;
  target: NotificationTarget;
  /** Optional explicit recipients. Defaults to all family members except actorId. */
  recipientIds?: MemberId[];
}

export async function dispatchFamilyNotification(
  input: DispatchNotificationInput
): Promise<FamilyNotification[]> {
  const { familyId, actorId, category, title, target } = input;
  const body = input.body || "";
  const now = new Date();
  const createdIso = now.toISOString();
  const db = await getReadyDb();

  let targetRecipients: MemberId[];

  if (input.recipientIds) {
    targetRecipients = [...new Set(input.recipientIds)].filter(
      (id) => id && id !== actorId
    );
  } else if (db) {
    const memberRows = await db
      .select({ id: members.id, isChild: members.isChild })
      .from(members)
      .where(eq(members.familyId, familyId));
    targetRecipients = memberRows
      .filter((m) => !m.isChild && m.id !== actorId)
      .map((m) => m.id);
  } else {
    const fam = getMemoryStore().families.get(familyId);
    targetRecipients = (fam?.members || [])
      .filter((m) => !m.isChild && m.id !== actorId)
      .map((m) => m.id);
  }

  if (targetRecipients.length === 0) return [];

  const created: FamilyNotification[] = targetRecipients.map((recipientId) => ({
    id: uid("nt"),
    familyId,
    recipientId,
    actorId,
    category,
    title,
    body,
    target: {
      tab: target.tab,
      entityId: target.entityId ?? null,
    },
    read: false,
    createdAt: createdIso,
  }));

  if (db) {
    try {
      await db.insert(notifications).values(
        created.map((n) => ({
          id: n.id,
          familyId: n.familyId,
          recipientId: n.recipientId,
          actorId: n.actorId,
          category: n.category,
          title: n.title,
          body: n.body,
          targetTab: n.target.tab,
          targetEntityId: n.target.entityId ?? null,
          read: false,
          createdAt: now,
        }))
      );
    } catch (err) {
      console.warn("Failed saving notifications to Neon DB:", err);
    }
    return created;
  }

  const fam = getMemoryStore().families.get(familyId);
  if (fam) {
    fam.notifications = [...created, ...(fam.notifications || [])].slice(
      0,
      200
    );
  }
  return created;
}

export async function getNotificationsForMember(
  familyId: string,
  recipientId: MemberId,
  limit = 30
): Promise<FamilyNotification[]> {
  const db = await getReadyDb();
  if (db) {
    try {
      const rows = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.familyId, familyId),
            eq(notifications.recipientId, recipientId)
          )
        )
        .orderBy(desc(notifications.createdAt))
        .limit(limit);

      return rows.map((n) => ({
        id: n.id,
        familyId: n.familyId,
        recipientId: n.recipientId,
        actorId: n.actorId,
        category: n.category as NotificationCategory,
        title: n.title,
        body: n.body,
        target: {
          tab: (n.targetTab === "tasks" || n.targetTab === "events"
            ? "plan"
            : n.targetTab || "wall") as AppTabId,
          entityId: n.targetEntityId || null,
        },
        read: n.read,
        createdAt: n.createdAt.toISOString(),
      }));
    } catch (err) {
      console.warn("Error fetching notifications from Neon DB:", err);
      return [];
    }
  }

  const fam = getMemoryStore().families.get(familyId);
  if (!fam) return [];
  return (fam.notifications || [])
    .filter((n) => n.recipientId === recipientId)
    .slice(0, limit);
}

export async function getPostsForFamily(familyId: string): Promise<WallPost[]> {
  const db = await getReadyDb();
  if (db) {
    try {
      const postRows = await db
        .select()
        .from(posts)
        .where(eq(posts.familyId, familyId))
        .orderBy(desc(posts.createdAt));

      const postIds = postRows.map((p) => p.id);
      const [commentRows, reactionRows] =
        postIds.length > 0
          ? await Promise.all([
              db
                .select()
                .from(postComments)
                .where(inArray(postComments.postId, postIds)),
              db
                .select()
                .from(postReactions)
                .where(inArray(postReactions.postId, postIds)),
            ])
          : [[], []];

      return postRows.map((p) => {
        const pComments = commentRows
          .filter((c) => c.postId === p.id)
          .sort(
            (a, b) =>
              (a.createdAt ? a.createdAt.getTime() : 0) -
              (b.createdAt ? b.createdAt.getTime() : 0)
          )
          .map((c) => ({
            id: c.id,
            by: c.by,
            text: c.text,
            at:
              c.createdAt instanceof Date && !Number.isNaN(c.createdAt.getTime())
                ? c.createdAt.toISOString()
                : c.at,
          }));

        const reactions: Record<string, MemberId[]> = {
          "❤️": [],
          "👍": [],
          "😂": [],
        };
        for (const r of reactionRows.filter((row) => row.postId === p.id)) {
          if (!reactions[r.emoji]) reactions[r.emoji] = [];
          if (!reactions[r.emoji].includes(r.memberId)) {
            reactions[r.emoji].push(r.memberId);
          }
        }

        return {
          id: p.id,
          author: p.author,
          type: p.type,
          content: p.content,
          images: p.images || [],
          createdAt:
            p.createdAt instanceof Date && !Number.isNaN(p.createdAt.getTime())
              ? p.createdAt.toISOString()
              : p.createdAtLabel,
          reactions,
          comments: pComments,
        };
      });
    } catch (err) {
      console.warn("Error fetching posts from Neon DB:", err);
      return [];
    }
  }

  const fam = getMemoryStore().families.get(familyId);
  return fam?.posts || [];
}

export async function getMembersForFamily(familyId: string): Promise<Member[]> {
  const db = await getReadyDb();
  if (db) {
    try {
      const rows = await db
        .select()
        .from(members)
        .where(eq(members.familyId, familyId));
      return rows.map(toPublicMember);
    } catch (err) {
      console.warn("Error fetching members from Neon DB:", err);
      return [];
    }
  }

  const fam = getMemoryStore().families.get(familyId);
  return (fam?.members || []).map(toPublicMember);
}

export async function markNotificationReadRecord(
  familyId: string,
  recipientId: MemberId,
  notificationId: string
): Promise<void> {
  const db = await getReadyDb();
  if (db) {
    await db
      .update(notifications)
      .set({ read: true })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.familyId, familyId),
          eq(notifications.recipientId, recipientId)
        )
      );
    return;
  }

  const fam = getMemoryStore().families.get(familyId);
  if (fam && fam.notifications) {
    fam.notifications = fam.notifications.map((n) =>
      n.id === notificationId && n.recipientId === recipientId
        ? { ...n, read: true }
        : n
    );
  }
}

export async function markAllNotificationsReadRecord(
  familyId: string,
  recipientId: MemberId
): Promise<void> {
  const db = await getReadyDb();
  if (db) {
    await db
      .update(notifications)
      .set({ read: true })
      .where(
        and(
          eq(notifications.familyId, familyId),
          eq(notifications.recipientId, recipientId)
        )
      );
    return;
  }

  const fam = getMemoryStore().families.get(familyId);
  if (fam && fam.notifications) {
    fam.notifications = fam.notifications.map((n) =>
      n.recipientId === recipientId ? { ...n, read: true } : n
    );
  }
}

export async function clearNotificationsRecord(
  familyId: string,
  recipientId: MemberId
): Promise<void> {
  const db = await getReadyDb();
  if (db) {
    await db
      .delete(notifications)
      .where(
        and(
          eq(notifications.familyId, familyId),
          eq(notifications.recipientId, recipientId)
        )
      );
    return;
  }

  const fam = getMemoryStore().families.get(familyId);
  if (fam && fam.notifications) {
    fam.notifications = fam.notifications.filter(
      (n) => n.recipientId !== recipientId
    );
  }
}

/* ---------------- Turn-Based Games ---------------- */

function mapDbGameRow(g: typeof games.$inferSelect): FamilyGame {
  const toIso = (d: Date | string | null | undefined): string => {
    if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString();
    if (typeof d === "string" && d.trim()) return d;
    return new Date().toISOString();
  };
  return {
    id: g.id,
    familyId: g.familyId,
    gameType: g.gameType as GameTypeId,
    mode: (g.mode === "pass_and_play" ? "pass_and_play" : "remote") as GameMode,
    status: g.status as GameStatus,
    challengerId: g.challengerId,
    opponentId: g.opponentId,
    players: g.players,
    currentTurnId: g.currentTurnId || null,
    winnerId: g.winnerId || null,
    outcome: (g.outcome as GameOutcome) || null,
    state: g.state || {},
    moves: g.moves || [],
    rematchOfId: g.rematchOfId || null,
    createdAt: toIso(g.createdAt),
    updatedAt: toIso(g.updatedAt),
    completedAt: g.completedAt ? toIso(g.completedAt) : null,
  };
}

export async function getGamesForFamily(
  familyId: string,
  limit = 100
): Promise<FamilyGame[]> {
  const db = await getReadyDb();
  if (db) {
    try {
      const rows = await db
        .select()
        .from(games)
        .where(eq(games.familyId, familyId))
        .orderBy(desc(games.updatedAt))
        .limit(limit);
      return settleExpiredGames(rows.map(mapDbGameRow));
    } catch (err) {
      console.warn("Error fetching games from Neon DB:", err);
      return [];
    }
  }

  const fam = getMemoryStore().families.get(familyId);
  return settleExpiredGames((fam?.games || []).slice(0, limit));
}

async function settleExpiredGames(list: FamilyGame[]): Promise<FamilyGame[]> {
  const out: FamilyGame[] = [];
  for (const g of list) {
    if (g.status === "active" && getGameDefinition(g.gameType)?.resolveTimeout) {
      out.push((await settleExpiredGame(g)) || g);
    } else {
      out.push(g);
    }
  }
  return out;
}

async function getGameById(
  familyId: string,
  gameId: string
): Promise<FamilyGame | null> {
  const db = await getReadyDb();
  if (db) {
    const rows = await db
      .select()
      .from(games)
      .where(and(eq(games.id, gameId), eq(games.familyId, familyId)))
      .limit(1);
    return rows[0] ? mapDbGameRow(rows[0]) : null;
  }

  const fam = getMemoryStore().families.get(familyId);
  return (fam?.games || []).find((g) => g.id === gameId) || null;
}

export interface CreateGameInput {
  gameType: GameTypeId | string;
  opponentId: MemberId;
  mode?: GameMode;
  rematchOfId?: string | null;
  options?: Record<string, unknown>;
}

export async function createGameRecord(
  familyId: string,
  actorId: MemberId,
  input: CreateGameInput
): Promise<
  | { ok: true; game: FamilyGame }
  | { ok: false; error: string; status: number }
> {
  const gameDef = getGameDefinition(input.gameType);
  if (!gameDef) {
    return { ok: false, error: "Unsupported game type.", status: 400 };
  }

  const mode: GameMode =
    input.mode === "pass_and_play" ? "pass_and_play" : "remote";
  if (mode === "pass_and_play" && gameDef.remoteOnly) {
    return {
      ok: false,
      error: `${gameDef.name} is a live race — send a challenge instead of Pass & Play.`,
      status: 400,
    };
  }
  const opponentId = (input.opponentId || "").trim();
  if (!opponentId) {
    return { ok: false, error: "Please choose an opponent.", status: 400 };
  }
  if (opponentId === actorId) {
    return {
      ok: false,
      error: "Choose another family member to play against.",
      status: 400,
    };
  }

  const familyMembers = await getMembersForFamily(familyId);
  const actor = familyMembers.find((m) => m.id === actorId);
  const opponent = familyMembers.find((m) => m.id === opponentId);
  if (!actor || !opponent) {
    return {
      ok: false,
      error: "Selected player was not found in your family.",
      status: 404,
    };
  }

  if (mode === "remote" && !opponent.hasAccount) {
    return {
      ok: false,
      error: `${opponent.name} doesn't have their own sign-in account yet. Try Pass & Play on this device instead!`,
      status: 400,
    };
  }

  let players: [MemberId, MemberId] = [actorId, opponentId];
  let rematchOfId: string | null = null;
  let resolvedOptions = input.options;
  if (input.rematchOfId) {
    const prev = await getGameById(familyId, input.rematchOfId);
    if (
      prev &&
      prev.gameType === gameDef.id &&
      prev.players.includes(actorId) &&
      prev.players.includes(opponentId)
    ) {
      rematchOfId = prev.id;
      // Alternate who goes first on rematches for fairness
      players = [prev.players[1], prev.players[0]];
      if (!resolvedOptions && gameDef.extractRematchOptions) {
        resolvedOptions = gameDef.extractRematchOptions(prev.state);
      }
    }
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const initialState = gameDef.createInitialState(players, resolvedOptions);
  const isPassAndPlay = mode === "pass_and_play";
  const newGame: FamilyGame = {
    id: uid("gm"),
    familyId,
    gameType: gameDef.id,
    mode,
    status: isPassAndPlay ? "active" : "pending",
    challengerId: actorId,
    opponentId,
    players,
    currentTurnId: isPassAndPlay ? players[0] : null,
    winnerId: null,
    outcome: null,
    state: initialState,
    moves: [],
    rematchOfId,
    createdAt: nowIso,
    updatedAt: nowIso,
    completedAt: null,
  };

  const db = await getReadyDb();
  if (db) {
    await db.insert(games).values({
      id: newGame.id,
      familyId: newGame.familyId,
      gameType: newGame.gameType,
      mode: newGame.mode,
      status: newGame.status,
      challengerId: newGame.challengerId,
      opponentId: newGame.opponentId,
      players: newGame.players,
      currentTurnId: newGame.currentTurnId,
      winnerId: null,
      outcome: null,
      state: newGame.state,
      moves: newGame.moves,
      rematchOfId: newGame.rematchOfId ?? null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    });
  } else {
    const fam = getMemoryStore().families.get(familyId);
    if (!fam) {
      return { ok: false, error: "Family not found.", status: 404 };
    }
    fam.games = [newGame, ...(fam.games || [])].slice(0, 150);
  }

  if (mode === "remote") {
    await dispatchFamilyNotification({
      familyId,
      actorId,
      recipientIds: [opponentId],
      category: "game",
      title: rematchOfId
        ? `${actor.name} wants a ${gameDef.name} rematch!`
        : `${actor.name} challenged you to ${gameDef.name}!`,
      body: "Tap to accept or decline the game request.",
      target: {
        tab: "games",
        entityId: newGame.id,
      },
    });
    await recordActivity(
      familyId,
      `${actor.name} challenged ${opponent.name} to ${gameDef.name}`,
      rematchOfId ? "Rematch request" : "Game invite",
      actorId
    );
  }

  return { ok: true, game: newGame };
}

export async function respondToGameInviteRecord(
  familyId: string,
  gameId: string,
  actorId: MemberId,
  decision: "accept" | "decline" | "cancel"
): Promise<
  | { ok: true; game: FamilyGame }
  | { ok: false; error: string; status: number }
> {
  const existing = await getGameById(familyId, gameId);
  if (!existing) {
    return { ok: false, error: "Game not found.", status: 404 };
  }
  if (existing.status !== "pending") {
    return {
      ok: false,
      error: "This game invitation is no longer pending.",
      status: 409,
    };
  }

  const gameDef = getGameDefinition(existing.gameType);
  if (!gameDef) {
    return { ok: false, error: "Unsupported game type.", status: 400 };
  }

  if (decision === "cancel") {
    if (existing.challengerId !== actorId) {
      return {
        ok: false,
        error: "Only the challenger can cancel a pending invite.",
        status: 403,
      };
    }
  } else {
    if (existing.opponentId !== actorId) {
      return {
        ok: false,
        error: "Only the invited player can accept or decline this invite.",
        status: 403,
      };
    }
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const nextStatus: GameStatus =
    decision === "accept"
      ? "active"
      : decision === "decline"
        ? "declined"
        : "cancelled";
  const baseState =
    decision === "accept" &&
    (!existing.state || Object.keys(existing.state).length === 0)
      ? gameDef.createInitialState(existing.players)
      : existing.state;
  const nextState =
    decision === "accept" && gameDef.onActivate
      ? gameDef.onActivate(baseState, now)
      : baseState;
  const nextTurnId =
    decision === "accept" && !gameDef.simultaneous
      ? existing.players[0]
      : null;

  const updated: FamilyGame = {
    ...existing,
    status: nextStatus,
    currentTurnId: nextTurnId,
    state: nextState,
    updatedAt: nowIso,
  };

  const db = await getReadyDb();
  if (db) {
    const updatedRows = await db
      .update(games)
      .set({
        status: updated.status,
        currentTurnId: updated.currentTurnId,
        state: updated.state,
        updatedAt: now,
      })
      .where(
        and(
          eq(games.id, gameId),
          eq(games.familyId, familyId),
          eq(games.status, "pending")
        )
      )
      .returning({ id: games.id });
    if (updatedRows.length === 0) {
      return {
        ok: false,
        error: "This game invitation is no longer pending.",
        status: 409,
      };
    }
  } else {
    const fam = getMemoryStore().families.get(familyId);
    if (fam) {
      fam.games = [
        updated,
        ...(fam.games || []).filter((g) => g.id !== gameId),
      ];
    }
  }

  if (existing.mode === "remote" && decision !== "cancel") {
    const actorName = await resolveMemberName(familyId, actorId);
    if (decision === "accept") {
      const challengerGoesFirst = updated.currentTurnId === existing.challengerId;
      await dispatchFamilyNotification({
        familyId,
        actorId,
        recipientIds: [existing.challengerId],
        category: "game",
        title: `${actorName} accepted your ${gameDef.name} challenge!`,
        body: gameDef.simultaneous
          ? "Game on — the clock is running! Jump in now."
          : challengerGoesFirst
            ? "It's your turn to make the first move."
            : `${actorName} goes first — watch for their opening move.`,
        target: {
          tab: "games",
          entityId: updated.id,
        },
      });
    } else if (decision === "decline") {
      await dispatchFamilyNotification({
        familyId,
        actorId,
        recipientIds: [existing.challengerId],
        category: "game",
        title: `${actorName} declined your ${gameDef.name} challenge`,
        body: "Challenge another family member anytime.",
        target: {
          tab: "games",
          entityId: updated.id,
        },
      });
    }
  }

  return { ok: true, game: updated };
}

/**
 * Lazily settles a timed game whose clock has run out.
 * Returns the completed game if it was settled now (or by a concurrent request),
 * or null if the game is not expired / not timed.
 */
async function settleExpiredGame(
  game: FamilyGame
): Promise<FamilyGame | null> {
  if (game.status !== "active") return null;
  const gameDef = getGameDefinition(game.gameType);
  if (!gameDef?.resolveTimeout) return null;
  const now = new Date();
  const resolved = gameDef.resolveTimeout(game.state, game.players, now);
  if (!resolved) return null;

  const nowIso = now.toISOString();
  const settled: FamilyGame = {
    ...game,
    state: resolved.nextState,
    status: "completed",
    currentTurnId: null,
    winnerId: resolved.winnerId,
    outcome: resolved.outcome,
    updatedAt: nowIso,
    completedAt: nowIso,
  };

  const db = await getReadyDb();
  if (db) {
    const rows = await db
      .update(games)
      .set({
        state: settled.state,
        status: "completed",
        currentTurnId: null,
        winnerId: settled.winnerId,
        outcome: settled.outcome,
        updatedAt: now,
        completedAt: now,
      })
      .where(
        and(
          eq(games.id, game.id),
          eq(games.familyId, game.familyId),
          eq(games.status, "active")
        )
      )
      .returning({ id: games.id });
    if (rows.length === 0) {
      // Someone else settled/finished it first.
      return getGameById(game.familyId, game.id);
    }
  } else {
    const fam = getMemoryStore().families.get(game.familyId);
    if (fam) {
      fam.games = [
        settled,
        ...(fam.games || []).filter((g) => g.id !== game.id),
      ];
    }
  }

  if (game.mode === "remote") {
    const [p1, p2] = game.players;
    const [n1, n2] = await Promise.all([
      resolveMemberName(game.familyId, p1),
      resolveMemberName(game.familyId, p2),
    ]);
    const nameOf = (id: MemberId) => (id === p1 ? n1 : n2);
    for (const recipient of [p1, p2]) {
      const other = recipient === p1 ? p2 : p1;
      const title =
        settled.outcome === "draw"
          ? `Time's up! ${gameDef.name} ended in a draw`
          : settled.winnerId === recipient
            ? `Time's up — you won ${gameDef.name}!`
            : `Time's up! ${nameOf(settled.winnerId!)} won ${gameDef.name}`;
      await dispatchFamilyNotification({
        familyId: game.familyId,
        actorId: other,
        recipientIds: [recipient],
        category: "game",
        title,
        body: "Tap to see the final board or request a rematch.",
        target: { tab: "games", entityId: game.id },
      });
    }
    await recordActivity(
      game.familyId,
      settled.outcome === "draw"
        ? `${n1} & ${n2} tied in ${gameDef.name}`
        : `${nameOf(settled.winnerId!)} won ${gameDef.name} against ${nameOf(
            settled.winnerId === p1 ? p2 : p1
          )}`,
      settled.outcome === "draw" ? "Draw" : gameDef.name,
      settled.winnerId || p1
    );
  }

  return settled;
}

/** Loads one game for a viewer, settling expired timers and hiding secrets. */
export async function getGameForViewer(
  familyId: string,
  gameId: string,
  viewerId: MemberId
): Promise<FamilyGame | null> {
  let game = await getGameById(familyId, gameId);
  if (!game) return null;
  const settled = await settleExpiredGame(game);
  if (settled) game = settled;
  return sanitizeGameForViewer(game, viewerId);
}

export async function makeGameMoveRecord(
  familyId: string,
  gameId: string,
  actorId: MemberId,
  rawMove: unknown
): Promise<
  | { ok: true; game: FamilyGame }
  | { ok: false; error: string; status: number }
> {
  const MAX_ATTEMPTS = 4;
  let existing: FamilyGame | null = null;
  let movingPlayerId: MemberId = actorId;
  let result: Extract<MoveValidationResult, { ok: true }> | null = null;
  let updated: FamilyGame | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let gameDef: GameDefinition<any, any> | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    existing = await getGameById(familyId, gameId);
    if (!existing) {
      return { ok: false, error: "Game not found.", status: 404 };
    }
    gameDef = getGameDefinition(existing.gameType);
    if (!gameDef) {
      return { ok: false, error: "Unsupported game type.", status: 400 };
    }
    const simultaneous = Boolean(gameDef.simultaneous);

    if (
      existing.status !== "active" ||
      (!simultaneous && !existing.currentTurnId)
    ) {
      return {
        ok: false,
        error: "This game is not currently active.",
        status: 409,
      };
    }

    if (simultaneous || existing.mode !== "remote") {
      if (!existing.players.includes(actorId)) {
        return {
          ok: false,
          error: "You are not a player in this match.",
          status: 403,
        };
      }
    } else if (existing.currentTurnId !== actorId) {
      return { ok: false, error: "It's not your turn yet.", status: 403 };
    }

    // Timed games: settle first if the clock already ran out.
    const settled = await settleExpiredGame(existing);
    if (settled) {
      return { ok: false, error: "Time's up!", status: 409 };
    }

    movingPlayerId = simultaneous ? actorId : existing.currentTurnId!;
    const now = new Date();
    const attemptResult = gameDef.validateAndApplyMove({
      state: existing.state,
      move: rawMove,
      playerId: movingPlayerId,
      players: existing.players,
      now,
    });

    if (!attemptResult.ok) {
      return { ok: false, error: attemptResult.error, status: 400 };
    }
    result = attemptResult;

    const nowIso = now.toISOString();
    const nextMoves = [
      ...(existing.moves || []),
      { by: movingPlayerId, move: rawMove, at: nowIso },
    ];

    updated = {
      ...existing,
      state: result.nextState,
      moves: nextMoves,
      currentTurnId: result.nextTurnId,
      status: result.completed ? "completed" : "active",
      winnerId: result.winnerId,
      outcome: result.outcome,
      updatedAt: nowIso,
      completedAt: result.completed ? nowIso : null,
    };

    const db = await getReadyDb();
    if (db) {
      const conditions = [
        eq(games.id, gameId),
        eq(games.familyId, familyId),
        eq(games.status, "active"),
        sql`jsonb_array_length(${games.moves}) = ${(existing.moves || []).length}`,
      ];
      if (!simultaneous) {
        conditions.push(eq(games.currentTurnId, movingPlayerId));
      }
      const updatedRows = await db
        .update(games)
        .set({
          state: updated.state,
          moves: updated.moves,
          currentTurnId: updated.currentTurnId,
          status: updated.status,
          winnerId: updated.winnerId,
          outcome: updated.outcome,
          updatedAt: now,
          completedAt: result.completed ? now : null,
        })
        .where(and(...conditions))
        .returning({ id: games.id });
      if (updatedRows.length === 0) {
        if (simultaneous && attempt < MAX_ATTEMPTS - 1) {
          continue; // opponent moved at the same time — re-read and re-apply
        }
        return {
          ok: false,
          error: "This turn was already played. Refreshing board.",
          status: 409,
        };
      }
    } else {
      const fam = getMemoryStore().families.get(familyId);
      if (fam) {
        fam.games = [
          updated,
          ...(fam.games || []).filter((g) => g.id !== gameId),
        ];
      }
    }
    break;
  }

  if (!existing || !result || !updated || !gameDef) {
    return { ok: false, error: "Could not save move.", status: 409 };
  }

  if (existing.mode === "remote") {
    const otherPlayerId =
      existing.players[0] === movingPlayerId
        ? existing.players[1]
        : existing.players[0];
    const [moverName, otherName] = await Promise.all([
      resolveMemberName(familyId, movingPlayerId),
      resolveMemberName(familyId, otherPlayerId),
    ]);

    if (result.completed) {
      if (result.outcome === "win") {
        const winnerId = result.winnerId || movingPlayerId;
        const loserId =
          existing.players[0] === winnerId
            ? existing.players[1]
            : existing.players[0];
        const winnerName = winnerId === movingPlayerId ? moverName : otherName;
        const loserName = loserId === movingPlayerId ? moverName : otherName;
        await dispatchFamilyNotification({
          familyId,
          actorId: movingPlayerId,
          recipientIds: [otherPlayerId],
          category: "game",
          title:
            winnerId === otherPlayerId
              ? `You won ${gameDef.name}!`
              : `${winnerName} won ${gameDef.name}!`,
          body: "Tap to see the final board or request a rematch.",
          target: {
            tab: "games",
            entityId: updated.id,
          },
        });
        await recordActivity(
          familyId,
          `${winnerName} won ${gameDef.name} against ${loserName}`,
          gameDef.name,
          winnerId
        );
      } else if (result.outcome === "draw") {
        await dispatchFamilyNotification({
          familyId,
          actorId: movingPlayerId,
          recipientIds: [otherPlayerId],
          category: "game",
          title: `${gameDef.name} ended in a draw!`,
          body: `Tie game with ${moverName} — tap for a rematch.`,
          target: {
            tab: "games",
            entityId: updated.id,
          },
        });
        await recordActivity(
          familyId,
          `${moverName} & ${otherName} tied in ${gameDef.name}`,
          "Draw",
          movingPlayerId
        );
      }
    } else if (result.nextTurnId) {
      await dispatchFamilyNotification({
        familyId,
        actorId: movingPlayerId,
        recipientIds: [result.nextTurnId],
        category: "game",
        title: `Your turn in ${gameDef.name}!`,
        body: `${moverName} just made a move.`,
        target: {
          tab: "games",
          entityId: updated.id,
        },
      });
    }
  }

  return { ok: true, game: updated };
}

export async function forfeitGameRecord(
  familyId: string,
  gameId: string,
  actorId: MemberId
): Promise<
  | { ok: true; game: FamilyGame }
  | { ok: false; error: string; status: number }
> {
  const existing = await getGameById(familyId, gameId);
  if (!existing) {
    return { ok: false, error: "Game not found.", status: 404 };
  }
  if (existing.status !== "active") {
    return {
      ok: false,
      error: "Only active games can be forfeited.",
      status: 409,
    };
  }
  if (!existing.players.includes(actorId)) {
    return {
      ok: false,
      error: "You are not a player in this game.",
      status: 403,
    };
  }

  const settled = await settleExpiredGame(existing);
  if (settled) {
    return {
      ok: false,
      error: "This game has already ended.",
      status: 409,
    };
  }

  const gameDef = getGameDefinition(existing.gameType);
  const otherPlayerId =
    existing.players[0] === actorId ? existing.players[1] : existing.players[0];
  const now = new Date();
  const nowIso = now.toISOString();

  const updated: FamilyGame = {
    ...existing,
    status: "completed",
    currentTurnId: null,
    winnerId: otherPlayerId,
    outcome: "forfeit",
    updatedAt: nowIso,
    completedAt: nowIso,
  };

  const db = await getReadyDb();
  if (db) {
    const updatedRows = await db
      .update(games)
      .set({
        status: updated.status,
        currentTurnId: null,
        winnerId: updated.winnerId,
        outcome: updated.outcome,
        updatedAt: now,
        completedAt: now,
      })
      .where(
        and(
          eq(games.id, gameId),
          eq(games.familyId, familyId),
          eq(games.status, "active")
        )
      )
      .returning({ id: games.id });
    if (updatedRows.length === 0) {
      return {
        ok: false,
        error: "This game is no longer active.",
        status: 409,
      };
    }
  } else {
    const fam = getMemoryStore().families.get(familyId);
    if (fam) {
      fam.games = [
        updated,
        ...(fam.games || []).filter((g) => g.id !== gameId),
      ];
    }
  }

  if (existing.mode === "remote") {
    const actorName = await resolveMemberName(familyId, actorId);
    await dispatchFamilyNotification({
      familyId,
      actorId,
      recipientIds: [otherPlayerId],
      category: "game",
      title: `${actorName} forfeited ${gameDef?.name || "the game"}`,
      body: "You win this round! Tap to view or start a rematch.",
      target: {
        tab: "games",
        entityId: updated.id,
      },
    });
  }

  return { ok: true, game: updated };
}

