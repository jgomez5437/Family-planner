"use client";

import React from "react";
import {
  Calendar,
  CheckCircle2,
  CheckSquare,
  Circle,
  Heart,
  History,
  MapPin,
  MessageSquare,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";
import { CARD_SHADOW, CATEGORY_META } from "@/lib/constants";
import { useMembers } from "@/components/MembersContext";
import {
  countdownLabel,
  fmtTime,
  formatRelativeTime,
  nowHHMM,
  relativeDay,
} from "@/lib/dates";
import { useHydrated } from "@/lib/useRelativeTime";
import { recurrenceLabel } from "@/lib/recurrence";
import type {
  ActivityItem,
  FamilyEvent,
  FamilyTask,
  Member,
  MemberId,
  ScheduledDose,
  WallPost,
} from "@/types/family";
import {
  AvatarDot,
  AvatarStack,
  CategoryBadge,
  EmptyRow,
  EmptyState,
  LocalClock,
  SectionLabel,
} from "@/components/ui/Primitives";
import type { ComposerKind } from "@/components/layout/QuickAddSheet";
import { PostCard } from "./WallTab";

export function StatChip({
  icon: Icon,
  label,
  tone,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  tone?: string;
  onClick?: () => void;
}) {
  const alert = tone === "alert";
  const style: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: alert ? "#E8622C" : "rgba(255,255,255,0.8)",
    color: alert ? "#fff" : "#2B2622",
    border: alert ? "none" : "1px solid rgba(232,98,44,0.18)",
    borderRadius: 999,
    padding: "7px 12px",
    fontSize: 12.5,
    fontWeight: 700,
    minHeight: 34,
    cursor: onClick ? "pointer" : "default",
  };
  const body = (
    <>
      <Icon size={14} strokeWidth={2.4} /> {label}
    </>
  );
  return onClick ? (
    <button onClick={onClick} style={style}>
      {body}
    </button>
  ) : (
    <span style={style}>{body}</span>
  );
}

function memberStatus(
  m: Member,
  events: FamilyEvent[],
  tasks: FamilyTask[],
  doses: ScheduledDose[]
): { text: string; sub: string } {
  const nowT = nowHHMM();
  const items: { t: string; text: string }[] = [];
  events.forEach((e) => {
    if (
      e.participants?.includes(m.id) &&
      !e.allDay &&
      e.startTime &&
      e.startTime >= nowT
    ) {
      items.push({ t: e.startTime, text: e.title });
    }
  });
  doses.forEach((d) => {
    if (d.med.kidId === m.id) {
      items.push({ t: d.time, text: `${d.med.name} dose` });
    }
  });
  items.sort((a, b) => a.t.localeCompare(b.t));
  if (items[0]) return { text: items[0].text, sub: fmtTime(items[0].t) };
  const open = tasks.filter((t) => t.assignedTo === m.id && !t.completed).length;
  if (open) return { text: `${open} task${open > 1 ? "s" : ""} to do`, sub: "Today" };
  const allDay = events.find((e) => e.participants?.includes(m.id) && e.allDay);
  if (allDay) return { text: allDay.title, sub: "All day" };
  return { text: "Free", sub: "Nothing planned" };
}

export function FamilyStatusCard({
  member,
  you,
  status,
}: {
  member: Member;
  you: boolean;
  status: { text: string; sub: string };
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #F1E8D9",
        boxShadow: CARD_SHADOW,
        borderRadius: 18,
        padding: "12px 14px",
        minWidth: 150,
        flexShrink: 0,
        scrollSnapAlign: "start",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <AvatarDot id={member.id} size={38} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{you ? "You" : member.name}</div>
        <div
          style={{
            fontSize: 12,
            color: "#2B2622",
            fontWeight: 600,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 124,
          }}
        >
          {status.text}
        </div>
        <div style={{ fontSize: 11, color: "#A69C8E" }}>{status.sub}</div>
      </div>
    </div>
  );
}

const linkBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#E8622C",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  padding: 2,
};

type TimelineItem =
  | {
      kind: "event";
      time: string | null;
      endTime: string | null;
      data: FamilyEvent;
      status: string;
    }
  | {
      kind: "task";
      time: string | null;
      endTime?: undefined;
      data: FamilyTask;
      status: string;
    };

export function HomeTab({
  currentUser,
  todaysEvents,
  todaysTasks,
  upcoming,
  posts,
  activity,
  toggleTask,
  toggleReaction,
  onDeletePost,
  openHistory,
  onOpenTask,
  goTab,
  openComposer,
  isDesktop,
  pendingDoses = [],
}: {
  currentUser: MemberId;
  todaysEvents: FamilyEvent[];
  todaysTasks: FamilyTask[];
  upcoming: FamilyEvent[];
  posts: WallPost[];
  activity: ActivityItem[];
  toggleTask: (id: string) => void;
  toggleReaction: (postId: string, emoji: string) => void;
  onDeletePost?: (postId: string) => void;
  openHistory: (e: FamilyEvent) => void;
  onOpenTask?: (t: FamilyTask) => void;
  goTab: (tab: string) => void;
  openComposer: (
    type: ComposerKind,
    date?: string,
    participants?: MemberId[],
    postType?: string
  ) => void;
  isDesktop: boolean;
  pendingDoses?: ScheduledDose[];
}) {
  const { members, memberById } = useMembers();
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const dateStr = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  const tasksLeft = todaysTasks.filter((t) => !t.completed).length;
  const heroChips: {
    icon: LucideIcon;
    label: string;
    tone?: string;
    onClick?: () => void;
  }[] = [];
  if (todaysEvents.length)
    heroChips.push({
      icon: Calendar,
      label: `${todaysEvents.length} event${todaysEvents.length > 1 ? "s" : ""}`,
    });
  if (tasksLeft)
    heroChips.push({
      icon: CheckSquare,
      label: `${tasksLeft} task${tasksLeft > 1 ? "s" : ""} to do`,
    });
  if (pendingDoses.length)
    heroChips.push({
      icon: Stethoscope,
      label: `${pendingDoses.length} dose${pendingDoses.length > 1 ? "s" : ""} due`,
      tone: "alert",
      onClick: () => goTab("manager"),
    });
  if (!heroChips.length)
    heroChips.push({ icon: Heart, label: "Nothing planned. Enjoy the day." });

  function timeToMinutes(t: string | null | undefined): number | null {
    if (!t) return null;
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  }

  const rawTimeline = [
    ...todaysEvents.map((e) => ({
      kind: "event" as const,
      time: e.allDay ? null : e.startTime,
      endTime: e.endTime,
      data: e,
    })),
    ...todaysTasks.map((t) => ({
      kind: "task" as const,
      time: t.dueTime || null,
      data: t,
    })),
  ].sort((a, b) => {
    if (a.time && b.time) return a.time.localeCompare(b.time);
    if (a.time) return -1;
    if (b.time) return 1;
    return 0;
  });

  const timeline: TimelineItem[] = rawTimeline.map((item) => {
    if (!item.time) return { ...item, status: "untimed" };
    const startMin = timeToMinutes(item.time) ?? 0;
    const endMin =
      item.kind === "event" && item.endTime
        ? (timeToMinutes(item.endTime) ?? startMin + 30)
        : startMin + 30;
    let status = "upcoming";
    if (item.kind === "task" && item.data.completed) status = "done";
    else if (nowMin >= startMin && nowMin < endMin) status = "current";
    else if (nowMin >= endMin) status = "past";
    return { ...item, status };
  });

  const nowInsertIndex = timeline.findIndex(
    (item) =>
      item.time &&
      (timeToMinutes(item.time) ?? 0) > nowMin &&
      item.status !== "done"
  );
  const hasTimedItems = timeline.some((item) => item.time);

  const mainColumn = (
    <div>
      <SectionLabel
        text={`Today · ${new Date().toLocaleDateString(undefined, { month: "long", day: "numeric" }).toUpperCase()}`}
      />
      {timeline.length === 0 && (
        <EmptyRow text="Nothing on the books today. Enjoy the quiet." />
      )}
      {timeline.length > 0 && (
        <div
          style={{
            background: "#fff",
            border: "1px solid #F1E8D9",
            boxShadow: CARD_SHADOW,
            borderRadius: 14,
            padding: "6px 14px",
            marginBottom: 10,
          }}
        >
          {timeline.map((item, i) => (
            <React.Fragment key={item.data.id}>
              {hasTimedItems && i === nowInsertIndex && <NowDivider />}
              <TimelineRow
                item={item}
                isLast={i === timeline.length - 1}
                onToggleTask={
                  item.kind === "task"
                    ? () => toggleTask(item.data.id)
                    : undefined
                }
                onOpenEvent={
                  item.kind === "event"
                    ? () => openHistory(item.data)
                    : undefined
                }
                onOpenTask={
                  item.kind === "task" && onOpenTask
                    ? () => onOpenTask(item.data)
                    : undefined
                }
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
        <EventRow
          key={e.id}
          event={e}
          onHistory={() => openHistory(e)}
          showDay
        />
      ))}
    </div>
  );

  const sideRail = (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <SectionLabel text="Family Updates" style={{ marginBottom: 0 }} />
        <button onClick={() => goTab("wall")} style={linkBtnStyle}>
          See all
        </button>
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
          <PostCard
            key={p.id}
            post={p}
            currentUser={currentUser}
            onReact={(emo) => toggleReaction(p.id, emo)}
            onDelete={onDeletePost ? () => onDeletePost(p.id) : undefined}
            compact
          />
        ))
      )}

      <SectionLabel text="Recent Activity" style={{ marginTop: 18 }} />
      {activity.length === 0 ? (
        <EmptyRow text="No activity yet — the moment someone adds or changes something, it'll show up here." />
      ) : (
        <div
          style={{
            background: "#fff",
            border: "1px solid #F1E8D9",
            boxShadow: CARD_SHADOW,
            borderRadius: 14,
            padding: "4px 14px",
          }}
        >
          {activity.map((a, i) => (
            <button
              key={a.id}
              onClick={() => a.target && openHistory(a.target)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "10px 0",
                borderBottom:
                  i === activity.length - 1 ? "none" : "1px solid #F3ECE0",
                width: "100%",
                background: "none",
                border: "none",
                cursor: a.target ? "pointer" : "default",
                textAlign: "left",
                borderRadius: 0,
              }}
            >
              <AvatarDot id={a.by} size={22} />
              <div style={{ fontSize: 13, flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 500 }}>{a.text}</span>
                {a.sub && (
                  <span style={{ color: "#948C80" }}>
                    {" — "}
                    <LocalClock value={a.sub} />
                  </span>
                )}
              </div>
              <div
                suppressHydrationWarning
                style={{
                  marginLeft: "auto",
                  fontSize: 11,
                  color: "#B7AE9F",
                  flexShrink: 0,
                }}
              >
                {formatRelativeTime(a.at)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div
        style={{
          background:
            "linear-gradient(135deg, #FFE5CF 0%, #FFF1DF 55%, #FFF9F0 100%)",
          border: "1px solid #F6DFC8",
          boxShadow: CARD_SHADOW,
          borderRadius: 22,
          padding: "18px 18px 16px",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <AvatarDot id={currentUser} size={52} />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: "'Baloo 2', sans-serif",
                fontSize: 25,
                fontWeight: 700,
                lineHeight: 1.1,
              }}
            >
              {greeting}, {memberById(currentUser).name}
            </div>
            <div style={{ color: "#8A7F70", fontSize: 13.5, marginTop: 3 }}>
              {dateStr}
            </div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 14,
          }}
        >
          {heroChips.map((c) => (
            <StatChip key={c.label} {...c} />
          ))}
        </div>
      </div>

      <SectionLabel text="Who's up to what" />
      <div
        style={{
          display: "flex",
          gap: 10,
          overflowX: "auto",
          margin: "0 -16px 18px",
          padding: "2px 16px 8px",
          scrollSnapType: "x proximity",
          scrollPaddingLeft: 16,
        }}
      >
        {members.map((m) => (
          <FamilyStatusCard
            key={m.id}
            member={m}
            you={m.id === currentUser}
            status={memberStatus(m, todaysEvents, todaysTasks, pendingDoses)}
          />
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 8,
          marginBottom: 22,
          maxWidth: isDesktop ? 420 : "none",
        }}
      >
        {(
          [
            { label: "Event", icon: Calendar, type: "event" },
            { label: "Task", icon: CheckSquare, type: "task" },
            { label: "Appt.", icon: Stethoscope, type: "appointment" },
            { label: "Update", icon: MessageSquare, type: "post" },
          ] as const
        ).map((a) => (
          <button
            key={a.label}
            onClick={() => openComposer(a.type)}
            style={{
              background: "#fff",
              border: "1px solid #F1E8D9",
              boxShadow: CARD_SHADOW,
              borderRadius: 14,
              padding: "12px 4px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 5,
              cursor: "pointer",
            }}
          >
            <a.icon size={18} color="#E8622C" />
            <span style={{ fontSize: 11, fontWeight: 600 }}>{a.label}</span>
          </button>
        ))}
      </div>

      {isDesktop ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr",
            gap: 32,
            alignItems: "start",
          }}
        >
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
  const hydrated = useHydrated();
  const label = hydrated
    ? new Date().toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })
    : "";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 0",
      }}
    >
      <div
        style={{ flex: 1, height: 1.5, background: "#E8622C", opacity: 0.35 }}
      />
      <span
        suppressHydrationWarning
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: "#E8622C",
          letterSpacing: 0.6,
        }}
      >
        {label ? `NOW · ${label}` : "NOW"}
      </span>
      <div
        style={{ flex: 1, height: 1.5, background: "#E8622C", opacity: 0.35 }}
      />
    </div>
  );
}

function TimelineRow({
  item,
  isLast,
  onToggleTask,
  onOpenEvent,
  onOpenTask,
  currentUser,
}: {
  item: TimelineItem;
  isLast: boolean;
  onToggleTask?: () => void;
  onOpenEvent?: () => void;
  onOpenTask?: () => void;
  currentUser: MemberId;
}) {
  const { memberById } = useMembers();
  const { kind, data, time, status } = item;
  const meta =
    kind === "event"
      ? CATEGORY_META[data.category] || CATEGORY_META.Other
      : null;
  const Icon = kind === "event" && meta ? meta.icon : CheckSquare;
  const label = time
    ? fmtTime(time)
    : kind === "event"
      ? "All day"
      : "Any time";
  const isDone = kind === "task" && data.completed;
  const isPast = status === "past" && !isDone;
  const isCurrent = status === "current";
  const isMine = kind === "task" && data.assignedTo === currentUser;

  const rowOpacity = isPast ? 0.55 : isDone ? 0.6 : 1;
  const handleRowOpen = kind === "event" ? onOpenEvent : onOpenTask;

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: isCurrent ? "10px 10px" : "10px 0",
        margin: isCurrent ? "2px -10px" : 0,
        borderRadius: isCurrent ? 12 : 0,
        background: isCurrent ? "#FCE9DF" : "transparent",
        borderBottom:
          isLast && !isCurrent
            ? "none"
            : isCurrent
              ? "none"
              : "1px solid #F3ECE0",
        opacity: rowOpacity,
        transition: "opacity 0.2s",
      }}
    >
      <div
        style={{
          width: 62,
          flexShrink: 0,
          fontSize: 11.5,
          fontWeight: isCurrent ? 800 : 600,
          color: isCurrent ? "#B24A1D" : "#948C80",
          paddingTop: 2,
        }}
      >
        {label}
      </div>
      {kind === "task" ? (
        <button
          onClick={onToggleTask}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            color: data.completed
              ? "#1F6F5C"
              : isMine
                ? "#E8622C"
                : "#C9BEAC",
            flexShrink: 0,
          }}
          aria-label={
            data.completed ? "Mark task incomplete" : "Mark task complete"
          }
        >
          {data.completed ? (
            <CheckCircle2 size={18} />
          ) : (
            <Circle size={18} />
          )}
        </button>
      ) : (
        <div style={{ color: meta?.color || "#6B6259", flexShrink: 0 }}>
          <Icon size={17} />
        </div>
      )}
      <button
        type="button"
        onClick={handleRowOpen}
        disabled={!handleRowOpen}
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: "left",
          background: "none",
          border: "none",
          padding: 0,
          cursor: handleRowOpen ? "pointer" : "default",
        }}
      >
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            textDecoration: isDone ? "line-through" : "none",
            color: isDone ? "#A69C8E" : "#2B2622",
          }}
        >
          {data.title}
          {kind === "event" && data.recurrence && (
            <span style={{ fontSize: 10, color: "#A69C8E", fontWeight: 500 }}>
              {" "}
              · 🔁
            </span>
          )}
        </div>
        {kind === "task" && data.assignedTo && (
          <div
            style={{
              fontSize: 11.5,
              color: isMine && !isDone ? "#E8622C" : "#A69C8E",
              marginTop: 1,
              fontWeight: isMine && !isDone ? 700 : 400,
            }}
          >
            {isMine ? "You" : memberById(data.assignedTo).name}
          </div>
        )}
        {kind === "event" &&
          (data.location || (data.participants && data.participants.length > 0)) && (
            <div style={{ fontSize: 11.5, color: "#A69C8E", marginTop: 1 }}>
              {data.location}
              {data.location &&
                data.participants &&
                data.participants.length > 0 &&
                " · "}
              {data.participants &&
                data.participants.length > 0 &&
                data.participants
                  .map((id) =>
                    id === currentUser ? "You" : memberById(id).name
                  )
                  .join(" + ")}
            </div>
          )}
      </button>
      {kind === "task" && !data.assignedTo && (
        <span
          style={{
            fontSize: 10.5,
            color: "#C9BEAC",
            flexShrink: 0,
            alignSelf: "center",
          }}
        >
          Unassigned
        </span>
      )}
    </div>
  );
}

export function EventRow({
  event,
  onHistory,
  showDay,
}: {
  event: FamilyEvent;
  onHistory: () => void;
  showDay?: boolean;
}) {
  const meta = CATEGORY_META[event.category] || CATEGORY_META.Other;
  const cd = countdownLabel(event.date);
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #F1E8D9",
        boxShadow: CARD_SHADOW,
        borderRadius: 14,
        padding: "12px 14px",
        marginBottom: 9,
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      <div
        style={{
          width: 4,
          alignSelf: "stretch",
          borderRadius: 4,
          background: meta.color,
          minHeight: 36,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 14.5 }}>{event.title}</span>
          {event.recurrence && (
            <span style={{ fontSize: 10, color: "#A69C8E" }}>
              🔁 {recurrenceLabel(event.recurrence, event.date)}
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: "#6B6259",
            marginTop: 3,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {showDay && (
            <span style={{ fontWeight: 600, color: "#E8622C" }}>
              {relativeDay(event.date)}
            </span>
          )}
          <span>
            {event.allDay
              ? "All day"
              : event.endTime
                ? `${fmtTime(event.startTime)} – ${fmtTime(event.endTime)}`
                : fmtTime(event.startTime)}
          </span>
          {event.location && (
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <MapPin size={11} /> {event.location}
            </span>
          )}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 7,
          }}
        >
          <CategoryBadge category={event.category} />
          <AvatarStack ids={event.participants} />
          {cd && (
            <span
              style={{ fontSize: 11, color: "#948C80", marginLeft: "auto" }}
            >
              {cd}
            </span>
          )}
        </div>
      </div>
      {event.history?.length > 0 && (
        <button
          onClick={onHistory}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#C9BEAC",
            padding: 2,
          }}
          title="View history"
        >
          <History size={15} />
        </button>
      )}
    </div>
  );
}
