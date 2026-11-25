import type { FamilyEvent, FamilyTask } from "@/types/family";
import { parseLocalDate, toLocalISO } from "./dates";

export function addInterval(dateStr: string, recurrence: string, n: number): string {
  const d = parseLocalDate(dateStr);
  if (recurrence === "Daily") d.setDate(d.getDate() + n);
  else if (recurrence === "Weekly") d.setDate(d.getDate() + 7 * n);
  else if (recurrence === "Monthly") d.setMonth(d.getMonth() + n);
  else if (recurrence === "Yearly") d.setFullYear(d.getFullYear() + n);
  return toLocalISO(d);
}

export function expandOccurrences<
  T extends {
    id: string;
    recurrence?: string | null;
    exceptions?: string[];
    overrides?: Record<string, object>;
  },
>(master: T, dateField: keyof T, rangeStart: string, rangeEnd: string): T[] {
  const baseDate = master[dateField] as unknown as string | undefined;
  if (!master.recurrence || !baseDate) {
    if (baseDate && baseDate >= rangeStart && baseDate <= rangeEnd) {
      return [
        {
          ...master,
          occurrenceDate: baseDate,
          masterId: master.id,
          isRecurring: false,
        } as T,
      ];
    }
    return [];
  }
  const out: T[] = [];
  let cursor = baseDate;
  let guard = 0;
  while (cursor <= rangeEnd && guard < 500) {
    if (cursor >= rangeStart) {
      const exceptions = master.exceptions || [];
      if (!exceptions.includes(cursor)) {
        const override =
          (master.overrides && master.overrides[cursor]) || {};
        const overriddenDate = (override as Record<string, unknown>)[
          dateField as string
        ];
        out.push({
          ...master,
          ...override,
          id: `${master.id}::${cursor}`,
          masterId: master.id,
          occurrenceDate: cursor,
          isRecurring: true,
          [dateField]:
            typeof overriddenDate === "string" && overriddenDate
              ? overriddenDate
              : cursor,
        } as T);
      }
    }
    cursor = addInterval(cursor, master.recurrence, 1);
    guard++;
  }
  return out;
}

export function expandAllEvents(
  events: FamilyEvent[],
  rangeStart: string,
  rangeEnd: string
): FamilyEvent[] {
  return events.flatMap((e) => expandOccurrences(e, "date", rangeStart, rangeEnd));
}

export function expandAllTasks(
  tasks: FamilyTask[],
  rangeStart: string,
  rangeEnd: string
): FamilyTask[] {
  return tasks.flatMap((t) => expandOccurrences(t, "dueDate", rangeStart, rangeEnd));
}

export function recurrenceLabel(recurrence?: string | null, dateStr?: string): string | null {
  if (!recurrence) return null;
  if (recurrence === "Weekly" && dateStr) {
    return `Every ${parseLocalDate(dateStr).toLocaleDateString(undefined, { weekday: "long" })}`;
  }
  if (recurrence === "Daily") return "Every day";
  if (recurrence === "Monthly") return "Every month";
  if (recurrence === "Yearly") return "Every year";
  return recurrence;
}

export function humanizeHistoryNote(note?: string): string {
  if (!note) return "Updated";
  if (note === "Created event") return "Created";
  if (note.startsWith("Time changed"))
    return note
      .replace("Time changed from", "Time changed:")
      .replace(" (", ", just ")
      .replace(")", "");
  if (note.startsWith("Location changed")) return note;
  if (note.startsWith("Location set")) return note;
  return note.replace(/^(\w+)\s+updated$/, (_, field: string) => `${field.charAt(0).toUpperCase()}${field.slice(1)} updated`);
}
