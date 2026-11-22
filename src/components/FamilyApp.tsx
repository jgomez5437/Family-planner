"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LogOut,
  Plus,
  Search,
  Settings as SettingsIcon,
  User,
  Users,
} from "lucide-react";
import {
  DESKTOP_BREAKPOINT,
  findMemberById,
  TABS,
} from "@/lib/constants";
import { fmtTime, nowClock, relativeDay, todayISO, uid } from "@/lib/dates";
import { dosesFor } from "@/lib/meds";
import {
  getDefaultNotificationPreferences,
  isCategoryEnabled,
  loadNotificationPreferences,
  saveNotificationPreferences,
  showBrowserNotification,
  type NotificationPreferences,
} from "@/lib/notifications";
import { expandAllEvents, expandAllTasks } from "@/lib/recurrence";
import type {
  ActivityItem,
  ChildProfile,
  DoseLogMap,
  FamilyEvent,
  FamilyNotification,
  FamilyStatePayload,
  FamilyTask,
  Medication,
  Member,
  MemberId,
  ProfilesMap,
  ScheduledDose,
  WallPost,
} from "@/types/family";
import { MembersProvider } from "@/components/MembersContext";
import { AvatarDot, LiveToast } from "@/components/ui/Primitives";
import { DesktopSidebar } from "@/components/layout/DesktopSidebar";
import {
  QuickAddSheet,
  type ComposerKind,
} from "@/components/layout/QuickAddSheet";
import { Composer } from "@/components/layout/Composer";
import { SearchOverlay } from "@/components/layout/SearchOverlay";
import { NotificationBell } from "@/components/layout/NotificationCenter";
import {
  SettingsScreen,
  type SettingsSubScreen,
} from "@/components/layout/SettingsScreen";
import {
  MemberModal,
  type MemberFormData,
} from "@/components/layout/MemberModal";
import { HomeTab } from "@/components/tabs/HomeTab";
import { CaregiverSheet, ManagerTab } from "@/components/tabs/ManagerTab";
import { TasksTab } from "@/components/tabs/TasksTab";
import { EventDetailModal, EventsTab } from "@/components/tabs/EventsTab";
import { WallTab } from "@/components/tabs/WallTab";
import { PwaInstallBanner } from "@/components/pwa/PwaContext";

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT);
    function onResize() {
      setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isDesktop;
}

export default function FamilyApp({
  initialState,
  onSignedOut,
}: {
  initialState: FamilyStatePayload;
  onSignedOut: () => void;
}) {
  const isDesktop = useIsDesktop();
  const currentUser: MemberId = initialState.currentUser.id;
  const [members, setMembers] = useState<Member[]>(initialState.members);
  const [inviteCode, setInviteCode] = useState(initialState.inviteCode);
  const [tab, setTab] = useState("home");

  const [notifications, setNotifications] = useState<FamilyNotification[]>(
    initialState.notifications || []
  );
  const [notificationPrefs, setNotificationPrefs] =
    useState<NotificationPreferences>(() =>
      getDefaultNotificationPreferences()
    );
  const [highlightedPostId, setHighlightedPostId] = useState<string | null>(
    null
  );
  const seenNotificationIdsRef = useRef<Set<string>>(
    new Set((initialState.notifications || []).map((n) => n.id))
  );
  const notificationPrefsRef = useRef<NotificationPreferences>(notificationPrefs);
  notificationPrefsRef.current = notificationPrefs;

  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved notification preferences for the current user
  useEffect(() => {
    setNotificationPrefs(loadNotificationPreferences(currentUser));
  }, [currentUser]);

  // Support PWA home-screen shortcut & notification URLs (e.g. /?tab=wall&entity=pt_123)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const requestedTab = url.searchParams.get("tab");
    const requestedEntity = url.searchParams.get("entity");
    let mutated = false;
    if (requestedTab && TABS.some((t) => t.id === requestedTab)) {
      setTab(requestedTab);
      url.searchParams.delete("tab");
      mutated = true;
    }
    if (requestedEntity) {
      if (requestedTab === "wall") {
        setHighlightedPostId(requestedEntity);
      }
      url.searchParams.delete("entity");
      mutated = true;
    }
    if (mutated) {
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    }
  }, []);

  const [events, setEvents] = useState<FamilyEvent[]>(initialState.events);
  const [tasks, setTasks] = useState<FamilyTask[]>(initialState.tasks);
  const [posts, setPosts] = useState<WallPost[]>(initialState.posts);
  const [activity, setActivity] = useState<ActivityItem[]>(
    initialState.activity
  );
  const [toast, setToast] = useState<string | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [composerType, setComposerType] = useState<ComposerKind | null>(null);
  const [composerDate, setComposerDate] = useState<string | null>(null);
  const [composerParticipants, setComposerParticipants] = useState<MemberId[]>(
    []
  );
  const [composerPostType, setComposerPostType] = useState("Update");
  const [meds, setMeds] = useState<Medication[]>(initialState.meds);
  const [doseLog, setDoseLog] = useState<DoseLogMap>(initialState.doseLog);
  const [profiles, setProfiles] = useState<ProfilesMap>(initialState.profiles);
  const [sheet, setSheet] = useState<{ kidIds: MemberId[] } | null>(null);
  const [historyModal, setHistoryModal] = useState<FamilyEvent | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsScreen, setSettingsScreen] =
    useState<SettingsSubScreen | null>(null);
  const [addChildModalOpen, setAddChildModalOpen] = useState(false);
  const [familyName, setFamilyName] = useState(initialState.familyName);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postMutationSeqRef = useRef(0);
  const pendingPostMutationsRef = useRef(0);
  const notifMutationSeqRef = useRef(0);
  const pendingNotifMutationsRef = useRef(0);
  const memberMutationSeqRef = useRef(0);

  const memberById = (id?: MemberId | null) => findMemberById(id, members);
  const me = memberById(currentUser);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  // Close mobile profile dropdown on outside click or Escape
  useEffect(() => {
    if (!userMenuOpen) return;
    function handleOutside(event: MouseEvent) {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setUserMenuOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [userMenuOpen]);

  // Smoothly scroll to and temporarily highlight a Wall post opened from a notification
  useEffect(() => {
    if (!highlightedPostId || tab !== "wall") return;
    const frame = window.requestAnimationFrame(() => {
      const el = document.getElementById(`post-${highlightedPostId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedPostId(null);
    }, 3500);
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [highlightedPostId, tab, posts.length]);

  const pollNotifications = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const postSeqAtStart = postMutationSeqRef.current;
    const notifSeqAtStart = notifMutationSeqRef.current;
    const memberSeqAtStart = memberMutationSeqRef.current;
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as {
        notifications?: FamilyNotification[];
        posts?: WallPost[];
        members?: Member[];
      };
      if (
        Array.isArray(json.members) &&
        json.members.length > 0 &&
        memberMutationSeqRef.current === memberSeqAtStart
      ) {
        setMembers(json.members);
      }
      if (
        Array.isArray(json.posts) &&
        pendingPostMutationsRef.current === 0 &&
        postMutationSeqRef.current === postSeqAtStart
      ) {
        setPosts(json.posts);
      }
      if (
        Array.isArray(json.notifications) &&
        pendingNotifMutationsRef.current === 0 &&
        notifMutationSeqRef.current === notifSeqAtStart
      ) {
        const incoming = json.notifications;
        const prefs = notificationPrefsRef.current;
        const newlyArrived = incoming.filter(
          (n) =>
            !n.read &&
            !seenNotificationIdsRef.current.has(n.id) &&
            isCategoryEnabled(prefs, n.category)
        );
        for (const n of incoming) {
          seenNotificationIdsRef.current.add(n.id);
        }
        setNotifications(incoming);
        if (prefs.browserEnabled && newlyArrived.length > 0) {
          for (const n of newlyArrived.slice(0, 3)) {
            void showBrowserNotification(n);
          }
        }
      }
    } catch {
      /* background polling failure is non-fatal */
    }
  }, []);

  // Poll for new notifications periodically, on window focus, and when reconnecting
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void pollNotifications();
      }
    }, 15000);

    function handleFocus() {
      void pollNotifications();
    }
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        void pollNotifications();
      }
    }
    function handleOnline() {
      void pollNotifications();
    }

    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [pollNotifications]);

  function fireToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }

  function handleUpdateNotificationPreferences(next: NotificationPreferences) {
    setNotificationPrefs(next);
    saveNotificationPreferences(currentUser, next);
  }

  const navigateFromNotificationPayload = useCallback(
    async (payload: {
      notificationId?: string | null;
      tab?: string | null;
      entityId?: string | null;
    }) => {
      if (payload.notificationId) {
        const id = payload.notificationId;
        notifMutationSeqRef.current += 1;
        pendingNotifMutationsRef.current += 1;
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, read: true } : n))
        );
        try {
          await fetch("/api/notifications", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
          });
        } catch {
          /* background sync */
        } finally {
          pendingNotifMutationsRef.current = Math.max(
            0,
            pendingNotifMutationsRef.current - 1
          );
        }
      }

      if (payload.tab && TABS.some((t) => t.id === payload.tab)) {
        setSettingsScreen(null);
        setTab(payload.tab);
        if (payload.tab === "wall" && payload.entityId) {
          setHighlightedPostId(payload.entityId);
        }
      }
    },
    []
  );

  // Handle OS/browser notification clicks from the Service Worker or fallback Notification API
  useEffect(() => {
    function handleSwMessage(event: MessageEvent) {
      if (event.data?.type === "NOTIFICATION_CLICK") {
        void navigateFromNotificationPayload({
          notificationId: event.data.notificationId,
          tab: event.data.tab,
          entityId: event.data.entityId,
        });
      }
    }
    function handleWindowNotifClick(event: Event) {
      const detail = (
        event as CustomEvent<{
          notificationId?: string | null;
          tab?: string | null;
          entityId?: string | null;
        }>
      ).detail;
      if (detail) {
        void navigateFromNotificationPayload(detail);
      }
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", handleSwMessage);
    }
    window.addEventListener("fp:notification-click", handleWindowNotifClick);
    return () => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", handleSwMessage);
      }
      window.removeEventListener(
        "fp:notification-click",
        handleWindowNotifClick
      );
    };
  }, [navigateFromNotificationPayload]);

  async function handleSelectNotification(notification: FamilyNotification) {
    await navigateFromNotificationPayload({
      notificationId: notification.read ? null : notification.id,
      tab: notification.target?.tab,
      entityId: notification.target?.entityId,
    });
  }

  async function handleMarkAllNotificationsRead() {
    notifMutationSeqRef.current += 1;
    pendingNotifMutationsRef.current += 1;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
    } catch {
      /* background sync */
    } finally {
      pendingNotifMutationsRef.current = Math.max(
        0,
        pendingNotifMutationsRef.current - 1
      );
    }
  }

  async function handleClearNotifications() {
    notifMutationSeqRef.current += 1;
    pendingNotifMutationsRef.current += 1;
    setNotifications([]);
    try {
      await fetch("/api/notifications", { method: "DELETE" });
    } catch {
      /* background sync */
    } finally {
      pendingNotifMutationsRef.current = Math.max(
        0,
        pendingNotifMutationsRef.current - 1
      );
    }
  }

  function pushActivity(
    text: string,
    sub: string | null,
    by: MemberId,
    targetEvent?: FamilyEvent | null
  ) {
    setActivity((a) =>
      [
        {
          id: uid("ac"),
          text,
          sub,
          by,
          at: "just now",
          target: targetEvent || null,
        },
        ...a,
      ].slice(0, 20)
    );
  }

  /* ---- AUTH & MEMBER ACTIONS ---- */

  async function handleSignOut() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    onSignedOut();
  }

  async function handleAddMember(data: MemberFormData): Promise<string | null> {
    try {
      const res = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) return json.error || "Could not add member.";
      const added: Member = json.member;
      memberMutationSeqRef.current += 1;
      setMembers((ms) => [...ms.filter((m) => m.id !== added.id), added]);
      if (added.isChild) {
        setProfiles((p) => ({
          ...p,
          [added.id]: p[added.id] || {
            allergies: "",
            doctor: "",
            contact: "",
            notes: "",
          },
        }));
      }
      pushActivity(
        `${memberById(currentUser).name} added ${added.name} to the family`,
        added.isChild ? "Child profile" : "Family member",
        currentUser
      );
      fireToast(`${added.name} added`);
      return null;
    } catch {
      return "Network error while adding member.";
    }
  }

  async function handleUpdateMember(
    memberId: MemberId,
    data: Partial<MemberFormData> & { password?: string }
  ): Promise<string | null> {
    try {
      const res = await fetch(`/api/members/${encodeURIComponent(memberId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) return json.error || "Could not update member.";
      const updated: Member = json.member;
      memberMutationSeqRef.current += 1;
      setMembers((ms) => ms.map((m) => (m.id === memberId ? updated : m)));
      if (updated.isChild) {
        setProfiles((p) => ({
          ...p,
          [updated.id]: p[updated.id] || {
            allergies: "",
            doctor: "",
            contact: "",
            notes: "",
          },
        }));
      }
      fireToast("Profile updated");
      return null;
    } catch {
      return "Network error while updating profile.";
    }
  }

  async function handleDeleteMember(
    memberId: MemberId
  ): Promise<string | null> {
    try {
      const res = await fetch(`/api/members/${encodeURIComponent(memberId)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) return json.error || "Could not remove member.";
      if (memberId === currentUser) {
        await handleSignOut();
        return null;
      }
      memberMutationSeqRef.current += 1;
      setMembers((ms) => ms.filter((m) => m.id !== memberId));
      setMeds((ms) => ms.filter((m) => m.kidId !== memberId));
      setProfiles((p) => {
        const next = { ...p };
        delete next[memberId];
        return next;
      });
      fireToast("Member removed");
      return null;
    } catch {
      return "Network error while removing member.";
    }
  }

  async function handleRegenerateInviteCode() {
    try {
      const res = await fetch("/api/family", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerateInviteCode: true }),
      });
      const json = await res.json();
      if (res.ok && json.inviteCode) {
        setInviteCode(json.inviteCode);
        fireToast("New invite code generated");
      }
    } catch {
      fireToast("Could not regenerate invite code");
    }
  }

  /* ---- ACTIONS (Optimistic UI + Backend API calls) ---- */

  async function addEvent(ev: Partial<FamilyEvent>) {
    const full: FamilyEvent = {
      id: uid("ev"),
      title: ev.title || "Untitled Event",
      description: ev.description || "",
      notes: ev.notes || "",
      date: ev.date || todayISO(0),
      startTime: ev.allDay ? null : ev.startTime || null,
      endTime: ev.allDay ? null : ev.endTime || null,
      allDay: Boolean(ev.allDay),
      location: ev.location || "",
      category: ev.category || "Family",
      participants: ev.participants || [],
      history: [{ by: currentUser, at: "just now", note: "Created event" }],
      createdBy: currentUser,
      recurrence: ev.recurrence || null,
      reminder: ev.reminder || null,
    };
    setEvents((e) => [...e, full]);
    pushActivity(
      `${memberById(currentUser).name} added "${full.title}"`,
      null,
      currentUser,
      full
    );
    fireToast("Event added");

    try {
      await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: full }),
      });
    } catch {
      /* background sync */
    }
  }

  async function updateEventTime(
    id: string,
    field: string,
    value: string,
    reason: string,
    scope: "instance" | "series"
  ) {
    const [masterId, occDate] = id.includes("::")
      ? id.split("::")
      : [id, null];
    let updatedEvent: FamilyEvent | null = null;

    setEvents((evts) =>
      evts.map((e) => {
        if (e.id !== masterId) return e;
        const isRecurring = !!e.recurrence;
        const editingJustThisOne = Boolean(
          isRecurring && occDate && scope === "instance"
        );

        const before = editingJustThisOne
          ? ((e.overrides?.[occDate!]?.[field] as string | undefined) ??
            (e[field as keyof FamilyEvent] as string | undefined))
          : (e[field as keyof FamilyEvent] as string | undefined);

        let note: string;
        if (field === "startTime")
          note = `Time changed from ${fmtTime(before)} to ${fmtTime(value)}`;
        else if (field === "location")
          note = before
            ? `Location changed from "${before}" to "${value}"`
            : `Location set to "${value}"`;
        else note = `${field} updated`;
        const historyEntry = { by: currentUser, at: "just now", note, reason };

        if (editingJustThisOne && occDate) {
          const existingOverride = (e.overrides && e.overrides[occDate]) || {};
          const merged: FamilyEvent = {
            ...e,
            overrides: {
              ...(e.overrides || {}),
              [occDate]: { ...existingOverride, [field]: value },
            },
            history: [
              ...e.history,
              {
                ...historyEntry,
                note: `${historyEntry.note} (${relativeDay(occDate)} only)`,
              },
            ],
          };
          updatedEvent = {
            ...merged,
            ...merged.overrides![occDate],
            id,
            occurrenceDate: occDate,
          };
          return merged;
        }

        const patched: FamilyEvent = {
          ...e,
          [field]: value,
          history: [...e.history, historyEntry],
        };
        updatedEvent = patched;
        return patched;
      })
    );

    const sub =
      field === "startTime"
        ? fmtTime(value)
        : field === "location"
          ? value
          : null;
    pushActivity(
      `${memberById(currentUser).name} changed "${
        (updatedEvent as FamilyEvent | null)?.title || "an event"
      }"`,
      sub,
      currentUser,
      updatedEvent
    );
    fireToast("Event updated");

    try {
      await fetch(`/api/events/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value, reason, scope }),
      });
    } catch {
      /* background sync */
    }
  }

  async function deleteEvent(id: string, scope: "instance" | "series") {
    const [masterId, occDate] = id.includes("::")
      ? id.split("::")
      : [id, null];
    if (occDate && scope === "instance") {
      setEvents((evts) =>
        evts.map((e) =>
          e.id === masterId
            ? { ...e, exceptions: [...(e.exceptions || []), occDate] }
            : e
        )
      );
      fireToast("Occurrence deleted");
    } else {
      setEvents((e) => e.filter((x) => x.id !== masterId));
      fireToast("Event deleted");
    }

    try {
      await fetch(
        `/api/events/${encodeURIComponent(id)}?scope=${encodeURIComponent(scope)}`,
        { method: "DELETE" }
      );
    } catch {
      /* background sync */
    }
  }

  async function addTask(tk: Partial<FamilyTask>) {
    const full: FamilyTask = {
      id: uid("tk"),
      title: tk.title || "Untitled Task",
      category: tk.category || "Household",
      assignedTo: tk.assignedTo || null,
      priority: tk.priority || "Medium",
      dueDate: tk.dueDate || todayISO(0),
      dueTime: tk.dueTime || null,
      notes: tk.notes || "",
      completed: false,
      createdBy: currentUser,
      linkedEventId: tk.linkedEventId,
      linkedEventTitle: tk.linkedEventTitle,
      recurrence: tk.recurrence || null,
    };
    setTasks((t) => [...t, full]);
    pushActivity(
      `${memberById(currentUser).name} added "${full.title}"`,
      null,
      currentUser
    );
    fireToast("Task added");

    try {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: full }),
      });
    } catch {
      /* background sync */
    }
  }

  async function toggleTask(id: string) {
    const [masterId, occDate] = id.includes("::")
      ? id.split("::")
      : [id, null];
    setTasks((ts) =>
      ts.map((t) => {
        if (t.id !== masterId) return t;

        if (occDate) {
          const existing = (t.overrides && t.overrides[occDate]) || {};
          const nowDone = !existing.completed;
          if (nowDone) {
            const clock = nowClock();
            pushActivity(
              `${memberById(currentUser).name} completed "${t.title}"`,
              clock,
              currentUser
            );
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

        const nowDone = !t.completed;
        if (nowDone) {
          const clock = nowClock();
          pushActivity(
            `${memberById(currentUser).name} completed "${t.title}"`,
            clock,
            currentUser
          );
          fireToast(`"${t.title}" completed`);
        }
        return {
          ...t,
          completed: nowDone,
          completedBy: nowDone ? currentUser : null,
          completedAt: nowDone ? nowClock() : null,
        };
      })
    );

    try {
      await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch {
      /* background sync */
    }
  }

  async function addPost(post: {
    type: string;
    content: string;
    images: string[];
  }): Promise<string | null> {
    const full: WallPost = {
      id: uid("pt"),
      author: currentUser,
      createdAt: "just now",
      reactions: {},
      comments: [],
      ...post,
    };

    postMutationSeqRef.current += 1;
    pendingPostMutationsRef.current += 1;
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post: full }),
      });

      if (!res.ok) {
        if (res.status === 413) {
          return "Photos are too large to upload together. Try fewer or smaller photos.";
        }
        try {
          const json = await res.json();
          return json.error || "Could not save your post. Please try again.";
        } catch {
          return "Could not save your post. Please try again.";
        }
      }

      const json = await res.json();
      const savedPost: WallPost = json.post || full;
      setPosts((p) => [savedPost, ...p.filter((x) => x.id !== savedPost.id)]);
      pushActivity(
        `${memberById(currentUser).name} posted a Family Update`,
        null,
        currentUser
      );
      fireToast("Posted to Family Wall");
      return null;
    } catch {
      return "Network error while saving your post. Please check your connection and try again.";
    } finally {
      pendingPostMutationsRef.current = Math.max(
        0,
        pendingPostMutationsRef.current - 1
      );
    }
  }

  async function toggleReaction(postId: string, emoji: string) {
    postMutationSeqRef.current += 1;
    pendingPostMutationsRef.current += 1;
    setPosts((ps) =>
      ps.map((p) => {
        if (p.id !== postId) return p;
        const cur = p.reactions[emoji] || [];
        const has = cur.includes(currentUser);
        const next = has
          ? cur.filter((u) => u !== currentUser)
          : [...cur, currentUser];
        return { ...p, reactions: { ...p.reactions, [emoji]: next } };
      })
    );

    try {
      await fetch(`/api/posts/${encodeURIComponent(postId)}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
    } catch {
      /* background sync */
    } finally {
      pendingPostMutationsRef.current = Math.max(
        0,
        pendingPostMutationsRef.current - 1
      );
    }
  }

  async function addComment(postId: string, text: string) {
    const comment = { id: uid("cm"), by: currentUser, text, at: "just now" };
    const post = posts.find((p) => p.id === postId);
    postMutationSeqRef.current += 1;
    pendingPostMutationsRef.current += 1;
    setPosts((ps) =>
      ps.map((p) =>
        p.id === postId
          ? { ...p, comments: [...(p.comments || []), comment] }
          : p
      )
    );
    if (post)
      pushActivity(
        `${memberById(currentUser).name} commented on ${
          memberById(post.author).name
        }'s post`,
        null,
        currentUser
      );

    try {
      await fetch(`/api/posts/${encodeURIComponent(postId)}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, commentId: comment.id }),
      });
    } catch {
      /* background sync */
    } finally {
      pendingPostMutationsRef.current = Math.max(
        0,
        pendingPostMutationsRef.current - 1
      );
    }
  }

  function openComposerFor(
    type: ComposerKind,
    date?: string,
    participants?: MemberId[],
    postType?: string
  ) {
    setComposerDate(date || todayISO(0));
    setComposerParticipants(participants || []);
    setComposerPostType(postType || "Update");
    setComposerType(type);
  }

  /* ---- Family Manager actions ---- */

  async function toggleDose(dose: ScheduledDose) {
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
    } else {
      const kidName = memberById(dose.med.kidId).name;
      pushActivity(
        `${memberById(currentUser).name} gave ${kidName} ${dose.med.name}`,
        `${fmtTime(dose.time)} dose`,
        currentUser
      );
      fireToast(`${kidName}'s ${dose.med.name} marked given`);
    }

    try {
      await fetch("/api/doses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: dose.key,
          medId: dose.med.id,
          kidId: dose.med.kidId,
          medName: dose.med.name,
          time: dose.time,
        }),
      });
    } catch {
      /* background sync */
    }
  }

  async function saveMed(med: Medication, isNew: boolean) {
    setMeds((ms) =>
      isNew ? [...ms, med] : ms.map((m) => (m.id === med.id ? med : m))
    );
    pushActivity(
      `${memberById(currentUser).name} ${isNew ? "added" : "changed"} ${
        med.name
      } for ${memberById(med.kidId).name}`,
      med.dose,
      currentUser
    );
    fireToast(isNew ? "Medication added" : "Medication updated");

    try {
      if (isNew) {
        await fetch("/api/meds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ med }),
        });
      } else {
        await fetch(`/api/meds/${encodeURIComponent(med.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ med }),
        });
      }
    } catch {
      /* background sync */
    }
  }

  async function deleteMed(id: string) {
    setMeds((ms) => ms.filter((m) => m.id !== id));
    fireToast("Medication removed");

    try {
      await fetch(`/api/meds/${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      /* background sync */
    }
  }

  async function saveProfile(kidId: MemberId, data: ChildProfile) {
    setProfiles((p) => ({ ...p, [kidId]: data }));
    pushActivity(
      `${memberById(currentUser).name} updated ${
        memberById(kidId).name
      }'s care info`,
      null,
      currentUser
    );
    fireToast("Care info saved");

    try {
      await fetch(`/api/profiles/${encodeURIComponent(kidId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: data }),
      });
    } catch {
      /* background sync */
    }
  }

  async function renameFamily(name: string) {
    setFamilyName(name);
    fireToast("Name updated");

    try {
      await fetch("/api/family", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyName: name }),
      });
    } catch {
      /* background sync */
    }
  }

  /* ---- Derived ---- */
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
    () =>
      [...expandedEvents].sort((a, b) =>
        (a.date + (a.startTime || "")).localeCompare(
          b.date + (b.startTime || "")
        )
      ),
    [expandedEvents]
  );
  const todaysEvents = sortedUpcomingEvents.filter(
    (e) => e.date === todayISO(0)
  );
  const todaysTasks = expandedTasks.filter((t) => t.dueDate === todayISO(0));
  const pendingDoses = meds
    .flatMap((m) => dosesFor(m, todayISO(0)))
    .filter((d) => !doseLog[d.key])
    .sort((a, b) => a.time.localeCompare(b.time));

  if (sheet) {
    return (
      <MembersProvider members={members}>
        <div
          style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            color: "#2B2622",
          }}
        >
          <CaregiverSheet
            initialKidIds={sheet.kidIds}
            meds={meds}
            profiles={profiles}
            events={sortedUpcomingEvents}
            doseLog={doseLog}
            preparedBy={me.name}
            onClose={() => setSheet(null)}
          />
        </div>
      </MembersProvider>
    );
  }

  return (
    <MembersProvider members={members}>
      <div
        style={{
          fontFamily: "'Inter', system-ui, sans-serif",
          background: "#FFF9F0",
          minHeight: "100vh",
          color: "#2B2622",
          display: "flex",
        }}
      >
        <LiveToast toast={toast} />

        {isDesktop && (
          <DesktopSidebar
            familyName={familyName}
            tab={tab}
            setTab={setTab}
            currentUser={currentUser}
            onQuickAdd={() => setQuickAddOpen(true)}
            onOpenSettings={(s) => setSettingsScreen(s || "root")}
            onSignOut={handleSignOut}
          />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Top bar */}
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 50,
              background: "rgba(255,249,240,0.86)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              borderBottom: "1px solid #F1E8D9",
              padding: isDesktop
                ? "16px 32px"
                : "calc(12px + env(safe-area-inset-top)) 18px 12px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  minWidth: 0,
                  flex: 1,
                }}
              >
                {!isDesktop && (
                  <div
                    title={familyName}
                    style={{
                      fontFamily: "'Baloo 2', sans-serif",
                      fontSize: 17,
                      fontWeight: 700,
                      color: "#2B2622",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      minWidth: 0,
                    }}
                  >
                    {familyName}
                  </div>
                )}
                {isDesktop && (
                  <div
                    style={{
                      fontFamily: "'Baloo 2', sans-serif",
                      fontSize: 19,
                      fontWeight: 700,
                      color: "#2B2622",
                      textTransform: "capitalize",
                    }}
                  >
                    {TABS.find((t) => t.id === tab)?.label || "Home"}
                  </div>
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexShrink: 0,
                }}
              >
                <button
                  onClick={() => setSearchOpen(true)}
                  title="Search"
                  aria-label="Search"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#6B6259",
                    flexShrink: 0,
                  }}
                >
                  <Search size={18} />
                </button>
                <NotificationBell
                  notifications={notifications}
                  preferences={notificationPrefs}
                  isDesktop={isDesktop}
                  onSelectNotification={(n) => void handleSelectNotification(n)}
                  onMarkAllRead={() => void handleMarkAllNotificationsRead()}
                  onClearAll={() => void handleClearNotifications()}
                  onOpenNotificationSettings={() =>
                    setSettingsScreen("notifications")
                  }
                />
                {!isDesktop && (
                  <button
                    onClick={() => setQuickAddOpen(true)}
                    title="Quick add"
                    aria-label="Quick add"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: "#E8622C",
                      color: "#fff",
                      border: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      flexShrink: 0,
                      boxShadow: "0 2px 8px rgba(232,98,44,0.35)",
                      marginLeft: 2,
                    }}
                  >
                    <Plus size={20} strokeWidth={2.75} />
                  </button>
                )}
                {!isDesktop && (
                  <div ref={userMenuRef} style={{ position: "relative" }}>
                    <button
                      onClick={() => setUserMenuOpen((s) => !s)}
                      aria-label={`Signed in as ${me.name}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        background: "#FFFDF9",
                        border: `1.5px solid ${me.color}55`,
                        borderRadius: 999,
                        padding: "5px 11px 5px 6px",
                        cursor: "pointer",
                      }}
                    >
                      <AvatarDot id={currentUser} size={22} />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>
                        {me.name}
                      </span>
                    </button>
                    {userMenuOpen && (
                      <div
                        style={{
                          position: "absolute",
                          right: 0,
                          top: "115%",
                          background: "#fff",
                          border: "1px solid #F1E8D9",
                          borderRadius: 14,
                          boxShadow: "0 8px 28px rgba(0,0,0,0.15)",
                          padding: 6,
                          zIndex: 60,
                          minWidth: 196,
                        }}
                      >
                        <div
                          style={{
                            padding: "6px 10px 8px",
                            borderBottom: "1px solid #F3ECE0",
                            marginBottom: 4,
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 700 }}>
                            {me.name}
                          </div>
                          {me.email && (
                            <div style={{ fontSize: 11, color: "#948C80" }}>
                              {me.email}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setUserMenuOpen(false);
                            setSettingsScreen("account");
                          }}
                          style={mobileMenuItemStyle}
                        >
                          <User size={14} color="#6B6259" /> Account
                        </button>
                        <button
                          onClick={() => {
                            setUserMenuOpen(false);
                            setSettingsScreen("family");
                          }}
                          style={mobileMenuItemStyle}
                        >
                          <Users size={14} color="#6B6259" /> Family &amp;
                          Members
                        </button>
                        <button
                          onClick={() => {
                            setUserMenuOpen(false);
                            setSettingsScreen("root");
                          }}
                          style={mobileMenuItemStyle}
                        >
                          <SettingsIcon size={14} color="#6B6259" /> Settings
                        </button>
                        <div
                          style={{
                            height: 1,
                            background: "#F3ECE0",
                            margin: "4px 6px",
                          }}
                        />
                        <button
                          onClick={() => {
                            setUserMenuOpen(false);
                            handleSignOut();
                          }}
                          style={{ ...mobileMenuItemStyle, color: "#C4402A" }}
                        >
                          <LogOut size={14} color="#C4402A" /> Sign Out
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Content */}
          <div
            key={tab}
            className="fade-up"
            style={{
              maxWidth: isDesktop ? 900 : 560,
              margin: "0 auto",
              padding: isDesktop
                ? "24px 32px 60px"
                : "18px 16px calc(96px + env(safe-area-inset-bottom))",
            }}
          >
            <PwaInstallBanner />
            {tab === "home" && (
              <HomeTab
                currentUser={currentUser}
                todaysEvents={todaysEvents}
                todaysTasks={todaysTasks}
                upcoming={sortedUpcomingEvents
                  .filter((e) => e.date > todayISO(0))
                  .slice(0, 5)}
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
                onAddAppointment={(kidId) =>
                  openComposerFor("appointment", todayISO(0), [kidId])
                }
                onOpenSheet={(kidIds) => setSheet({ kidIds })}
                onAddChild={() => setAddChildModalOpen(true)}
              />
            )}
            {tab === "tasks" && (
              <TasksTab
                tasks={expandedTasks}
                toggleTask={toggleTask}
                currentUser={currentUser}
                openComposer={openComposerFor}
                onOpenLinkedEvent={(task) => {
                  const master = events.find(
                    (e) => e.id === task.linkedEventId
                  );
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
            {tab === "wall" && (
              <WallTab
                posts={posts}
                currentUser={currentUser}
                toggleReaction={toggleReaction}
                addComment={addComment}
                openComposer={openComposerFor}
                highlightedPostId={highlightedPostId}
              />
            )}
          </div>
        </div>

        {/* Bottom nav — mobile only */}
        {!isDesktop && (
          <div
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              background: "rgba(255,253,249,0.92)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              borderTop: "1px solid #F1E8D9",
              display: "flex",
              zIndex: 60,
              paddingBottom: "max(6px, env(safe-area-inset-bottom))",
            }}
          >
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  aria-current={active ? "page" : undefined}
                  style={{
                    flex: 1,
                    background: "none",
                    border: "none",
                    padding: "8px 4px 5px",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 2,
                    color: active ? "#E8622C" : "#A69C8E",
                  }}
                >
                  <span
                    style={{
                      width: 54,
                      height: 30,
                      borderRadius: 15,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: active ? "#FCE9DF" : "transparent",
                      transition: "background 0.2s",
                    }}
                  >
                    <Icon size={21} strokeWidth={active ? 2.4 : 2} />
                  </span>
                  <span
                    style={{ fontSize: 10.5, fontWeight: active ? 700 : 500 }}
                  >
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {quickAddOpen && (
          <QuickAddSheet
            onClose={() => setQuickAddOpen(false)}
            onSelect={(type) => {
              openComposerFor(type);
              setQuickAddOpen(false);
            }}
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
            onOpenEvent={(e) => {
              setSearchOpen(false);
              setHistoryModal(e);
            }}
          />
        )}

        {settingsScreen && (
          <SettingsScreen
            initialScreen={settingsScreen}
            onClose={() => setSettingsScreen(null)}
            familyName={familyName}
            inviteCode={inviteCode}
            currentUserId={currentUser}
            notificationPreferences={notificationPrefs}
            onUpdateNotificationPreferences={handleUpdateNotificationPreferences}
            onRenameFamily={renameFamily}
            onRegenerateInviteCode={handleRegenerateInviteCode}
            onAddMember={handleAddMember}
            onUpdateMember={handleUpdateMember}
            onDeleteMember={handleDeleteMember}
            onSignOut={handleSignOut}
          />
        )}

        {addChildModalOpen && (
          <MemberModal
            defaultIsChild={true}
            onClose={() => setAddChildModalOpen(false)}
            onSave={handleAddMember}
          />
        )}
      </div>
    </MembersProvider>
  );
}

const mobileMenuItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  background: "transparent",
  border: "none",
  borderRadius: 10,
  padding: "8px 10px",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  color: "#2B2622",
  textAlign: "left",
};
