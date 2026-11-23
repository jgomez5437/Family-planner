import { formatRelativeTime } from "@/lib/dates";
import type {
  FamilyNotification,
  MemberId,
  NotificationCategory,
} from "@/types/family";

export interface NotificationCategoryMeta {
  id: NotificationCategory;
  label: string;
  description: string;
  emoji: string;
  defaultEnabled: boolean;
  /** Whether a server producer currently emits this category */
  active: boolean;
}

/**
 * Central registry for notification categories.
 * To add a new notification type:
 *  1. Enable or register its metadata entry here.
 *  2. Call `dispatchFamilyNotification(...)` from the relevant mutation in `src/db/repository.ts`.
 */
export const NOTIFICATION_CATEGORIES: NotificationCategoryMeta[] = [
  {
    id: "wall_post",
    label: "Family Wall Posts",
    description: "Updates, announcements, reminders, and photos shared on the wall",
    emoji: "💬",
    defaultEnabled: true,
    active: true,
  },
  {
    id: "wall_comment",
    label: "Wall Comments",
    description: "Replies and comments on Family Wall posts",
    emoji: "💭",
    defaultEnabled: true,
    active: false,
  },
  {
    id: "event",
    label: "Events & Schedule Changes",
    description: "New family events or time/location changes",
    emoji: "📅",
    defaultEnabled: true,
    active: false,
  },
  {
    id: "task",
    label: "Tasks & Chores",
    description: "Tasks assigned to you or completed by family members",
    emoji: "✅",
    defaultEnabled: true,
    active: false,
  },
  {
    id: "medication",
    label: "Medications & Care",
    description: "Medication updates and dose reminders",
    emoji: "💊",
    defaultEnabled: true,
    active: false,
  },
];

export const ACTIVE_NOTIFICATION_CATEGORIES = NOTIFICATION_CATEGORIES.filter(
  (c) => c.active
);

export const CATEGORY_META_BY_ID: Record<
  NotificationCategory,
  NotificationCategoryMeta
> = NOTIFICATION_CATEGORIES.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<NotificationCategory, NotificationCategoryMeta>
);

export interface NotificationPreferences {
  browserEnabled: boolean;
  categories: Record<NotificationCategory, boolean>;
}

export function getDefaultNotificationPreferences(): NotificationPreferences {
  const categories = {} as Record<NotificationCategory, boolean>;
  for (const cat of NOTIFICATION_CATEGORIES) {
    categories[cat.id] = cat.defaultEnabled;
  }
  return {
    browserEnabled: false,
    categories,
  };
}

function prefsStorageKey(memberId: MemberId): string {
  return `family-planner:notif-prefs:v1:${memberId}`;
}

export function loadNotificationPreferences(
  memberId: MemberId
): NotificationPreferences {
  const defaults = getDefaultNotificationPreferences();
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(prefsStorageKey(memberId));
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
    return {
      browserEnabled: Boolean(parsed.browserEnabled),
      categories: {
        ...defaults.categories,
        ...(parsed.categories || {}),
      },
    };
  } catch {
    return defaults;
  }
}

export function saveNotificationPreferences(
  memberId: MemberId,
  prefs: NotificationPreferences
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      prefsStorageKey(memberId),
      JSON.stringify(prefs)
    );
  } catch {
    /* ignore storage quota / privacy mode errors */
  }
}

export function isCategoryEnabled(
  prefs: NotificationPreferences,
  category: NotificationCategory
): boolean {
  return prefs.categories[category] !== false;
}

export function formatNotificationTime(isoString: string): string {
  return formatRelativeTime(isoString) || "Just Now";
}

export function isBrowserNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getBrowserNotificationPermission():
  | NotificationPermission
  | "unsupported" {
  if (!isBrowserNotificationSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (!isBrowserNotificationSupported()) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export async function showBrowserNotification(
  notification: FamilyNotification
): Promise<void> {
  if (!isBrowserNotificationSupported()) return;
  if (Notification.permission !== "granted") return;

  const url = `/?tab=${encodeURIComponent(notification.target.tab)}${
    notification.target.entityId
      ? `&entity=${encodeURIComponent(notification.target.entityId)}`
      : ""
  }`;

  const options: NotificationOptions = {
    body: notification.body || undefined,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: notification.id,
    data: {
      url,
      notificationId: notification.id,
      tab: notification.target.tab,
      entityId: notification.target.entityId ?? null,
    },
  };

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && typeof reg.showNotification === "function") {
        await reg.showNotification(notification.title, options);
        return;
      }
    }
    const n = new Notification(notification.title, options);
    n.onclick = () => {
      window.focus();
      window.dispatchEvent(
        new CustomEvent("fp:notification-click", {
          detail: {
            notificationId: notification.id,
            tab: notification.target.tab,
            entityId: notification.target.entityId ?? null,
          },
        })
      );
      n.close();
    };
  } catch {
    /* ignore notification errors when blocked or unsupported in context */
  }
}
