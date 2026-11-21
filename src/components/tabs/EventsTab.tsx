"use client";

import React, { useState } from "react";
import { CheckCircle2, Circle, History, MapPin } from "lucide-react";
import {
  btnStyle,
  CARD_SHADOW,
  CATEGORY_META,
  inputStyle,
  memberById,
} from "@/lib/constants";
import {
  countdownLabel,
  fmtTime,
  parseLocalDate,
  relativeDay,
  todayISO,
} from "@/lib/dates";
import { humanizeHistoryNote, recurrenceLabel } from "@/lib/recurrence";
import type {
  EventHistoryEntry,
  FamilyEvent,
  FamilyTask,
} from "@/types/family";
import {
  AvatarDot,
  AvatarStack,
  CategoryBadge,
  EmptyState,
  FieldLabel,
  ModalShell,
  SectionLabel,
} from "@/components/ui/Primitives";
import type { ComposerKind } from "@/components/layout/QuickAddSheet";

export function EventsTab({
  events,
  openHistory,
  openComposer,
  onUpdateTime,
  onDelete,
}: {
  events: FamilyEvent[];
  openHistory: (e: FamilyEvent) => void;
  openComposer?: (type: ComposerKind) => void;
  onUpdateTime: (
    id: string,
    field: string,
    value: string,
    reason: string,
    scope: "instance" | "series"
  ) => void;
  onDelete: (id: string, scope: "instance" | "series") => void;
}) {
  const [editing, setEditing] = useState<FamilyEvent | null>(null);
  const groups: Record<string, FamilyEvent[]> = {
    Today: [],
    Tomorrow: [],
    "This Week": [],
    "Next Week": [],
    Later: [],
  };
  const today = parseLocalDate(todayISO(0));
  events.forEach((e) => {
    const diff = Math.round(
      (parseLocalDate(e.date).getTime() - today.getTime()) / 86400000
    );
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
      <div
        style={{
          fontFamily: "'Baloo 2', sans-serif",
          fontSize: 22,
          fontWeight: 700,
          marginBottom: 4,
        }}
      >
        Upcoming
      </div>
      <div style={{ fontSize: 13, color: "#948C80", marginBottom: 16 }}>
        Appointments and important dates, at a glance.
      </div>
      {Object.entries(groups).map(([label, list]) =>
        list.length === 0 ? null : (
          <div key={label} style={{ marginBottom: 18 }}>
            <SectionLabel text={label} />
            {list.map((e) => (
              <AppointmentCard
                key={e.id}
                event={e}
                onEdit={() => setEditing(e)}
                onHistory={() => openHistory(e)}
              />
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
          onSave={(field, value, reason, scope) => {
            onUpdateTime(editing.id, field, value, reason, scope);
            setEditing(null);
          }}
          onDelete={(scope) => {
            onDelete(editing.id, scope);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

export function AppointmentCard({
  event,
  onEdit,
  onHistory,
}: {
  event: FamilyEvent;
  onEdit: () => void;
  onHistory: () => void;
}) {
  const meta = CATEGORY_META[event.category] || CATEGORY_META.Other;
  const cd = countdownLabel(event.date);
  return (
    <button
      onClick={onEdit}
      style={{
        background: "#fff",
        border: "1px solid #F1E8D9",
        boxShadow: CARD_SHADOW,
        borderRadius: 16,
        padding: 16,
        marginBottom: 10,
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        display: "block",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 15.5 }}>{event.title}</div>
          <div style={{ fontSize: 12.5, color: "#6B6259", marginTop: 4 }}>
            {relativeDay(event.date)}
            {!event.allDay && ` · ${fmtTime(event.startTime)}`}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
          }}
        >
          {cd && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: meta.color,
                background: `${meta.color}15`,
                borderRadius: 999,
                padding: "4px 10px",
              }}
            >
              {cd}
            </span>
          )}
          {event.history?.length > 0 && (
            <span
              role="button"
              onClick={(ev) => {
                ev.stopPropagation();
                onHistory();
              }}
              style={{ color: "#C9BEAC", padding: 2, display: "flex" }}
              title="View history"
            >
              <History size={15} />
            </span>
          )}
        </div>
      </div>
      {event.location && (
        <div
          style={{
            fontSize: 12.5,
            color: "#6B6259",
            marginTop: 8,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <MapPin size={12} /> {event.location}
        </div>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 10,
        }}
      >
        <CategoryBadge category={event.category} />
        <AvatarStack ids={event.participants} />
        <span style={{ fontSize: 11, color: "#A69C8E", marginLeft: "auto" }}>
          Added by {memberById(event.createdBy).name}
        </span>
      </div>
    </button>
  );
}

export function EventEditModal({
  event,
  onClose,
  onSave,
  onDelete,
}: {
  event: FamilyEvent;
  onClose: () => void;
  onSave: (
    field: string,
    value: string,
    reason: string,
    scope: "instance" | "series"
  ) => void;
  onDelete: (scope: "instance" | "series") => void;
}) {
  const [time, setTime] = useState(event.startTime || "");
  const [location, setLocation] = useState(event.location || "");
  const [reason, setReason] = useState("");
  const [pendingAction, setPendingAction] = useState<"save" | "delete" | null>(
    null
  );

  const timeChanged = time !== (event.startTime || "");
  const locationChanged = location !== (event.location || "");
  const isRecurring = !!event.recurrence;

  function requestSave() {
    if (!timeChanged && !locationChanged) {
      onClose();
      return;
    }
    if (isRecurring) setPendingAction("save");
    else commitSave("series");
  }

  function commitSave(scope: "instance" | "series") {
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
      <ModalShell
        onClose={() => setPendingAction(null)}
        title={pendingAction === "delete" ? "Delete Event" : "Edit Event"}
      >
        <div
          style={{
            fontSize: 13,
            color: "#6B6259",
            marginBottom: 16,
            lineHeight: 1.5,
          }}
        >
          &quot;{event.title}&quot; repeats{" "}
          {recurrenceLabel(event.recurrence, event.date)?.toLowerCase()}.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            onClick={() =>
              pendingAction === "delete"
                ? onDelete("instance")
                : commitSave("instance")
            }
            style={{
              ...btnStyle,
              background: "#fff",
              border: "1.5px solid #EFE4D2",
              color: "#2B2622",
              textAlign: "left",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>
              This occurrence only
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: "#948C80",
                fontWeight: 400,
                marginTop: 1,
              }}
            >
              {pendingAction === "delete"
                ? "Removes just this date; the series continues."
                : "Only changes this date."}
            </div>
          </button>
          <button
            onClick={() =>
              pendingAction === "delete"
                ? onDelete("series")
                : commitSave("series")
            }
            style={{
              ...btnStyle,
              background: "#fff",
              border: `1.5px solid ${
                pendingAction === "delete" ? "#F3D9D2" : "#EFE4D2"
              }`,
              color: pendingAction === "delete" ? "#C4402A" : "#2B2622",
              textAlign: "left",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>Entire series</div>
            <div
              style={{
                fontSize: 11.5,
                color: "#948C80",
                fontWeight: 400,
                marginTop: 1,
              }}
            >
              {pendingAction === "delete"
                ? "Removes every occurrence, past and future."
                : "Applies to every occurrence."}
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <CategoryBadge category={event.category} />
        {event.participants?.length > 0 && (
          <AvatarStack ids={event.participants} />
        )}
        {isRecurring && (
          <span style={{ fontSize: 11, color: "#A69C8E" }}>
            🔁 {recurrenceLabel(event.recurrence, event.date)}
          </span>
        )}
      </div>
      <FieldLabel>Start time</FieldLabel>
      <input
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        style={inputStyle}
      />
      <FieldLabel style={{ marginTop: 12 }}>Location</FieldLabel>
      <input
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        style={inputStyle}
        placeholder="Add a location"
      />
      {(timeChanged || locationChanged) && (
        <>
          <FieldLabel style={{ marginTop: 12 }}>
            Why the change?{" "}
            <span style={{ fontWeight: 400, color: "#A69C8E" }}>(optional)</span>
          </FieldLabel>
          <input
            placeholder="e.g. Coach moved practice back an hour"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={inputStyle}
          />
        </>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
        <button
          onClick={requestDelete}
          style={{
            ...btnStyle,
            background: "#fff",
            color: "#C4402A",
            border: "1.5px solid #F3D9D2",
          }}
        >
          Delete
        </button>
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

export function EventDetailModal({
  event,
  tasks,
  onClose,
  onToggleTask,
}: {
  event: FamilyEvent;
  tasks: FamilyTask[];
  onClose: () => void;
  onToggleTask?: (id: string) => void;
}) {
  const relatedTasks = (tasks || []).filter(
    (t) => t.linkedEventId === event.masterId || t.linkedEventId === event.id
  );

  return (
    <ModalShell onClose={onClose} title={event.title}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <CategoryBadge category={event.category} />
        {event.recurrence && (
          <span
            style={{
              fontSize: 11,
              color: "#A69C8E",
              display: "flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            🔁 {recurrenceLabel(event.recurrence, event.date)}
          </span>
        )}
      </div>

      <div style={{ fontSize: 13, color: "#6B6259", marginBottom: 4 }}>
        {relativeDay(event.occurrenceDate || event.date)}
        {!event.allDay &&
          event.startTime &&
          ` · ${
            event.endTime
              ? `${fmtTime(event.startTime)} – ${fmtTime(event.endTime)}`
              : fmtTime(event.startTime)
          }`}
      </div>
      {event.location && (
        <div
          style={{
            fontSize: 13,
            color: "#6B6259",
            marginBottom: 4,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <MapPin size={12} /> {event.location}
        </div>
      )}
      {event.participants?.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 8,
          }}
        >
          <AvatarStack ids={event.participants} />
          <span style={{ fontSize: 12, color: "#948C80" }}>
            {event.participants.map((id) => memberById(id).name).join(" + ")}
          </span>
        </div>
      )}
      {(event.notes || event.description) && (
        <div
          style={{
            fontSize: 12.5,
            color: "#6B6259",
            marginTop: 10,
            lineHeight: 1.5,
          }}
        >
          {event.notes || event.description}
        </div>
      )}

      {relatedTasks.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <FieldLabel>Related Tasks</FieldLabel>
          <div
            style={{
              background: "#FFFDF9",
              border: "1px solid #EFE4D2",
              borderRadius: 12,
              padding: "2px 12px",
            }}
          >
            {relatedTasks.map((t, i) => (
              <div
                key={t.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 0",
                  borderBottom:
                    i === relatedTasks.length - 1
                      ? "none"
                      : "1px solid #F3ECE0",
                }}
              >
                <button
                  onClick={() => onToggleTask?.(t.id)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    color: t.completed ? "#1F6F5C" : "#C9BEAC",
                  }}
                  aria-label={t.completed ? "Mark incomplete" : "Mark complete"}
                >
                  {t.completed ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <Circle size={16} />
                  )}
                </button>
                <span
                  style={{
                    fontSize: 13,
                    textDecoration: t.completed ? "line-through" : "none",
                    color: t.completed ? "#A69C8E" : "#2B2622",
                    flex: 1,
                  }}
                >
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
        <HistoryTimeline history={event.history || []} />
      </div>
    </ModalShell>
  );
}

export function HistoryTimeline({
  history,
}: {
  history: EventHistoryEntry[];
}) {
  return (
    <div>
      {history.map((h, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: 10,
            paddingBottom: 16,
            position: "relative",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <AvatarDot id={h.by} size={26} />
            {i < history.length - 1 && (
              <div
                style={{
                  width: 2,
                  flex: 1,
                  background: "#EFE4D2",
                  marginTop: 4,
                }}
              />
            )}
          </div>
          <div style={{ flex: 1, paddingBottom: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {humanizeHistoryNote(h.note)}{" "}
              <span style={{ fontWeight: 400, color: "#A69C8E" }}>
                · {memberById(h.by).name} · {h.at}
              </span>
            </div>
            {h.reason && (
              <div
                style={{
                  fontSize: 12.5,
                  background: "#FDF6EA",
                  border: "1px solid #F1E4C4",
                  borderRadius: 10,
                  padding: "8px 10px",
                  marginTop: 6,
                  color: "#6B5B2F",
                  fontStyle: "italic",
                }}
              >
                &quot;{h.reason}&quot;
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
