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
import { fmtShortDate, fmtTime, todayISO, uid } from "@/lib/dates";
import { useRelativeTimeTicker } from "@/lib/useRelativeTime";
import { dosesFor } from "@/lib/meds";
import {
  clearNotificationPreferences,
  getDefaultNotificationPreferences,
  isCategoryEnabled,
  loadNotificationPreferences,
  saveNotificationPreferences,
  showBrowserNotification,
  type NotificationPreferences,
} from "@/lib/notifications";
import { expandAllEvents, expandAllTasks } from "@/lib/recurrence";
import {
  countActionableGamesForMember,
  getGameDefinition,
} from "@/lib/games/registry";
import type {
  ActivityItem,
  ChildProfile,
  DoseLogMap,
  FamilyEvent,
  FamilyGame,
  FamilyNotification,
  FamilyStatePayload,
  FamilyTask,
  GameMode,
  GameTypeId,
  Medication,
  Member,
  MemberId,
  ProfilesMap,
  ScheduledDose,
  TaskOverride,
  TaskUpdateInput,
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
import { PlanTab } from "@/components/tabs/PlanTab";
import { TaskEditModal } from "@/components/plan/TaskItems";
import { EventDetailModal } from "@/components/plan/EventItems";
import { WallTab } from "@/components/tabs/WallTab";
import { GamesTab } from "@/components/tabs/GamesTab";
import { PwaInstallBanner } from "@/components/pwa/PwaContext";
import type { PlanTypeFilter } from "@/lib/plan";

function resolveTabTarget(
  rawTab?: string | null,
  rawFilter?: string | null
): { tab: string; filter?: PlanTypeFilter } | null {
  if (!rawTab) return null;
  if (rawTab === "tasks") return { tab: "plan", filter: "tasks" };
  if (rawTab === "events") return { tab: "plan", filter: "events" };
  if (rawTab === "plan") {
    const validFilter: PlanTypeFilter | undefined =
      rawFilter === "all" ||
      rawFilter === "tasks" ||
      rawFilter === "events" ||
      rawFilter === "appointments"
        ? rawFilter
        : undefined;
    return { tab: "plan", filter: validFilter };
  }
  if (TABS.some((t) => t.id === rawTab)) {
    return { tab: rawTab };
  }
  return null;
}

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
  onSignedOut: (options?: { notice?: string }) => void;
}) {
  const isDesktop = useIsDesktop();
  useRelativeTimeTicker(30000);
  const currentUser: MemberId = initialState.currentUser.id;
  const [members, setMembers] = useState<Member[]>(initialState.members);
  const [inviteCode, setInviteCode] = useState(initialState.inviteCode);
  const [tab, setTab] = useState("home");
  const [planFilter, setPlanFilter] = useState<PlanTypeFilter>("all");

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
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [selectedManagerKidId, setSelectedManagerKidId] =
    useState<MemberId | null>(null);
  const [highlightedMedId, setHighlightedMedId] = useState<string | null>(null);
  const seenNotificationIdsRef = useRef<Set<string>>(
    new Set((initialState.notifications || []).map((n) => n.id))
  );
  const notificationPrefsRef = useRef<NotificationPreferences>(notificationPrefs);
  notificationPrefsRef.current = notificationPrefs;
  const onSignedOutRef = useRef(onSignedOut);
  onSignedOutRef.current = onSignedOut;

  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const medHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved notification preferences for the current user
  useEffect(() => {
    setNotificationPrefs(loadNotificationPreferences(currentUser));
  }, [currentUser]);

  // Support PWA home-screen shortcut & notification URLs (e.g. /?tab=wall&entity=pt_123)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const requestedTab = url.searchParams.get("tab");
    const requestedFilter = url.searchParams.get("filter");
    const requestedEntity = url.searchParams.get("entity");
    let mutated = false;
    const resolved = resolveTabTarget(requestedTab, requestedFilter);
    if (resolved) {
      setTab(resolved.tab);
      if (resolved.filter) setPlanFilter(resolved.filter);
      url.searchParams.delete("tab");
      mutated = true;
    }
    if (requestedFilter) {
      url.searchParams.delete("filter");
      mutated = true;
    }
    if (requestedEntity) {
      if (requestedTab === "wall") {
        setHighlightedPostId(requestedEntity);
      } else if (requestedTab === "games") {
        setSelectedGameId(requestedEntity);
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
  const [games, setGames] = useState<FamilyGame[]>(initialState.games || []);
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);
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
  const [editingTask, setEditingTask] = useState<FamilyTask | null>(null);
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
  const gameMutationSeqRef = useRef(0);
  const pendingGameMutationsRef = useRef(0);

  const memberById = (id?: MemberId | null) => findMemberById(id, members);
  const me = memberById(currentUser);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      if (medHighlightTimerRef.current) clearTimeout(medHighlightTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!highlightedMedId || tab !== "manager") return;
    if (medHighlightTimerRef.current) clearTimeout(medHighlightTimerRef.current);
    medHighlightTimerRef.current = setTimeout(() => {
      setHighlightedMedId(null);
    }, 3500);
  }, [highlightedMedId, tab]);

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
    const gameSeqAtStart = gameMutationSeqRef.current;
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (res.status === 401) {
        onSignedOutRef.current();
        return;
      }
      if (!res.ok) return;
      const json = (await res.json()) as {
        notifications?: FamilyNotification[];
        posts?: WallPost[];
        members?: Member[];
        games?: FamilyGame[];
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
        Array.isArray(json.games) &&
        pendingGameMutationsRef.current === 0 &&
        gameMutationSeqRef.current === gameSeqAtStart
      ) {
        setGames(json.games);
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

  const syncServerClock = useCallback((serverNow?: string) => {
    if (!serverNow) return;
    const serverMs = Date.parse(serverNow);
    if (!Number.isNaN(serverMs)) {
      setServerClockOffsetMs(serverMs - Date.now());
    }
  }, []);

  const pollGames = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const gameSeqAtStart = gameMutationSeqRef.current;
    try {
      const res = await fetch("/api/games", { cache: "no-store" });
      if (res.status === 401) {
        onSignedOutRef.current();
        return;
      }
      if (!res.ok) return;
      const json = (await res.json()) as {
        games?: FamilyGame[];
        serverNow?: string;
      };
      syncServerClock(json.serverNow);
      if (
        Array.isArray(json.games) &&
        pendingGameMutationsRef.current === 0 &&
        gameMutationSeqRef.current === gameSeqAtStart
      ) {
        setGames(json.games);
      }
    } catch {
      /* background polling failure is non-fatal */
    }
  }, [syncServerClock]);

  const pollSingleGame = useCallback(
    async (gameId: string) => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      const gameSeqAtStart = gameMutationSeqRef.current;
      try {
        const res = await fetch(`/api/games/${encodeURIComponent(gameId)}`, {
          cache: "no-store",
        });
        if (res.status === 401) {
          onSignedOutRef.current();
          return;
        }
        if (res.status === 404) {
          setSelectedGameId((cur) => (cur === gameId ? null : cur));
          setGames((prev) => prev.filter((g) => g.id !== gameId));
          return;
        }
        if (!res.ok) return;
        const json = (await res.json()) as {
          game?: FamilyGame;
          serverNow?: string;
        };
        syncServerClock(json.serverNow);
        if (
          json.game &&
          pendingGameMutationsRef.current === 0 &&
          gameMutationSeqRef.current === gameSeqAtStart
        ) {
          const fresh = json.game;
          setGames((prev) =>
            prev.some((g) => g.id === fresh.id)
              ? prev.map((g) => (g.id === fresh.id ? fresh : g))
              : [fresh, ...prev]
          );
        }
      } catch {
        /* background polling failure is non-fatal */
      }
    },
    [syncServerClock]
  );

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

  // Fetch fresh games immediately when entering the Games tab
  useEffect(() => {
    if (tab === "games") {
      void pollGames();
    }
  }, [tab, pollGames]);

  // Poll more frequently while actively viewing the Games tab with remote matches/invites
  const hasLiveRemoteGame = useMemo(
    () =>
      games.some(
        (g) =>
          g.mode === "remote" &&
          (g.status === "pending" || g.status === "active")
      ),
    [games]
  );

  useEffect(() => {
    if (tab !== "games" || !hasLiveRemoteGame) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void pollGames();
      }
    }, 5000);
    return () => window.clearInterval(interval);
  }, [tab, hasLiveRemoteGame, pollGames]);

  // Fast ~1s single-game poll while a live/pending simultaneous game (e.g. Versus Sudoku) is open
  const openRealtimeGameId = useMemo(() => {
    if (tab !== "games" || !selectedGameId) return null;
    const g = games.find((item) => item.id === selectedGameId);
    if (!g) return null;
    if (g.status !== "active" && g.status !== "pending") return null;
    return getGameDefinition(g.gameType)?.simultaneous ? g.id : null;
  }, [tab, selectedGameId, games]);

  useEffect(() => {
    if (!openRealtimeGameId) return;
    let inFlight = false;
    const tick = async () => {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        await pollSingleGame(openRealtimeGameId);
      } finally {
        inFlight = false;
      }
    };
    const interval = window.setInterval(() => {
      void tick();
    }, 1000);
    return () => window.clearInterval(interval);
  }, [openRealtimeGameId, pollSingleGame]);

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

      const resolved = resolveTabTarget(payload.tab);
      if (resolved) {
        setSettingsScreen(null);
        setTab(resolved.tab);
        if (resolved.filter) setPlanFilter(resolved.filter);
        if (resolved.tab === "wall" && payload.entityId) {
          setHighlightedPostId(payload.entityId);
        } else if (resolved.tab === "games") {
          setSelectedGameId(payload.entityId || null);
          void pollGames();
        }
      }
    },
    [pollGames]
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
          at: new Date().toISOString(),
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

  async function handleDeleteAccount(password: string): Promise<string | null> {
    try {
      const res = await fetch("/api/auth/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        familyDeleted?: boolean;
        error?: string;
      };
      if (!res.ok) {
        return json.error || "Could not delete your account.";
      }
      clearNotificationPreferences(currentUser);
      onSignedOut({
        notice: json.familyDeleted
          ? "Your account and family workspace have been permanently deleted."
          : "Your account and history have been permanently deleted.",
      });
      return null;
    } catch {
      return "Network error while deleting your account.";
    }
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
      setMeds((ms) => {
        if (highlightedMedId && ms.some((m) => m.id === highlightedMedId && m.kidId === memberId)) {
          setHighlightedMedId(null);
        }
        return ms.filter((m) => m.kidId !== memberId);
      });
      setSelectedManagerKidId((cur) => (cur === memberId ? null : cur));
      setProfiles((p) => {
        const next = { ...p };
        delete next[memberId];
        return next;
      });
      setGames((gs) => {
        const remaining = gs.filter(
          (g) => g.challengerId !== memberId && g.opponentId !== memberId
        );
        if (
          selectedGameId &&
          !remaining.some((g) => g.id === selectedGameId)
        ) {
          setSelectedGameId(null);
        }
        return remaining;
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
    const nowIso = new Date().toISOString();
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
      history: [{ by: currentUser, at: nowIso, note: "Created event" }],
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
    const nowIso = new Date().toISOString();

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
        const historyEntry = { by: currentUser, at: nowIso, note, reason };

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
                note: `${historyEntry.note} (${fmtShortDate(occDate)} only)`,
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
    const target = events.find((e) => e.id === masterId);
    if (!target) return;
    if (target.createdBy !== currentUser) {
      fireToast("Only the person who created this event can delete it.");
      return;
    }

    const previousEvents = events;
    const previousTasks = tasks;
    const previousActivity = activity;
    if (occDate && scope === "instance") {
      setEvents((evts) =>
        evts.map((e) =>
          e.id === masterId
            ? {
                ...e,
                exceptions: (e.exceptions || []).includes(occDate)
                  ? e.exceptions
                  : [...(e.exceptions || []), occDate],
              }
            : e
        )
      );
      fireToast("Occurrence deleted");
    } else {
      setEvents((e) => e.filter((x) => x.id !== masterId));
      setTasks((ts) =>
        ts.map((t) =>
          t.linkedEventId === masterId
            ? { ...t, linkedEventId: undefined, linkedEventTitle: undefined }
            : t
        )
      );
      setActivity((ac) =>
        ac.map((a) =>
          a.targetEventId === masterId || a.target?.id === masterId
            ? { ...a, targetEventId: null, target: null }
            : a
        )
      );
      fireToast("Event deleted");
    }
    setHistoryModal((cur) =>
      cur && (cur.id === id || cur.id === masterId || cur.masterId === masterId)
        ? null
        : cur
    );

    try {
      const res = await fetch(
        `/api/events/${encodeURIComponent(id)}?scope=${encodeURIComponent(scope)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        setEvents(previousEvents);
        setTasks(previousTasks);
        setActivity(previousActivity);
        const json = await res.json().catch(() => ({}));
        fireToast(json.error || "Could not delete event");
      }
    } catch {
      setEvents(previousEvents);
      setTasks(previousTasks);
      setActivity(previousActivity);
      fireToast("Could not delete event");
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
    const completedIso = new Date().toISOString();
    setTasks((ts) =>
      ts.map((t) => {
        if (t.id !== masterId) return t;

        if (occDate) {
          const existing = (t.overrides && t.overrides[occDate]) || {};
          const nowDone = !existing.completed;
          const displayTitle = existing.title || t.title;
          if (nowDone) {
            pushActivity(
              `${memberById(currentUser).name} completed "${displayTitle}"`,
              completedIso,
              currentUser
            );
            fireToast(`"${displayTitle}" completed`);
          }
          return {
            ...t,
            overrides: {
              ...(t.overrides || {}),
              [occDate]: {
                ...existing,
                completed: nowDone,
                completedBy: nowDone ? currentUser : null,
                completedAt: nowDone ? completedIso : null,
              },
            },
          };
        }

        const nowDone = !t.completed;
        if (nowDone) {
          pushActivity(
            `${memberById(currentUser).name} completed "${t.title}"`,
            completedIso,
            currentUser
          );
          fireToast(`"${t.title}" completed`);
        }
        return {
          ...t,
          completed: nowDone,
          completedBy: nowDone ? currentUser : null,
          completedAt: nowDone ? completedIso : null,
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

  async function updateTask(
    id: string,
    updates: TaskUpdateInput,
    scope: "instance" | "series"
  ) {
    const [masterId, occDate] = id.includes("::")
      ? id.split("::")
      : [id, null];
    const target = tasks.find((t) => t.id === masterId);
    if (!target) return;

    const previousTasks = tasks;
    const isRecurring = Boolean(target.recurrence);
    const editingJustThisOne = Boolean(
      isRecurring && occDate && scope === "instance" && updates.recurrence === undefined
    );

    const linkedEventTitle =
      updates.linkedEventId !== undefined
        ? updates.linkedEventId
          ? events.find((e) => e.id === updates.linkedEventId)?.title ||
            target.linkedEventTitle ||
            null
          : null
        : undefined;

    setTasks((ts) =>
      ts.map((t) => {
        if (t.id !== masterId) return t;
        if (editingJustThisOne && occDate) {
          const existingOverride = (t.overrides && t.overrides[occDate]) || {};
          const { recurrence: _ignored, ...restUpdates } = updates;
          const nextOverride: TaskOverride = {
            ...existingOverride,
            ...restUpdates,
            ...(linkedEventTitle !== undefined ? { linkedEventTitle } : {}),
          };
          return {
            ...t,
            overrides: {
              ...(t.overrides || {}),
              [occDate]: nextOverride,
            },
          };
        }
        const clearedKeys = Object.keys(updates).filter(
          (k) => k !== "recurrence" && k !== "dueDate"
        );
        let nextOverrides = t.overrides || {};
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
        return {
          ...t,
          ...updates,
          overrides: nextOverrides,
          linkedEventId:
            updates.linkedEventId !== undefined
              ? updates.linkedEventId || undefined
              : t.linkedEventId,
          linkedEventTitle:
            linkedEventTitle !== undefined
              ? linkedEventTitle || undefined
              : t.linkedEventTitle,
        };
      })
    );

    const displayTitle =
      updates.title ||
      (editingJustThisOne && occDate && target.overrides?.[occDate]?.title) ||
      target.title;
    pushActivity(
      `${memberById(currentUser).name} updated "${displayTitle}"`,
      null,
      currentUser
    );
    fireToast("Task updated");

    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates, scope }),
      });
      if (!res.ok) {
        setTasks(previousTasks);
        const json = await res.json().catch(() => ({}));
        fireToast(json.error || "Could not update task");
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (json.task) {
        setTasks((ts) =>
          ts.map((t) => (t.id === masterId ? json.task : t))
        );
      }
    } catch {
      setTasks(previousTasks);
      fireToast("Could not update task");
    }
  }

  async function deleteTask(id: string, scope: "instance" | "series") {
    const [masterId, occDate] = id.includes("::")
      ? id.split("::")
      : [id, null];
    const target = tasks.find((t) => t.id === masterId);
    if (!target) return;
    if (target.createdBy !== currentUser) {
      fireToast("Only the person who created this task can delete it.");
      return;
    }

    const previousTasks = tasks;
    if (occDate && scope === "instance") {
      setTasks((ts) =>
        ts.map((t) =>
          t.id === masterId
            ? {
                ...t,
                exceptions: (t.exceptions || []).includes(occDate)
                  ? t.exceptions
                  : [...(t.exceptions || []), occDate],
              }
            : t
        )
      );
      fireToast("Task occurrence deleted");
    } else {
      setTasks((ts) => ts.filter((t) => t.id !== masterId));
      fireToast("Task deleted");
    }
    setEditingTask((cur) =>
      cur && (cur.id === id || cur.id === masterId || cur.masterId === masterId)
        ? null
        : cur
    );

    try {
      const res = await fetch(
        `/api/tasks/${encodeURIComponent(id)}?scope=${encodeURIComponent(scope)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        setTasks(previousTasks);
        const json = await res.json().catch(() => ({}));
        fireToast(json.error || "Could not delete task");
      }
    } catch {
      setTasks(previousTasks);
      fireToast("Could not delete task");
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
      createdAt: new Date().toISOString(),
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

  async function deletePost(postId: string) {
    const target = posts.find((p) => p.id === postId);
    if (!target) return;
    if (target.author !== currentUser) {
      fireToast("Only the person who posted this can delete it.");
      return;
    }

    const previousPosts = posts;
    const previousNotifications = notifications;
    postMutationSeqRef.current += 1;
    pendingPostMutationsRef.current += 1;
    notifMutationSeqRef.current += 1;
    pendingNotifMutationsRef.current += 1;
    setPosts((ps) => ps.filter((p) => p.id !== postId));
    setNotifications((ns) => ns.filter((n) => n.target?.entityId !== postId));
    setHighlightedPostId((cur) => (cur === postId ? null : cur));
    fireToast("Post deleted");

    try {
      const res = await fetch(`/api/posts/${encodeURIComponent(postId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setPosts(previousPosts);
        setNotifications(previousNotifications);
        const json = await res.json().catch(() => ({}));
        fireToast(json.error || "Could not delete post");
      }
    } catch {
      setPosts(previousPosts);
      setNotifications(previousNotifications);
      fireToast("Could not delete post");
    } finally {
      pendingPostMutationsRef.current = Math.max(
        0,
        pendingPostMutationsRef.current - 1
      );
      pendingNotifMutationsRef.current = Math.max(
        0,
        pendingNotifMutationsRef.current - 1
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
    const comment = {
      id: uid("cm"),
      by: currentUser,
      text,
      at: new Date().toISOString(),
    };
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

  async function deleteComment(postId: string, commentId: string) {
    const post = posts.find((p) => p.id === postId);
    const comment = post?.comments?.find((c) => c.id === commentId);
    if (!post || !comment) return;
    if (comment.by !== currentUser) {
      fireToast("Only the person who wrote this comment can delete it.");
      return;
    }

    const previousPosts = posts;
    postMutationSeqRef.current += 1;
    pendingPostMutationsRef.current += 1;
    setPosts((ps) =>
      ps.map((p) =>
        p.id === postId
          ? { ...p, comments: (p.comments || []).filter((c) => c.id !== commentId) }
          : p
      )
    );
    fireToast("Comment deleted");

    try {
      const res = await fetch(
        `/api/posts/${encodeURIComponent(postId)}/comments?commentId=${encodeURIComponent(commentId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        setPosts(previousPosts);
        const json = await res.json().catch(() => ({}));
        fireToast(json.error || "Could not delete comment");
      }
    } catch {
      setPosts(previousPosts);
      fireToast("Could not delete comment");
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
      return {
        ...log,
        [dose.key]: { by: currentUser, at: new Date().toISOString() },
      };
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

  const resolvedActivity = useMemo(
    () =>
      activity.map((a) => {
        const refId = a.targetEventId || a.target?.masterId || a.target?.id;
        if (!refId) return a;
        const [masterId] = refId.includes("::") ? refId.split("::") : [refId];
        const liveEvent = events.find((e) => e.id === masterId) || null;
        return { ...a, target: liveEvent };
      }),
    [activity, events]
  );

  const resolvedHistoryModal = useMemo(() => {
    if (!historyModal) return null;
    const [masterId, occDate] = historyModal.id.includes("::")
      ? historyModal.id.split("::")
      : [historyModal.masterId || historyModal.id, null];
    if (occDate) {
      return (
        expandedEvents.find((e) => e.id === `${masterId}::${occDate}`) ||
        events.find((e) => e.id === masterId) ||
        null
      );
    }
    return events.find((e) => e.id === masterId) || null;
  }, [historyModal, events, expandedEvents]);

  const resolvedEditingTask = useMemo(() => {
    if (!editingTask) return null;
    const [masterId, occDate] = editingTask.id.includes("::")
      ? editingTask.id.split("::")
      : [editingTask.masterId || editingTask.id, null];
    const master = tasks.find((t) => t.id === masterId);
    if (!master) return null;
    if (occDate) {
      if ((master.exceptions || []).includes(occDate)) return null;
      return (
        expandedTasks.find((t) => t.id === `${masterId}::${occDate}`) || {
          ...master,
          ...(master.overrides?.[occDate] || {}),
          id: `${masterId}::${occDate}`,
          masterId,
          occurrenceDate: occDate,
          isRecurring: true,
        }
      );
    }
    return expandedTasks.find((t) => t.id === masterId) || master;
  }, [editingTask, tasks, expandedTasks]);

  /* ---- GAMES ACTIONS ---- */

  const gamesBadgeCount = useMemo(
    () => countActionableGamesForMember(games, currentUser),
    [games, currentUser]
  );

  const tabBadges = useMemo(
    () => (gamesBadgeCount > 0 ? { games: gamesBadgeCount } : {}),
    [gamesBadgeCount]
  );

  function handleSelectTab(nextTab: string) {
    if (nextTab === "games" && tab === "games") {
      setSelectedGameId(null);
    } else if (nextTab !== "games") {
      setSelectedGameId(null);
    }
    setTab(nextTab);
  }

  async function handleCreateGame(input: {
    gameType: GameTypeId;
    opponentId: MemberId;
    mode: GameMode;
    rematchOfId?: string | null;
    options?: Record<string, unknown>;
  }): Promise<string | null> {
    gameMutationSeqRef.current += 1;
    pendingGameMutationsRef.current += 1;
    try {
      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = (await res.json()) as {
        game?: FamilyGame;
        error?: string;
        serverNow?: string;
      };
      syncServerClock(json.serverNow);
      if (!res.ok || !json.game) {
        const errMsg = json.error || "Could not create game.";
        if (input.rematchOfId) fireToast(errMsg);
        return errMsg;
      }
      const created = json.game;
      setGames((prev) => [created, ...prev.filter((g) => g.id !== created.id)]);
      if (created.mode === "pass_and_play") {
        setSelectedGameId(created.id);
        fireToast("Pass & Play match started!");
      } else {
        setSelectedGameId(created.id);
        const oppName = memberById(created.opponentId).name;
        const gameName = getGameDefinition(created.gameType)?.name || "a game";
        pushActivity(
          `${me.name} challenged ${oppName} to ${gameName}`,
          created.rematchOfId ? "Rematch request" : "Game invite",
          currentUser
        );
        fireToast(
          created.rematchOfId
            ? `Rematch request sent to ${oppName}`
            : `Game request sent to ${oppName}`
        );
      }
      return null;
    } catch {
      const errMsg = "Network error while creating game.";
      if (input.rematchOfId) fireToast(errMsg);
      return errMsg;
    } finally {
      pendingGameMutationsRef.current = Math.max(
        0,
        pendingGameMutationsRef.current - 1
      );
    }
  }

  async function handleRespondGameInvite(
    gameId: string,
    decision: "accept" | "decline" | "cancel"
  ) {
    gameMutationSeqRef.current += 1;
    pendingGameMutationsRef.current += 1;
    try {
      const res = await fetch(`/api/games/${encodeURIComponent(gameId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: decision }),
      });
      const json = (await res.json()) as {
        game?: FamilyGame;
        error?: string;
        serverNow?: string;
      };
      syncServerClock(json.serverNow);
      if (!res.ok || !json.game) {
        fireToast(json.error || "Could not update game invite.");
        void pollGames();
        return;
      }
      const updated = json.game;
      setGames((prev) => [updated, ...prev.filter((g) => g.id !== updated.id)]);
      if (decision === "accept") {
        fireToast("Challenge accepted — game on!");
      } else if (decision === "decline") {
        fireToast("Challenge declined");
      } else {
        fireToast("Challenge cancelled");
      }
    } catch {
      fireToast("Network error while updating invite.");
    } finally {
      pendingGameMutationsRef.current = Math.max(
        0,
        pendingGameMutationsRef.current - 1
      );
    }
  }

  async function handleMakeGameMove(
    gameId: string,
    move: unknown
  ): Promise<{ ok: boolean; error?: string }> {
    const existing = games.find((g) => g.id === gameId);
    if (!existing) return { ok: false, error: "Game not found." };

    const previousGames = games;
    const gameDef = getGameDefinition(existing.gameType);
    const isSimultaneous = Boolean(gameDef?.simultaneous);
    const movingPlayerId = existing.currentTurnId;

    // Optimistic client move for turn-based games (simultaneous games like
    // Sudoku keep hidden state server-side and render their own pending UI)
    if (
      !isSimultaneous &&
      gameDef &&
      movingPlayerId &&
      existing.status === "active"
    ) {
      const preview = gameDef.validateAndApplyMove({
        state: existing.state,
        move,
        playerId: movingPlayerId,
        players: existing.players,
      });
      if (!preview.ok) {
        fireToast(preview.error);
        return { ok: false, error: preview.error };
      }
      const nowIso = new Date().toISOString();
      const optimistic: FamilyGame = {
        ...existing,
        state: preview.nextState,
        moves: [
          ...existing.moves,
          { by: movingPlayerId, move, at: nowIso },
        ],
        currentTurnId: preview.nextTurnId,
        status: preview.completed ? "completed" : "active",
        winnerId: preview.winnerId,
        outcome: preview.outcome,
        updatedAt: nowIso,
        completedAt: preview.completed ? nowIso : null,
      };
      setGames((prev) => [
        optimistic,
        ...prev.filter((g) => g.id !== optimistic.id),
      ]);
    }

    gameMutationSeqRef.current += 1;
    pendingGameMutationsRef.current += 1;
    try {
      const res = await fetch(`/api/games/${encodeURIComponent(gameId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "move", move }),
      });
      const json = (await res.json()) as {
        game?: FamilyGame;
        error?: string;
        serverNow?: string;
      };
      syncServerClock(json.serverNow);
      if (!res.ok || !json.game) {
        const errMsg = json.error || "Move could not be saved.";
        if (isSimultaneous) {
          void pollSingleGame(gameId);
        } else {
          setGames(previousGames);
          fireToast(errMsg);
          void pollGames();
        }
        return { ok: false, error: errMsg };
      }
      const saved = json.game;
      setGames((prev) => [saved, ...prev.filter((g) => g.id !== saved.id)]);
      if (saved.status === "completed") {
        const gameName = getGameDefinition(saved.gameType)?.name || "Game";
        const otherPlayerId =
          saved.players[0] === currentUser
            ? saved.players[1]
            : saved.players[0];
        const otherName = memberById(otherPlayerId).name;
        if (saved.outcome === "draw") {
          if (saved.mode === "remote") {
            pushActivity(
              `${me.name} & ${otherName} tied in ${gameName}`,
              "Draw",
              currentUser
            );
          }
          if (saved.gameType !== "pool") {
            fireToast("It's a draw! 🤝");
          }
        } else if (saved.winnerId) {
          if (saved.mode === "remote" && saved.outcome === "win") {
            const loserId =
              saved.players[0] === saved.winnerId
                ? saved.players[1]
                : saved.players[0];
            pushActivity(
              `${memberById(saved.winnerId).name} won ${gameName} against ${memberById(loserId).name}`,
              gameName,
              saved.winnerId
            );
          }
          if (saved.gameType !== "pool") {
            const winnerName =
              saved.mode === "remote" && saved.winnerId === currentUser
                ? "You"
                : memberById(saved.winnerId).name;
            fireToast(`${winnerName} won! 🎉`);
          }
        }
      }
      return { ok: true };
    } catch {
      if (!isSimultaneous) {
        setGames(previousGames);
        fireToast("Network error while saving move.");
      }
      return { ok: false, error: "Network error while saving move." };
    } finally {
      pendingGameMutationsRef.current = Math.max(
        0,
        pendingGameMutationsRef.current - 1
      );
    }
  }

  async function handleForfeitGame(gameId: string) {
    gameMutationSeqRef.current += 1;
    pendingGameMutationsRef.current += 1;
    try {
      const res = await fetch(`/api/games/${encodeURIComponent(gameId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "forfeit" }),
      });
      const json = (await res.json()) as {
        game?: FamilyGame;
        error?: string;
        serverNow?: string;
      };
      syncServerClock(json.serverNow);
      if (!res.ok || !json.game) {
        fireToast(json.error || "Could not forfeit game.");
        return;
      }
      const updated = json.game;
      setGames((prev) => [updated, ...prev.filter((g) => g.id !== updated.id)]);
      fireToast("Match forfeited");
    } catch {
      fireToast("Network error while forfeiting match.");
    } finally {
      pendingGameMutationsRef.current = Math.max(
        0,
        pendingGameMutationsRef.current - 1
      );
    }
  }

  if (sheet) {
    return (
      <MembersProvider members={members}>
        <div
          style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            color: "var(--text-primary)",
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
          background: "var(--bg-app)",
          minHeight: "100vh",
          color: "var(--text-primary)",
          display: "flex",
        }}
      >
        <LiveToast toast={toast} />

        {isDesktop && (
          <DesktopSidebar
            familyName={familyName}
            tab={tab}
            setTab={handleSelectTab}
            tabBadges={tabBadges}
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
              background: "var(--bg-header)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              borderBottom: "1px solid var(--border-subtle)",
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
                      color: "var(--text-primary)",
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
                      color: "var(--text-primary)",
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
                    color: "var(--text-secondary)",
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
                      background: "var(--accent)",
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
                        background: "var(--bg-surface-warm)",
                        color: "var(--text-primary)",
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
                          background: "var(--bg-surface)",
                          border: "1px solid var(--border-subtle)",
                          borderRadius: 14,
                          boxShadow: "var(--menu-shadow)",
                          padding: 6,
                          zIndex: 60,
                          minWidth: 196,
                        }}
                      >
                        <div
                          style={{
                            padding: "6px 10px 8px",
                            borderBottom: "1px solid var(--border-divider)",
                            marginBottom: 4,
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 700 }}>
                            {me.name}
                          </div>
                          {me.email && (
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
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
                          <User size={14} color="var(--text-secondary)" /> Account
                        </button>
                        <button
                          onClick={() => {
                            setUserMenuOpen(false);
                            setSettingsScreen("family");
                          }}
                          style={mobileMenuItemStyle}
                        >
                          <Users size={14} color="var(--text-secondary)" /> Family &amp;
                          Members
                        </button>
                        <button
                          onClick={() => {
                            setUserMenuOpen(false);
                            setSettingsScreen("root");
                          }}
                          style={mobileMenuItemStyle}
                        >
                          <SettingsIcon size={14} color="var(--text-secondary)" /> Settings
                        </button>
                        <div
                          style={{
                            height: 1,
                            background: "var(--border-divider)",
                            margin: "4px 6px",
                          }}
                        />
                        <button
                          onClick={() => {
                            setUserMenuOpen(false);
                            handleSignOut();
                          }}
                          style={{ ...mobileMenuItemStyle, color: "var(--danger)" }}
                        >
                          <LogOut size={14} color="var(--danger)" /> Sign Out
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
            className={
              tab === "games" &&
              selectedGameId &&
              games.some(
                (g) =>
                  g.id === selectedGameId &&
                  (g.gameType === "pool" || g.gameType === "sudoku")
              )
                ? undefined
                : "fade-up"
            }
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
                activity={resolvedActivity.slice(0, 4)}
                toggleTask={toggleTask}
                toggleReaction={toggleReaction}
                onDeletePost={deletePost}
                openHistory={setHistoryModal}
                onOpenTask={setEditingTask}
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
                selectedKidId={selectedManagerKidId}
                onSelectKid={(kidId) => {
                  setSelectedManagerKidId(kidId);
                  if (!kidId) setHighlightedMedId(null);
                }}
                highlightedMedId={highlightedMedId}
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
            {tab === "plan" && (
              <PlanTab
                events={sortedUpcomingEvents}
                tasks={expandedTasks}
                currentUser={currentUser}
                typeFilter={planFilter}
                onTypeFilterChange={setPlanFilter}
                toggleTask={toggleTask}
                openHistory={setHistoryModal}
                openComposer={openComposerFor}
                onQuickAdd={() => setQuickAddOpen(true)}
                onEditTask={setEditingTask}
                onDeleteTask={deleteTask}
                onOpenLinkedEvent={(task) => {
                  const master = events.find(
                    (e) => e.id === task.linkedEventId
                  );
                  if (master) setHistoryModal(master);
                }}
                onUpdateEventTime={updateEventTime}
                onDeleteEvent={deleteEvent}
              />
            )}
            {tab === "wall" && (
              <WallTab
                posts={posts}
                currentUser={currentUser}
                toggleReaction={toggleReaction}
                addComment={addComment}
                onDeletePost={deletePost}
                onDeleteComment={deleteComment}
                openComposer={openComposerFor}
                highlightedPostId={highlightedPostId}
              />
            )}
            {tab === "games" && (
              <GamesTab
                games={games}
                currentUser={currentUser}
                selectedGameId={selectedGameId}
                serverClockOffsetMs={serverClockOffsetMs}
                onSelectGame={setSelectedGameId}
                onCreateGame={handleCreateGame}
                onRespondInvite={handleRespondGameInvite}
                onMakeMove={handleMakeGameMove}
                onSyncGame={(id) => void pollSingleGame(id)}
                onForfeitGame={handleForfeitGame}
                onOpenFamilySettings={() => setSettingsScreen("family")}
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
              background: "var(--bg-nav)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              borderTop: "1px solid var(--border-subtle)",
              display: "flex",
              zIndex: 60,
              paddingBottom: "max(6px, env(safe-area-inset-bottom))",
            }}
          >
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              const badge = (tabBadges as Partial<Record<string, number>>)[t.id] || 0;
              return (
                <button
                  key={t.id}
                  onClick={() => handleSelectTab(t.id)}
                  aria-current={active ? "page" : undefined}
                  aria-label={
                    badge > 0 ? `${t.label} (${badge} waiting)` : t.label
                  }
                  style={{
                    flex: 1,
                    minWidth: 0,
                    background: "none",
                    border: "none",
                    padding: "8px 2px 5px",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 2,
                    color: active ? "var(--accent)" : "var(--text-faint)",
                  }}
                >
                  <span
                    style={{
                      position: "relative",
                      width: 44,
                      height: 30,
                      borderRadius: 15,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: active ? "var(--accent-soft)" : "transparent",
                      transition: "background 0.2s",
                    }}
                  >
                    <Icon size={20} strokeWidth={active ? 2.4 : 2} />
                    {badge > 0 && (
                      <span
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          top: -1,
                          right: 1,
                          minWidth: 16,
                          height: 16,
                          padding: "0 4px",
                          borderRadius: 999,
                          background: "var(--accent)",
                          color: "#fff",
                          fontSize: 10,
                          fontWeight: 800,
                          lineHeight: "16px",
                          textAlign: "center",
                          boxShadow: "0 0 0 2px var(--bg-nav)",
                        }}
                      >
                        {badge > 9 ? "9+" : badge}
                      </span>
                    )}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: active ? 700 : 500,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: "100%",
                    }}
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

        {resolvedHistoryModal && (
          <EventDetailModal
            key={resolvedHistoryModal.id}
            event={resolvedHistoryModal}
            tasks={expandedTasks}
            currentUser={currentUser}
            onToggleTask={toggleTask}
            onOpenTask={setEditingTask}
            onDelete={deleteEvent}
            onClose={() => setHistoryModal(null)}
          />
        )}

        {resolvedEditingTask && (
          <TaskEditModal
            key={resolvedEditingTask.id}
            task={resolvedEditingTask}
            existingEvents={events}
            canDelete={resolvedEditingTask.createdBy === currentUser}
            onClose={() => setEditingTask(null)}
            onToggle={toggleTask}
            onSave={updateTask}
            onDelete={deleteTask}
            onOpenLinkedEvent={(task) => {
              const master = events.find((e) => e.id === task.linkedEventId);
              if (master) setHistoryModal(master);
            }}
          />
        )}

        {searchOpen && (
          <SearchOverlay
            onClose={() => setSearchOpen(false)}
            events={events}
            expandedEvents={sortedUpcomingEvents}
            tasks={tasks}
            expandedTasks={expandedTasks}
            posts={posts}
            meds={meds}
            doseLog={doseLog}
            profiles={profiles}
            onOpenPerson={(member) => {
              setSearchOpen(false);
              if (member.isChild) {
                setSelectedManagerKidId(member.id);
                setHighlightedMedId(null);
                setTab("manager");
              } else {
                setSettingsScreen(
                  member.id === currentUser ? "account" : "family"
                );
              }
            }}
            onOpenMed={(med) => {
              setSearchOpen(false);
              setSelectedManagerKidId(med.kidId);
              setHighlightedMedId(med.id);
              setTab("manager");
            }}
            onOpenEvent={(e) => {
              setSearchOpen(false);
              setHistoryModal(e);
            }}
            onOpenTask={(t) => {
              setSearchOpen(false);
              setEditingTask(t);
            }}
            onOpenPost={(p) => {
              setSearchOpen(false);
              setTab("wall");
              setHighlightedPostId(p.id);
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
            onDeleteAccount={handleDeleteAccount}
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
  color: "var(--text-primary)",
  textAlign: "left",
};
