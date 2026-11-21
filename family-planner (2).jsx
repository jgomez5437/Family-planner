import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Home, Calendar, CheckSquare, Clock, MessageSquare, Plus, X,
  MapPin, Bell, Search, Filter, ChevronLeft, ChevronRight,
  Heart, ThumbsUp, Laugh, CheckCircle2, Circle, Camera,
  Stethoscope, Users, Trophy, Briefcase, School, Cake, PartyPopper,
  ShoppingCart, Home as HomeIcon, MoreHorizontal, History,
  ChevronDown, Check, Settings as SettingsIcon, Sun, Moon,
  Monitor, UserPlus, User, ChevronRight as ChevronRightIcon, Printer, Send
} from "lucide-react";

const CARD_SHADOW = "0 1px 2px rgba(74,50,24,0.05), 0 6px 18px rgba(74,50,24,0.06)";

/* ---------------------------------------------------------
   DATA — family members, mock live seed data
--------------------------------------------------------- */

const MEMBERS = [
  { id: "dad",   name: "Dad",   emoji: "👨", color: "#1F6F5C", light: "#E4F1EC" },
  { id: "mom",   name: "Mom",   emoji: "👩", color: "#E8622C", light: "#FCE9DF" },
  { id: "alex",  name: "Alex",  emoji: "👦", color: "#3E6FD9", light: "#E6ECFC", isChild: true },
  { id: "mia",   name: "Mia",   emoji: "👧", color: "#B25CC9", light: "#F3E5F7", isChild: true },
];

const memberById = (id) => MEMBERS.find((m) => m.id === id) || MEMBERS[0];

const CATEGORY_META = {
  Family:      { icon: Users,        color: "#1F6F5C" },
  School:      { icon: School,       color: "#3E6FD9" },
  Work:        { icon: Briefcase,    color: "#6B6259" },
  Medical:     { icon: Stethoscope,  color: "#E8622C" },
  Sports:      { icon: Trophy,       color: "#C9972B" },
  Appointment: { icon: Clock,        color: "#B25CC9" },
  Birthday:    { icon: Cake,         color: "#E8622C" },
  Holiday:     { icon: PartyPopper,  color: "#1F6F5C" },
  Other:       { icon: MoreHorizontal, color: "#6B6259" },
};

const TASK_CATEGORIES = ["Household", "Shopping", "Kids", "School", "Work", "Errands", "Medical", "Other"];

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

// Formats a Date using its LOCAL year/month/day (never UTC-shift the calendar day)
function toLocalISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return toLocalISO(d);
}

// Parses a "YYYY-MM-DD" string as a LOCAL midnight Date (never let the
// browser interpret it as UTC, which rolls the day back in negative-UTC-offset zones).
function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/* ---------------------------------------------------------
   RECURRENCE ENGINE
   Master events/tasks with a `recurrence` store ONE record.
   This expands a master into virtual dated occurrences across
   [rangeStart, rangeEnd] (inclusive, "YYYY-MM-DD" strings).
   Each occurrence carries occurrenceDate + masterId, and per-
   date overrides (edited time/location/completion/etc, or a
   skip) are looked up from the master's `overrides` map and
   `exceptions` list so "just this one" edits don't touch the series.
--------------------------------------------------------- */

function addInterval(dateStr, recurrence, n) {
  const d = parseLocalDate(dateStr);
  if (recurrence === "Daily") d.setDate(d.getDate() + n);
  else if (recurrence === "Weekly") d.setDate(d.getDate() + 7 * n);
  else if (recurrence === "Monthly") d.setMonth(d.getMonth() + n);
  else if (recurrence === "Yearly") d.setFullYear(d.getFullYear() + n);
  return toLocalISO(d);
}

function expandOccurrences(master, dateField, rangeStart, rangeEnd) {
  const baseDate = master[dateField];
  if (!master.recurrence || !baseDate) {
    // Non-recurring: a single occurrence, only if it falls in range.
    if (baseDate >= rangeStart && baseDate <= rangeEnd) {
      return [{ ...master, occurrenceDate: baseDate, masterId: master.id, isRecurring: false }];
    }
    return [];
  }
  const out = [];
  let cursor = baseDate;
  let guard = 0;
  // Walk forward from the base date. If the base date is already past
  // rangeEnd this naturally yields nothing; if it's long before
  // rangeStart we still have to step through — cap with a guard.
  while (cursor <= rangeEnd && guard < 500) {
    if (cursor >= rangeStart) {
      const exceptions = master.exceptions || [];
      if (!exceptions.includes(cursor)) {
        const override = (master.overrides && master.overrides[cursor]) || {};
        out.push({
          ...master,
          ...override,
          id: `${master.id}::${cursor}`,
          masterId: master.id,
          occurrenceDate: cursor,
          isRecurring: true,
          [dateField]: cursor,
        });
      }
    }
    cursor = addInterval(cursor, master.recurrence, 1);
    guard++;
  }
  return out;
}

function expandAllEvents(events, rangeStart, rangeEnd) {
  return events.flatMap((e) => expandOccurrences(e, "date", rangeStart, rangeEnd));
}

function expandAllTasks(tasks, rangeStart, rangeEnd) {
  return tasks.flatMap((t) => expandOccurrences(t, "dueDate", rangeStart, rangeEnd));
}

/* ---------------------------------------------------------
   SEED DATA
--------------------------------------------------------- */

// Demo data only. Doses and instructions are placeholders, not medical guidance.
const seedMeds = () => [
  { id: "med_amox", kidId: "alex", name: "Amoxicillin", dose: "5 mL", frequency: "Every day", times: ["08:00", "20:00"], startDate: todayISO(-3), endDate: todayISO(6), instructions: "Give with food" },
  { id: "med_cetirizine", kidId: "mia", name: "Cetirizine", dose: "5 mg", frequency: "Every day", times: ["08:00"], startDate: todayISO(-30), endDate: null, instructions: "Morning, before school" },
  { id: "med_vitd", kidId: "mia", name: "Vitamin D drops", dose: "1 drop", frequency: "Once a week", times: ["09:00"], startDate: todayISO(-14), endDate: null, instructions: "" },
  { id: "med_inhaler", kidId: "mia", name: "Albuterol inhaler", dose: "2 puffs", frequency: "As needed", times: [], startDate: todayISO(-60), endDate: null, instructions: "Only as directed by her doctor" },
];

const seedProfiles = () => ({
  alex: { allergies: "Peanuts (EpiPen in his backpack)", doctor: "Dr. Patel, Children's Medical Center", contact: "", notes: "Bedtime is 8:30 PM. Likes the hallway light on." },
  mia: { allergies: "Pollen, dust mites", doctor: "Dr. Patel, Children's Medical Center", contact: "", notes: "Her inhaler lives in the front pocket of her school bag." },
});

const seedEvents = () => [
  {
    id: uid("ev"),
    title: "Soccer Practice",
    description: "Bring cleats and water bottle",
    date: todayISO(0),
    startTime: "17:30",
    endTime: "18:30",
    allDay: false,
    location: "Riverside Field",
    category: "Sports",
    participants: ["alex", "dad"],
    createdBy: "mom",
    history: [
      { by: "mom", at: "Aug 5", note: "Created event" },
      { by: "dad", at: "Aug 10", note: "Time changed from 5:00 PM to 5:30 PM", reason: "Coach moved practice back half an hour." },
    ],
  },
  {
    id: uid("ev"),
    title: "Pediatrician Appointment",
    description: "Annual checkup for Mia",
    date: todayISO(1),
    startTime: "10:30",
    endTime: "11:00",
    allDay: false,
    location: "Children's Medical Center",
    category: "Medical",
    participants: ["mom", "mia"],
    createdBy: "mom",
    history: [{ by: "mom", at: "Aug 8", note: "Created event" }],
  },
  {
    id: "ev_picture_day",
    title: "School Picture Day",
    description: "Nice clothes for both kids",
    date: todayISO(3),
    startTime: null,
    endTime: null,
    allDay: true,
    location: "Lincoln Elementary",
    category: "School",
    participants: ["alex", "mia"],
    createdBy: "mom",
    history: [{ by: "mom", at: "Aug 7", note: "Created event" }],
  },
  {
    id: uid("ev"),
    title: "Trash Day",
    description: "",
    date: todayISO(2),
    startTime: null,
    endTime: null,
    allDay: true,
    location: "",
    category: "Family",
    participants: ["dad"],
    createdBy: "dad",
    recurrence: "Weekly",
    history: [{ by: "dad", at: "Jul 1", note: "Created recurring event" }],
  },
  {
    id: uid("ev"),
    title: "Speech Therapy",
    description: "",
    date: todayISO(5),
    startTime: "15:45",
    endTime: "16:30",
    allDay: false,
    location: "Bright Steps Clinic",
    category: "Appointment",
    participants: ["alex", "mom"],
    createdBy: "mom",
    recurrence: "Weekly",
    history: [{ by: "mom", at: "Jul 20", note: "Created recurring event" }],
  },
  {
    id: uid("ev"),
    title: "Allergist Follow-up",
    description: "",
    date: todayISO(9),
    startTime: "09:15",
    endTime: "10:00",
    allDay: false,
    location: "Allergy & Asthma Associates",
    category: "Medical",
    participants: ["mia", "dad"],
    createdBy: "dad",
    recurrence: "Monthly",
    history: [{ by: "dad", at: "Jun 3", note: "Created recurring event" }],
  },
];

const seedTasks = () => [
  { id: uid("tk"), title: "Pick up groceries", category: "Shopping", assignedTo: "dad", priority: "Medium", dueDate: todayISO(0), completed: false, createdBy: "mom" },
  { id: uid("tk"), title: "Pay school fee", category: "School", assignedTo: null, priority: "High", dueDate: todayISO(0), completed: false, createdBy: "mom" },
  { id: uid("tk"), title: "Buy school supplies", category: "School", assignedTo: "mom", priority: "Medium", dueDate: todayISO(3), completed: false, createdBy: "mom", linkedEventId: "ev_picture_day", linkedEventTitle: "School Picture Day" },
  { id: uid("tk"), title: "Complete registration form", category: "School", assignedTo: "dad", priority: "Medium", dueDate: todayISO(3), completed: false, createdBy: "mom", linkedEventId: "ev_picture_day", linkedEventTitle: "School Picture Day" },
  { id: uid("tk"), title: "Call pediatrician to confirm", category: "Medical", assignedTo: "mom", priority: "Low", dueDate: todayISO(1), completed: false, createdBy: "mom" },
  { id: uid("tk"), title: "Buy diapers", category: "Shopping", assignedTo: "dad", priority: "Low", dueDate: todayISO(-1), completed: true, completedBy: "dad", createdBy: "mom" },
];

// Demo "photo": a tiny illustration so the feed has something to look at.
const seedPhoto = () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD9A8"/><stop offset="1" stop-color="#FFF1DC"/></linearGradient></defs><rect width="800" height="600" fill="url(#s)"/><circle cx="610" cy="150" r="70" fill="#FFB75E"/><path d="M0 380 Q200 300 400 370 T800 340 V600 H0Z" fill="#8CC9A0"/><path d="M0 450 Q250 390 480 450 T800 430 V600 H0Z" fill="#5FAF82"/><circle cx="300" cy="500" r="34" fill="#fff" stroke="#2B2622" stroke-width="5"/><path d="M300 480l14 10-5 17h-18l-5-17z" fill="#2B2622"/></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
};

const seedPosts = () => [
  {
    id: uid("pt"),
    author: "mom",
    type: "Photo",
    content: "Alex's first game of the season! He scored! ⚽",
    images: [seedPhoto()],
    createdAt: "20 minutes ago",
    reactions: { "❤️": ["dad", "mia"], "👍": [], "😂": [] },
    comments: [
      { id: uid("cm"), by: "dad", text: "That kick!! So proud.", at: "15 min ago" },
      { id: uid("cm"), by: "mia", text: "Go Alex!!", at: "10 min ago" },
    ],
  },
  {
    id: uid("pt"),
    author: "mom",
    type: "Reminder",
    content: "Picture day is Friday. Don't forget the boys need nice clothes!",
    images: [],
    createdAt: "2 hours ago",
    reactions: { "❤️": ["dad"], "👍": [], "😂": [] },
    comments: [{ id: uid("cm"), by: "dad", text: "Got it. I'll lay out their nice shirts tonight.", at: "1 hour ago" }],
  },
  {
    id: uid("pt"),
    author: "dad",
    type: "Change",
    content: "Moved the dentist appointment from Thursday to Monday because of a work conflict.",
    images: [],
    createdAt: "Yesterday",
    reactions: { "❤️": [], "👍": ["mom"], "😂": [] },
    comments: [],
  },
];

const seedActivity = () => [
  { id: uid("ac"), text: "Dad changed Soccer Practice", sub: "5:00 PM → 5:30 PM", by: "dad", at: "2h ago" },
  { id: uid("ac"), text: "Mom added Pediatrician Appointment", by: "mom", at: "1d ago" },
  { id: uid("ac"), text: "Dad completed Buy diapers", by: "dad", at: "1d ago" },
];

/* ---------------------------------------------------------
   SMALL UI PRIMITIVES
--------------------------------------------------------- */

function AvatarDot({ id, size = 22 }) {
  const m = memberById(id);
  return (
    <div
      title={m.name}
      style={{
        width: size, height: size, borderRadius: "50%",
        background: `linear-gradient(145deg, ${m.light}, #fff)`, border: `${size >= 28 ? 2 : 1.5}px solid ${m.color}`,
        boxShadow: size >= 28 ? `0 2px 6px ${m.color}33` : "none",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.55, flexShrink: 0,
      }}
    >
      {m.emoji}
    </div>
  );
}

function AvatarStack({ ids = [] }) {
  if (!ids.length) return null;
  return (
    <div style={{ display: "flex" }}>
      {ids.map((id, i) => (
        <div key={id} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: ids.length - i, borderRadius: "50%", boxShadow: "0 0 0 2px #fff" }}>
          <AvatarDot id={id} size={24} />
        </div>
      ))}
    </div>
  );
}

function CategoryBadge({ category }) {
  const meta = CATEGORY_META[category] || CATEGORY_META.Other;
  const Icon = meta.icon;
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        fontSize: 11, fontWeight: 600, padding: "3px 8px 3px 6px",
        borderRadius: 999, background: `${meta.color}15`, color: meta.color,
        letterSpacing: 0.2,
      }}
    >
      <Icon size={11} strokeWidth={2.5} />
      {category}
    </span>
  );
}

function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function relativeDay(dateStr) {
  const d0 = parseLocalDate(todayISO(0));
  const d1 = parseLocalDate(dateStr);
  const diff = Math.round((d1 - d0) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return d1.toLocaleDateString(undefined, { weekday: "long" });
  return d1.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function countdownLabel(dateStr) {
  const d0 = parseLocalDate(todayISO(0));
  const d1 = parseLocalDate(dateStr);
  const diff = Math.round((d1 - d0) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff > 1) return `In ${diff} days`;
  return "";
}

/* Toast for "live sync" simulation */
function LiveToast({ toast }) {
  if (!toast) return null;
  return (
    <div
      style={{
        position: "fixed", top: 72, left: "50%", transform: "translateX(-50%)",
        background: "#2B2622", color: "#FFF9F0", padding: "9px 16px",
        borderRadius: 12, fontSize: 13, fontWeight: 600, zIndex: 200,
        display: "flex", alignItems: "center", gap: 7, boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
        maxWidth: "88%", animation: "slideDown 0.25s ease",
      }}
    >
      <Check size={14} color="#7FD9A8" strokeWidth={3} />
      {toast}
    </div>
  );
}

/* ---------------------------------------------------------
   MAIN APP
--------------------------------------------------------- */

const TABS = [
  { id: "home", label: "Home", icon: Home },
  { id: "manager", label: "Manager", icon: Heart },
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "events", label: "Events", icon: Clock },
  { id: "wall", label: "Family Wall", icon: MessageSquare },
];

const DESKTOP_BREAKPOINT = 900;

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== "undefined" ? window.innerWidth >= DESKTOP_BREAKPOINT : false
  );
  useEffect(() => {
    function onResize() {
      setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isDesktop;
}

export default function FamilyApp() {
  const isDesktop = useIsDesktop();
  const [currentUser, setCurrentUser] = useState("mom");
  const [tab, setTab] = useState("home");
  const [events, setEvents] = useState(seedEvents);
  const [tasks, setTasks] = useState(seedTasks);
  const [posts, setPosts] = useState(seedPosts);
  const [activity, setActivity] = useState(seedActivity);
  const [toast, setToast] = useState(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [composerType, setComposerType] = useState(null); // "event" | "task" | "appointment" | "post"
  const [composerDate, setComposerDate] = useState(null);
  const [composerParticipants, setComposerParticipants] = useState([]);
  const [composerPostType, setComposerPostType] = useState("Update");
  const [meds, setMeds] = useState(seedMeds);
  const [doseLog, setDoseLog] = useState({});
  const [profiles, setProfiles] = useState(seedProfiles);
  const [sheet, setSheet] = useState(null);
  const [historyModal, setHistoryModal] = useState(null);
  const [online, setOnline] = useState(true);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [familyName, setFamilyName] = useState("The Martinez Family");
  const toastTimer = useRef(null);

  function fireToast(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }

  function pushActivity(text, sub, by, targetEvent) {
    setActivity((a) => [{ id: uid("ac"), text, sub, by, at: "just now", target: targetEvent || null }, ...a].slice(0, 20));
  }

  function nowClock() {
    const d = new Date();
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, "0");
    const period = h >= 12 ? "PM" : "AM";
    h = h % 12 === 0 ? 12 : h % 12;
    return `${h}:${m} ${period}`;
  }

  /* ---- Load storage on mount ---- */
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage?.get("family-data-v3", true);
        if (res?.value) {
          const data = JSON.parse(res.value);
          if (data.events) setEvents(data.events);
          if (data.tasks) setTasks(data.tasks);
          if (data.posts) setPosts(data.posts);
          if (data.activity) setActivity(data.activity);
          if (data.familyName) setFamilyName(data.familyName);
          if (data.meds) setMeds(data.meds);
          if (data.doseLog) setDoseLog(data.doseLog);
          if (data.profiles) setProfiles(data.profiles);
        }
      } catch (e) {
        /* no saved data yet — use seed */
      }
    })();
  }, []);

  /* ---- Persist to shared storage on change (simulates real-time backend) ---- */
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        await window.storage?.set(
          "family-data-v3",
          JSON.stringify({ events, tasks, posts, activity, familyName, meds, doseLog, profiles }),
          true
        );
      } catch (e) {
        /* best effort */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [events, tasks, posts, activity, familyName, meds, doseLog, profiles]);

  /* ---- ACTIONS ---- */

  function addEvent(ev) {
    const full = {
      id: uid("ev"),
      participants: [],
      history: [{ by: currentUser, at: "just now", note: "Created event" }],
      createdBy: currentUser,
      ...ev,
    };
    setEvents((e) => [...e, full]);
    pushActivity(`${memberById(currentUser).name} added "${ev.title}"`, null, currentUser, full);
    fireToast("Event added");
  }

  function updateEventTime(id, field, value, reason, scope) {
    const [masterId, occDate] = id.includes("::") ? id.split("::") : [id, null];
    let updatedEvent = null;

    setEvents((evts) =>
      evts.map((e) => {
        if (e.id !== masterId) return e;
        const isRecurring = !!e.recurrence;
        const editingJustThisOne = isRecurring && occDate && scope === "instance";

        const before = editingJustThisOne
          ? ((e.overrides && e.overrides[occDate] && e.overrides[occDate][field]) ?? e[field])
          : e[field];
        let note;
        if (field === "startTime") note = `Time changed from ${fmtTime(before)} to ${fmtTime(value)}`;
        else if (field === "location") note = before ? `Location changed from "${before}" to "${value}"` : `Location set to "${value}"`;
        else note = `${field} updated`;
        const historyEntry = { by: currentUser, at: "just now", note, reason };

        if (editingJustThisOne) {
          const existingOverride = (e.overrides && e.overrides[occDate]) || {};
          const merged = {
            ...e,
            overrides: {
              ...(e.overrides || {}),
              [occDate]: { ...existingOverride, [field]: value },
            },
            history: [...e.history, { ...historyEntry, note: `${historyEntry.note} (${relativeDay(occDate)} only)` }],
          };
          updatedEvent = { ...merged, ...merged.overrides[occDate], id, occurrenceDate: occDate };
          return merged;
        }

        // Editing the whole series (or a non-recurring event): patch the master.
        const patched = { ...e, [field]: value, history: [...e.history, historyEntry] };
        updatedEvent = patched;
        return patched;
      })
    );

    const sub = field === "startTime" ? fmtTime(value) : field === "location" ? value : null;
    pushActivity(`${memberById(currentUser).name} changed "${updatedEvent?.title || "an event"}"`, sub, currentUser, updatedEvent);
    fireToast("Event updated");
  }

  function deleteEvent(id, scope) {
    const [masterId, occDate] = id.includes("::") ? id.split("::") : [id, null];
    if (occDate && scope === "instance") {
      // Skip just this one occurrence — record it as an exception on the series.
      setEvents((evts) =>
        evts.map((e) => (e.id === masterId ? { ...e, exceptions: [...(e.exceptions || []), occDate] } : e))
      );
      fireToast("Occurrence deleted");
    } else {
      setEvents((e) => e.filter((x) => x.id !== masterId));
      fireToast("Event deleted");
    }
  }


  function addTask(tk) {
    const full = { id: uid("tk"), completed: false, createdBy: currentUser, ...tk };
    setTasks((t) => [...t, full]);
    pushActivity(`${memberById(currentUser).name} added "${tk.title}"`, null, currentUser);
    fireToast("Task added");
  }

  function toggleTask(id) {
    const [masterId, occDate] = id.includes("::") ? id.split("::") : [id, null];
    setTasks((ts) =>
      ts.map((t) => {
        if (t.id !== masterId) return t;

        if (occDate) {
          // Recurring occurrence: completion is per-date, stored in overrides.
          const existing = (t.overrides && t.overrides[occDate]) || {};
          const nowDone = !existing.completed;
          if (nowDone) {
            const clock = nowClock();
            pushActivity(`${memberById(currentUser).name} completed "${t.title}"`, clock, currentUser);
            fireToast(`"${t.title}" completed`);
          }
          return {
            ...t,
            overrides: {
              ...(t.overrides || {}),
              [occDate]: {
                ...existing,
                completed: nowDone,
                completedBy: nowDone ? currentUser : null,
                completedAt: nowDone ? nowClock() : null,
              },
            },
          };
        }

        // Non-recurring: toggle the master directly, as before.
        const nowDone = !t.completed;
        if (nowDone) {
          const clock = nowClock();
          pushActivity(`${memberById(currentUser).name} completed "${t.title}"`, clock, currentUser);
          fireToast(`"${t.title}" completed`);
        }
        return { ...t, completed: nowDone, completedBy: nowDone ? currentUser : null, completedAt: nowDone ? nowClock() : null };
      })
    );
  }

  function addPost(post) {
    const full = { id: uid("pt"), author: currentUser, createdAt: "just now", reactions: {}, images: [], ...post };
    setPosts((p) => [full, ...p]);
    pushActivity(`${memberById(currentUser).name} posted a Family Update`, null, currentUser);
    fireToast("Posted to Family Wall");
  }

  function toggleReaction(postId, emoji) {
    setPosts((ps) =>
      ps.map((p) => {
        if (p.id !== postId) return p;
        const cur = p.reactions[emoji] || [];
        const has = cur.includes(currentUser);
        const next = has ? cur.filter((u) => u !== currentUser) : [...cur, currentUser];
        return { ...p, reactions: { ...p.reactions, [emoji]: next } };
      })
    );
  }

  function addComment(postId, text) {
    const comment = { id: uid("cm"), by: currentUser, text, at: "just now" };
    const post = posts.find((p) => p.id === postId);
    setPosts((ps) => ps.map((p) => (p.id === postId ? { ...p, comments: [...(p.comments || []), comment] } : p)));
    if (post) pushActivity(`${memberById(currentUser).name} commented on ${memberById(post.author).name}'s post`, null, currentUser);
  }

  function openComposerFor(type, date, participants, postType) {
    setComposerDate(date || todayISO(0));
    setComposerParticipants(participants || []);
    setComposerPostType(postType || "Update");
    setComposerType(type);
  }

  /* ---- Family Manager actions ---- */

  function toggleDose(dose) {
    const wasGiven = !!doseLog[dose.key];
    setDoseLog((log) => {
      if (log[dose.key]) {
        const next = { ...log };
        delete next[dose.key];
        return next;
      }
      return { ...log, [dose.key]: { by: currentUser, at: nowClock() } };
    });
    if (wasGiven) {
      fireToast("Dose unmarked");
      return;
    }
    const kidName = memberById(dose.med.kidId).name;
    pushActivity(`${memberById(currentUser).name} gave ${kidName} ${dose.med.name}`, `${fmtTime(dose.time)} dose`, currentUser);
    fireToast(`${kidName}'s ${dose.med.name} marked given`);
  }

  function saveMed(med, isNew) {
    setMeds((ms) => (isNew ? [...ms, med] : ms.map((m) => (m.id === med.id ? med : m))));
    pushActivity(`${memberById(currentUser).name} ${isNew ? "added" : "changed"} ${med.name} for ${memberById(med.kidId).name}`, med.dose, currentUser);
    fireToast(isNew ? "Medication added" : "Medication updated");
  }

  function deleteMed(id) {
    setMeds((ms) => ms.filter((m) => m.id !== id));
    fireToast("Medication removed");
  }

  function saveProfile(kidId, data) {
    setProfiles((p) => ({ ...p, [kidId]: data }));
    pushActivity(`${memberById(currentUser).name} updated ${memberById(kidId).name}'s care info`, null, currentUser);
    fireToast("Care info saved");
  }

  /* ---- Derived ---- */
  // Expand recurring masters into virtual dated occurrences across a
  // generous visible window (recent past through 6 months ahead).
  const rangeStart = useMemo(() => todayISO(-60), []);
  const rangeEnd = useMemo(() => todayISO(180), []);
  const expandedEvents = useMemo(
    () => expandAllEvents(events, rangeStart, rangeEnd),
    [events, rangeStart, rangeEnd]
  );
  const expandedTasks = useMemo(
    () => expandAllTasks(tasks, rangeStart, rangeEnd),
    [tasks, rangeStart, rangeEnd]
  );
  const sortedUpcomingEvents = useMemo(
    () => [...expandedEvents].sort((a, b) => (a.date + (a.startTime || "")).localeCompare(b.date + (b.startTime || ""))),
    [expandedEvents]
  );
  const todaysEvents = sortedUpcomingEvents.filter((e) => e.date === todayISO(0));
  const todaysTasks = expandedTasks.filter((t) => t.dueDate === todayISO(0));
  const pendingDoses = meds.flatMap((m) => dosesFor(m, todayISO(0))).filter((d) => !doseLog[d.key]).sort((a, b) => a.time.localeCompare(b.time));

  if (sheet) {
    return (
      <div style={{ fontFamily: "'Inter', system-ui, sans-serif", color: "#2B2622" }}>
        <style>{FONT_CSS}</style>
        <CaregiverSheet
          initialKidIds={sheet.kidIds}
          meds={meds}
          profiles={profiles}
          events={sortedUpcomingEvents}
          doseLog={doseLog}
          preparedBy={memberById(currentUser).name}
          onClose={() => setSheet(null)}
        />
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#FFF9F0", minHeight: "100vh", color: "#2B2622", display: "flex" }}>
      <style>{FONT_CSS}</style>
      <LiveToast toast={toast} />

      {isDesktop && (
        <DesktopSidebar
          familyName={familyName}
          tab={tab}
          setTab={setTab}
          currentUser={currentUser}
          setCurrentUser={setCurrentUser}
          onQuickAdd={() => setQuickAddOpen(true)}
        />
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Top bar */}
        <div style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(255,249,240,0.86)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", borderBottom: "1px solid #F1E8D9", padding: isDesktop ? "16px 32px" : "14px 18px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
              {!isDesktop && (
                <div title={familyName} style={{ fontFamily: "'Baloo 2', sans-serif", fontSize: 17, fontWeight: 700, color: "#2B2622", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
                  {familyName}
                </div>
              )}
              {isDesktop && (
                <div style={{ fontFamily: "'Baloo 2', sans-serif", fontSize: 19, fontWeight: 700, color: "#2B2622", textTransform: "capitalize" }}>
                  {TABS.find((t) => t.id === tab)?.label || "Home"}
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <button onClick={() => setSearchOpen(true)} title="Search" aria-label="Search" style={{ background: "none", border: "none", cursor: "pointer", width: 34, height: 34, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#6B6259", flexShrink: 0 }}>
                <Search size={18} />
              </button>
              <button onClick={() => setSettingsOpen(true)} title="Settings" aria-label="Settings" style={{ background: "none", border: "none", cursor: "pointer", width: 34, height: 34, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#6B6259", flexShrink: 0 }}>
                <SettingsIcon size={18} />
              </button>
              {!isDesktop && (
                <button
                  onClick={() => setQuickAddOpen(true)}
                  title="Quick add"
                  aria-label="Quick add"
                  style={{
                    width: 36, height: 36, borderRadius: "50%", background: "#E8622C", color: "#fff", border: "none",
                    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
                    boxShadow: "0 2px 8px rgba(232,98,44,0.35)", marginLeft: 2,
                  }}
                >
                  <Plus size={20} strokeWidth={2.75} />
                </button>
              )}
              {!isDesktop && (
                <div style={{ position: "relative" }}>
                  <button
                    onClick={() => setSwitcherOpen((s) => !s)}
                    title="Demo tool — not real sign-in"
                    aria-label={`Demo: viewing as ${memberById(currentUser).name}. Tap to switch.`}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, background: "#FFFDF9",
                      border: `1.5px dashed ${memberById(currentUser).color}`, borderRadius: 999,
                      padding: "5px 12px 5px 6px", cursor: "pointer",
                    }}
                  >
                    <AvatarDot id={currentUser} size={22} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{memberById(currentUser).name}</span>
                  </button>
                  {switcherOpen && (
                    <div style={{ position: "absolute", right: 0, top: "115%", background: "#fff", borderRadius: 14, boxShadow: "0 8px 28px rgba(0,0,0,0.15)", padding: 6, zIndex: 60, minWidth: 190 }}>
                      <div style={{ fontSize: 10.5, color: "#A69C8E", padding: "7px 10px 6px", lineHeight: 1.4, borderBottom: "1px solid #F3ECE0", marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, color: "#6B6259" }}>Demo tool</span> — switches whose view you're testing. Not real sign-in.
                      </div>
                      {MEMBERS.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => { setCurrentUser(m.id); setSwitcherOpen(false); }}
                          style={{
                            display: "flex", alignItems: "center", gap: 8, width: "100%",
                            background: currentUser === m.id ? m.light : "transparent", border: "none",
                            borderRadius: 10, padding: "8px 10px", cursor: "pointer", fontSize: 13.5, fontWeight: 500,
                          }}
                        >
                          <AvatarDot id={m.id} size={20} /> {m.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          {!online && (
            <div style={{ marginTop: 8, fontSize: 12, background: "#FCE9DF", color: "#B24A1D", padding: "6px 10px", borderRadius: 8, fontWeight: 500 }}>
              You're offline. Changes will sync when you're back online.
            </div>
          )}
        </div>

        {/* Content */}
        <div key={tab} className="fade-up" style={{ maxWidth: isDesktop ? 900 : 560, margin: "0 auto", padding: isDesktop ? "24px 32px 60px" : "18px 16px 90px" }}>
          {tab === "home" && (
            <HomeTab
              currentUser={currentUser}
              todaysEvents={todaysEvents}
              todaysTasks={todaysTasks}
              upcoming={sortedUpcomingEvents.filter((e) => e.date > todayISO(0)).slice(0, 5)}
              posts={posts.slice(0, 3)}
              activity={activity.slice(0, 4)}
              toggleTask={toggleTask}
              toggleReaction={toggleReaction}
              openHistory={setHistoryModal}
              goTab={setTab}
              openComposer={openComposerFor}
              isDesktop={isDesktop}
              pendingDoses={pendingDoses}
            />
          )}
          {tab === "manager" && (
            <ManagerTab
              meds={meds}
              doseLog={doseLog}
              profiles={profiles}
              events={sortedUpcomingEvents}
              onToggleDose={toggleDose}
              onSaveMed={saveMed}
              onDeleteMed={deleteMed}
              onSaveProfile={saveProfile}
              onOpenEvent={setHistoryModal}
              onAddAppointment={(kidId) => openComposerFor("appointment", todayISO(0), [kidId])}
              onOpenSheet={(kidIds) => setSheet({ kidIds })}
            />
          )}
          {tab === "tasks" && (
            <TasksTab
              tasks={expandedTasks}
              toggleTask={toggleTask}
              currentUser={currentUser}
              openComposer={openComposerFor}
              onOpenLinkedEvent={(task) => {
                const master = events.find((e) => e.id === task.linkedEventId);
                if (master) setHistoryModal(master);
              }}
            />
          )}
          {tab === "events" && (
            <EventsTab
              events={sortedUpcomingEvents}
              openHistory={setHistoryModal}
              openComposer={openComposerFor}
              onUpdateTime={updateEventTime}
              onDelete={deleteEvent}
            />
          )}
          {tab === "wall" && <WallTab posts={posts} currentUser={currentUser} toggleReaction={toggleReaction} addComment={addComment} openComposer={openComposerFor} />}
        </div>
      </div>

      {/* Bottom nav — mobile only */}
      {!isDesktop && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(255,253,249,0.92)",
          backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
          borderTop: "1px solid #F1E8D9", display: "flex", zIndex: 60,
          paddingBottom: "max(6px, env(safe-area-inset-bottom))",
        }}>
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={active ? "page" : undefined}
                style={{
                  flex: 1, background: "none", border: "none", padding: "8px 4px 5px", cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                  color: active ? "#E8622C" : "#A69C8E",
                }}
              >
                <span style={{ width: 54, height: 30, borderRadius: 15, display: "flex", alignItems: "center", justifyContent: "center", background: active ? "#FCE9DF" : "transparent", transition: "background 0.2s" }}>
                  <Icon size={21} strokeWidth={active ? 2.4 : 2} />
                </span>
                <span style={{ fontSize: 10.5, fontWeight: active ? 700 : 500 }}>{t.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {quickAddOpen && (
        <QuickAddSheet
          onClose={() => setQuickAddOpen(false)}
          onSelect={(type) => { openComposerFor(type); setQuickAddOpen(false); }}
        />
      )}

      {composerType && (
        <Composer
          type={composerType}
          onClose={() => setComposerType(null)}
          onAddEvent={addEvent}
          onAddTask={addTask}
          onAddPost={addPost}
          initialDate={composerDate}
          initialParticipants={composerParticipants}
          initialPostType={composerPostType}
          existingEvents={events}
        />
      )}

      {historyModal && (
        <EventDetailModal
          event={historyModal}
          tasks={expandedTasks}
          onToggleTask={toggleTask}
          onClose={() => setHistoryModal(null)}
        />
      )}

      {searchOpen && (
        <SearchOverlay
          onClose={() => setSearchOpen(false)}
          events={sortedUpcomingEvents}
          tasks={expandedTasks}
          posts={posts}
          onOpenEvent={(e) => { setSearchOpen(false); setHistoryModal(e); }}
        />
      )}

      {settingsOpen && (
        <SettingsScreen
          onClose={() => setSettingsOpen(false)}
          familyName={familyName}
          onRenameFamily={(name) => { setFamilyName(name); fireToast("Name updated"); }}
          online={online}
          onToggleOffline={() => setOnline((o) => !o)}
        />
      )}
    </div>
  );
}


/* ---- Home: hero chips + per-person status ---- */

function StatChip({ icon: Icon, label, tone, onClick }) {
  const alert = tone === "alert";
  const style = {
    display: "inline-flex", alignItems: "center", gap: 6, background: alert ? "#E8622C" : "rgba(255,255,255,0.8)",
    color: alert ? "#fff" : "#2B2622", border: alert ? "none" : "1px solid rgba(232,98,44,0.18)",
    borderRadius: 999, padding: "7px 12px", fontSize: 12.5, fontWeight: 700, minHeight: 34,
    cursor: onClick ? "pointer" : "default",
  };
  const body = (<><Icon size={14} strokeWidth={2.4} /> {label}</>);
  return onClick ? <button onClick={onClick} style={style}>{body}</button> : <span style={style}>{body}</span>;
}

function memberStatus(m, events, tasks, doses) {
  const nowT = nowHHMM();
  const items = [];
  events.forEach((e) => {
    if (e.participants?.includes(m.id) && !e.allDay && e.startTime && e.startTime >= nowT) items.push({ t: e.startTime, text: e.title });
  });
  doses.forEach((d) => {
    if (d.med.kidId === m.id) items.push({ t: d.time, text: `${d.med.name} dose` });
  });
  items.sort((a, b) => a.t.localeCompare(b.t));
  if (items[0]) return { text: items[0].text, sub: fmtTime(items[0].t) };
  const open = tasks.filter((t) => t.assignedTo === m.id && !t.completed).length;
  if (open) return { text: `${open} task${open > 1 ? "s" : ""} to do`, sub: "Today" };
  const allDay = events.find((e) => e.participants?.includes(m.id) && e.allDay);
  if (allDay) return { text: allDay.title, sub: "All day" };
  return { text: "Free", sub: "Nothing planned" };
}

function FamilyStatusCard({ member, you, status }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #F1E8D9", boxShadow: CARD_SHADOW, borderRadius: 18, padding: "12px 14px", minWidth: 150, flexShrink: 0, scrollSnapAlign: "start", display: "flex", alignItems: "center", gap: 10 }}>
      <AvatarDot id={member.id} size={38} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{you ? "You" : member.name}</div>
        <div style={{ fontSize: 12, color: "#2B2622", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 124 }}>{status.text}</div>
        <div style={{ fontSize: 11, color: "#A69C8E" }}>{status.sub}</div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   DESKTOP SIDEBAR
--------------------------------------------------------- */

function DesktopSidebar({ familyName, tab, setTab, currentUser, setCurrentUser, onQuickAdd }) {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  return (
    <div style={{
      width: 232, flexShrink: 0, background: "#FFFDF9", borderRight: "1px solid #EFE4D2",
      display: "flex", flexDirection: "column", height: "100vh", position: "sticky", top: 0,
    }}>
      <div style={{ padding: "22px 20px 18px", fontFamily: "'Baloo 2', sans-serif", fontSize: 18, fontWeight: 700 }}>
        {familyName}
      </div>

      <button
        onClick={onQuickAdd}
        style={{
          margin: "0 16px 18px", background: "#E8622C", color: "#fff", border: "none", borderRadius: 12,
          padding: "10px 14px", fontSize: 13.5, fontWeight: 700, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          boxShadow: "0 4px 14px rgba(232,98,44,0.3)",
        }}
      >
        <Plus size={16} strokeWidth={2.5} /> Quick Add
      </button>

      <div style={{ flex: 1, padding: "0 12px" }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: "flex", alignItems: "center", gap: 11, width: "100%", background: active ? "#FCE9DF" : "transparent",
                border: "none", borderRadius: 11, padding: "10px 12px", marginBottom: 3, cursor: "pointer",
                color: active ? "#B24A1D" : "#6B6259", textAlign: "left",
              }}
            >
              <Icon size={17} strokeWidth={active ? 2.4 : 2} />
              <span style={{ fontSize: 13.5, fontWeight: active ? 700 : 500 }}>{t.label}</span>
            </button>
          );
        })}
      </div>

      <div style={{ padding: 12, borderTop: "1px solid #EFE4D2", position: "relative" }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, color: "#C9BEAC", letterSpacing: 0.5, padding: "0 2px 5px" }}>VIEWING AS · DEMO</div>
        <button
          onClick={() => setSwitcherOpen((s) => !s)}
          title="Demo tool — not real sign-in"
          style={{
            display: "flex", alignItems: "center", gap: 8, width: "100%", background: "#FFFDF9",
            border: `1.5px dashed ${memberById(currentUser).color}`, borderRadius: 12,
            padding: "8px 10px", cursor: "pointer",
          }}
        >
          <AvatarDot id={currentUser} size={24} />
          <span style={{ fontSize: 13, fontWeight: 600, flex: 1, textAlign: "left" }}>{memberById(currentUser).name}</span>
          <ChevronDown size={13} />
        </button>
        {switcherOpen && (
          <div style={{ position: "absolute", left: 12, right: 12, bottom: "108%", background: "#fff", borderRadius: 14, boxShadow: "0 8px 28px rgba(0,0,0,0.15)", padding: 6, zIndex: 60 }}>
            <div style={{ fontSize: 10.5, color: "#A69C8E", padding: "7px 10px 6px", lineHeight: 1.4, borderBottom: "1px solid #F3ECE0", marginBottom: 4 }}>
              <span style={{ fontWeight: 700, color: "#6B6259" }}>Demo tool</span> — switches whose view you're testing. Not real sign-in.
            </div>
            {MEMBERS.map((m) => (
              <button
                key={m.id}
                onClick={() => { setCurrentUser(m.id); setSwitcherOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  background: currentUser === m.id ? m.light : "transparent", border: "none",
                  borderRadius: 10, padding: "8px 10px", cursor: "pointer", fontSize: 13.5, fontWeight: 500,
                }}
              >
                <AvatarDot id={m.id} size={20} /> {m.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   HOME TAB
--------------------------------------------------------- */

function HomeTab({ currentUser, todaysEvents, todaysTasks, upcoming, posts, activity, toggleTask, toggleReaction, openHistory, goTab, openComposer, isDesktop, pendingDoses = [] }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const dateStr = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  const tasksLeft = todaysTasks.filter((t) => !t.completed).length;
  const heroChips = [];
  if (todaysEvents.length) heroChips.push({ icon: Calendar, label: `${todaysEvents.length} event${todaysEvents.length > 1 ? "s" : ""}` });
  if (tasksLeft) heroChips.push({ icon: CheckSquare, label: `${tasksLeft} task${tasksLeft > 1 ? "s" : ""} to do` });
  if (pendingDoses.length) heroChips.push({ icon: Stethoscope, label: `${pendingDoses.length} dose${pendingDoses.length > 1 ? "s" : ""} due`, tone: "alert", onClick: () => goTab("manager") });
  if (!heroChips.length) heroChips.push({ icon: Heart, label: "Nothing planned. Enjoy the day." });

  function timeToMinutes(t) {
    if (!t) return null;
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  }

  // Merge today's events + tasks into one time-sorted timeline (timed items first, by time; then untimed).
  const rawTimeline = [
    ...todaysEvents.map((e) => ({ kind: "event", time: e.allDay ? null : e.startTime, endTime: e.endTime, data: e })),
    ...todaysTasks.map((t) => ({ kind: "task", time: t.dueTime || null, data: t })),
  ].sort((a, b) => {
    if (a.time && b.time) return a.time.localeCompare(b.time);
    if (a.time) return -1;
    if (b.time) return 1;
    return 0;
  });

  // Tag each timed item as past / current / upcoming relative to right now.
  const timeline = rawTimeline.map((item) => {
    if (!item.time) return { ...item, status: "untimed" };
    const startMin = timeToMinutes(item.time);
    const endMin = item.endTime ? timeToMinutes(item.endTime) : startMin + 30;
    let status = "upcoming";
    if (item.kind === "task" && item.data.completed) status = "done";
    else if (nowMin >= startMin && nowMin < endMin) status = "current";
    else if (nowMin >= endMin) status = "past";
    return { ...item, status };
  });

  // Find the index right before which "NOW" should be inserted — the first
  // timed item that hasn't started yet (skipping untimed items, which have no position in the day).
  const nowInsertIndex = timeline.findIndex((item) => item.time && timeToMinutes(item.time) > nowMin && item.status !== "done");
  const hasTimedItems = timeline.some((item) => item.time);

  const mainColumn = (
    <div>
      <SectionLabel text={`Today · ${new Date().toLocaleDateString(undefined, { month: "long", day: "numeric" }).toUpperCase()}`} />
      {timeline.length === 0 && (
        <EmptyRow text="Nothing on the books today. Enjoy the quiet." />
      )}
      {timeline.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #F1E8D9", boxShadow: CARD_SHADOW, borderRadius: 14, padding: "6px 14px", marginBottom: 10 }}>
          {timeline.map((item, i) => (
            <React.Fragment key={item.data.id}>
              {hasTimedItems && i === nowInsertIndex && <NowDivider />}
              <TimelineRow
                item={item}
                isLast={i === timeline.length - 1}
                onToggleTask={item.kind === "task" ? () => toggleTask(item.data.id) : undefined}
                onOpenEvent={item.kind === "event" ? () => openHistory(item.data) : undefined}
                currentUser={currentUser}
              />
            </React.Fragment>
          ))}
          {hasTimedItems && nowInsertIndex === -1 && <NowDivider />}
        </div>
      )}

      <SectionLabel text="Coming Up" style={{ marginTop: 18 }} />
      {upcoming.length === 0 && <EmptyRow text="Nothing coming up yet." />}
      {upcoming.map((e) => (
        <EventRow key={e.id} event={e} onHistory={() => openHistory(e)} showDay />
      ))}
    </div>
  );

  const sideRail = (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <SectionLabel text="Family Updates" style={{ marginBottom: 0 }} />
        <button onClick={() => goTab("wall")} style={linkBtnStyle}>See all</button>
      </div>
      {posts.length === 0 ? (
        <EmptyState
          text="No family updates yet."
          sub="Share something with everyone."
          actionLabel="Post Update"
          onAction={() => openComposer("post")}
        />
      ) : (
        posts.map((p) => (
          <PostCard key={p.id} post={p} onReact={(emo) => toggleReaction(p.id, emo)} compact />
        ))
      )}

      <SectionLabel text="Recent Activity" style={{ marginTop: 18 }} />
      {activity.length === 0 ? (
        <EmptyRow text="No activity yet — the moment someone adds or changes something, it'll show up here." />
      ) : (
        <div style={{ background: "#fff", border: "1px solid #F1E8D9", boxShadow: CARD_SHADOW, borderRadius: 14, padding: "4px 14px" }}>
          {activity.map((a, i) => (
            <button
              key={a.id}
              onClick={() => a.target && openHistory(a.target)}
              style={{
                display: "flex", alignItems: "center", gap: 9, padding: "10px 0",
                borderBottom: i === activity.length - 1 ? "none" : "1px solid #F3ECE0",
                width: "100%", background: "none", border: "none", cursor: a.target ? "pointer" : "default",
                textAlign: "left", borderRadius: 0,
              }}
            >
              <AvatarDot id={a.by} size={22} />
              <div style={{ fontSize: 13, flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 500 }}>{a.text}</span>
                {a.sub && <span style={{ color: "#948C80" }}> — {a.sub}</span>}
              </div>
              <div style={{ marginLeft: "auto", fontSize: 11, color: "#B7AE9F", flexShrink: 0 }}>{a.at}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg, #FFE5CF 0%, #FFF1DF 55%, #FFF9F0 100%)", border: "1px solid #F6DFC8", boxShadow: CARD_SHADOW, borderRadius: 22, padding: "18px 18px 16px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <AvatarDot id={currentUser} size={52} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "'Baloo 2', sans-serif", fontSize: 25, fontWeight: 700, lineHeight: 1.1 }}>
              {greeting}, {memberById(currentUser).name}
            </div>
            <div style={{ color: "#8A7F70", fontSize: 13.5, marginTop: 3 }}>{dateStr}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          {heroChips.map((c) => <StatChip key={c.label} {...c} />)}
        </div>
      </div>

      <SectionLabel text="Who's up to what" />
      <div style={{ display: "flex", gap: 10, overflowX: "auto", margin: "0 -16px 18px", padding: "2px 16px 8px", scrollSnapType: "x proximity", scrollPaddingLeft: 16 }}>
        {MEMBERS.map((m) => <FamilyStatusCard key={m.id} member={m} you={m.id === currentUser} status={memberStatus(m, todaysEvents, todaysTasks, pendingDoses)} />)}
      </div>

      {/* Quick actions — open composers immediately, no navigation */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 22, maxWidth: isDesktop ? 420 : "none" }}>
        {[
          { label: "Event", icon: Calendar, type: "event" },
          { label: "Task", icon: CheckSquare, type: "task" },
          { label: "Appt.", icon: Stethoscope, type: "appointment" },
          { label: "Update", icon: MessageSquare, type: "post" },
        ].map((a) => (
          <button
            key={a.label}
            onClick={() => openComposer(a.type)}
            style={{
              background: "#fff", border: "1px solid #F1E8D9", boxShadow: CARD_SHADOW, borderRadius: 14, padding: "12px 4px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 5, cursor: "pointer",
            }}
          >
            <a.icon size={18} color="#E8622C" />
            <span style={{ fontSize: 11, fontWeight: 600 }}>{a.label}</span>
          </button>
        ))}
      </div>

      {isDesktop ? (
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 32, alignItems: "start" }}>
          {mainColumn}
          {sideRail}
        </div>
      ) : (
        <>
          {mainColumn}
          <div style={{ marginTop: 18 }}>{sideRail}</div>
        </>
      )}
    </div>
  );
}

function NowDivider() {
  const label = new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
      <div style={{ flex: 1, height: 1.5, background: "#E8622C", opacity: 0.35 }} />
      <span style={{ fontSize: 10, fontWeight: 800, color: "#E8622C", letterSpacing: 0.6 }}>NOW · {label}</span>
      <div style={{ flex: 1, height: 1.5, background: "#E8622C", opacity: 0.35 }} />
    </div>
  );
}

function TimelineRow({ item, isLast, onToggleTask, onOpenEvent, currentUser }) {
  const { kind, data, time, status } = item;
  const meta = kind === "event" ? (CATEGORY_META[data.category] || CATEGORY_META.Other) : null;
  const Icon = kind === "event" ? meta.icon : CheckSquare;
  const label = time ? fmtTime(time) : kind === "event" ? "All day" : "Any time";
  const isDone = kind === "task" && data.completed;
  const isPast = status === "past" && !isDone;
  const isCurrent = status === "current";
  const isMine = kind === "task" && data.assignedTo === currentUser;

  // Visual weight: current > upcoming/untimed > past > done.
  const rowOpacity = isPast ? 0.55 : isDone ? 0.6 : 1;

  return (
    <div
      style={{
        display: "flex", gap: 12, padding: isCurrent ? "10px 10px" : "10px 0",
        margin: isCurrent ? "2px -10px" : 0,
        borderRadius: isCurrent ? 12 : 0,
        background: isCurrent ? "#FCE9DF" : "transparent",
        borderBottom: isLast && !isCurrent ? "none" : isCurrent ? "none" : "1px solid #F3ECE0",
        opacity: rowOpacity, transition: "opacity 0.2s",
      }}
    >
      <div style={{ width: 62, flexShrink: 0, fontSize: 11.5, fontWeight: isCurrent ? 800 : 600, color: isCurrent ? "#B24A1D" : "#948C80", paddingTop: 2 }}>
        {label}
      </div>
      {kind === "task" ? (
        <button onClick={onToggleTask} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: data.completed ? "#1F6F5C" : isMine ? "#E8622C" : "#C9BEAC", flexShrink: 0 }} aria-label={data.completed ? "Mark task incomplete" : "Mark task complete"}>
          {data.completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
        </button>
      ) : (
        <div style={{ color: meta.color, flexShrink: 0 }}>
          <Icon size={17} />
        </div>
      )}
      <button
        onClick={kind === "event" ? onOpenEvent : undefined}
        style={{
          flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", padding: 0,
          cursor: kind === "event" ? "pointer" : "default",
        }}
      >
        <div style={{
          fontSize: 13.5, fontWeight: 600,
          textDecoration: isDone ? "line-through" : "none",
          color: isDone ? "#A69C8E" : "#2B2622",
        }}>
          {data.title}
          {kind === "event" && data.recurrence && <span style={{ fontSize: 10, color: "#A69C8E", fontWeight: 500 }}> · 🔁</span>}
        </div>
        {kind === "task" && data.assignedTo && (
          <div style={{ fontSize: 11.5, color: isMine && !isDone ? "#E8622C" : "#A69C8E", marginTop: 1, fontWeight: isMine && !isDone ? 700 : 400 }}>
            {isMine ? "You" : memberById(data.assignedTo).name}
          </div>
        )}
        {kind === "event" && (data.location || data.participants?.length > 0) && (
          <div style={{ fontSize: 11.5, color: "#A69C8E", marginTop: 1 }}>
            {data.location}
            {data.location && data.participants?.length > 0 && " · "}
            {data.participants?.length > 0 && data.participants.map((id) => id === currentUser ? "You" : memberById(id).name).join(" + ")}
          </div>
        )}
      </button>
      {kind === "task" && !data.assignedTo && <span style={{ fontSize: 10.5, color: "#C9BEAC", flexShrink: 0, alignSelf: "center" }}>Unassigned</span>}
    </div>
  );
}

const linkBtnStyle = {
  background: "none", border: "none", color: "#E8622C", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 2,
};

function EmptyState({ text, sub, actionLabel, onAction }) {
  return (
    <div style={{ background: "#fff", border: "1px dashed #E4D9C6", borderRadius: 14, padding: "22px 16px", textAlign: "center", marginBottom: 10 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: "#6B6259" }}>{text}</div>
      {sub && <div style={{ fontSize: 12.5, color: "#A69C8E", marginTop: 3 }}>{sub}</div>}
      {actionLabel && (
        <button onClick={onAction} style={{ marginTop: 12, background: "#E8622C", color: "#fff", border: "none", borderRadius: 10, padding: "8px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function SectionLabel({ text, style }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 700, color: "#6B6259", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, ...style }}>
      {text}
    </div>
  );
}

function EmptyRow({ text }) {
  return (
    <div style={{ background: "#fff", border: "1px dashed #E4D9C6", borderRadius: 14, padding: "16px", textAlign: "center", color: "#A69C8E", fontSize: 13, marginBottom: 10 }}>
      {text}
    </div>
  );
}

/* ---------------------------------------------------------
   EVENT ROW / CARD
--------------------------------------------------------- */

function EventRow({ event, onHistory, showDay }) {
  const meta = CATEGORY_META[event.category] || CATEGORY_META.Other;
  const cd = countdownLabel(event.date);
  return (
    <div style={{ background: "#fff", border: "1px solid #F1E8D9", boxShadow: CARD_SHADOW, borderRadius: 14, padding: "12px 14px", marginBottom: 9, display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{ width: 4, alignSelf: "stretch", borderRadius: 4, background: meta.color, minHeight: 36 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: 14.5 }}>{event.title}</span>
          {event.recurrence && <span style={{ fontSize: 10, color: "#A69C8E" }}>🔁 {recurrenceLabel(event.recurrence, event.date)}</span>}
        </div>
        <div style={{ fontSize: 12.5, color: "#6B6259", marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {showDay && <span style={{ fontWeight: 600, color: "#E8622C" }}>{relativeDay(event.date)}</span>}
          <span>{event.allDay ? "All day" : event.endTime ? `${fmtTime(event.startTime)} – ${fmtTime(event.endTime)}` : fmtTime(event.startTime)}</span>
          {event.location && (
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <MapPin size={11} /> {event.location}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7 }}>
          <CategoryBadge category={event.category} />
          <AvatarStack ids={event.participants} />
          {cd && <span style={{ fontSize: 11, color: "#948C80", marginLeft: "auto" }}>{cd}</span>}
        </div>
      </div>
      {event.history?.length > 0 && (
        <button onClick={onHistory} style={{ background: "none", border: "none", cursor: "pointer", color: "#C9BEAC", padding: 2 }} title="View history">
          <History size={15} />
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   FAMILY MANAGER
   Per-child medications, appointments, care info, and a
   printable caregiver sheet for sitters / grandparents.
--------------------------------------------------------- */

const CHILDREN = MEMBERS.filter((m) => m.isChild);
const MED_FREQUENCIES = ["Every day", "Once a week", "As needed"];

function fmtShortDate(dateStr) {
  return parseLocalDate(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtDayLong(dateStr) {
  return parseLocalDate(dateStr).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/* ---- Medication schedule logic ---- */

function medRunsOn(med, dateStr) {
  if (med.frequency === "As needed") return false;
  if (dateStr < med.startDate) return false;
  if (med.endDate && dateStr > med.endDate) return false;
  if (med.frequency === "Once a week" && parseLocalDate(dateStr).getDay() !== parseLocalDate(med.startDate).getDay()) return false;
  return true;
}

function dosesFor(med, dateStr) {
  if (!medRunsOn(med, dateStr)) return [];
  return [...med.times].sort().map((time) => ({ med, date: dateStr, time, key: `${med.id}|${dateStr}|${time}` }));
}

function medIsCurrent(med) {
  return !med.endDate || med.endDate >= todayISO(0);
}

function medWhenLabel(med) {
  if (med.frequency === "As needed") return "As needed";
  const times = [...med.times].sort().map(fmtTime).join(", ");
  if (med.frequency === "Once a week") {
    const day = parseLocalDate(med.startDate).toLocaleDateString(undefined, { weekday: "long" });
    return `${day}s · ${times}`;
  }
  return `Every day · ${times}`;
}

function medCourseLabel(med) {
  const starts = med.startDate > todayISO(0) ? `Starts ${fmtShortDate(med.startDate)} · ` : "";
  if (!med.endDate) return `${starts}Ongoing`;
  const diff = Math.round((parseLocalDate(med.endDate) - parseLocalDate(todayISO(0))) / 86400000);
  if (diff === 0) return `${starts}Last day today`;
  if (diff === 1) return `${starts}Ends tomorrow`;
  return `${starts}Until ${fmtShortDate(med.endDate)} · ${diff} days left`;
}

// First dose that hasn't been marked given yet (today's missed doses count as overdue).
function nextDose(med, doseLog) {
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

function nextDoseLabel(nd) {
  if (!nd) return null;
  return `${nd.overdue ? "Overdue · " : ""}${relativeDay(nd.date)} ${fmtTime(nd.time)}`;
}

// One row per appointment series (a weekly appointment shows once, with its next date).
function groupKidSeries(events, kidId) {
  const today = todayISO(0);
  const map = new Map();
  events.forEach((e) => {
    if (!e.participants?.includes(kidId) || e.date < today) return;
    const key = e.masterId || e.id;
    if (!map.has(key)) map.set(key, e);
  });
  return [...map.values()];
}

/* ---- Small shared pieces ---- */

const managerCard = { background: "#fff", border: "1px solid #F1E8D9", boxShadow: CARD_SHADOW, borderRadius: 16, padding: 14, marginBottom: 10 };
const textBtn = { background: "none", border: "none", color: "#E8622C", fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: "8px 6px", minHeight: 36 };

function DoseChip({ dose, entry, onToggle }) {
  const given = !!entry;
  return (
    <button
      onClick={() => onToggle(dose)}
      aria-pressed={given}
      aria-label={`${dose.med.name} ${fmtTime(dose.time)} dose, ${given ? "given. Tap to undo" : "not given yet. Tap to mark as given"}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5, minHeight: 36,
        border: `1.5px solid ${given ? "#1F6F5C" : "#E4D9C6"}`, background: given ? "#E4F1EC" : "#fff",
        color: given ? "#155C4A" : "#2B2622", borderRadius: 999, padding: "6px 12px",
        fontSize: 12.5, fontWeight: 700, cursor: "pointer", transition: "background 0.15s, border-color 0.15s",
      }}
    >
      {given ? <Check size={13} strokeWidth={3} /> : <Circle size={13} />}
      {fmtTime(dose.time)}
      {given && <span style={{ fontWeight: 500, fontSize: 11 }}>· {memberById(entry.by).name}</span>}
    </button>
  );
}

function MedCard({ med, doseLog, onToggleDose, onEdit }) {
  const todays = dosesFor(med, todayISO(0));
  const nd = nextDose(med, doseLog);
  return (
    <div style={managerCard}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {med.name} <span style={{ fontWeight: 500, color: "#6B6259" }}>· {med.dose}</span>
          </div>
          <div style={{ fontSize: 12.5, color: "#6B6259", marginTop: 3 }}>{medWhenLabel(med)}</div>
          {med.instructions && (
            <div style={{ fontSize: 12, color: "#8A7F70", marginTop: 3, fontStyle: "italic" }}>{med.instructions}</div>
          )}
        </div>
        <button onClick={onEdit} style={textBtn} aria-label={`Edit ${med.name}`}>Edit</button>
      </div>

      {todays.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "#A69C8E", letterSpacing: 0.5, marginBottom: 6 }}>TODAY</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {todays.map((d) => <DoseChip key={d.key} dose={d} entry={doseLog[d.key]} onToggle={onToggleDose} />)}
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginTop: 10, paddingTop: 9, borderTop: "1px solid #F3ECE0", fontSize: 11.5, color: "#948C80" }}>
        <span>{medCourseLabel(med)}</span>
        {nd && <span style={{ color: nd.overdue ? "#C4402A" : "#948C80", fontWeight: nd.overdue ? 700 : 500 }}>Next: {nextDoseLabel(nd)}</span>}
      </div>
    </div>
  );
}

/* ---- Overview: today's meds across all kids + a card per kid ---- */

function ManagerOverview({ meds, doseLog, profiles, events, onToggleDose, onSelectKid, onOpenSheet }) {
  const today = todayISO(0);
  const nowT = nowHHMM();
  const todays = meds.flatMap((m) => dosesFor(m, today)).sort((a, b) => a.time.localeCompare(b.time));
  const pending = todays.filter((d) => !doseLog[d.key]).length;
  const todayLabel = todays.length === 0 ? "Medications today" : pending === 0 ? "Medications today · all given ✓" : `Medications today · ${pending} to go`;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
        <div style={{ fontFamily: "'Baloo 2', sans-serif", fontSize: 22, fontWeight: 700 }}>Family Manager</div>
        <button
          onClick={() => onOpenSheet(CHILDREN.map((c) => c.id))}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", border: "1.5px solid #EFE4D2", borderRadius: 10, padding: "8px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", color: "#2B2622", minHeight: 38 }}
        >
          <Printer size={15} /> Caregiver sheet
        </button>
      </div>
      <div style={{ fontSize: 13, color: "#948C80", marginBottom: 18 }}>Who takes what, who has appointments, and what a sitter needs to know.</div>

      <SectionLabel text={todayLabel} />
      {todays.length === 0 ? (
        <EmptyRow text="No medications scheduled today." />
      ) : (
        <div style={{ background: "#fff", border: "1px solid #F1E8D9", boxShadow: CARD_SHADOW, borderRadius: 14, padding: "2px 14px", marginBottom: 10 }}>
          {todays.map((d, i) => {
            const entry = doseLog[d.key];
            const overdue = !entry && d.time < nowT;
            return (
              <div key={d.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i === todays.length - 1 ? "none" : "1px solid #F3ECE0", opacity: entry ? 0.65 : 1 }}>
                <button
                  onClick={() => onToggleDose(d)}
                  aria-pressed={!!entry}
                  aria-label={`${memberById(d.med.kidId).name}, ${d.med.name} at ${fmtTime(d.time)}: ${entry ? "given. Tap to undo" : "tap to mark as given"}`}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: entry ? "#1F6F5C" : "#C9BEAC", display: "flex" }}
                >
                  {entry ? <CheckCircle2 size={24} /> : <Circle size={24} />}
                </button>
                <div style={{ width: 62, flexShrink: 0, fontSize: 11.5, fontWeight: 700, color: overdue ? "#C4402A" : "#948C80" }}>{fmtTime(d.time)}</div>
                <AvatarDot id={d.med.kidId} size={24} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, textDecoration: entry ? "line-through" : "none" }}>
                    {memberById(d.med.kidId).name} · {d.med.name} <span style={{ fontWeight: 500, color: "#6B6259", whiteSpace: "nowrap" }}>{d.med.dose}</span>
                  </div>
                  {entry ? (
                    <div style={{ fontSize: 11, color: "#1F6F5C", fontWeight: 600 }}>✓ Given by {memberById(entry.by).name} · {entry.at}</div>
                  ) : overdue ? (
                    <div style={{ fontSize: 11, color: "#C4402A", fontWeight: 700 }}>Overdue{d.med.instructions ? ` · ${d.med.instructions}` : ""}</div>
                  ) : d.med.instructions ? (
                    <div style={{ fontSize: 11, color: "#A69C8E" }}>{d.med.instructions}</div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SectionLabel text="Kids" style={{ marginTop: 18 }} />
      {CHILDREN.map((kid) => {
        const kidMeds = meds.filter((m) => m.kidId === kid.id && medIsCurrent(m));
        const nextDoses = kidMeds.map((m) => nextDose(m, doseLog)).filter(Boolean).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
        const nextAppt = groupKidSeries(events, kid.id)[0];
        const allergies = profiles[kid.id]?.allergies;
        return (
          <button
            key={kid.id}
            onClick={() => onSelectKid(kid.id)}
            style={{ ...managerCard, width: "100%", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}
          >
            <AvatarDot id={kid.id} size={46} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15.5, fontWeight: 700 }}>{kid.name}</div>
              <div style={{ fontSize: 12.5, color: "#6B6259", marginTop: 2 }}>
                {kidMeds.length === 0 ? "No medications" : `${kidMeds.length} medication${kidMeds.length > 1 ? "s" : ""}`}
                {nextDoses[0] && ` · next ${nextDoseLabel(nextDoses[0])}`}
              </div>
              {nextAppt && (
                <div style={{ fontSize: 12, color: "#948C80", marginTop: 2 }}>
                  {nextAppt.recurrence ? "🔁 " : ""}{nextAppt.title} · {relativeDay(nextAppt.date)}
                </div>
              )}
              {allergies && <div style={{ fontSize: 11.5, color: "#C4402A", fontWeight: 600, marginTop: 3 }}>⚠ Allergies: {allergies}</div>}
            </div>
            <ChevronRightIcon size={18} color="#C9BEAC" />
          </button>
        );
      })}
    </div>
  );
}

function SectionHeader({ title, action, onAction }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 20, marginBottom: 8 }}>
      <SectionLabel text={title} style={{ marginBottom: 0 }} />
      {action && <button onClick={onAction} style={textBtn}>{action}</button>}
    </div>
  );
}

/* ---- One child's profile ---- */

function KidProfile({ kidId, meds, doseLog, profile, events, onBack, onToggleDose, onAddMed, onEditMed, onEditCare, onOpenEvent, onAddAppointment, onOpenSheet }) {
  const kid = memberById(kidId);
  const kidMeds = meds.filter((m) => m.kidId === kidId && medIsCurrent(m));
  const series = groupKidSeries(events, kidId);
  const hasCare = profile.allergies || profile.doctor || profile.contact || profile.notes;

  return (
    <div>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 3, background: "none", border: "none", color: "#6B6259", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "6px 0", minHeight: 36 }}>
        <ChevronLeft size={16} /> Family Manager
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "8px 0 14px" }}>
        <AvatarDot id={kidId} size={56} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Baloo 2', sans-serif", fontSize: 24, fontWeight: 700, lineHeight: 1.1 }}>{kid.name}</div>
          <div style={{ fontSize: 12.5, color: "#948C80", marginTop: 2 }}>
            {kidMeds.length} medication{kidMeds.length === 1 ? "" : "s"} · {series.length} upcoming appointment{series.length === 1 ? "" : "s"}
          </div>
        </div>
        <button
          onClick={() => onOpenSheet([kidId])}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", border: "1.5px solid #EFE4D2", borderRadius: 10, padding: "8px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", color: "#2B2622", minHeight: 38 }}
        >
          <Printer size={15} /> Care sheet
        </button>
      </div>

      {profile.allergies && (
        <div role="note" style={{ background: "#FDECE8", border: "1px solid #F3C9BF", borderRadius: 12, padding: "10px 12px", fontSize: 13, color: "#8F2F1D", fontWeight: 600 }}>
          ⚠ Allergies: {profile.allergies}
        </div>
      )}

      <SectionHeader title="Medications" action="+ Add medication" onAction={onAddMed} />
      {kidMeds.length === 0 ? (
        <EmptyState text={`No medications for ${kid.name}.`} sub="Add one and it will show up in today's list and on the care sheet." actionLabel="Add medication" onAction={onAddMed} />
      ) : (
        kidMeds.map((m) => <MedCard key={m.id} med={m} doseLog={doseLog} onToggleDose={onToggleDose} onEdit={() => onEditMed(m)} />)
      )}

      <SectionHeader title="Appointments & activities" action="+ Add" onAction={onAddAppointment} />
      {series.length === 0 ? (
        <EmptyState text={`Nothing scheduled for ${kid.name}.`} sub="Add an appointment and pick them as a participant." actionLabel="Add appointment" onAction={onAddAppointment} />
      ) : (
        series.map((e) => {
          const meta = CATEGORY_META[e.category] || CATEGORY_META.Other;
          const Icon = meta.icon;
          return (
            <button key={e.id} onClick={() => onOpenEvent(e)} style={{ ...managerCard, width: "100%", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, background: `${meta.color}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon size={17} color={meta.color} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{e.title}</div>
                <div style={{ fontSize: 12, color: "#6B6259", marginTop: 2 }}>
                  {e.recurrence ? `🔁 ${recurrenceLabel(e.recurrence, e.date)} · next ` : ""}
                  {fmtDayLong(e.date)}{!e.allDay && e.startTime ? ` · ${fmtTime(e.startTime)}` : ""}
                </div>
                {e.location && <div style={{ fontSize: 11.5, color: "#A69C8E", marginTop: 1 }}>{e.location}</div>}
              </div>
            </button>
          );
        })
      )}

      <SectionHeader title="Care info" action={hasCare ? "Edit" : undefined} onAction={onEditCare} />
      {!hasCare ? (
        <EmptyState text="No care info yet." sub="Allergies, doctor and notes appear on the care sheet." actionLabel="Add care info" onAction={onEditCare} />
      ) : (
        <div style={managerCard}>
          {[["Allergies", profile.allergies], ["Doctor", profile.doctor], ["Emergency contact", profile.contact], ["Notes", profile.notes]].map(([label, value]) =>
            value ? (
              <div key={label} style={{ padding: "7px 0", borderBottom: "1px solid #F3ECE0" }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: "#A69C8E", letterSpacing: 0.5 }}>{label.toUpperCase()}</div>
                <div style={{ fontSize: 13.5, marginTop: 2, lineHeight: 1.4 }}>{value}</div>
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}

/* ---- Add / edit medication ---- */

function MedModal({ kidId, med, onClose, onSave, onDelete }) {
  const isEdit = !!med;
  const [name, setName] = useState(med?.name || "");
  const [dose, setDose] = useState(med?.dose || "");
  const [frequency, setFrequency] = useState(med?.frequency || "Every day");
  const [times, setTimes] = useState(med?.times?.length ? med.times : ["08:00"]);
  const [startDate, setStartDate] = useState(med?.startDate || todayISO(0));
  const [hasEnd, setHasEnd] = useState(!!med?.endDate);
  const [endDate, setEndDate] = useState(med?.endDate || todayISO(7));
  const [instructions, setInstructions] = useState(med?.instructions || "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const asNeeded = frequency === "As needed";

  function save() {
    if (!name.trim()) return setError("Add the medication name.");
    if (!dose.trim()) return setError("Add the dose, for example 5 mL or 1 tablet.");
    if (!asNeeded && times.filter(Boolean).length === 0) return setError("Add at least one time.");
    if (hasEnd && endDate < startDate) return setError("The end date is before the start date.");
    onSave(
      {
        id: med?.id || uid("med"),
        kidId,
        name: name.trim(),
        dose: dose.trim(),
        frequency,
        times: asNeeded ? [] : [...new Set(times.filter(Boolean))].sort(),
        startDate,
        endDate: hasEnd ? endDate : null,
        instructions: instructions.trim(),
      },
      !isEdit
    );
  }

  return (
    <ModalShell onClose={onClose} title={`${isEdit ? "Edit" : "Add"} medication · ${memberById(kidId).name}`}>
      <FieldLabel>Medication</FieldLabel>
      <input aria-label="Medication name" autoFocus placeholder="e.g. Amoxicillin" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />

      <FieldLabel style={{ marginTop: 12 }}>Dose</FieldLabel>
      <input aria-label="Dose" placeholder="e.g. 5 mL, 1 tablet, 2 puffs" value={dose} onChange={(e) => setDose(e.target.value)} style={inputStyle} />

      <FieldLabel style={{ marginTop: 12 }}>How often</FieldLabel>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {MED_FREQUENCIES.map((f) => (
          <button key={f} onClick={() => setFrequency(f)} style={pillStyle(frequency === f)}>{f}</button>
        ))}
      </div>

      {!asNeeded && (
        <>
          <FieldLabel style={{ marginTop: 12 }}>Time{times.length > 1 ? "s" : ""} of day</FieldLabel>
          {times.map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <input
                type="time"
                aria-label={`Dose time ${i + 1}`}
                value={t}
                onChange={(e) => setTimes((ts) => ts.map((x, idx) => (idx === i ? e.target.value : x)))}
                style={{ ...inputStyle, flex: 1 }}
              />
              {times.length > 1 && (
                <button onClick={() => setTimes((ts) => ts.filter((_, idx) => idx !== i))} aria-label="Remove this time" style={{ ...iconBtnStyle, width: 40, height: 40, borderRadius: 12 }}>
                  <X size={15} />
                </button>
              )}
            </div>
          ))}
          <button onClick={() => setTimes((ts) => [...ts, "20:00"])} style={{ ...textBtn, padding: "6px 2px" }}>+ Add another time</button>
        </>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <div style={{ flex: 1 }}>
          <FieldLabel>{frequency === "Once a week" ? "First dose" : "Starts"}</FieldLabel>
          <input type="date" aria-label="Start date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
        </div>
        {hasEnd && (
          <div style={{ flex: 1 }}>
            <FieldLabel>Last day</FieldLabel>
            <input type="date" aria-label="Last day" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
          </div>
        )}
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "#6B6259", marginTop: 10, minHeight: 32 }}>
        <input type="checkbox" checked={hasEnd} onChange={(e) => setHasEnd(e.target.checked)} />
        It's a short course (has a last day)
      </label>

      <FieldLabel style={{ marginTop: 12 }}>Instructions <span style={{ fontWeight: 400, color: "#A69C8E" }}>(optional)</span></FieldLabel>
      <input aria-label="Instructions" placeholder="e.g. Give with food" value={instructions} onChange={(e) => setInstructions(e.target.value)} style={inputStyle} />

      {error && <div role="alert" style={{ marginTop: 12, fontSize: 12.5, fontWeight: 600, color: "#C4402A" }}>{error}</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
        {isEdit && (
          <button
            onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
            style={{ ...btnStyle, background: confirmDelete ? "#C4402A" : "#fff", color: confirmDelete ? "#fff" : "#C4402A", border: "1.5px solid #F3D9D2" }}
          >
            {confirmDelete ? "Tap again to delete" : "Delete"}
          </button>
        )}
        <button onClick={save} style={{ ...btnStyle, flex: 1, background: "#E8622C", color: "#fff" }}>{isEdit ? "Save changes" : "Add medication"}</button>
      </div>
    </ModalShell>
  );
}

/* ---- Allergies / doctor / contact / notes ---- */

function CareInfoModal({ kidId, profile, onClose, onSave }) {
  const [allergies, setAllergies] = useState(profile.allergies || "");
  const [doctor, setDoctor] = useState(profile.doctor || "");
  const [contact, setContact] = useState(profile.contact || "");
  const [notes, setNotes] = useState(profile.notes || "");

  return (
    <ModalShell onClose={onClose} title={`Care info · ${memberById(kidId).name}`}>
      <FieldLabel>Allergies</FieldLabel>
      <input aria-label="Allergies" autoFocus placeholder="e.g. Peanuts, bee stings" value={allergies} onChange={(e) => setAllergies(e.target.value)} style={inputStyle} />
      <FieldLabel style={{ marginTop: 12 }}>Doctor</FieldLabel>
      <input aria-label="Doctor" placeholder="Name and practice" value={doctor} onChange={(e) => setDoctor(e.target.value)} style={inputStyle} />
      <FieldLabel style={{ marginTop: 12 }}>Emergency contact</FieldLabel>
      <input aria-label="Emergency contact" placeholder="Name and phone number" value={contact} onChange={(e) => setContact(e.target.value)} style={inputStyle} />
      <FieldLabel style={{ marginTop: 12 }}>Notes for caregivers</FieldLabel>
      <textarea aria-label="Notes for caregivers" rows={3} placeholder="Bedtime routine, comfort items, anything a sitter should know" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
      <button
        onClick={() => onSave({ allergies: allergies.trim(), doctor: doctor.trim(), contact: contact.trim(), notes: notes.trim() })}
        style={{ ...btnStyle, width: "100%", background: "#E8622C", color: "#fff", marginTop: 18 }}
      >
        Save
      </button>
    </ModalShell>
  );
}

/* ---- The tab ---- */

function ManagerTab({ meds, doseLog, profiles, events, onToggleDose, onSaveMed, onDeleteMed, onSaveProfile, onOpenEvent, onAddAppointment, onOpenSheet }) {
  const [kidId, setKidId] = useState(null);
  const [medModal, setMedModal] = useState(null); // { kidId, med }
  const [careModal, setCareModal] = useState(null); // kidId

  return (
    <div>
      {kidId ? (
        <KidProfile
          kidId={kidId}
          meds={meds}
          doseLog={doseLog}
          profile={profiles[kidId] || {}}
          events={events}
          onBack={() => setKidId(null)}
          onToggleDose={onToggleDose}
          onAddMed={() => setMedModal({ kidId, med: null })}
          onEditMed={(med) => setMedModal({ kidId, med })}
          onEditCare={() => setCareModal(kidId)}
          onOpenEvent={onOpenEvent}
          onAddAppointment={() => onAddAppointment(kidId)}
          onOpenSheet={onOpenSheet}
        />
      ) : (
        <ManagerOverview meds={meds} doseLog={doseLog} profiles={profiles} events={events} onToggleDose={onToggleDose} onSelectKid={setKidId} onOpenSheet={onOpenSheet} />
      )}

      {medModal && (
        <MedModal
          kidId={medModal.kidId}
          med={medModal.med}
          onClose={() => setMedModal(null)}
          onSave={(m, isNew) => { onSaveMed(m, isNew); setMedModal(null); }}
          onDelete={() => { onDeleteMed(medModal.med.id); setMedModal(null); }}
        />
      )}
      {careModal && (
        <CareInfoModal
          kidId={careModal}
          profile={profiles[careModal] || {}}
          onClose={() => setCareModal(null)}
          onSave={(data) => { onSaveProfile(careModal, data); setCareModal(null); }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   CAREGIVER SHEET (printable)
   Replaces the whole app view while open, so printing only
   ever outputs the sheet.
--------------------------------------------------------- */

function buildSheet({ kidIds, days, meds, profiles, events }) {
  const today = todayISO(0);
  const dates = Array.from({ length: days }, (_, i) => todayISO(i));
  const last = dates[dates.length - 1];
  return kidIds.map((kidId) => {
    const kidMeds = meds.filter((m) => m.kidId === kidId && medIsCurrent(m) && m.startDate <= last);
    const scheduled = kidMeds.filter((m) => m.frequency !== "As needed");
    const asNeeded = kidMeds.filter((m) => m.frequency === "As needed");
    const schedule = dates.map((date) => ({
      date,
      doses: scheduled.flatMap((m) => dosesFor(m, date)).sort((a, b) => a.time.localeCompare(b.time)),
    }));
    const appts = events.filter((e) => e.participants?.includes(kidId) && e.date >= today && e.date <= last);
    return { kid: memberById(kidId), profile: profiles[kidId] || {}, scheduled, asNeeded, schedule, appts };
  });
}

function buildSheetText(sections, { forWho, extra, preparedBy, doseLog, rangeLabel }) {
  const lines = [];
  sections.forEach((s, idx) => {
    if (idx > 0) lines.push("", "----------------------------------------", "");
    lines.push(`CARE SHEET - ${s.kid.name.toUpperCase()}`, rangeLabel);
    if (forWho) lines.push(`Prepared for: ${forWho}`);
    lines.push("", `ALLERGIES: ${s.profile.allergies || "None listed"}`);
    lines.push(`Doctor: ${s.profile.doctor || "-"}`);
    lines.push(`Emergency contact: ${s.profile.contact || "-"}`);
    lines.push("", "MEDICATIONS");
    if (s.scheduled.length === 0 && s.asNeeded.length === 0) lines.push("No regular medications.");
    s.scheduled.forEach((m) => lines.push(`- ${m.name}, ${m.dose}: ${medWhenLabel(m)}${m.instructions ? ` (${m.instructions})` : ""}${m.endDate ? ` - through ${fmtShortDate(m.endDate)}` : ""}`));
    s.asNeeded.forEach((m) => lines.push(`- ${m.name}, ${m.dose}: as needed${m.instructions ? ` (${m.instructions})` : ""}`));
    if (s.scheduled.length > 0) {
      lines.push("", "SCHEDULE");
      s.schedule.forEach((day) => {
        lines.push(fmtDayLong(day.date) + (day.date === todayISO(0) ? " (today)" : ""));
        if (day.doses.length === 0) lines.push("  No scheduled doses");
        day.doses.forEach((d) => {
          const entry = doseLog[d.key];
          lines.push(`  ${fmtTime(d.time)}  ${d.med.name} ${d.med.dose}  ${entry ? `[x] given by ${memberById(entry.by).name} ${entry.at}` : "[ ] given: ____"}`);
        });
      });
    }
    if (s.appts.length > 0) {
      lines.push("", "APPOINTMENTS");
      s.appts.forEach((e) => lines.push(`- ${fmtDayLong(e.date)}${!e.allDay && e.startTime ? ` ${fmtTime(e.startTime)}` : ""}: ${e.title}${e.location ? ` (${e.location})` : ""}`));
    }
    if (s.profile.notes) lines.push("", `NOTES: ${s.profile.notes}`);
  });
  if (extra) lines.push("", `EXTRA NOTES: ${extra}`);
  lines.push("", `Prepared by ${preparedBy} on ${new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}.`, "Medication details are as entered by the family. Follow the label and the doctor's instructions. This sheet is not medical advice.");
  return lines.join("\n");
}

const sheetTh = { textAlign: "left", border: "1px solid #999", padding: "5px 8px", background: "#F2F2F2", fontSize: 12 };
const sheetTd = { border: "1px solid #999", padding: "5px 8px", verticalAlign: "top", fontSize: 12.5 };
const sheetH2 = { fontSize: 14, fontWeight: 800, margin: "18px 0 6px", textTransform: "uppercase", letterSpacing: 0.4 };

function CaregiverSheet({ initialKidIds, meds, profiles, events, doseLog, preparedBy, onClose }) {
  const [kidIds, setKidIds] = useState(initialKidIds);
  const [days, setDays] = useState(3);
  const [forWho, setForWho] = useState("");
  const [extra, setExtra] = useState("");
  const [msg, setMsg] = useState("");
  const [showText, setShowText] = useState(false);

  const sections = useMemo(() => buildSheet({ kidIds, days, meds, profiles, events }), [kidIds, days, meds, profiles, events]);
  const today = todayISO(0);
  const rangeLabel = days === 1 ? `Today, ${fmtDayLong(today)}` : `${fmtDayLong(today)} to ${fmtDayLong(todayISO(days - 1))}`;
  const text = buildSheetText(sections, { forWho, extra, preparedBy, doseLog, rangeLabel });

  function toggleKid(id) {
    setKidIds((ids) => {
      if (ids.includes(id)) return ids.length > 1 ? ids.filter((x) => x !== id) : ids; // keep at least one selected
      return CHILDREN.map((c) => c.id).filter((c) => c === id || ids.includes(c));
    });
  }

  function doPrint() {
    setMsg("");
    try {
      window.print();
    } catch (e) {
      setMsg("Printing is blocked in this preview. Use Copy text, or open the app in a full browser window.");
    }
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      setMsg("Copied. Paste it into a text or email.");
      setShowText(false);
    } catch (e) {
      setMsg("Couldn't copy automatically. Select the text below instead.");
      setShowText(true);
    }
  }

  return (
    <div className="sheet-root" style={{ minHeight: "100vh", background: "#F5EFE3", paddingBottom: 40 }}>
      <div className="no-print" style={{ background: "#FFF9F0", borderBottom: "1px solid #EFE4D2", padding: "12px 16px", position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onClose} style={{ ...iconBtnStyle, width: 38, height: 38 }} aria-label="Back to Family Manager"><ChevronLeft size={18} /></button>
          <div style={{ flex: 1, fontFamily: "'Baloo 2', sans-serif", fontSize: 18, fontWeight: 700 }}>Caregiver sheet</div>
          <button onClick={copyText} style={{ ...btnStyle, background: "#fff", border: "1.5px solid #EFE4D2", color: "#2B2622", padding: "9px 14px", fontSize: 13 }}>Copy text</button>
          <button onClick={doPrint} style={{ ...btnStyle, background: "#E8622C", color: "#fff", padding: "9px 14px", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
            <Printer size={15} /> Print
          </button>
        </div>
      </div>

      <div className="no-print" style={{ maxWidth: 760, margin: "14px auto 0", padding: "0 16px" }}>
        <div style={{ background: "#fff", border: "1px solid #F1E8D9", boxShadow: CARD_SHADOW, borderRadius: 14, padding: 14 }}>
          <FieldLabel>Who's it for?</FieldLabel>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {CHILDREN.map((c) => (
              <button key={c.id} onClick={() => toggleKid(c.id)} aria-pressed={kidIds.includes(c.id)} style={pillStyle(kidIds.includes(c.id))}>
                {kidIds.includes(c.id) ? "✓ " : ""}{c.emoji} {c.name}
              </button>
            ))}
          </div>
          <FieldLabel style={{ marginTop: 12 }}>How long?</FieldLabel>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[[1, "Today"], [3, "3 days"], [7, "A week"]].map(([n, label]) => (
              <button key={n} onClick={() => setDays(n)} aria-pressed={days === n} style={pillStyle(days === n)}>{label}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 200px" }}>
              <FieldLabel>Prepared for <span style={{ fontWeight: 400, color: "#A69C8E" }}>(optional)</span></FieldLabel>
              <input aria-label="Prepared for" placeholder="e.g. Grandma" value={forWho} onChange={(e) => setForWho(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: "2 1 260px" }}>
              <FieldLabel>Extra notes <span style={{ fontWeight: 400, color: "#A69C8E" }}>(optional)</span></FieldLabel>
              <input aria-label="Extra notes" placeholder="e.g. Bedtime is 8:00 PM" value={extra} onChange={(e) => setExtra(e.target.value)} style={inputStyle} />
            </div>
          </div>
          {msg && <div role="status" style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: "#6B6259" }}>{msg}</div>}
          <div style={{ marginTop: 8, fontSize: 11.5, color: "#A69C8E" }}>If Print does nothing, your preview may block printing. Copy text works anywhere.</div>
          {showText && (
            <textarea readOnly aria-label="Sheet as plain text" value={text} rows={8} onFocus={(e) => e.target.select()} style={{ ...inputStyle, marginTop: 10, fontFamily: "monospace", fontSize: 12 }} />
          )}
        </div>
      </div>

      <div className="care-sheet" style={{ maxWidth: 760, margin: "16px auto 0", background: "#fff", color: "#111", padding: "28px 32px", border: "1px solid #E4D9C6", borderRadius: 8, fontSize: 13, lineHeight: 1.45 }}>
        {sections.map((s, idx) => (
          <div key={s.kid.id} style={{ breakAfter: idx < sections.length - 1 ? "page" : "auto", pageBreakAfter: idx < sections.length - 1 ? "always" : "auto", marginBottom: idx < sections.length - 1 ? 40 : 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: "#666" }}>CARE SHEET</div>
            <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1 }}>{s.kid.name}</div>
            <div style={{ fontSize: 13, color: "#444", marginTop: 2 }}>{rangeLabel}{forWho ? ` · Prepared for ${forWho}` : ""}</div>

            <div style={{ border: "2px solid #111", borderRadius: 6, padding: "8px 12px", margin: "14px 0 8px", fontWeight: 700 }}>
              ALLERGIES: {s.profile.allergies || "None listed"}
            </div>
            <div style={{ fontSize: 13 }}><strong>Doctor:</strong> {s.profile.doctor || "______________________"}</div>
            <div style={{ fontSize: 13 }}><strong>Emergency contact:</strong> {s.profile.contact || "______________________"}</div>

            <div style={sheetH2}>Medications</div>
            {s.scheduled.length === 0 && s.asNeeded.length === 0 ? (
              <div style={{ fontSize: 13 }}>No regular medications.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr><th style={sheetTh}>Medication</th><th style={sheetTh}>Dose</th><th style={sheetTh}>When</th><th style={sheetTh}>Instructions</th><th style={sheetTh}>Through</th></tr>
                </thead>
                <tbody>
                  {[...s.scheduled, ...s.asNeeded].map((m) => (
                    <tr key={m.id}>
                      <td style={{ ...sheetTd, fontWeight: 700 }}>{m.name}</td>
                      <td style={sheetTd}>{m.dose}</td>
                      <td style={sheetTd}>{medWhenLabel(m)}</td>
                      <td style={sheetTd}>{m.instructions || "-"}</td>
                      <td style={sheetTd}>{m.endDate ? fmtShortDate(m.endDate) : "Ongoing"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {s.scheduled.length > 0 && (
              <>
                <div style={sheetH2}>Schedule</div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr><th style={{ ...sheetTh, width: 80 }}>Time</th><th style={sheetTh}>Medication</th><th style={sheetTh}>Dose</th><th style={{ ...sheetTh, width: 170 }}>Given (initials, time)</th></tr>
                  </thead>
                  <tbody>
                    {s.schedule.map((day) => (
                      <React.Fragment key={day.date}>
                        <tr><td colSpan={4} style={{ ...sheetTd, background: "#F7F7F7", fontWeight: 800 }}>{fmtDayLong(day.date)}{day.date === today ? " (today)" : ""}</td></tr>
                        {day.doses.length === 0 ? (
                          <tr><td colSpan={4} style={{ ...sheetTd, color: "#666" }}>No scheduled doses</td></tr>
                        ) : (
                          day.doses.map((d) => {
                            const entry = doseLog[d.key];
                            return (
                              <tr key={d.key}>
                                <td style={{ ...sheetTd, fontWeight: 700 }}>{fmtTime(d.time)}</td>
                                <td style={sheetTd}>{d.med.name}</td>
                                <td style={sheetTd}>{d.med.dose}</td>
                                <td style={sheetTd}>{entry ? `✓ ${memberById(entry.by).name} · ${entry.at}` : "☐  ____________"}</td>
                              </tr>
                            );
                          })
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {s.appts.length > 0 && (
              <>
                <div style={sheetH2}>Appointments</div>
                {s.appts.map((e) => (
                  <div key={e.id} style={{ fontSize: 13, marginBottom: 3 }}>
                    <strong>{fmtDayLong(e.date)}{!e.allDay && e.startTime ? `, ${fmtTime(e.startTime)}` : ""}</strong> · {e.title}{e.location ? ` (${e.location})` : ""}
                  </div>
                ))}
              </>
            )}

            {(s.profile.notes || extra) && (
              <>
                <div style={sheetH2}>Notes</div>
                {s.profile.notes && <div style={{ fontSize: 13 }}>{s.profile.notes}</div>}
                {extra && <div style={{ fontSize: 13, marginTop: 4 }}>{extra}</div>}
              </>
            )}

            <div style={{ marginTop: 22, paddingTop: 8, borderTop: "1px solid #999", fontSize: 10.5, color: "#555" }}>
              Prepared by {preparedBy} on {new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}. Medication details are as entered by the family. Follow the label and the doctor's instructions. This sheet is not medical advice.
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   EDIT EVENT (shared by the Events tab)
--------------------------------------------------------- */

function EventEditModal({ event, onClose, onSave, onDelete }) {
  const [time, setTime] = useState(event.startTime || "");
  const [location, setLocation] = useState(event.location || "");
  const [reason, setReason] = useState("");
  const [pendingAction, setPendingAction] = useState(null); // "save" | "delete" | null — awaiting scope choice

  const timeChanged = time !== (event.startTime || "");
  const locationChanged = location !== (event.location || "");
  const isRecurring = !!event.recurrence;

  function requestSave() {
    if (!timeChanged && !locationChanged) { onClose(); return; }
    if (isRecurring) setPendingAction("save");
    else commitSave("series");
  }

  function commitSave(scope) {
    if (timeChanged) onSave("startTime", time, reason, scope);
    else if (locationChanged) onSave("location", location, reason, scope);
    setPendingAction(null);
  }

  function requestDelete() {
    if (isRecurring) setPendingAction("delete");
    else onDelete("series");
  }

  if (pendingAction) {
    return (
      <ModalShell onClose={() => setPendingAction(null)} title={pendingAction === "delete" ? "Delete Event" : "Edit Event"}>
        <div style={{ fontSize: 13, color: "#6B6259", marginBottom: 16, lineHeight: 1.5 }}>
          "{event.title}" repeats {recurrenceLabel(event.recurrence, event.date)?.toLowerCase()}.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            onClick={() => pendingAction === "delete" ? onDelete("instance") : commitSave("instance")}
            style={{ ...btnStyle, background: "#fff", border: "1.5px solid #EFE4D2", color: "#2B2622", textAlign: "left" }}
          >
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>This occurrence only</div>
            <div style={{ fontSize: 11.5, color: "#948C80", fontWeight: 400, marginTop: 1 }}>
              {pendingAction === "delete" ? "Removes just this date; the series continues." : "Only changes this date."}
            </div>
          </button>
          <button
            onClick={() => pendingAction === "delete" ? onDelete("series") : commitSave("series")}
            style={{ ...btnStyle, background: "#fff", border: `1.5px solid ${pendingAction === "delete" ? "#F3D9D2" : "#EFE4D2"}`, color: pendingAction === "delete" ? "#C4402A" : "#2B2622", textAlign: "left" }}
          >
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>Entire series</div>
            <div style={{ fontSize: 11.5, color: "#948C80", fontWeight: 400, marginTop: 1 }}>
              {pendingAction === "delete" ? "Removes every occurrence, past and future." : "Applies to every occurrence."}
            </div>
          </button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={onClose} title={event.title}>
      <div style={{ fontSize: 12.5, color: "#6B6259", marginBottom: 14 }}>
        {event.notes || event.description || "No notes"}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <CategoryBadge category={event.category} />
        {event.participants?.length > 0 && <AvatarStack ids={event.participants} />}
        {isRecurring && <span style={{ fontSize: 11, color: "#A69C8E" }}>🔁 {recurrenceLabel(event.recurrence, event.date)}</span>}
      </div>
      <FieldLabel>Start time</FieldLabel>
      <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inputStyle} />
      <FieldLabel style={{ marginTop: 12 }}>Location</FieldLabel>
      <input value={location} onChange={(e) => setLocation(e.target.value)} style={inputStyle} placeholder="Add a location" />
      {(timeChanged || locationChanged) && (
        <>
          <FieldLabel style={{ marginTop: 12 }}>Why the change? <span style={{ fontWeight: 400, color: "#A69C8E" }}>(optional)</span></FieldLabel>
          <input
            placeholder="e.g. Coach moved practice back an hour"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={inputStyle}
          />
        </>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
        <button onClick={requestDelete} style={{ ...btnStyle, background: "#fff", color: "#C4402A", border: "1.5px solid #F3D9D2" }}>Delete</button>
        <button
          onClick={requestSave}
          style={{ ...btnStyle, flex: 1, background: "#E8622C", color: "#fff" }}
        >
          Save changes
        </button>
      </div>
    </ModalShell>
  );
}

/* ---------------------------------------------------------
   TASKS TAB
--------------------------------------------------------- */

function TasksTab({ tasks, toggleTask, currentUser, openComposer, onOpenLinkedEvent }) {
  const [filter, setFilter] = useState("All");

  const filtered = tasks.filter((t) => {
    if (filter === "My Tasks") return t.assignedTo === currentUser;
    if (filter === "Family Tasks") return !!t.assignedTo && t.assignedTo !== currentUser;
    if (filter === "Unassigned") return !t.assignedTo;
    if (filter === "Today") return !t.completed && t.dueDate === todayISO(0);
    if (filter === "Upcoming") return !t.completed && t.dueDate > todayISO(0);
    if (filter === "Overdue") return !t.completed && t.dueDate && t.dueDate < todayISO(0);
    if (filter === "Completed") return t.completed;
    return true;
  });

  const grouped = {};
  filtered.forEach((t) => {
    const key = t.completed ? "Completed" : t.dueDate || "No due date";
    grouped[key] = grouped[key] || [];
    grouped[key].push(t);
  });

  return (
    <div>
      <div style={{ fontFamily: "'Baloo 2', sans-serif", fontSize: 22, fontWeight: 700, marginBottom: 14 }}>Tasks</div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 16, paddingBottom: 4 }}>
        {["All", "My Tasks", "Family Tasks", "Today", "Upcoming", "Overdue", "Unassigned", "Completed"].map((c) => (
          <button key={c} onClick={() => setFilter(c)} style={{
            flexShrink: 0, border: `1.5px solid ${filter === c ? "#1F6F5C" : "#EFE4D2"}`,
            background: filter === c ? "#E4F1EC" : "#fff", color: filter === c ? "#155C4A" : "#6B6259",
            borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>{c}</button>
        ))}
      </div>

      {Object.keys(grouped).length === 0 && (
        <EmptyState
          text="No tasks yet."
          sub="Add your family's first task."
          actionLabel={openComposer ? "Add Task" : undefined}
          onAction={openComposer ? () => openComposer("task") : undefined}
        />
      )}
      {Object.entries(grouped).map(([key, list]) => (
        <div key={key} style={{ marginBottom: 16 }}>
          <SectionLabel text={key === "Completed" ? "Completed" : key === "No due date" ? key : relativeDay(key)} />
          <div style={{ background: "#fff", border: "1px solid #F1E8D9", boxShadow: CARD_SHADOW, borderRadius: 14, padding: "4px 14px" }}>
            {list.map((t) => (
              <TaskRow key={t.id} task={t} onToggle={() => toggleTask(t.id)} onOpenLinkedEvent={onOpenLinkedEvent} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TaskRow({ task, onToggle, compact, onOpenLinkedEvent }) {
  const overdue = !task.completed && task.dueDate < todayISO(0);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: compact ? "7px 0" : "11px 0", borderBottom: "1px solid #F3ECE0" }}>
      <button onClick={onToggle} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: task.completed ? "#1F6F5C" : "#C9BEAC" }} aria-label={task.completed ? "Mark incomplete" : "Mark complete"}>
        {task.completed ? <CheckCircle2 size={20} /> : <Circle size={20} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13.5, fontWeight: 500,
          textDecoration: task.completed ? "line-through" : "none",
          color: task.completed ? "#A69C8E" : "#2B2622",
        }}>
          {task.assignedTo && <span style={{ fontWeight: 700 }}>{memberById(task.assignedTo).name} — </span>}
          {task.title}
        </div>
        {!compact && (
          <div style={{ display: "flex", gap: 6, marginTop: 3, alignItems: "center", flexWrap: "wrap" }}>
            {task.completed && task.completedBy ? (
              <span style={{ fontSize: 10.5, color: "#1F6F5C", fontWeight: 600 }}>
                ✓ {memberById(task.completedBy).name} completed{task.completedAt ? ` · ${task.completedAt}` : ""}
              </span>
            ) : (
              <>
                <span style={{ fontSize: 10.5, color: "#A69C8E" }}>{task.category}</span>
                {task.priority === "High" && <span style={{ fontSize: 10, fontWeight: 700, color: "#C4402A" }}>● High</span>}
                {overdue && <span style={{ fontSize: 10, fontWeight: 700, color: "#C4402A" }}>Overdue</span>}
                {task.recurrence && <span style={{ fontSize: 10, color: "#A69C8E" }}>🔁 {recurrenceLabel(task.recurrence, task.dueDate)}</span>}
                {task.linkedEventTitle && (
                  <button
                    onClick={() => onOpenLinkedEvent?.(task)}
                    style={{ fontSize: 10, color: "#B24A1D", background: "#FCE9DF", border: "none", borderRadius: 999, padding: "1px 7px", cursor: onOpenLinkedEvent ? "pointer" : "default", fontWeight: 600 }}
                  >
                    ↳ {task.linkedEventTitle}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
      {task.assignedTo && <AvatarDot id={task.assignedTo} size={20} />}
    </div>
  );
}

/* ---------------------------------------------------------
   EVENTS (appointments) TAB
--------------------------------------------------------- */

function EventsTab({ events, openHistory, openComposer, onUpdateTime, onDelete }) {
  const [editing, setEditing] = useState(null);
  const groups = { Today: [], Tomorrow: [], "This Week": [], "Next Week": [], Later: [] };
  const today = parseLocalDate(todayISO(0));
  events.forEach((e) => {
    const diff = Math.round((parseLocalDate(e.date) - today) / 86400000);
    if (diff < 0) return;
    if (diff === 0) groups.Today.push(e);
    else if (diff === 1) groups.Tomorrow.push(e);
    else if (diff <= 7) groups["This Week"].push(e);
    else if (diff <= 14) groups["Next Week"].push(e);
    else groups.Later.push(e);
  });

  const isEmpty = events.filter((e) => e.date >= todayISO(0)).length === 0;

  return (
    <div>
      <div style={{ fontFamily: "'Baloo 2', sans-serif", fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Upcoming</div>
      <div style={{ fontSize: 13, color: "#948C80", marginBottom: 16 }}>Appointments and important dates, at a glance.</div>
      {Object.entries(groups).map(([label, list]) =>
        list.length === 0 ? null : (
          <div key={label} style={{ marginBottom: 18 }}>
            <SectionLabel text={label} />
            {list.map((e) => (
              <AppointmentCard key={e.id} event={e} onEdit={() => setEditing(e)} onHistory={() => openHistory(e)} />
            ))}
          </div>
        )
      )}
      {isEmpty && (
        <EmptyState
          text="Nothing upcoming yet."
          sub="Add an appointment or important date."
          actionLabel={openComposer ? "Add Appointment" : undefined}
          onAction={openComposer ? () => openComposer("appointment") : undefined}
        />
      )}

      {editing && (
        <EventEditModal
          event={editing}
          onClose={() => setEditing(null)}
          onSave={(field, value, reason, scope) => { onUpdateTime(editing.id, field, value, reason, scope); setEditing(null); }}
          onDelete={(scope) => { onDelete(editing.id, scope); setEditing(null); }}
        />
      )}
    </div>
  );
}

function AppointmentCard({ event, onEdit, onHistory }) {
  const meta = CATEGORY_META[event.category] || CATEGORY_META.Other;
  const cd = countdownLabel(event.date);
  return (
    <button
      onClick={onEdit}
      style={{ background: "#fff", border: "1px solid #F1E8D9", boxShadow: CARD_SHADOW, borderRadius: 16, padding: 16, marginBottom: 10, width: "100%", textAlign: "left", cursor: "pointer", display: "block" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15.5 }}>{event.title}</div>
          <div style={{ fontSize: 12.5, color: "#6B6259", marginTop: 4 }}>
            {relativeDay(event.date)}{!event.allDay && ` · ${fmtTime(event.startTime)}`}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {cd && (
            <span style={{ fontSize: 11, fontWeight: 700, color: meta.color, background: `${meta.color}15`, borderRadius: 999, padding: "4px 10px" }}>
              {cd}
            </span>
          )}
          {event.history?.length > 0 && (
            <span
              role="button"
              onClick={(ev) => { ev.stopPropagation(); onHistory(); }}
              style={{ color: "#C9BEAC", padding: 2, display: "flex" }}
              title="View history"
            >
              <History size={15} />
            </span>
          )}
        </div>
      </div>
      {event.location && (
        <div style={{ fontSize: 12.5, color: "#6B6259", marginTop: 8, display: "flex", alignItems: "center", gap: 4 }}>
          <MapPin size={12} /> {event.location}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
        <CategoryBadge category={event.category} />
        <AvatarStack ids={event.participants} />
        <span style={{ fontSize: 11, color: "#A69C8E", marginLeft: "auto" }}>Added by {memberById(event.createdBy).name}</span>
      </div>
    </button>
  );
}

/* ---------------------------------------------------------
   FAMILY WALL TAB
--------------------------------------------------------- */

const REACTIONS = ["❤️", "👍", "😂"];
const POST_TYPE_COLORS = { Announcement: "#E8622C", Update: "#3E6FD9", Reminder: "#C9972B", Change: "#B25CC9", Photo: "#1F6F5C" };
const POST_TYPE_EMOJI = { Announcement: "📢", Update: "💬", Reminder: "🔔", Change: "🔄", Photo: "📸" };

function WallTab({ posts, currentUser, toggleReaction, addComment, openComposer }) {
  const me = memberById(currentUser);
  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <div style={{ fontFamily: "'Baloo 2', sans-serif", fontSize: 22, fontWeight: 700, marginBottom: 2 }}>Family Wall</div>
      <div style={{ fontSize: 13, color: "#948C80", marginBottom: 14 }}>Your household's private feed.</div>

      {openComposer && (
        <div style={{ background: "#fff", border: "1px solid #F1E8D9", boxShadow: CARD_SHADOW, borderRadius: 20, padding: "12px 12px 6px", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <AvatarDot id={currentUser} size={42} />
            <button
              onClick={() => openComposer("post")}
              style={{ flex: 1, textAlign: "left", background: "#FBF5EA", border: "1px solid #F1E8D9", borderRadius: 999, padding: "12px 16px", color: "#948C80", fontSize: 14, cursor: "pointer", minHeight: 44 }}
            >
              What's on your mind, {me.name}?
            </button>
          </div>
          <div style={{ display: "flex", marginTop: 8, paddingTop: 4, borderTop: "1px solid #F3ECE0" }}>
            {[["📸", "Photo", "Photo"], ["📢", "Announce", "Announcement"], ["🔔", "Remind", "Reminder"]].map(([emoji, label, type]) => (
              <button
                key={type}
                onClick={() => openComposer("post", undefined, undefined, type)}
                style={{ flex: 1, background: "none", border: "none", borderRadius: 12, padding: "10px 4px", fontSize: 12.5, fontWeight: 700, color: "#6B6259", cursor: "pointer", minHeight: 42 }}
              >
                {emoji} {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {posts.length === 0 ? (
        <EmptyState
          text="No family updates yet."
          sub="Share something with everyone."
          actionLabel={openComposer ? "Post Update" : undefined}
          onAction={openComposer ? () => openComposer("post") : undefined}
        />
      ) : (
        posts.map((p) => (
          <PostCard key={p.id} post={p} currentUser={currentUser} onReact={(e) => toggleReaction(p.id, e)} onComment={(text) => addComment(p.id, text)} />
        ))
      )}
    </div>
  );
}

const REACTION_LABELS = { "❤️": "Love", "👍": "Like", "😂": "Haha" };
const clampStyle = { display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" };

function reactionSummary(post, currentUser) {
  const reactions = post.reactions || {};
  const ids = [...new Set(Object.values(reactions).flat())];
  if (!ids.length) return null;
  const emojis = Object.entries(reactions).filter(([, u]) => u.length).map(([e]) => e).join("");
  const ordered = [...ids].sort((a, b) => (a === currentUser ? -1 : b === currentUser ? 1 : 0)); // "You" first
  const names = ordered.map((id) => (id === currentUser ? "You" : memberById(id).name));
  const text = names.length <= 2 ? names.join(" and ") : `${names[0]}, ${names[1]} and ${names.length - 2} more`;
  return { emojis, text };
}

function PostCard({ post, onReact, onComment, currentUser, compact }) {
  const author = memberById(post.author);
  const color = POST_TYPE_COLORS[post.type] || "#6B6259";
  const emoji = POST_TYPE_EMOJI[post.type] || "💬";
  const images = post.images || [];
  const comments = post.comments || [];
  const [lightbox, setLightbox] = useState(null);
  const [showComments, setShowComments] = useState(!compact && comments.length > 0);
  const [draft, setDraft] = useState("");
  const summary = reactionSummary(post, currentUser);

  function sendComment() {
    const text = draft.trim();
    if (!text) return;
    onComment?.(text);
    setDraft("");
    setShowComments(true);
  }

  return (
    <article style={{ background: "#fff", border: "1px solid #F1E8D9", boxShadow: CARD_SHADOW, borderRadius: 20, marginBottom: compact ? 10 : 14, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 14px 0" }}>
        <AvatarDot id={post.author} size={compact ? 36 : 44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>{author.name}</div>
          <div style={{ fontSize: 11.5, color: "#A69C8E" }}>{post.createdAt}</div>
        </div>
        {post.type !== "Update" && (
          <span style={{ fontSize: 11.5, fontWeight: 700, color, background: `${color}15`, borderRadius: 999, padding: "5px 11px", whiteSpace: "nowrap" }}>
            {emoji} {post.type === "Change" ? "Schedule change" : post.type}
          </span>
        )}
      </div>

      {post.content && (
        <div style={{ padding: "10px 14px 0", fontSize: compact ? 13.5 : 15, lineHeight: 1.5, color: "#2B2622", ...(compact ? clampStyle : {}) }}>{post.content}</div>
      )}

      {images.length > 0 && (
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: images.length === 1 ? "1fr" : "1fr 1fr", gap: 2 }}>
          {images.slice(0, 4).map((src, i) => (
            <button
              key={i}
              onClick={() => setLightbox(i)}
              aria-label={`Open photo ${i + 1} of ${images.length}`}
              style={{ position: "relative", border: "none", padding: 0, cursor: "pointer", aspectRatio: images.length === 1 ? (compact ? "16/9" : "4/3") : "1/1", overflow: "hidden", background: "#F1E9DA", borderRadius: 0 }}
            >
              <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              {i === 3 && images.length > 4 && (
                <div style={{ position: "absolute", inset: 0, background: "rgba(43,38,34,0.55)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700 }}>
                  +{images.length - 4}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {(summary || comments.length > 0) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 14px 0", fontSize: 12.5, color: "#8A7F70" }}>
          <span style={{ minWidth: 0 }}>{summary ? `${summary.emojis} ${summary.text}` : ""}</span>
          {comments.length > 0 && (
            compact ? (
              <span style={{ flexShrink: 0 }}>{comments.length} comment{comments.length > 1 ? "s" : ""}</span>
            ) : (
              <button onClick={() => setShowComments((v) => !v)} style={{ background: "none", border: "none", color: "#8A7F70", fontSize: 12.5, cursor: "pointer", padding: "4px 0", flexShrink: 0 }}>
                {comments.length} comment{comments.length > 1 ? "s" : ""}
              </button>
            )
          )}
        </div>
      )}

      {!compact && (
        <div style={{ display: "flex", gap: 2, margin: "10px 8px 0", padding: "4px 0", borderTop: "1px solid #F3ECE0" }}>
          {REACTIONS.map((emo) => {
            const mine = (post.reactions?.[emo] || []).includes(currentUser);
            return (
              <button
                key={emo}
                onClick={() => onReact(emo)}
                aria-pressed={mine}
                aria-label={`${REACTION_LABELS[emo] || "React"}${mine ? " (selected)" : ""}`}
                style={{ flex: "1 1 0", minWidth: 0, minHeight: 44, whiteSpace: "nowrap", padding: "0 2px", background: mine ? "#FCE9DF" : "transparent", border: "none", borderRadius: 12, fontSize: 12, fontWeight: 700, color: mine ? "#B24A1D" : "#6B6259", cursor: "pointer" }}
              >
                <span className={mine ? "react-pop" : undefined}>{emo}</span> {REACTION_LABELS[emo]}
              </button>
            );
          })}
          <button
            onClick={() => setShowComments((v) => !v)}
            aria-expanded={showComments}
            style={{ flex: "1.25 1 0", minWidth: 0, minHeight: 44, whiteSpace: "nowrap", padding: "0 2px", background: showComments ? "#F7F0E4" : "transparent", border: "none", borderRadius: 12, fontSize: 12, fontWeight: 700, color: "#6B6259", cursor: "pointer" }}
          >
            💬 Comment
          </button>
        </div>
      )}

      {!compact && showComments && (
        <div style={{ padding: "2px 14px 14px" }}>
          {comments.map((c) => (
            <div key={c.id} style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <AvatarDot id={c.by} size={32} />
              <div style={{ minWidth: 0 }}>
                <div style={{ background: "#F7F0E4", borderRadius: 16, padding: "8px 12px" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>{memberById(c.by).name}</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.4, wordBreak: "break-word" }}>{c.text}</div>
                </div>
                <div style={{ fontSize: 11, color: "#A69C8E", margin: "3px 0 0 10px" }}>{c.at}</div>
              </div>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <AvatarDot id={currentUser} size={32} />
            <input
              aria-label="Write a comment"
              value={draft}
              placeholder="Write a comment…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendComment()}
              style={{ flex: 1, minWidth: 0, background: "#FBF5EA", border: "1px solid #F1E8D9", borderRadius: 999, padding: "10px 14px", fontSize: 13.5, fontFamily: "inherit", color: "#2B2622" }}
            />
            <button
              onClick={sendComment}
              disabled={!draft.trim()}
              aria-label="Send comment"
              style={{ width: 38, height: 38, borderRadius: "50%", background: "#E8622C", color: "#fff", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: draft.trim() ? "pointer" : "default", opacity: draft.trim() ? 1 : 0.4, flexShrink: 0 }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
      {!compact && !showComments && <div style={{ height: 8 }} />}
      {compact && <div style={{ height: 12 }} />}

      {lightbox !== null && (
        <ImageLightbox images={images} index={lightbox} onClose={() => setLightbox(null)} onNav={setLightbox} />
      )}
    </article>
  );
}

function ImageLightbox({ images, index, onClose, onNav }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(20,17,14,0.92)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
        <X size={18} />
      </button>
      {images.length > 1 && index > 0 && (
        <button onClick={(e) => { e.stopPropagation(); onNav(index - 1); }} style={{ position: "absolute", left: 12, background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%", width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
          <ChevronLeft size={20} />
        </button>
      )}
      {images.length > 1 && index < images.length - 1 && (
        <button onClick={(e) => { e.stopPropagation(); onNav(index + 1); }} style={{ position: "absolute", right: 12, background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%", width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
          <ChevronRight size={20} />
        </button>
      )}
      <img src={images[index]} alt="" style={{ maxWidth: "92%", maxHeight: "86%", borderRadius: 8, objectFit: "contain" }} onClick={(e) => e.stopPropagation()} />
      {images.length > 1 && (
        <div style={{ position: "absolute", bottom: 20, color: "#fff", fontSize: 12.5, fontWeight: 600 }}>{index + 1} / {images.length}</div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   QUICK ADD SHEET
--------------------------------------------------------- */

function QuickAddSheet({ onClose, onSelect }) {
  const options = [
    { id: "event", label: "Event", icon: Calendar, color: "#3E6FD9" },
    { id: "task", label: "Task", icon: CheckSquare, color: "#1F6F5C" },
    { id: "appointment", label: "Appointment", icon: Stethoscope, color: "#E8622C" },
    { id: "post", label: "Family Update", icon: Camera, color: "#B25CC9" },
  ];
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...sheetStyle }} onClick={(e) => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: "#E4D9C6", borderRadius: 4, margin: "0 auto 16px" }} />
        <div style={{ fontFamily: "'Baloo 2', sans-serif", fontSize: 17, fontWeight: 700, marginBottom: 14 }}>What do you want to add?</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {options.map((o) => (
            <button key={o.id} onClick={() => onSelect(o.id)} style={{
              border: "1px solid #F1E8D9", boxShadow: CARD_SHADOW, background: "#FFFDF9", borderRadius: 16, padding: "18px 10px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 8, cursor: "pointer",
            }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: `${o.color}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <o.icon size={22} color={o.color} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{o.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   COMPOSER (event / task / post)
--------------------------------------------------------- */

function Composer({ type, onClose, onAddEvent, onAddTask, onAddPost, initialDate, existingEvents, initialParticipants, initialPostType }) {
  const isAppointment = type === "appointment";
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(initialDate || todayISO(0));
  const [time, setTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState(type === "task" ? "Household" : isAppointment ? "Appointment" : "Family");
  const [assignedTo, setAssignedTo] = useState("");
  const [participants, setParticipants] = useState(initialParticipants || []);
  const [postType, setPostType] = useState(initialPostType || "Update");
  const [content, setContent] = useState("");
  const [recurrence, setRecurrence] = useState("None");
  const [reminder, setReminder] = useState("None");
  const [priority, setPriority] = useState("Medium");
  const [notes, setNotes] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [linkedEventId, setLinkedEventId] = useState("");
  const [postImages, setPostImages] = useState([]);
  const fileInputRef = useRef(null);

  function toggleParticipant(id) {
    setParticipants((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  function handleFiles(fileList) {
    const files = Array.from(fileList || []).slice(0, 6 - postImages.length);
    files.forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => setPostImages((imgs) => [...imgs, reader.result]);
      reader.readAsDataURL(file);
    });
  }

  function removeImage(i) {
    setPostImages((imgs) => imgs.filter((_, idx) => idx !== i));
  }

  function submit() {
    if (type === "event" || isAppointment) {
      if (!title.trim()) return;
      onAddEvent({
        title, date,
        startTime: allDay ? null : time || null,
        endTime: allDay ? null : endTime || null,
        allDay,
        location, category, participants, notes,
        recurrence: recurrence === "None" ? null : recurrence,
        reminder: reminder === "None" ? null : reminder,
      });
    } else if (type === "task") {
      if (!title.trim()) return;
      const linked = existingEvents?.find((e) => e.id === linkedEventId);
      onAddTask({
        title, dueDate: date, dueTime: dueTime || null, category,
        assignedTo: assignedTo || null, priority, notes,
        recurrence: recurrence === "None" ? null : recurrence,
        linkedEventId: linked ? linked.id : undefined,
        linkedEventTitle: linked ? linked.title : undefined,
      });
    } else if (type === "post") {
      if (!content.trim() && postImages.length === 0) return;
      onAddPost({ type: postType, content, images: postImages });
    }
    onClose();
  }

  const titles = { event: "New Event", appointment: "New Appointment", task: "New Task", post: "New Family Update" };

  return (
    <ModalShell onClose={onClose} title={titles[type]}>
      {(type === "event" || isAppointment) && (
        <>
          <FieldLabel>{isAppointment ? "What's the appointment?" : "Event name"}</FieldLabel>
          <input autoFocus placeholder={isAppointment ? "e.g. Pediatrician checkup" : "e.g. Soccer practice"} value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <div style={{ flex: 1 }}>
              <FieldLabel>Date</FieldLabel>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "#6B6259", paddingTop: 18, whiteSpace: "nowrap" }}>
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
              All day
            </label>
          </div>

          {!allDay && (
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <div style={{ flex: 1 }}>
                <FieldLabel>Start time</FieldLabel>
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <FieldLabel>End time <span style={{ fontWeight: 400, color: "#A69C8E" }}>(optional)</span></FieldLabel>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={inputStyle} />
              </div>
            </div>
          )}

          <FieldLabel style={{ marginTop: 12 }}>Location</FieldLabel>
          <input placeholder={isAppointment ? "e.g. Children's Medical Center" : "e.g. Riverside Field"} value={location} onChange={(e) => setLocation(e.target.value)} style={inputStyle} />

          <FieldLabel style={{ marginTop: 12 }}>Category</FieldLabel>
          <CategoryPicker value={category} onChange={setCategory} />

          <FieldLabel style={{ marginTop: 12 }}>Who's involved?</FieldLabel>
          <MemberPicker selected={participants} onToggle={toggleParticipant} />

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <div style={{ flex: 1 }}>
              <FieldLabel>Repeats</FieldLabel>
              <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} style={inputStyle}>
                {["None", "Daily", "Weekly", "Monthly", "Yearly"].map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <FieldLabel>Reminder</FieldLabel>
              <select value={reminder} onChange={(e) => setReminder(e.target.value)} style={inputStyle}>
                {["None", "At time of event", "15 min before", "1 hour before", "1 day before"].map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
          </div>

          <FieldLabel style={{ marginTop: 12 }}>Notes <span style={{ fontWeight: 400, color: "#A69C8E" }}>(optional)</span></FieldLabel>
          <textarea placeholder="Anything else worth noting?" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
        </>
      )}
      {type === "task" && (
        <>
          <FieldLabel>Title</FieldLabel>
          <input autoFocus placeholder="e.g. Buy diapers" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <div style={{ flex: 1 }}>
              <FieldLabel>Due date</FieldLabel>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <FieldLabel>Due time <span style={{ fontWeight: 400, color: "#A69C8E" }}>(optional)</span></FieldLabel>
              <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <FieldLabel style={{ marginTop: 12 }}>Category</FieldLabel>
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
            {TASK_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>

          <FieldLabel style={{ marginTop: 12 }}>Priority</FieldLabel>
          <div style={{ display: "flex", gap: 6 }}>
            {["Low", "Medium", "High"].map((p) => (
              <button key={p} onClick={() => setPriority(p)} style={pillStyle(priority === p)}>{p}</button>
            ))}
          </div>

          <FieldLabel style={{ marginTop: 12 }}>Assign to</FieldLabel>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={() => setAssignedTo("")} style={pillStyle(assignedTo === "")}>Unassigned</button>
            {MEMBERS.map((m) => (
              <button key={m.id} onClick={() => setAssignedTo(m.id)} style={pillStyle(assignedTo === m.id)}>
                {m.emoji} {m.name}
              </button>
            ))}
          </div>

          <FieldLabel style={{ marginTop: 12 }}>Repeats</FieldLabel>
          <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} style={inputStyle}>
            {["None", "Daily", "Weekly", "Monthly"].map((r) => <option key={r}>{r}</option>)}
          </select>

          {existingEvents?.length > 0 && (
            <>
              <FieldLabel style={{ marginTop: 12 }}>Link to an event <span style={{ fontWeight: 400, color: "#A69C8E" }}>(optional)</span></FieldLabel>
              <select value={linkedEventId} onChange={(e) => setLinkedEventId(e.target.value)} style={inputStyle}>
                <option value="">None</option>
                {existingEvents.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
              </select>
            </>
          )}

          <FieldLabel style={{ marginTop: 12 }}>Notes <span style={{ fontWeight: 400, color: "#A69C8E" }}>(optional)</span></FieldLabel>
          <textarea placeholder="Anything else worth noting?" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
        </>
      )}
      {type === "post" && (
        <>
          <FieldLabel>What do you want to share with the family?</FieldLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 4 }}>
            {[
              { id: "Announcement", emoji: "📢" },
              { id: "Update", emoji: "💬" },
              { id: "Reminder", emoji: "🔔" },
              { id: "Change", emoji: "🔄" },
              { id: "Photo", emoji: "📸" },
            ].map((t) => (
              <button key={t.id} onClick={() => setPostType(t.id)} style={{
                ...pillStyle(postType === t.id), display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 10px",
              }}>
                <span>{t.emoji}</span> {t.id}
              </button>
            ))}
          </div>
          <FieldLabel style={{ marginTop: 12 }}>Message</FieldLabel>
          <textarea
            autoFocus
            placeholder="What does your family need to know?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
          />

          <FieldLabel style={{ marginTop: 12 }}>Photos <span style={{ fontWeight: 400, color: "#A69C8E" }}>(optional)</span></FieldLabel>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {postImages.map((src, i) => (
              <div key={i} style={{ position: "relative", width: 64, height: 64, borderRadius: 10, overflow: "hidden" }}>
                <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <button
                  onClick={() => removeImage(i)}
                  style={{ position: "absolute", top: 2, right: 2, background: "rgba(20,17,14,0.65)", border: "none", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                >
                  <X size={10} color="#fff" />
                </button>
              </div>
            ))}
            {postImages.length < 6 && (
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: 64, height: 64, borderRadius: 10, border: "1.5px dashed #E4D9C6", background: "#FFFDF9",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, cursor: "pointer", color: "#A69C8E",
                }}
              >
                <Camera size={19} />
                <span style={{ fontSize: 9, fontWeight: 600 }}>Add</span>
              </button>
            )}
          </div>
        </>
      )}
      <button onClick={submit} style={{ ...btnStyle, width: "100%", background: "#E8622C", color: "#fff", marginTop: 18 }}>
        Save
      </button>
    </ModalShell>
  );
}

function CategoryPicker({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {Object.keys(CATEGORY_META).map((c) => (
        <button key={c} onClick={() => onChange(c)} style={pillStyle(value === c)}>{c}</button>
      ))}
    </div>
  );
}

function MemberPicker({ selected, onToggle }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {MEMBERS.map((m) => (
        <button key={m.id} onClick={() => onToggle(m.id)} style={pillStyle(selected.includes(m.id))}>
          {m.emoji} {m.name}
        </button>
      ))}
    </div>
  );
}

function pillStyle(active) {
  return {
    border: `1.5px solid ${active ? "#E8622C" : "#EFE4D2"}`,
    background: active ? "#FCE9DF" : "#fff",
    color: active ? "#B24A1D" : "#6B6259",
    borderRadius: 999, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
  };
}

/* ---------------------------------------------------------
   HISTORY MODAL
--------------------------------------------------------- */

function EventDetailModal({ event, tasks, onClose, onToggleTask }) {
  const relatedTasks = (tasks || []).filter((t) => t.linkedEventId === event.masterId || t.linkedEventId === event.id);
  const meta = CATEGORY_META[event.category] || CATEGORY_META.Other;

  return (
    <ModalShell onClose={onClose} title={event.title}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <CategoryBadge category={event.category} />
        {event.recurrence && (
          <span style={{ fontSize: 11, color: "#A69C8E", display: "flex", alignItems: "center", gap: 3 }}>
            🔁 {recurrenceLabel(event.recurrence, event.date)}
          </span>
        )}
      </div>

      <div style={{ fontSize: 13, color: "#6B6259", marginBottom: 4 }}>
        {relativeDay(event.occurrenceDate || event.date)}
        {!event.allDay && event.startTime && ` · ${event.endTime ? `${fmtTime(event.startTime)} – ${fmtTime(event.endTime)}` : fmtTime(event.startTime)}`}
      </div>
      {event.location && (
        <div style={{ fontSize: 13, color: "#6B6259", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
          <MapPin size={12} /> {event.location}
        </div>
      )}
      {event.participants?.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
          <AvatarStack ids={event.participants} />
          <span style={{ fontSize: 12, color: "#948C80" }}>{event.participants.map((id) => memberById(id).name).join(" + ")}</span>
        </div>
      )}
      {(event.notes || event.description) && (
        <div style={{ fontSize: 12.5, color: "#6B6259", marginTop: 10, lineHeight: 1.5 }}>{event.notes || event.description}</div>
      )}

      {relatedTasks.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <FieldLabel>Related Tasks</FieldLabel>
          <div style={{ background: "#FFFDF9", border: "1px solid #EFE4D2", borderRadius: 12, padding: "2px 12px" }}>
            {relatedTasks.map((t, i) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 0", borderBottom: i === relatedTasks.length - 1 ? "none" : "1px solid #F3ECE0" }}>
                <button onClick={() => onToggleTask?.(t.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: t.completed ? "#1F6F5C" : "#C9BEAC" }} aria-label={t.completed ? "Mark incomplete" : "Mark complete"}>
                  {t.completed ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                </button>
                <span style={{ fontSize: 13, textDecoration: t.completed ? "line-through" : "none", color: t.completed ? "#A69C8E" : "#2B2622", flex: 1 }}>
                  {t.title}
                </span>
                {t.assignedTo && <AvatarDot id={t.assignedTo} size={17} />}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <FieldLabel>History</FieldLabel>
        <HistoryTimeline history={event.history} />
      </div>
    </ModalShell>
  );
}

// Consistent, non-technical phrasing for how an event repeats — used
// everywhere a recurrence badge appears, so the wording never drifts.
function recurrenceLabel(recurrence, dateStr) {
  if (!recurrence) return null;
  if (recurrence === "Weekly" && dateStr) {
    return `Every ${parseLocalDate(dateStr).toLocaleDateString(undefined, { weekday: "long" })}`;
  }
  if (recurrence === "Daily") return "Every day";
  if (recurrence === "Monthly") return "Every month";
  if (recurrence === "Yearly") return "Every year";
  return recurrence;
}

function HistoryTimeline({ history }) {
  return (
    <div>
      {history.map((h, i) => (
        <div key={i} style={{ display: "flex", gap: 10, paddingBottom: 16, position: "relative" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <AvatarDot id={h.by} size={26} />
            {i < history.length - 1 && <div style={{ width: 2, flex: 1, background: "#EFE4D2", marginTop: 4 }} />}
          </div>
          <div style={{ flex: 1, paddingBottom: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {humanizeHistoryNote(h.note)} <span style={{ fontWeight: 400, color: "#A69C8E" }}>· {memberById(h.by).name} · {h.at}</span>
            </div>
            {h.reason && (
              <div style={{ fontSize: 12.5, background: "#FDF6EA", border: "1px solid #F1E4C4", borderRadius: 10, padding: "8px 10px", marginTop: 6, color: "#6B5B2F", fontStyle: "italic" }}>
                "{h.reason}"
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Turns internal history notes into plain, human-readable phrasing —
// never expose field names or implementation details like "startTime".
function humanizeHistoryNote(note) {
  if (!note) return "Updated";
  if (note === "Created event") return "Created";
  if (note.startsWith("Time changed")) return note.replace("Time changed from", "Time changed:").replace(" (", ", just ").replace(")", "");
  if (note.startsWith("Location changed")) return note;
  if (note.startsWith("Location set")) return note;
  return note.replace(/^(\w+)\s+updated$/, (_, field) => `${field.charAt(0).toUpperCase()}${field.slice(1)} updated`);
}

/* ---------------------------------------------------------
   GLOBAL SEARCH
--------------------------------------------------------- */

function highlightMatch(text, query) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: "#F4C95D", color: "#2B2622", borderRadius: 3, padding: "0 1px" }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function SearchOverlay({ onClose, events, tasks, posts, onOpenEvent }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const grouped = useMemo(() => {
    if (!q) return null;
    const eventHits = events.filter(
      (e) => e.title.toLowerCase().includes(q) || e.location?.toLowerCase().includes(q) || e.notes?.toLowerCase().includes(q)
    );
    const taskHits = tasks.filter((t) => t.title.toLowerCase().includes(q) || t.notes?.toLowerCase().includes(q));
    const postHits = posts.filter((p) => p.content.toLowerCase().includes(q));
    return { events: eventHits, tasks: taskHits, posts: postHits };
  }, [q, events, tasks, posts]);

  const totalResults = grouped ? grouped.events.length + grouped.tasks.length + grouped.posts.length : 0;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#FFF9F0", zIndex: 150, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #EFE4D2", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1.5px solid #EFE4D2", borderRadius: 12, padding: "9px 12px" }}>
          <Search size={16} color="#A69C8E" />
          <input
            autoFocus
            placeholder="Search events, tasks, appointments, wall…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ border: "none", outline: "none", flex: 1, fontSize: 14, background: "transparent", fontFamily: "inherit" }}
          />
        </div>
        <button onClick={onClose} style={{ background: "#F5EFE3", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <X size={16} />
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px 40px" }}>
        {!q && (
          <div style={{ textAlign: "center", color: "#A69C8E", fontSize: 13, marginTop: 40 }}>
            Search across events, appointments, tasks, and the Family Wall.
          </div>
        )}
        {q && totalResults === 0 && (
          <div style={{ textAlign: "center", marginTop: 40 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "#6B6259" }}>Nothing found for "{query}"</div>
            <div style={{ fontSize: 12.5, color: "#A69C8E", marginTop: 4 }}>Try searching for an event, task, appointment, or family update.</div>
          </div>
        )}
        {grouped && grouped.events.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <SectionLabel text="Events" />
            {grouped.events.map((e) => <SearchResultRow key={e.id} kind="event" data={e} query={query} onOpenEvent={onOpenEvent} />)}
          </div>
        )}
        {grouped && grouped.tasks.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <SectionLabel text="Tasks" />
            {grouped.tasks.map((t) => <SearchResultRow key={t.id} kind="task" data={t} query={query} />)}
          </div>
        )}
        {grouped && grouped.posts.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <SectionLabel text="Family Wall" />
            {grouped.posts.map((p) => <SearchResultRow key={p.id} kind="post" data={p} query={query} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function SearchResultRow({ kind, data, query, onOpenEvent }) {
  if (kind === "event") {
    const meta = CATEGORY_META[data.category] || CATEGORY_META.Other;
    const Icon = meta.icon;
    return (
      <button onClick={() => onOpenEvent(data)} style={searchRowStyle}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: `${meta.color}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={15} color={meta.color} />
        </div>
        <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{highlightMatch(data.title, query)}</div>
          <div style={{ fontSize: 11.5, color: "#A69C8E" }}>{relativeDay(data.occurrenceDate || data.date)}{data.location ? ` · ${data.location}` : ""}</div>
        </div>
      </button>
    );
  }
  if (kind === "task") {
    return (
      <div style={searchRowStyle}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: "#E4F1EC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <CheckSquare size={14} color="#1F6F5C" />
        </div>
        <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, textDecoration: data.completed ? "line-through" : "none", color: data.completed ? "#A69C8E" : "#2B2622" }}>
            {highlightMatch(data.title, query)}
          </div>
          <div style={{ fontSize: 11.5, color: "#A69C8E" }}>{data.dueDate ? relativeDay(data.dueDate) : "No due date"}</div>
        </div>
      </div>
    );
  }
  // post
  return (
    <div style={searchRowStyle}>
      <AvatarDot id={data.author} size={30} />
      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
        <div style={{ fontSize: 13, color: "#2B2622" }}>{highlightMatch(data.content, query)}</div>
        <div style={{ fontSize: 11.5, color: "#A69C8E" }}>{memberById(data.author).name} · {data.createdAt}</div>
      </div>
    </div>
  );
}

const searchRowStyle = {
  display: "flex", alignItems: "center", gap: 10, width: "100%", background: "#fff",
  border: "1px solid #F1E8D9", boxShadow: CARD_SHADOW, borderRadius: 12, padding: "10px 12px", marginBottom: 8,
  cursor: "pointer", textAlign: "left",
};

/* ---------------------------------------------------------
   SETTINGS
--------------------------------------------------------- */

function SettingsScreen({ onClose, familyName, onRenameFamily, online, onToggleOffline }) {
  const [screen, setScreen] = useState("root"); // root | family | notifications | account | appearance
  const [editingName, setEditingName] = useState(familyName);
  const trimmedName = editingName.trim();
  const canSaveName = trimmedName.length > 0 && trimmedName !== familyName;
  function saveName() {
    if (canSaveName) onRenameFamily(trimmedName);
  }
  const [notifPrefs, setNotifPrefs] = useState({
    Events: true, Tasks: true, Announcements: true, Changes: true, Reminders: true,
  });
  const [appearance, setAppearance] = useState("system");

  return (
    <div style={{ position: "fixed", inset: 0, background: "#FFF9F0", zIndex: 150, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #EFE4D2", display: "flex", alignItems: "center", gap: 10 }}>
        {screen !== "root" ? (
          <button onClick={() => setScreen("root")} style={iconBtnStyle}><ChevronLeft size={18} /></button>
        ) : (
          <div style={{ width: 32 }} />
        )}
        <div style={{ flex: 1, fontFamily: "'Baloo 2', sans-serif", fontSize: 17, fontWeight: 700, textAlign: "center" }}>
          {{ root: "Settings", family: "Family", notifications: "Notifications", account: "Account", appearance: "Appearance" }[screen]}
        </div>
        <button onClick={onClose} style={iconBtnStyle}><X size={18} /></button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        {screen === "root" && (
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
            <SettingsRow icon={Users} label="Family" sub={familyName} onClick={() => setScreen("family")} />
            <SettingsRow icon={Bell} label="Notifications" onClick={() => setScreen("notifications")} />
            <SettingsRow icon={User} label="Account" onClick={() => setScreen("account")} />
            <SettingsRow icon={Sun} label="Appearance" sub={appearance === "system" ? "System" : appearance === "light" ? "Light" : "Dark"} onClick={() => setScreen("appearance")} />
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "#A69C8E", letterSpacing: 0.5, margin: "20px 2px 8px" }}>DEMO TOOLS</div>
            <ToggleRow label="Simulate offline" checked={!online} onChange={() => onToggleOffline()} />
            <div style={{ fontSize: 11.5, color: "#A69C8E", margin: "2px 4px 0", lineHeight: 1.4 }}>Shows the "You're offline" banner so you can see how the app behaves without a connection.</div>
          </div>
        )}

        {screen === "family" && (
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
            <FieldLabel>Name shown at the top of the app</FieldLabel>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                aria-label="Family name"
                value={editingName}
                maxLength={32}
                placeholder="e.g. The Martinez Family"
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveName()}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={saveName}
                disabled={!canSaveName}
                style={{ ...btnStyle, background: "#E8622C", color: "#fff", opacity: canSaveName ? 1 : 0.45, cursor: canSaveName ? "pointer" : "default" }}
              >
                Save
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 11.5, color: "#A69C8E", margin: "6px 2px 20px", lineHeight: 1.4 }}>
              <span>Type anything you like. Shorter names fit better on a phone.</span>
              <span style={{ flexShrink: 0 }}>{editingName.length}/32</span>
            </div>

            <FieldLabel>Members</FieldLabel>
            <div style={{ background: "#fff", border: "1px solid #F1E8D9", boxShadow: CARD_SHADOW, borderRadius: 14, padding: "4px 14px", marginBottom: 20 }}>
              {MEMBERS.map((m, i) => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: i === MEMBERS.length - 1 ? "none" : "1px solid #F3ECE0" }}>
                  <AvatarDot id={m.id} size={30} />
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{m.name}</div>
                </div>
              ))}
            </div>

            <button style={{ ...btnStyle, width: "100%", background: "#fff", border: "1.5px solid #EFE4D2", color: "#2B2622", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <UserPlus size={16} /> Invite Family Member
            </button>
            <div style={{ fontSize: 11.5, color: "#A69C8E", textAlign: "center", marginTop: 8 }}>
              Invite by email or share a link — they'll join {familyName} once they accept.
            </div>
          </div>
        )}

        {screen === "notifications" && (
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
            {Object.keys(notifPrefs).map((key) => (
              <ToggleRow
                key={key}
                label={key}
                checked={notifPrefs[key]}
                onChange={(v) => setNotifPrefs((p) => ({ ...p, [key]: v }))}
              />
            ))}
          </div>
        )}

        {screen === "account" && (
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
            <FieldLabel>Name</FieldLabel>
            <input defaultValue="Dad" style={inputStyle} />
            <FieldLabel style={{ marginTop: 12 }}>Email</FieldLabel>
            <input defaultValue="dad@martinezfamily.example" style={inputStyle} />
            <FieldLabel style={{ marginTop: 12 }}>Profile photo</FieldLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <AvatarDot id="dad" size={44} />
              <button style={{ ...btnStyle, background: "#fff", border: "1.5px solid #EFE4D2", color: "#2B2622" }}>Change</button>
            </div>
          </div>
        )}

        {screen === "appearance" && (
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
            {[
              { id: "light", label: "Light", icon: Sun },
              { id: "dark", label: "Dark", icon: Moon },
              { id: "system", label: "System", icon: Monitor },
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => setAppearance(opt.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%", background: "#fff",
                  border: `1.5px solid ${appearance === opt.id ? "#E8622C" : "#EFE4D2"}`, borderRadius: 12,
                  padding: "12px 14px", marginBottom: 8, cursor: "pointer",
                }}
              >
                <opt.icon size={16} color={appearance === opt.id ? "#E8622C" : "#6B6259"} />
                <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1, textAlign: "left" }}>{opt.label}</span>
                {appearance === opt.id && <Check size={16} color="#E8622C" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsRow({ icon: Icon, label, sub, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 12, width: "100%", background: "#fff",
      border: "1px solid #F1E8D9", boxShadow: CARD_SHADOW, borderRadius: 14, padding: "13px 14px", marginBottom: 8, cursor: "pointer",
    }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: "#FCE9DF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={16} color="#E8622C" />
      </div>
      <div style={{ flex: 1, textAlign: "left" }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
        {sub && <div style={{ fontSize: 11.5, color: "#A69C8E" }}>{sub}</div>}
      </div>
      <ChevronRightIcon size={16} color="#C9BEAC" />
    </button>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", border: "1px solid #F1E8D9", boxShadow: CARD_SHADOW, borderRadius: 14, padding: "13px 14px", marginBottom: 8 }}>
      <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: 42, height: 24, borderRadius: 999, border: "none", cursor: "pointer",
          background: checked ? "#E8622C" : "#E4D9C6", position: "relative", transition: "background 0.15s",
        }}
      >
        <div style={{
          width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3,
          left: checked ? 21 : 3, transition: "left 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }} />
      </button>
    </div>
  );
}

const iconBtnStyle = {
  background: "#F5EFE3", border: "none", borderRadius: "50%", width: 32, height: 32,
  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
};

/* ---------------------------------------------------------
   SHARED MODAL / FORM STYLES
--------------------------------------------------------- */

function ModalShell({ children, onClose, title }) {
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={sheetStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: "#E4D9C6", borderRadius: 4, margin: "0 auto 16px" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontFamily: "'Baloo 2', sans-serif", fontSize: 17, fontWeight: 700 }}>{title}</div>
          <button onClick={onClose} style={{ background: "#F5EFE3", border: "none", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={15} />
          </button>
        </div>
        <div style={{ maxHeight: "62vh", overflowY: "auto" }}>{children}</div>
      </div>
    </div>
  );
}

function FieldLabel({ children, style }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: "#6B6259", marginBottom: 6, ...style }}>{children}</div>;
}

const overlayStyle = {
  position: "fixed", inset: 0, background: "rgba(43,38,34,0.42)", zIndex: 100,
  display: "flex", alignItems: "flex-end", justifyContent: "center",
};

const sheetStyle = {
  background: "#FFF9F0", width: "100%", maxWidth: 560, borderRadius: "22px 22px 0 0",
  padding: "14px 20px calc(20px + env(safe-area-inset-bottom))", boxShadow: "0 -8px 30px rgba(0,0,0,0.2)",
  animation: "slideUp 0.25s ease",
};

const inputStyle = {
  width: "100%", border: "1.5px solid #EFE4D2", borderRadius: 12, padding: "10px 12px",
  fontSize: 14, fontFamily: "inherit", background: "#fff", color: "#2B2622", boxSizing: "border-box",
};

const btnStyle = {
  border: "none", borderRadius: 12, padding: "12px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer",
};

const FONT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap');
* { box-sizing: border-box; }
body { margin: 0; }
input, select, textarea { outline: none; }
input:focus, select:focus, textarea:focus { border-color: #E8622C !important; }
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-thumb { background: #E4D9C6; border-radius: 4px; }
@keyframes slideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes slideDown { from { transform: translate(-50%, -20px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
button { font-family: inherit; transition: transform 0.12s ease, background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease; -webkit-tap-highlight-color: transparent; }
button:not(:disabled):active { transform: scale(0.97); }
:focus-visible { outline: 2.5px solid #E8622C; outline-offset: 2px; border-radius: 8px; }
input:focus-visible, select:focus-visible, textarea:focus-visible { outline: none; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes pop { 0% { transform: scale(0.7); } 60% { transform: scale(1.2); } 100% { transform: scale(1); } }
/* no fill-mode: a lingering animation would trap fixed-position modals below the header/nav */
.fade-up { animation: fadeUp 0.28s ease; }
.react-pop { display: inline-block; animation: pop 0.3s ease; }
button[aria-pressed="true"] svg { animation: pop 0.28s ease; }
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
@media print {
  .no-print { display: none !important; }
  .sheet-root { background: #fff !important; padding: 0 !important; min-height: 0 !important; }
  .care-sheet { max-width: none !important; margin: 0 !important; padding: 0 !important; border: none !important; border-radius: 0 !important; }
  @page { margin: 14mm; }
}
`;
