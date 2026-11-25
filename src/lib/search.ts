import { findMemberById } from "@/lib/constants";
import { todayISO } from "@/lib/dates";
import { medIsCurrent, nextDose } from "@/lib/meds";
import type {
  ChildProfile,
  DoseLogMap,
  FamilyEvent,
  FamilyTask,
  Medication,
  Member,
  ProfilesMap,
  ScheduledDose,
  WallPost,
} from "@/types/family";

export interface HighlightSegment {
  text: string;
  match: boolean;
}

export interface PersonSearchHit {
  member: Member;
  profile: ChildProfile | null;
  medCount: number;
  upcomingEventCount: number;
  matchedCareField: { label: string; value: string } | null;
  score: number;
}

export interface MedSearchHit {
  med: Medication;
  kid: Member;
  isCurrent: boolean;
  nextDose: ScheduledDose | null;
  score: number;
}

export interface EventSearchHit {
  event: FamilyEvent;
  score: number;
}

export interface TaskSearchHit {
  task: FamilyTask;
  score: number;
}

export interface PostSearchHit {
  post: WallPost;
  matchedComment: { byName: string; text: string } | null;
  score: number;
}

export interface FamilySearchResults {
  people: PersonSearchHit[];
  meds: MedSearchHit[];
  events: EventSearchHit[];
  tasks: TaskSearchHit[];
  posts: PostSearchHit[];
  total: number;
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeWords(value: string): string[] {
  return normalizeSearchText(value).match(/[\p{L}\p{N}]+/gu) || [];
}

/**
 * Damerau-Levenshtein distance <= 1 check (handles single insertion, deletion,
 * substitution, or adjacent transposition, e.g. "symbacort" <-> "symbicort").
 */
export function editDistanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;

  let i = 0;
  let j = 0;
  let diffs = 0;

  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }

    diffs++;
    if (diffs > 1) return false;

    // Adjacent transposition
    if (i + 1 < la && j + 1 < lb && a[i] === b[j + 1] && a[i + 1] === b[j]) {
      i += 2;
      j += 2;
      continue;
    }

    if (la > lb) {
      i++;
    } else if (lb > la) {
      j++;
    } else {
      i++;
      j++;
    }
  }

  if (i < la || j < lb) diffs++;
  return diffs <= 1;
}

function fuzzyTokenMatchesWords(token: string, words: string[]): boolean {
  if (token.length < 4) return false;
  for (const w of words) {
    if (w.length < 4) continue;
    if (editDistanceAtMostOne(token, w)) return true;
    if (
      token.length >= 5 &&
      w.length > token.length &&
      w.slice(0, 3) === token.slice(0, 3) &&
      editDistanceAtMostOne(token, w.slice(0, token.length))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Returns a relevance score:
 * - 3: full normalized query is a substring of at least one field (or combined text)
 * - 2: every query token is a substring across the fields
 * - 1: every query token matches either as a substring or via 1-edit typo tolerance
 * - 0: no match
 */
export function scoreFieldMatch(
  rawQuery: string,
  fields: Array<string | null | undefined>
): number {
  const normalizedQuery = normalizeSearchText(rawQuery);
  if (!normalizedQuery) return 0;

  const normalizedFields = fields
    .map((f) => (typeof f === "string" ? normalizeSearchText(f) : ""))
    .filter(Boolean);

  if (normalizedFields.length === 0) return 0;

  if (normalizedFields.some((f) => f.includes(normalizedQuery))) {
    return 3;
  }

  const combined = normalizedFields.join(" ");
  if (combined.includes(normalizedQuery)) {
    return 3;
  }

  const tokens = normalizedQuery.split(" ").filter(Boolean);
  if (tokens.length === 0) return 0;

  if (tokens.every((t) => combined.includes(t))) {
    return 2;
  }

  const words = tokenizeWords(combined);
  const allFuzzyOrExact = tokens.every(
    (t) => combined.includes(t) || fuzzyTokenMatchesWords(t, words)
  );
  return allFuzzyOrExact ? 1 : 0;
}

/**
 * Splits `text` into highlightable segments matching `rawQuery` (exact phrase,
 * exact tokens, or 1-edit fuzzy word matches).
 */
export function getHighlightSegments(
  text: string,
  rawQuery: string
): HighlightSegment[] {
  if (!text) return [];
  const trimmed = rawQuery.trim();
  if (!trimmed) return [{ text, match: false }];

  const lowerText = text.toLowerCase();
  const lowerQuery = trimmed.toLowerCase();

  const ranges: Array<[number, number]> = [];

  const directIdx = lowerText.indexOf(lowerQuery);
  if (directIdx !== -1) {
    ranges.push([directIdx, directIdx + lowerQuery.length]);
  } else {
    const tokens = normalizeSearchText(trimmed).split(" ").filter(Boolean);
    for (const token of tokens) {
      if (token.length < 2) continue;
      const idx = lowerText.indexOf(token);
      if (idx !== -1) {
        ranges.push([idx, idx + token.length]);
      } else if (token.length >= 4) {
        const wordRegex = /[\p{L}\p{N}]+/giu;
        let m: RegExpExecArray | null;
        while ((m = wordRegex.exec(text)) !== null) {
          const wordNorm = normalizeSearchText(m[0]);
          if (fuzzyTokenMatchesWords(token, [wordNorm])) {
            ranges.push([m.index, m.index + m[0].length]);
            break;
          }
        }
      }
    }
  }

  if (ranges.length === 0) return [{ text, match: false }];

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (!last || r[0] > last[1]) {
      merged.push([...r]);
    } else if (r[1] > last[1]) {
      last[1] = r[1];
    }
  }

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) {
      segments.push({ text: text.slice(cursor, start), match: false });
    }
    segments.push({ text: text.slice(start, end), match: true });
    cursor = end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), match: false });
  }
  return segments;
}

function pickSeriesEvents(
  rawEvents: FamilyEvent[],
  expandedEvents: FamilyEvent[],
  today: string,
  scoreFn: (ev: FamilyEvent) => number
): EventSearchHit[] {
  const byMaster = new Map<string, FamilyEvent[]>();
  for (const occ of expandedEvents) {
    const key = occ.masterId || occ.id;
    const list = byMaster.get(key) || [];
    list.push(occ);
    byMaster.set(key, list);
  }

  const hits: EventSearchHit[] = [];
  const seenIds = new Set<string>();

  for (const master of rawEvents) {
    const occurrences = byMaster.get(master.id) || [];
    if (!master.recurrence) {
      const candidate =
        occurrences[0] || {
          ...master,
          masterId: master.id,
          occurrenceDate: master.date,
          isRecurring: false,
        };
      const score = scoreFn(candidate);
      if (score > 0 && !seenIds.has(candidate.id)) {
        seenIds.add(candidate.id);
        hits.push({ event: candidate, score });
      }
      continue;
    }

    const sortedOccs = [...occurrences].sort((a, b) =>
      (a.date + (a.startTime || "")).localeCompare(b.date + (b.startTime || ""))
    );
    const primary =
      sortedOccs.find((o) => o.date >= today) ||
      sortedOccs[sortedOccs.length - 1] || {
        ...master,
        masterId: master.id,
        occurrenceDate: master.date,
        isRecurring: true,
      };

    const primaryScore = scoreFn(primary);
    if (primaryScore > 0 && !seenIds.has(primary.id)) {
      seenIds.add(primary.id);
      hits.push({ event: primary, score: primaryScore });
    }

    // Surface overridden occurrences that uniquely match (e.g. a renamed instance)
    for (const occ of sortedOccs) {
      if (occ.id === primary.id) continue;
      const occDate = occ.occurrenceDate || occ.date;
      if (!master.overrides?.[occDate]) continue;
      const occScore = scoreFn(occ);
      if (occScore > primaryScore && !seenIds.has(occ.id)) {
        seenIds.add(occ.id);
        hits.push({ event: occ, score: occScore });
      }
    }
  }

  return hits.sort(
    (a, b) =>
      b.score - a.score ||
      (a.event.date + (a.event.startTime || "")).localeCompare(
        b.event.date + (b.event.startTime || "")
      )
  );
}

function pickSeriesTasks(
  rawTasks: FamilyTask[],
  expandedTasks: FamilyTask[],
  today: string,
  scoreFn: (tk: FamilyTask) => number
): TaskSearchHit[] {
  const byMaster = new Map<string, FamilyTask[]>();
  for (const occ of expandedTasks) {
    const key = occ.masterId || occ.id;
    const list = byMaster.get(key) || [];
    list.push(occ);
    byMaster.set(key, list);
  }

  const hits: TaskSearchHit[] = [];
  const seenIds = new Set<string>();

  for (const master of rawTasks) {
    const occurrences = byMaster.get(master.id) || [];
    if (!master.recurrence || !master.dueDate) {
      const candidate =
        occurrences[0] || {
          ...master,
          masterId: master.id,
          occurrenceDate: master.dueDate || undefined,
          isRecurring: false,
        };
      const score = scoreFn(candidate);
      if (score > 0 && !seenIds.has(candidate.id)) {
        seenIds.add(candidate.id);
        hits.push({ task: candidate, score });
      }
      continue;
    }

    const sortedOccs = [...occurrences].sort((a, b) =>
      (a.dueDate || "").localeCompare(b.dueDate || "")
    );
    const primary =
      sortedOccs.find((o) => !o.completed && (o.dueDate || "") >= today) ||
      sortedOccs.find((o) => (o.dueDate || "") >= today) ||
      sortedOccs[sortedOccs.length - 1] || {
        ...master,
        masterId: master.id,
        occurrenceDate: master.dueDate,
        isRecurring: true,
      };

    const primaryScore = scoreFn(primary);
    if (primaryScore > 0 && !seenIds.has(primary.id)) {
      seenIds.add(primary.id);
      hits.push({ task: primary, score: primaryScore });
    }

    for (const occ of sortedOccs) {
      if (occ.id === primary.id) continue;
      const occDate = occ.occurrenceDate || occ.dueDate;
      if (!occDate || !master.overrides?.[occDate]) continue;
      const occScore = scoreFn(occ);
      if (occScore > primaryScore && !seenIds.has(occ.id)) {
        seenIds.add(occ.id);
        hits.push({ task: occ, score: occScore });
      }
    }
  }

  return hits.sort(
    (a, b) =>
      b.score - a.score ||
      Number(a.task.completed) - Number(b.task.completed) ||
      (a.task.dueDate || "9999-99-99").localeCompare(b.task.dueDate || "9999-99-99")
  );
}

export function runFamilySearch({
  query,
  members,
  meds,
  doseLog,
  profiles,
  events,
  expandedEvents,
  tasks,
  expandedTasks,
  posts,
  today = todayISO(0),
}: {
  query: string;
  members: Member[];
  meds: Medication[];
  doseLog: DoseLogMap;
  profiles: ProfilesMap;
  events: FamilyEvent[];
  expandedEvents: FamilyEvent[];
  tasks: FamilyTask[];
  expandedTasks: FamilyTask[];
  posts: WallPost[];
  today?: string;
}): FamilySearchResults {
  const trimmed = query.trim();
  if (!trimmed) {
    return { people: [], meds: [], events: [], tasks: [], posts: [], total: 0 };
  }

  const memberName = (id?: string | null) =>
    id ? findMemberById(id, members).name : "";

  const upcomingEventsByMember = new Map<string, Set<string>>();
  for (const ev of expandedEvents) {
    if (ev.date < today) continue;
    const seriesId = ev.masterId || ev.id;
    for (const pid of ev.participants || []) {
      if (!upcomingEventsByMember.has(pid)) {
        upcomingEventsByMember.set(pid, new Set());
      }
      upcomingEventsByMember.get(pid)!.add(seriesId);
    }
  }

  // 1. People (members + child care profiles)
  const peopleHits: PersonSearchHit[] = [];
  for (const member of members) {
    const profile = member.isChild ? profiles[member.id] || null : null;
    const roleLabel = member.isChild
      ? "Child"
      : member.role === "admin"
        ? "Admin"
        : "Adult";
    const nameScore = scoreFieldMatch(trimmed, [member.name]);
    const carePairs: Array<{ label: string; value: string }> = profile
      ? [
          { label: "Allergies", value: profile.allergies },
          { label: "Doctor", value: profile.doctor },
          { label: "Emergency contact", value: profile.contact },
          { label: "Care notes", value: profile.notes },
        ].filter((p) => Boolean(p.value))
      : [];

    let bestCareMatch: { label: string; value: string; score: number } | null = null;
    for (const pair of carePairs) {
      const s = scoreFieldMatch(trimmed, [pair.value]);
      if (s > 0 && (!bestCareMatch || s > bestCareMatch.score)) {
        bestCareMatch = { ...pair, score: s };
      }
    }

    const totalScore = scoreFieldMatch(trimmed, [
      member.name,
      roleLabel,
      ...carePairs.map((p) => p.value),
    ]);

    if (totalScore > 0) {
      const medCount = meds.filter(
        (m) => m.kidId === member.id && medIsCurrent(m)
      ).length;
      const upcomingEventCount = upcomingEventsByMember.get(member.id)?.size || 0;
      peopleHits.push({
        member,
        profile,
        medCount,
        upcomingEventCount,
        matchedCareField:
          nameScore === 0 && bestCareMatch
            ? { label: bestCareMatch.label, value: bestCareMatch.value }
            : null,
        score: nameScore > 0 ? totalScore + 1 : totalScore,
      });
    }
  }
  peopleHits.sort(
    (a, b) =>
      b.score - a.score ||
      Number(Boolean(b.member.isChild)) - Number(Boolean(a.member.isChild)) ||
      a.member.name.localeCompare(b.member.name)
  );

  // 2. Medications
  const medHits: MedSearchHit[] = [];
  for (const med of meds) {
    const kid = findMemberById(med.kidId, members);
    const nameScore = scoreFieldMatch(trimmed, [med.name]);
    const overallScore = scoreFieldMatch(trimmed, [
      med.name,
      med.dose,
      med.instructions,
      med.frequency,
      kid.name,
    ]);
    if (overallScore > 0) {
      const current = medIsCurrent(med);
      medHits.push({
        med,
        kid,
        isCurrent: current,
        nextDose: current ? nextDose(med, doseLog) : null,
        score: nameScore > 0 ? overallScore + 1 : overallScore,
      });
    }
  }
  medHits.sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.isCurrent) - Number(a.isCurrent) ||
      a.med.name.localeCompare(b.med.name)
  );

  // 3. Events (deduplicated across recurring series)
  const eventHits = pickSeriesEvents(events, expandedEvents, today, (ev) => {
    const participantNames = (ev.participants || []).map((id) => memberName(id));
    return scoreFieldMatch(trimmed, [
      ev.title,
      ev.location,
      ev.notes,
      ev.description,
      ev.category,
      ...participantNames,
      memberName(ev.createdBy),
    ]);
  });

  // 4. Tasks (deduplicated across recurring series)
  const taskHits = pickSeriesTasks(tasks, expandedTasks, today, (tk) =>
    scoreFieldMatch(trimmed, [
      tk.title,
      tk.notes,
      tk.category,
      tk.linkedEventTitle,
      memberName(tk.assignedTo),
      memberName(tk.createdBy),
    ])
  );

  // 5. Family Wall posts + comments
  const postHits: PostSearchHit[] = [];
  for (const post of posts) {
    const authorName = memberName(post.author);
    const bodyScore = scoreFieldMatch(trimmed, [
      post.content,
      post.type,
      authorName,
    ]);
    let bestCommentMatch: { byName: string; text: string; score: number } | null =
      null;
    for (const c of post.comments || []) {
      const cAuthor = memberName(c.by);
      const cScore = scoreFieldMatch(trimmed, [c.text, cAuthor]);
      if (cScore > 0 && (!bestCommentMatch || cScore > bestCommentMatch.score)) {
        bestCommentMatch = { byName: cAuthor, text: c.text, score: cScore };
      }
    }

    const overallScore = scoreFieldMatch(trimmed, [
      post.content,
      post.type,
      authorName,
      ...(post.comments || []).flatMap((c) => [c.text, memberName(c.by)]),
    ]);

    if (overallScore > 0) {
      postHits.push({
        post,
        matchedComment:
          bodyScore === 0 && bestCommentMatch
            ? { byName: bestCommentMatch.byName, text: bestCommentMatch.text }
            : null,
        score: bodyScore > 0 ? overallScore + 1 : overallScore,
      });
    }
  }
  postHits.sort(
    (a, b) =>
      b.score - a.score || b.post.createdAt.localeCompare(a.post.createdAt)
  );

  return {
    people: peopleHits,
    meds: medHits,
    events: eventHits,
    tasks: taskHits,
    posts: postHits,
    total:
      peopleHits.length +
      medHits.length +
      eventHits.length +
      taskHits.length +
      postHits.length,
  };
}
