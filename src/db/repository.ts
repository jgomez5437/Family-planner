import { and, desc, eq } from "drizzle-orm";
import { getDb } from "./index";
import {
  activities,
  childProfiles,
  DEFAULT_FAMILY_ID,
  doseLogs,
  events,
  families,
  medications,
  members,
  postComments,
  postReactions,
  posts,
  tasks,
} from "./schema";
import { buildSeedState } from "./seed-data";
import type {
  ActivityItem,
  ChildProfile,
  DoseLogMap,
  FamilyEvent,
  FamilyStatePayload,
  FamilyTask,
  Medication,
  MemberId,
  PostComment,
  ProfilesMap,
  WallPost,
} from "@/types/family";
import { memberById } from "@/lib/constants";
import { fmtTime, nowClock, relativeDay, uid } from "@/lib/dates";

// Global in-memory fallback store when DATABASE_URL is not configured or reachable
declare global {
  // eslint-disable-next-line no-var
  var __familyPlannerMemoryStore: FamilyStatePayload | undefined;
}

function getMemoryStore(): FamilyStatePayload {
  if (!globalThis.__familyPlannerMemoryStore) {
    globalThis.__familyPlannerMemoryStore = buildSeedState();
  }
  return globalThis.__familyPlannerMemoryStore;
}

export async function ensureSeededInNeon(): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  try {
    const existing = await db
      .select()
      .from(families)
      .where(eq(families.id, DEFAULT_FAMILY_ID))
      .limit(1);

    if (existing.length > 0) return true;

    const seed = buildSeedState();

    await db.insert(families).values({
      id: DEFAULT_FAMILY_ID,
      name: seed.familyName,
    });

    if (seed.members.length > 0) {
      await db.insert(members).values(
        seed.members.map((m) => ({
          id: m.id,
          familyId: DEFAULT_FAMILY_ID,
          name: m.name,
          emoji: m.emoji,
          color: m.color,
          light: m.light,
          isChild: Boolean(m.isChild),
          email: m.email || null,
        }))
      );
    }

    const profileEntries = Object.entries(seed.profiles);
    if (profileEntries.length > 0) {
      await db.insert(childProfiles).values(
        profileEntries.map(([kidId, p]) => ({
          kidId,
          familyId: DEFAULT_FAMILY_ID,
          allergies: p.allergies,
          doctor: p.doctor,
          contact: p.contact,
          notes: p.notes,
        }))
      );
    }

    if (seed.meds.length > 0) {
      await db.insert(medications).values(
        seed.meds.map((m) => ({
          id: m.id,
          familyId: DEFAULT_FAMILY_ID,
          kidId: m.kidId,
          name: m.name,
          dose: m.dose,
          frequency: m.frequency,
          times: m.times,
          startDate: m.startDate,
          endDate: m.endDate,
          instructions: m.instructions,
        }))
      );
    }

    if (seed.events.length > 0) {
      await db.insert(events).values(
        seed.events.map((e) => ({
          id: e.id,
          familyId: DEFAULT_FAMILY_ID,
          title: e.title,
          description: e.description || "",
          notes: e.notes || "",
          date: e.date,
          startTime: e.startTime,
          endTime: e.endTime,
          allDay: e.allDay,
          location: e.location || "",
          category: e.category,
          participants: e.participants,
          createdBy: e.createdBy,
          recurrence: e.recurrence || null,
          reminder: e.reminder || null,
          overrides: e.overrides || {},
          exceptions: e.exceptions || [],
          history: e.history || [],
        }))
      );
    }

    if (seed.tasks.length > 0) {
      await db.insert(tasks).values(
        seed.tasks.map((t) => ({
          id: t.id,
          familyId: DEFAULT_FAMILY_ID,
          title: t.title,
          category: t.category,
          assignedTo: t.assignedTo,
          priority: t.priority,
          dueDate: t.dueDate,
          dueTime: t.dueTime || null,
          notes: t.notes || "",
          completed: t.completed,
          completedBy: t.completedBy || null,
          completedAt: t.completedAt || null,
          createdBy: t.createdBy,
          linkedEventId: t.linkedEventId || null,
          linkedEventTitle: t.linkedEventTitle || null,
          recurrence: t.recurrence || null,
          overrides: t.overrides || {},
          exceptions: t.exceptions || [],
        }))
      );
    }

    for (const post of seed.posts) {
      await db.insert(posts).values({
        id: post.id,
        familyId: DEFAULT_FAMILY_ID,
        author: post.author,
        type: post.type,
        content: post.content,
        images: post.images,
        createdAtLabel: post.createdAt,
      });

      if (post.comments?.length) {
        await db.insert(postComments).values(
          post.comments.map((c) => ({
            id: c.id,
            postId: post.id,
            by: c.by,
            text: c.text,
            at: c.at,
          }))
        );
      }

      const reactionRows: { postId: string; emoji: string; memberId: string }[] = [];
      for (const [emoji, userIds] of Object.entries(post.reactions || {})) {
        for (const memberId of userIds) {
          reactionRows.push({ postId: post.id, emoji, memberId });
        }
      }
      if (reactionRows.length > 0) {
        await db.insert(postReactions).values(reactionRows);
      }
    }

    if (seed.activity.length > 0) {
      await db.insert(activities).values(
        seed.activity.map((a) => ({
          id: a.id,
          familyId: DEFAULT_FAMILY_ID,
          text: a.text,
          sub: a.sub || null,
          by: a.by,
          at: a.at,
          targetEventId: a.targetEventId || null,
        }))
      );
    }

    return true;
  } catch (err) {
    console.warn("Neon DB not ready or unreachable, falling back to memory store:", err);
    return false;
  }
}

export async function getFamilyState(): Promise<FamilyStatePayload> {
  const db = getDb();
  if (!db || !(await ensureSeededInNeon())) {
    return getMemoryStore();
  }

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
      commentRows,
      reactionRows,
      activityRows,
    ] = await Promise.all([
      db.select().from(families).where(eq(families.id, DEFAULT_FAMILY_ID)),
      db.select().from(members).where(eq(members.familyId, DEFAULT_FAMILY_ID)),
      db.select().from(childProfiles).where(eq(childProfiles.familyId, DEFAULT_FAMILY_ID)),
      db.select().from(events).where(eq(events.familyId, DEFAULT_FAMILY_ID)),
      db.select().from(tasks).where(eq(tasks.familyId, DEFAULT_FAMILY_ID)),
      db.select().from(medications).where(eq(medications.familyId, DEFAULT_FAMILY_ID)),
      db.select().from(doseLogs).where(eq(doseLogs.familyId, DEFAULT_FAMILY_ID)),
      db
        .select()
        .from(posts)
        .where(eq(posts.familyId, DEFAULT_FAMILY_ID))
        .orderBy(desc(posts.createdAt)),
      db.select().from(postComments),
      db.select().from(postReactions),
      db
        .select()
        .from(activities)
        .where(eq(activities.familyId, DEFAULT_FAMILY_ID))
        .orderBy(desc(activities.createdAt))
        .limit(20),
    ]);

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

      const reactions: Record<string, MemberId[]> = { "❤️": [], "👍": [], "😂": [] };
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
      familyName: familyRows[0]?.name || "The Martinez Family",
      members: memberRows.map((m) => ({
        id: m.id,
        name: m.name,
        emoji: m.emoji,
        color: m.color,
        light: m.light,
        isChild: m.isChild,
        email: m.email,
      })),
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
    console.warn("Error reading from Neon DB, falling back to memory store:", err);
    return getMemoryStore();
  }
}

export async function recordActivity(
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

  const store = getMemoryStore();
  store.activity = [item, ...store.activity].slice(0, 20);

  const db = getDb();
  if (db) {
    try {
      await db.insert(activities).values({
        id: item.id,
        familyId: DEFAULT_FAMILY_ID,
        text: item.text,
        sub: item.sub || null,
        by: item.by,
        at: item.at,
        targetEventId: item.targetEventId || null,
      });
    } catch (e) {
      console.warn("Failed to insert activity into Neon:", e);
    }
  }
  return item;
}

export async function updateFamilyName(name: string): Promise<string> {
  const trimmed = name.trim();
  const store = getMemoryStore();
  store.familyName = trimmed;

  const db = getDb();
  if (db) {
    try {
      await db
        .update(families)
        .set({ name: trimmed, updatedAt: new Date() })
        .where(eq(families.id, DEFAULT_FAMILY_ID));
    } catch (e) {
      console.warn("Failed to update familyName in Neon:", e);
    }
  }
  return trimmed;
}

export async function createEventRecord(
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
    history: ev.history || [{ by: currentUser, at: "just now", note: "Created event" }],
  };

  const store = getMemoryStore();
  store.events.push(full);

  const db = getDb();
  if (db) {
    try {
      await db.insert(events).values({
        id: full.id,
        familyId: DEFAULT_FAMILY_ID,
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
    } catch (e) {
      console.warn("Failed to insert event into Neon:", e);
    }
  }

  await recordActivity(
    `${memberById(currentUser).name} added "${full.title}"`,
    null,
    currentUser,
    full
  );
  return full;
}

export async function updateEventRecord(
  id: string,
  field: string,
  value: string,
  reason: string,
  scope: "instance" | "series",
  currentUser: MemberId
): Promise<FamilyEvent | null> {
  const [masterId, occDate] = id.includes("::") ? id.split("::") : [id, null];
  const store = getMemoryStore();
  const db = getDb();

  let target = store.events.find((e) => e.id === masterId);
  if (db) {
    try {
      const rows = await db.select().from(events).where(eq(events.id, masterId)).limit(1);
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
    } catch (e) {
      console.warn("Failed reading event from Neon:", e);
    }
  }

  if (!target) return null;

  const isRecurring = Boolean(target.recurrence);
  const editingJustThisOne = Boolean(isRecurring && occDate && scope === "instance");

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
        { ...historyEntry, note: `${historyEntry.note} (${relativeDay(occDate)} only)` },
      ],
    };
  } else {
    patchedMaster = {
      ...target,
      [field]: value,
      history: [...(target.history || []), historyEntry],
    };
  }

  store.events = store.events.map((e) => (e.id === masterId ? patchedMaster : e));

  if (db) {
    try {
      await db
        .update(events)
        .set({
          startTime: patchedMaster.startTime,
          location: patchedMaster.location,
          overrides: patchedMaster.overrides || {},
          history: patchedMaster.history,
        })
        .where(eq(events.id, masterId));
    } catch (e) {
      console.warn("Failed updating event in Neon:", e);
    }
  }

  const sub = field === "startTime" ? fmtTime(value) : field === "location" ? value : null;
  await recordActivity(
    `${memberById(currentUser).name} changed "${patchedMaster.title}"`,
    sub,
    currentUser,
    patchedMaster
  );

  return patchedMaster;
}

export async function deleteEventRecord(
  id: string,
  scope: "instance" | "series"
): Promise<void> {
  const [masterId, occDate] = id.includes("::") ? id.split("::") : [id, null];
  const store = getMemoryStore();
  const db = getDb();

  if (occDate && scope === "instance") {
    store.events = store.events.map((e) =>
      e.id === masterId ? { ...e, exceptions: [...(e.exceptions || []), occDate] } : e
    );
    if (db) {
      try {
        const rows = await db.select().from(events).where(eq(events.id, masterId)).limit(1);
        if (rows[0]) {
          const nextExceptions = [...(rows[0].exceptions || []), occDate];
          await db
            .update(events)
            .set({ exceptions: nextExceptions })
            .where(eq(events.id, masterId));
        }
      } catch (e) {
        console.warn("Failed updating event exceptions in Neon:", e);
      }
    }
  } else {
    store.events = store.events.filter((e) => e.id !== masterId);
    if (db) {
      try {
        await db.delete(events).where(eq(events.id, masterId));
      } catch (e) {
        console.warn("Failed deleting event from Neon:", e);
      }
    }
  }
}

export async function createTaskRecord(
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

  const store = getMemoryStore();
  store.tasks.push(full);

  const db = getDb();
  if (db) {
    try {
      await db.insert(tasks).values({
        id: full.id,
        familyId: DEFAULT_FAMILY_ID,
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
    } catch (e) {
      console.warn("Failed inserting task into Neon:", e);
    }
  }

  await recordActivity(
    `${memberById(currentUser).name} added "${full.title}"`,
    null,
    currentUser
  );
  return full;
}

export async function toggleTaskRecord(
  id: string,
  currentUser: MemberId
): Promise<FamilyTask | null> {
  const [masterId, occDate] = id.includes("::") ? id.split("::") : [id, null];
  const store = getMemoryStore();
  const db = getDb();

  let target = store.tasks.find((t) => t.id === masterId);
  if (db) {
    try {
      const rows = await db.select().from(tasks).where(eq(tasks.id, masterId)).limit(1);
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
    } catch (e) {
      console.warn("Failed reading task from Neon:", e);
    }
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

  store.tasks = store.tasks.map((t) => (t.id === masterId ? updated : t));

  if (db) {
    try {
      await db
        .update(tasks)
        .set({
          completed: updated.completed,
          completedBy: updated.completedBy || null,
          completedAt: updated.completedAt || null,
          overrides: updated.overrides || {},
        })
        .where(eq(tasks.id, masterId));
    } catch (e) {
      console.warn("Failed updating task in Neon:", e);
    }
  }

  if (nowDone) {
    await recordActivity(
      `${memberById(currentUser).name} completed "${updated.title}"`,
      clock,
      currentUser
    );
  }
  return updated;
}

export async function saveMedicationRecord(
  med: Medication,
  isNew: boolean,
  currentUser: MemberId
): Promise<Medication> {
  const store = getMemoryStore();
  if (isNew) {
    store.meds.push(med);
  } else {
    store.meds = store.meds.map((m) => (m.id === med.id ? med : m));
  }

  const db = getDb();
  if (db) {
    try {
      if (isNew) {
        await db.insert(medications).values({
          id: med.id,
          familyId: DEFAULT_FAMILY_ID,
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
          .where(eq(medications.id, med.id));
      }
    } catch (e) {
      console.warn("Failed saving medication in Neon:", e);
    }
  }

  await recordActivity(
    `${memberById(currentUser).name} ${isNew ? "added" : "changed"} ${med.name} for ${memberById(med.kidId).name}`,
    med.dose,
    currentUser
  );
  return med;
}

export async function deleteMedicationRecord(id: string): Promise<void> {
  const store = getMemoryStore();
  store.meds = store.meds.filter((m) => m.id !== id);

  const db = getDb();
  if (db) {
    try {
      await db.delete(medications).where(eq(medications.id, id));
    } catch (e) {
      console.warn("Failed deleting medication in Neon:", e);
    }
  }
}

export async function toggleDoseRecord(
  key: string,
  medId: string,
  kidId: MemberId,
  medName: string,
  time: string,
  currentUser: MemberId
): Promise<{ given: boolean; entry?: { by: MemberId; at: string } }> {
  const store = getMemoryStore();
  const db = getDb();

  const existing = store.doseLog[key];
  let wasGiven = Boolean(existing);

  if (db) {
    try {
      const rows = await db.select().from(doseLogs).where(eq(doseLogs.key, key)).limit(1);
      wasGiven = rows.length > 0;
    } catch (e) {
      console.warn("Failed checking doseLog in Neon:", e);
    }
  }

  if (wasGiven) {
    delete store.doseLog[key];
    if (db) {
      try {
        await db.delete(doseLogs).where(eq(doseLogs.key, key));
      } catch (e) {
        console.warn("Failed deleting doseLog in Neon:", e);
      }
    }
    return { given: false };
  }

  const entry = { by: currentUser, at: nowClock() };
  store.doseLog[key] = entry;

  if (db) {
    try {
      await db.insert(doseLogs).values({
        key,
        familyId: DEFAULT_FAMILY_ID,
        medId,
        givenBy: entry.by,
        givenAt: entry.at,
      });
    } catch (e) {
      console.warn("Failed inserting doseLog in Neon:", e);
    }
  }

  const kidName = memberById(kidId).name;
  await recordActivity(
    `${memberById(currentUser).name} gave ${kidName} ${medName}`,
    `${fmtTime(time)} dose`,
    currentUser
  );
  return { given: true, entry };
}

export async function saveChildProfileRecord(
  kidId: MemberId,
  data: ChildProfile,
  currentUser: MemberId
): Promise<ChildProfile> {
  const store = getMemoryStore();
  store.profiles[kidId] = data;

  const db = getDb();
  if (db) {
    try {
      const existing = await db
        .select()
        .from(childProfiles)
        .where(eq(childProfiles.kidId, kidId))
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
          .where(eq(childProfiles.kidId, kidId));
      } else {
        await db.insert(childProfiles).values({
          kidId,
          familyId: DEFAULT_FAMILY_ID,
          allergies: data.allergies,
          doctor: data.doctor,
          contact: data.contact,
          notes: data.notes,
        });
      }
    } catch (e) {
      console.warn("Failed saving child profile in Neon:", e);
    }
  }

  await recordActivity(
    `${memberById(currentUser).name} updated ${memberById(kidId).name}'s care info`,
    null,
    currentUser
  );
  return data;
}

export async function createPostRecord(
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

  const store = getMemoryStore();
  store.posts = [full, ...store.posts];

  const db = getDb();
  if (db) {
    try {
      await db.insert(posts).values({
        id: full.id,
        familyId: DEFAULT_FAMILY_ID,
        author: full.author,
        type: full.type,
        content: full.content,
        images: full.images,
        createdAtLabel: full.createdAt,
      });
    } catch (e) {
      console.warn("Failed inserting post in Neon:", e);
    }
  }

  await recordActivity(
    `${memberById(currentUser).name} posted a Family Update`,
    null,
    currentUser
  );
  return full;
}

export async function togglePostReactionRecord(
  postId: string,
  emoji: string,
  currentUser: MemberId
): Promise<void> {
  const store = getMemoryStore();
  store.posts = store.posts.map((p) => {
    if (p.id !== postId) return p;
    const cur = p.reactions[emoji] || [];
    const has = cur.includes(currentUser);
    const next = has ? cur.filter((u) => u !== currentUser) : [...cur, currentUser];
    return { ...p, reactions: { ...p.reactions, [emoji]: next } };
  });

  const db = getDb();
  if (db) {
    try {
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
        await db.delete(postReactions).where(eq(postReactions.id, existing[0].id));
      } else {
        await db.insert(postReactions).values({
          postId,
          emoji,
          memberId: currentUser,
        });
      }
    } catch (e) {
      console.warn("Failed toggling reaction in Neon:", e);
    }
  }
}

export async function addPostCommentRecord(
  postId: string,
  text: string,
  currentUser: MemberId,
  commentId?: string
): Promise<PostComment> {
  const comment: PostComment = {
    id: commentId || uid("cm"),
    by: currentUser,
    text,
    at: "just now",
  };

  const store = getMemoryStore();
  let postAuthor: MemberId | null = null;
  store.posts = store.posts.map((p) => {
    if (p.id !== postId) return p;
    postAuthor = p.author;
    return { ...p, comments: [...(p.comments || []), comment] };
  });

  const db = getDb();
  if (db) {
    try {
      await db.insert(postComments).values({
        id: comment.id,
        postId,
        by: comment.by,
        text: comment.text,
        at: comment.at,
      });
      if (!postAuthor) {
        const rows = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
        if (rows[0]) postAuthor = rows[0].author;
      }
    } catch (e) {
      console.warn("Failed inserting comment in Neon:", e);
    }
  }

  if (postAuthor) {
    await recordActivity(
      `${memberById(currentUser).name} commented on ${memberById(postAuthor).name}'s post`,
      null,
      currentUser
    );
  }
  return comment;
}
