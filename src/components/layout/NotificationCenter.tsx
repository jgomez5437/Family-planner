"use client";

import React, { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, SlidersHorizontal, Trash2 } from "lucide-react";
import {
  CATEGORY_META_BY_ID,
  formatNotificationTime,
  isCategoryEnabled,
  type NotificationPreferences,
} from "@/lib/notifications";
import type { FamilyNotification } from "@/types/family";
import { AvatarDot } from "@/components/ui/Primitives";

export function NotificationBell({
  notifications,
  preferences,
  isDesktop,
  onSelectNotification,
  onMarkAllRead,
  onClearAll,
  onOpenNotificationSettings,
}: {
  notifications: FamilyNotification[];
  preferences: NotificationPreferences;
  isDesktop: boolean;
  onSelectNotification: (notification: FamilyNotification) => void;
  onMarkAllRead: () => void;
  onClearAll: () => void;
  onOpenNotificationSettings: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [, setTimeTick] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const visibleNotifications = notifications.filter((n) =>
    isCategoryEnabled(preferences, n.category)
  );
  const unreadCount = visibleNotifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (!open) return;
    const ticker = window.setInterval(() => setTimeTick((t) => t + 1), 30000);
    function handleOutsideClick(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearInterval(ticker);
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title="Notifications"
        aria-label={
          unreadCount > 0
            ? `Notifications (${unreadCount} unread)`
            : "Notifications"
        }
        aria-expanded={open}
        style={{
          position: "relative",
          background: open ? "#FCE9DF" : "none",
          border: "none",
          cursor: "pointer",
          width: 34,
          height: 34,
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: open ? "#B24A1D" : "#6B6259",
          flexShrink: 0,
        }}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 3,
              right: 3,
              minWidth: 16,
              height: 16,
              padding: "0 4px",
              borderRadius: 999,
              background: "#E8622C",
              color: "#fff",
              fontSize: 10,
              fontWeight: 800,
              lineHeight: "16px",
              textAlign: "center",
              boxShadow: "0 0 0 2px #FFF9F0",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          style={{
            position: isDesktop ? "absolute" : "fixed",
            right: isDesktop ? 0 : 12,
            left: isDesktop ? "auto" : 12,
            top: isDesktop
              ? "calc(100% + 8px)"
              : "calc(64px + env(safe-area-inset-top))",
            width: isDesktop ? 360 : "auto",
            maxWidth: isDesktop ? "92vw" : 420,
            marginLeft: isDesktop ? 0 : "auto",
            background: "#fff",
            border: "1px solid #F1E8D9",
            borderRadius: 18,
            boxShadow: "0 14px 36px rgba(43,38,34,0.16)",
            zIndex: 80,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            maxHeight: "min(72vh, 480px)",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "12px 14px",
              borderBottom: "1px solid #F3ECE0",
              background: "#FFFDF9",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span
                style={{
                  fontFamily: "'Baloo 2', sans-serif",
                  fontSize: 16,
                  fontWeight: 700,
                  color: "#2B2622",
                }}
              >
                Notifications
              </span>
              {unreadCount > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#B24A1D",
                    background: "#FCE9DF",
                    borderRadius: 999,
                    padding: "2px 8px",
                  }}
                >
                  {unreadCount} new
                </span>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  title="Mark all as read"
                  style={{
                    background: "none",
                    border: "none",
                    color: "#E8622C",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "5px 8px",
                    borderRadius: 8,
                  }}
                >
                  <CheckCheck size={14} /> Mark read
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpenNotificationSettings();
                }}
                title="Notification settings"
                aria-label="Notification settings"
                style={{
                  background: "none",
                  border: "none",
                  color: "#6B6259",
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <SlidersHorizontal size={15} />
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {visibleNotifications.length === 0 ? (
              <div
                style={{
                  padding: "32px 20px",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    background: "#FBF5EA",
                    color: "#B5AA9A",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 10,
                  }}
                >
                  <Bell size={20} />
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#2B2622",
                    marginBottom: 4,
                  }}
                >
                  You&apos;re all caught up
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "#948C80",
                    lineHeight: 1.4,
                  }}
                >
                  When family members post on the Family Wall, updates will
                  appear here.
                </div>
              </div>
            ) : (
              visibleNotifications.map((n, index) => {
                const catMeta = CATEGORY_META_BY_ID[n.category];
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onSelectNotification(n);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      width: "100%",
                      textAlign: "left",
                      padding: "12px 14px",
                      background: n.read ? "#fff" : "#FFF8F2",
                      border: "none",
                      borderBottom:
                        index === visibleNotifications.length - 1
                          ? "none"
                          : "1px solid #F3ECE0",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <AvatarDot id={n.actorId} size={36} />
                      {catMeta && (
                        <span
                          aria-hidden="true"
                          style={{
                            position: "absolute",
                            bottom: -2,
                            right: -3,
                            width: 17,
                            height: 17,
                            borderRadius: "50%",
                            background: "#fff",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.14)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 10,
                          }}
                        >
                          {catMeta.emoji}
                        </span>
                      )}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: n.read ? 600 : 700,
                          color: "#2B2622",
                          lineHeight: 1.35,
                        }}
                      >
                        {n.title}
                      </div>
                      {n.body && (
                        <div
                          style={{
                            fontSize: 12.5,
                            color: "#6B6259",
                            marginTop: 2,
                            lineHeight: 1.35,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {n.body}
                        </div>
                      )}
                      <div
                        suppressHydrationWarning
                        style={{
                          fontSize: 11,
                          color: "#A69C8E",
                          marginTop: 4,
                          fontWeight: 500,
                        }}
                      >
                        {formatNotificationTime(n.createdAt)}
                      </div>
                    </div>

                    {!n.read && (
                      <span
                        aria-label="Unread"
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: "#E8622C",
                          flexShrink: 0,
                          marginTop: 6,
                        }}
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          {visibleNotifications.length > 0 && (
            <div
              style={{
                borderTop: "1px solid #F3ECE0",
                padding: "8px 12px",
                display: "flex",
                justifyContent: "flex-end",
                background: "#FFFDF9",
              }}
            >
              <button
                type="button"
                onClick={onClearAll}
                style={{
                  background: "none",
                  border: "none",
                  color: "#8A7F70",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "4px 8px",
                  borderRadius: 8,
                }}
              >
                <Trash2 size={13} /> Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
