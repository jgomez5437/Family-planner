import type {
  ChildProfile,
  DoseLogMap,
  FamilyEvent,
  Medication,
  Member,
  MemberId,
  ProfilesMap,
  ScheduledDose,
} from "@/types/family";
import { findMemberById } from "./constants";
import {
  fmtDayLong,
  fmtShortDate,
  fmtTime,
  formatLocalClock,
  nowHHMM,
  parseLocalDate,
  relativeDay,
  todayISO,
} from "./dates";

export function medRunsOn(med: Medication, dateStr: string): boolean {
  if (med.frequency === "As needed") return false;
  if (dateStr < med.startDate) return false;
  if (med.endDate && dateStr > med.endDate) return false;
  if (
    med.frequency === "Once a week" &&
    parseLocalDate(dateStr).getDay() !== parseLocalDate(med.startDate).getDay()
  )
    return false;
  return true;
}

export function dosesFor(med: Medication, dateStr: string): ScheduledDose[] {
  if (!medRunsOn(med, dateStr)) return [];
  return [...med.times].sort().map((time) => ({
    med,
    date: dateStr,
    time,
    key: `${med.id}|${dateStr}|${time}`,
  }));
}

export function medIsCurrent(med: Medication): boolean {
  return !med.endDate || med.endDate >= todayISO(0);
}

export function medWhenLabel(med: Medication): string {
  if (med.frequency === "As needed") return "As needed";
  const times = [...med.times].sort().map(fmtTime).join(", ");
  if (med.frequency === "Once a week") {
    const day = parseLocalDate(med.startDate).toLocaleDateString(undefined, { weekday: "long" });
    return `${day}s · ${times}`;
  }
  return `Every day · ${times}`;
}

export function medCourseLabel(med: Medication): string {
  const starts = med.startDate > todayISO(0) ? `Starts ${fmtShortDate(med.startDate)} · ` : "";
  if (!med.endDate) return `${starts}Ongoing`;
  const diff = Math.round(
    (parseLocalDate(med.endDate).getTime() - parseLocalDate(todayISO(0)).getTime()) / 86400000
  );
  if (diff === 0) return `${starts}Last day today`;
  if (diff === 1) return `${starts}Ends tomorrow`;
  return `${starts}Until ${fmtShortDate(med.endDate)} · ${diff} days left`;
}

export function nextDose(med: Medication, doseLog: DoseLogMap): ScheduledDose | null {
  if (med.frequency === "As needed") return null;
  const nowT = nowHHMM();
  for (let i = 0; i < 120; i++) {
    const date = todayISO(i);
    for (const d of dosesFor(med, date)) {
      if (doseLog[d.key]) continue;
      return { ...d, overdue: i === 0 && d.time < nowT };
    }
  }
  return null;
}

export function nextDoseLabel(nd: ScheduledDose | null): string | null {
  if (!nd) return null;
  return `${nd.overdue ? "Overdue · " : ""}${relativeDay(nd.date)} ${fmtTime(nd.time)}`;
}

export function groupKidSeries(events: FamilyEvent[], kidId: MemberId): FamilyEvent[] {
  const today = todayISO(0);
  const map = new Map<string, FamilyEvent>();
  events.forEach((e) => {
    if (!e.participants?.includes(kidId) || e.date < today) return;
    const key = e.masterId || e.id;
    if (!map.has(key)) map.set(key, e);
  });
  return [...map.values()];
}

export interface SheetSection {
  kid: Member;
  profile: ChildProfile;
  scheduled: Medication[];
  asNeeded: Medication[];
  schedule: { date: string; doses: ScheduledDose[] }[];
  appts: FamilyEvent[];
}

export function buildSheet({
  kidIds,
  days,
  meds,
  profiles,
  events,
  members,
}: {
  kidIds: MemberId[];
  days: number;
  meds: Medication[];
  profiles: ProfilesMap;
  events: FamilyEvent[];
  members: Member[];
}): SheetSection[] {
  const today = todayISO(0);
  const dates = Array.from({ length: days }, (_, i) => todayISO(i));
  const last = dates[dates.length - 1];
  return kidIds.map((kidId) => {
    const kidMeds = meds.filter((m) => m.kidId === kidId && medIsCurrent(m) && m.startDate <= last);
    const scheduled = kidMeds.filter((m) => m.frequency !== "As needed");
    const asNeeded = kidMeds.filter((m) => m.frequency === "As needed");
    const schedule = dates.map((date) => ({
      date,
      doses: scheduled
        .flatMap((m) => dosesFor(m, date))
        .sort((a, b) => a.time.localeCompare(b.time)),
    }));
    const appts = events.filter(
      (e) => e.participants?.includes(kidId) && e.date >= today && e.date <= last
    );
    return {
      kid: findMemberById(kidId, members),
      profile: profiles[kidId] || { allergies: "", doctor: "", contact: "", notes: "" },
      scheduled,
      asNeeded,
      schedule,
      appts,
    };
  });
}

export function buildSheetText(
  sections: SheetSection[],
  {
    forWho,
    extra,
    preparedBy,
    doseLog,
    rangeLabel,
    members,
  }: {
    forWho: string;
    extra: string;
    preparedBy: string;
    doseLog: DoseLogMap;
    rangeLabel: string;
    members: Member[];
  }
): string {
  const lines: string[] = [];
  sections.forEach((s, idx) => {
    if (idx > 0) lines.push("", "----------------------------------------", "");
    lines.push(`CARE SHEET - ${s.kid.name.toUpperCase()}`, rangeLabel);
    if (forWho) lines.push(`Prepared for: ${forWho}`);
    lines.push("", `ALLERGIES: ${s.profile.allergies || "None listed"}`);
    lines.push(`Doctor: ${s.profile.doctor || "-"}`);
    lines.push(`Emergency contact: ${s.profile.contact || "-"}`);
    lines.push("", "MEDICATIONS");
    if (s.scheduled.length === 0 && s.asNeeded.length === 0)
      lines.push("No regular medications.");
    s.scheduled.forEach((m) =>
      lines.push(
        `- ${m.name}, ${m.dose}: ${medWhenLabel(m)}${m.instructions ? ` (${m.instructions})` : ""}${m.endDate ? ` - through ${fmtShortDate(m.endDate)}` : ""}`
      )
    );
    s.asNeeded.forEach((m) =>
      lines.push(
        `- ${m.name}, ${m.dose}: as needed${m.instructions ? ` (${m.instructions})` : ""}`
      )
    );
    if (s.scheduled.length > 0) {
      lines.push("", "SCHEDULE");
      s.schedule.forEach((day) => {
        lines.push(fmtDayLong(day.date) + (day.date === todayISO(0) ? " (today)" : ""));
        if (day.doses.length === 0) lines.push("  No scheduled doses");
        day.doses.forEach((d) => {
          const entry = doseLog[d.key];
          lines.push(
            `  ${fmtTime(d.time)}  ${d.med.name} ${d.med.dose}  ${entry ? `[x] given by ${findMemberById(entry.by, members).name} ${formatLocalClock(entry.at)}` : "[ ] given: ____"}`
          );
        });
      });
    }
    if (s.appts.length > 0) {
      lines.push("", "APPOINTMENTS");
      s.appts.forEach((e) =>
        lines.push(
          `- ${fmtDayLong(e.date)}${!e.allDay && e.startTime ? ` ${fmtTime(e.startTime)}` : ""}: ${e.title}${e.location ? ` (${e.location})` : ""}`
        )
      );
    }
    if (s.profile.notes) lines.push("", `NOTES: ${s.profile.notes}`);
  });
  if (extra) lines.push("", `EXTRA NOTES: ${extra}`);
  lines.push(
    "",
    `Prepared by ${preparedBy} on ${new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}.`,
    "Medication details are as entered by the family. Follow the label and the doctor's instructions. This sheet is not medical advice."
  );
  return lines.join("\n");
}
