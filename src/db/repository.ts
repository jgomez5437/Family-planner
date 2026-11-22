import { and, desc, eq, inArray } from "drizzle-orm";
import { getReadyDb } from "./index";
import {
  activities,
  childProfiles,
  doseLogs,
  events,
  families,
  medications,
  members,
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
import { fmtTime, nowClock, relativeDay, uid } from "@/lib/dates";
import type {
  ActivityItem,
  ChildProfile,
  DoseLogMap,
  FamilyEvent,
  FamilyStatePayload,
  FamilyTask,
  Medication,
  Member,
  MemberId,
  MemberRole,
  PostComment,
  ProfilesMap,
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

      const doseLog: DoseLogMap = {};
      for (const d of doseRows) {
        doseLog[d.key] = { by: d.givenBy, at: d.givenAt };
      }

      const formattedEvents: FamilyEvent[] = eventRows.map((e) => ({
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
        history: e.history || [],
      }));

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
          .map((c) => ({ id: c.id, by: c.by, text: c.text, at: c.at }));

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
          createdAt: p.createdAtLabel,
          reactions,
          comments: pComments,
        };
      });

      const formattedActivity: ActivityItem[] = activityRows.map((a) => ({
        id: a.id,
        text: a.text,
        sub: a.sub,
        by: a.by,
        at: a.at,
        targetEventId: a.targetEventId,
        target: a.targetEventId
          ? formattedEvents.find((ev) => ev.id === a.targetEventId) || null
          : null,
      }));

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
  const item: ActivityItem = {
    id: uid("ac"),
    text,
    sub,
    by,
    at: "just now",
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
        at: item.at,
        targetEventId: item.targetEventId || null,
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

    const loginAccounts = famMembers.filter((m) => Boolean(m.passwordHash));
    if (target.passwordHash && loginAccounts.length <= 1) {
      return {
        ok: false,
        error: "You cannot remove the only login account in the family.",
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

  const loginAccounts = fam.members.filter((m) => Boolean(m.passwordHash));
  if (target.passwordHash && loginAccounts.length <= 1) {
    return {
      ok: false,
      error: "You cannot remove the only login account in the family.",
      status: 400,
    };
  }

  fam.members = fam.members.filter((m) => m.id !== memberId);
  delete fam.profiles[memberId];
  fam.meds = fam.meds.filter((m) => m.kidId !== memberId);
  for (const [token, sess] of store.sessions.entries()) {
    if (sess.memberId === memberId) store.sessions.delete(token);
  }
  return { ok: true };
}

/* ---------------- Events ---------------- */

export async function createEventRecord(
  familyId: string,
  ev: Partial<FamilyEvent>,
  currentUser: MemberId
): Promise<FamilyEvent> {
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
    history: ev.history || [
      { by: currentUser, at: "just now", note: "Created event" },
    ],
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

  const historyEntry = { by: currentUser, at: "just now", note, reason };

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
          note: `${historyEntry.note} (${relativeDay(occDate)} only)`,
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
  scope: "instance" | "series"
): Promise<void> {
  const [masterId, occDate] = id.includes("::") ? id.split("::") : [id, null];
  const db = await getReadyDb();
  const fam = getMemoryStore().families.get(familyId);

  if (occDate && scope === "instance") {
    if (db) {
      const rows = await db
        .select()
        .from(events)
        .where(and(eq(events.id, masterId), eq(events.familyId, familyId)))
        .limit(1);
      if (rows[0]) {
        const nextExceptions = [...(rows[0].exceptions || []), occDate];
        await db
          .update(events)
          .set({ exceptions: nextExceptions })
          .where(and(eq(events.id, masterId), eq(events.familyId, familyId)));
      }
    } else if (fam) {
      fam.events = fam.events.map((e) =>
        e.id === masterId
          ? { ...e, exceptions: [...(e.exceptions || []), occDate] }
          : e
      );
    }
  } else {
    if (db) {
      await db
        .delete(events)
        .where(and(eq(events.id, masterId), eq(events.familyId, familyId)));
    } else if (fam) {
      fam.events = fam.events.filter((e) => e.id !== masterId);
    }
  }
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

  const clock = nowClock();
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
          completedAt: nowDone ? clock : null,
        },
      },
    };
  } else {
    nowDone = !target.completed;
    updated = {
      ...target,
      completed: nowDone,
      completedBy: nowDone ? currentUser : null,
      completedAt: nowDone ? clock : null,
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
    await recordActivity(
      familyId,
      `${actorName} completed "${updated.title}"`,
      clock,
      currentUser
    );
  }
  return updated;
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

  const entry = { by: currentUser, at: nowClock() };
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
  const full: WallPost = {
    id: postInput.id || uid("pt"),
    author: currentUser,
    type: postInput.type || "Update",
    content: postInput.content || "",
    images: postInput.images || [],
    createdAt: "just now",
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
      createdAtLabel: full.createdAt,
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
  return full;
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
  const comment: PostComment = {
    id: commentId || uid("cm"),
    by: currentUser,
    text,
    at: "just now",
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
      at: comment.at,
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
