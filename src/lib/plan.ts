import { parseLocalDate, todayISO } from "@/lib/dates";
import type { FamilyEvent, FamilyTask, MemberId } from "@/types/family";

export type PlanTypeFilter = "all" | "tasks" | "events" | "appointments";

export type TaskSubFilter =
  | "all"
  | "mine"
  | "family"
  | "unassigned"
  | "overdue"
  | "completed";

export type PlanSectionId =
  | "overdue"
  | "today"
  | "tomorrow"
  | "this_week"
  | "next_week"
  | "later"
  | "no_date";

export type PlanTimelineItem =
  | {
      kind: "task";
      id: string;
      date: string;
      time: string | null;
      task: FamilyTask;
    }
  | {
      kind: "event" | "appointment";
      id: string;
      date: string;
      time: string | null;
      event: FamilyEvent;
    };

export interface PlanSection {
  id: PlanSectionId;
  label: string;
  isOverdue: boolean;
  isMultiDay: boolean;
  items: PlanTimelineItem[];
}

export interface PlanCounts {
  all: number;
  tasks: number;
  events: number;
  appointments: number;
}

export function isAppointmentEvent(
  event: Pick<FamilyEvent, "category">
): boolean {
  return event.category === "Appointment" || event.category === "Medical";
}

export function getPlanCounts({
  events,
  tasks,
  today = todayISO(0),
}: {
  events: FamilyEvent[];
  tasks: FamilyTask[];
  today?: string;
}): PlanCounts {
  const activeTasksCount = tasks.filter((t) => !t.completed).length;
  let eventsCount = 0;
  let appointmentsCount = 0;
  for (const e of events) {
    if (e.date < today) continue;
    if (isAppointmentEvent(e)) appointmentsCount++;
    else eventsCount++;
  }
  return {
    all: activeTasksCount + eventsCount + appointmentsCount,
    tasks: activeTasksCount,
    events: eventsCount,
    appointments: appointmentsCount,
  };
}

function comparePlanItems(a: PlanTimelineItem, b: PlanTimelineItem): number {
  const dateA = a.date || "9999-99-99";
  const dateB = b.date || "9999-99-99";
  if (dateA !== dateB) return dateA.localeCompare(dateB);

  if (a.time && b.time) {
    if (a.time !== b.time) return a.time.localeCompare(b.time);
  } else if (a.time && !b.time) {
    return -1;
  } else if (!a.time && b.time) {
    return 1;
  }

  const kindRank = (k: PlanTimelineItem["kind"]) => (k === "task" ? 1 : 0);
  const rankDiff = kindRank(a.kind) - kindRank(b.kind);
  if (rankDiff !== 0) return rankDiff;

  const titleA = a.kind === "task" ? a.task.title : a.event.title;
  const titleB = b.kind === "task" ? b.task.title : b.event.title;
  return titleA.localeCompare(titleB);
}

const SECTION_META: {
  id: PlanSectionId;
  label: string;
  isOverdue: boolean;
  isMultiDay: boolean;
}[] = [
  { id: "overdue", label: "Overdue", isOverdue: true, isMultiDay: true },
  { id: "today", label: "Today", isOverdue: false, isMultiDay: false },
  { id: "tomorrow", label: "Tomorrow", isOverdue: false, isMultiDay: false },
  { id: "this_week", label: "This Week", isOverdue: false, isMultiDay: true },
  { id: "next_week", label: "Next Week", isOverdue: false, isMultiDay: true },
  { id: "later", label: "Later", isOverdue: false, isMultiDay: true },
  { id: "no_date", label: "No due date", isOverdue: false, isMultiDay: false },
];

export function groupPlanItems({
  events,
  tasks,
  typeFilter,
  taskSubFilter,
  currentUser,
  today = todayISO(0),
}: {
  events: FamilyEvent[];
  tasks: FamilyTask[];
  typeFilter: PlanTypeFilter;
  taskSubFilter: TaskSubFilter;
  currentUser: MemberId;
  today?: string;
}): {
  sections: PlanSection[];
  completedTasks: FamilyTask[];
} {
  const buckets: Record<PlanSectionId, PlanTimelineItem[]> = {
    overdue: [],
    today: [],
    tomorrow: [],
    this_week: [],
    next_week: [],
    later: [],
    no_date: [],
  };

  const todayMs = parseLocalDate(today).getTime();

  function bucketForDate(dateStr: string): PlanSectionId {
    if (!dateStr) return "no_date";
    const diff = Math.round(
      (parseLocalDate(dateStr).getTime() - todayMs) / 86400000
    );
    if (diff < 0) return "overdue";
    if (diff === 0) return "today";
    if (diff === 1) return "tomorrow";
    if (diff <= 7) return "this_week";
    if (diff <= 14) return "next_week";
    return "later";
  }

  // Events & Appointments
  if (typeFilter === "all" || typeFilter === "events" || typeFilter === "appointments") {
    for (const ev of events) {
      if (ev.date < today) continue;
      const isAppt = isAppointmentEvent(ev);
      if (typeFilter === "events" && isAppt) continue;
      if (typeFilter === "appointments" && !isAppt) continue;

      const sectionId = bucketForDate(ev.date);
      buckets[sectionId].push({
        kind: isAppt ? "appointment" : "event",
        id: ev.id,
        date: ev.date,
        time: ev.allDay ? null : ev.startTime || null,
        event: ev,
      });
    }
  }

  // Tasks
  const completedTasks: FamilyTask[] = [];
  if (typeFilter === "all" || typeFilter === "tasks") {
    const activeSubFilter: TaskSubFilter =
      typeFilter === "tasks" ? taskSubFilter : "all";

    for (const t of tasks) {
      const matchesScope =
        activeSubFilter === "all" ||
        (activeSubFilter === "mine" && t.assignedTo === currentUser) ||
        (activeSubFilter === "family" &&
          Boolean(t.assignedTo) &&
          t.assignedTo !== currentUser) ||
        (activeSubFilter === "unassigned" && !t.assignedTo) ||
        (activeSubFilter === "overdue" &&
          !t.completed &&
          Boolean(t.dueDate) &&
          t.dueDate < today) ||
        (activeSubFilter === "completed" && t.completed);

      if (!matchesScope) continue;

      if (t.completed) {
        if (activeSubFilter === "all" || activeSubFilter === "completed") {
          completedTasks.push(t);
        }
        continue;
      }

      if (activeSubFilter === "completed") continue;

      const sectionId = bucketForDate(t.dueDate || "");
      buckets[sectionId].push({
        kind: "task",
        id: t.id,
        date: t.dueDate || "",
        time: t.dueTime || null,
        task: t,
      });
    }
  }

  completedTasks.sort((a, b) => {
    const aKey = a.completedAt || a.dueDate || "";
    const bKey = b.completedAt || b.dueDate || "";
    return bKey.localeCompare(aKey);
  });

  const sections: PlanSection[] = [];
  for (const meta of SECTION_META) {
    const items = buckets[meta.id];
    if (items.length === 0) continue;
    items.sort(comparePlanItems);
    sections.push({
      ...meta,
      items,
    });
  }

  return { sections, completedTasks };
}
