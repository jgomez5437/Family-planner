"use client";

import React, { useState } from "react";
import { CheckCircle2, Circle, Trash2 } from "lucide-react";
import {
  btnStyle,
  CARD_SHADOW,
  inputStyle,
  pillStyle,
  TASK_CATEGORIES,
} from "@/lib/constants";
import { useMembers } from "@/components/MembersContext";
import {
  fmtTime,
  formatRelativeTime,
  relativeDay,
  todayISO,
} from "@/lib/dates";
import { recurrenceLabel } from "@/lib/recurrence";
import type {
  FamilyEvent,
  FamilyTask,
  MemberId,
  TaskUpdateInput,
} from "@/types/family";
import {
  AvatarDot,
  EmptyState,
  FieldLabel,
  LocalClock,
  ModalShell,
  SectionLabel,
} from "@/components/ui/Primitives";
import type { ComposerKind } from "@/components/layout/QuickAddSheet";

export function TasksTab({
  tasks,
  toggleTask,
  currentUser,
  openComposer,
  onOpenLinkedEvent,
  onEditTask,
  onDeleteTask,
}: {
  tasks: FamilyTask[];
  toggleTask: (id: string) => void;
  currentUser: MemberId;
  openComposer?: (type: ComposerKind) => void;
  onOpenLinkedEvent?: (task: FamilyTask) => void;
  onEditTask?: (task: FamilyTask) => void;
  onDeleteTask?: (id: string, scope: "instance" | "series") => void;
}) {
  const [filter, setFilter] = useState("All");
  const [recurringDeleteTarget, setRecurringDeleteTarget] =
    useState<FamilyTask | null>(null);

  const filtered = tasks.filter((t) => {
    if (filter === "My Tasks") return t.assignedTo === currentUser;
    if (filter === "Family Tasks")
      return !!t.assignedTo && t.assignedTo !== currentUser;
    if (filter === "Unassigned") return !t.assignedTo;
    if (filter === "Today") return !t.completed && t.dueDate === todayISO(0);
    if (filter === "Upcoming") return !t.completed && t.dueDate > todayISO(0);
    if (filter === "Overdue")
      return !t.completed && t.dueDate && t.dueDate < todayISO(0);
    if (filter === "Completed") return t.completed;
    return true;
  });

  const grouped: Record<string, FamilyTask[]> = {};
  filtered.forEach((t) => {
    const key = t.completed ? "Completed" : t.dueDate || "No due date";
    grouped[key] = grouped[key] || [];
    grouped[key].push(t);
  });

  return (
    <div>
      <div
        style={{
          fontFamily: "'Baloo 2', sans-serif",
          fontSize: 22,
          fontWeight: 700,
          marginBottom: 14,
        }}
      >
        Tasks
      </div>
      <div
        style={{
          display: "flex",
          gap: 6,
          overflowX: "auto",
          marginBottom: 16,
          paddingBottom: 4,
        }}
      >
        {[
          "All",
          "My Tasks",
          "Family Tasks",
          "Today",
          "Upcoming",
          "Overdue",
          "Unassigned",
          "Completed",
        ].map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            style={{
              flexShrink: 0,
              border: `1.5px solid ${filter === c ? "var(--success)" : "var(--border-default)"}`,
              background: filter === c ? "var(--success-soft)" : "var(--bg-surface)",
              color: filter === c ? "var(--success-ink)" : "var(--text-secondary)",
              borderRadius: 999,
              padding: "5px 12px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {c}
          </button>
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
          <SectionLabel
            text={
              key === "Completed"
                ? "Completed"
                : key === "No due date"
                  ? key
                  : relativeDay(key)
            }
          />
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              boxShadow: CARD_SHADOW,
              borderRadius: 14,
              padding: "4px 14px",
            }}
          >
            {list.map((t) => {
              const canDelete = Boolean(
                onDeleteTask && t.createdBy === currentUser
              );
              const isRecurring = Boolean(t.recurrence && t.id.includes("::"));
              return (
                <TaskRow
                  key={t.id}
                  task={t}
                  onToggle={() => toggleTask(t.id)}
                  onOpen={onEditTask ? () => onEditTask(t) : undefined}
                  onOpenLinkedEvent={onOpenLinkedEvent}
                  canDelete={canDelete}
                  isRecurring={isRecurring}
                  onDelete={
                    canDelete && onDeleteTask
                      ? () => {
                          if (isRecurring) {
                            setRecurringDeleteTarget(t);
                          } else {
                            onDeleteTask(t.id, "series");
                          }
                        }
                      : undefined
                  }
                />
              );
            })}
          </div>
        </div>
      ))}

      {recurringDeleteTarget && onDeleteTask && (
        <ModalShell
          onClose={() => setRecurringDeleteTarget(null)}
          title="Delete Task"
        >
          <div
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              marginBottom: 16,
              lineHeight: 1.5,
            }}
          >
            &quot;{recurringDeleteTarget.title}&quot; repeats{" "}
            {recurrenceLabel(
              recurringDeleteTarget.recurrence,
              recurringDeleteTarget.dueDate
            )?.toLowerCase()}
            .
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              onClick={() => {
                onDeleteTask(recurringDeleteTarget.id, "instance");
                setRecurringDeleteTarget(null);
              }}
              style={{
                ...btnStyle,
                background: "var(--bg-surface)",
                border: "1.5px solid var(--border-default)",
                color: "var(--text-primary)",
                textAlign: "left",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                This occurrence only
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: "var(--text-muted)",
                  fontWeight: 400,
                  marginTop: 1,
                }}
              >
                Removes just this date; the series continues.
              </div>
            </button>
            <button
              onClick={() => {
                onDeleteTask(recurringDeleteTarget.id, "series");
                setRecurringDeleteTarget(null);
              }}
              style={{
                ...btnStyle,
                background: "var(--bg-surface)",
                border: "1.5px solid var(--danger-border)",
                color: "var(--danger)",
                textAlign: "left",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                Entire series
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: "var(--text-muted)",
                  fontWeight: 400,
                  marginTop: 1,
                }}
              >
                Removes every occurrence, past and future.
              </div>
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

export function TaskRow({
  task,
  onToggle,
  onOpen,
  compact,
  onOpenLinkedEvent,
  canDelete,
  isRecurring,
  onDelete,
}: {
  task: FamilyTask;
  onToggle: () => void;
  onOpen?: () => void;
  compact?: boolean;
  onOpenLinkedEvent?: (task: FamilyTask) => void;
  canDelete?: boolean;
  isRecurring?: boolean;
  onDelete?: () => void;
}) {
  const { memberById } = useMembers();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const overdue = !task.completed && Boolean(task.dueDate) && task.dueDate < todayISO(0);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: compact ? "7px 0" : "11px 0",
        borderBottom: "1px solid var(--border-divider)",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          color: task.completed ? "var(--success)" : "var(--border-muted)",
          flexShrink: 0,
        }}
        aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
      >
        {task.completed ? <CheckCircle2 size={20} /> : <Circle size={20} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <button
          type="button"
          onClick={onOpen}
          disabled={!onOpen}
          style={{
            display: "block",
            width: "100%",
            background: "none",
            border: "none",
            padding: 0,
            textAlign: "left",
            cursor: onOpen ? "pointer" : "default",
            fontFamily: "inherit",
          }}
        >
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 500,
              textDecoration: task.completed ? "line-through" : "none",
              color: task.completed ? "var(--text-faint)" : "var(--text-primary)",
            }}
          >
            {task.assignedTo && (
              <span style={{ fontWeight: 700 }}>
                {memberById(task.assignedTo).name} —{" "}
              </span>
            )}
            {task.title}
          </div>
          {!compact && (
            <div
              style={{
                display: "flex",
                gap: 6,
                marginTop: 3,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              {task.completed && task.completedBy ? (
                <span
                  suppressHydrationWarning
                  style={{ fontSize: 10.5, color: "var(--success)", fontWeight: 600 }}
                >
                  ✓ {memberById(task.completedBy).name} completed
                  {task.completedAt
                    ? ` · ${formatRelativeTime(task.completedAt)}`
                    : ""}
                </span>
              ) : (
                <>
                  <span style={{ fontSize: 10.5, color: "var(--text-faint)" }}>
                    {task.category}
                  </span>
                  {task.dueTime && (
                    <span style={{ fontSize: 10.5, color: "var(--text-muted)", fontWeight: 600 }}>
                      · {fmtTime(task.dueTime)}
                    </span>
                  )}
                  {task.priority === "High" && (
                    <span
                      style={{ fontSize: 10, fontWeight: 700, color: "var(--danger)" }}
                    >
                      ● High
                    </span>
                  )}
                  {overdue && (
                    <span
                      style={{ fontSize: 10, fontWeight: 700, color: "var(--danger)" }}
                    >
                      Overdue
                    </span>
                  )}
                  {task.recurrence && (
                    <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
                      🔁 {recurrenceLabel(task.recurrence, task.dueDate)}
                    </span>
                  )}
                </>
              )}
            </div>
          )}
        </button>
        {!compact && !task.completed && task.linkedEventTitle && (
          <div style={{ marginTop: 4 }}>
            <button
              type="button"
              onClick={() => onOpenLinkedEvent?.(task)}
              style={{
                fontSize: 10,
                color: "var(--accent-ink)",
                background: "var(--accent-soft)",
                border: "none",
                borderRadius: 999,
                padding: "1px 7px",
                cursor: onOpenLinkedEvent ? "pointer" : "default",
                fontWeight: 600,
              }}
            >
              ↳ {task.linkedEventTitle}
            </button>
          </div>
        )}
      </div>
      {task.assignedTo && <AvatarDot id={task.assignedTo} size={20} />}
      {canDelete && onDelete && (
        confirmingDelete ? (
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => {
                setConfirmingDelete(false);
                onDelete();
              }}
              style={{
                background: "var(--danger)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "4px 8px",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              style={{
                background: "var(--bg-subtle-alt)",
                color: "var(--text-secondary)",
                border: "none",
                borderRadius: 8,
                padding: "4px 7px",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (isRecurring) onDelete();
              else setConfirmingDelete(true);
            }}
            aria-label={`Delete task ${task.title}`}
            title="Delete task"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              color: "var(--text-faint)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Trash2 size={15} />
          </button>
        )
      )}
    </div>
  );
}

export function TaskEditModal({
  task,
  existingEvents,
  canDelete = false,
  onClose,
  onToggle,
  onSave,
  onDelete,
  onOpenLinkedEvent,
}: {
  task: FamilyTask;
  existingEvents?: FamilyEvent[];
  canDelete?: boolean;
  onClose: () => void;
  onToggle: (id: string) => void;
  onSave: (
    id: string,
    updates: TaskUpdateInput,
    scope: "instance" | "series"
  ) => void;
  onDelete?: (id: string, scope: "instance" | "series") => void;
  onOpenLinkedEvent?: (task: FamilyTask) => void;
}) {
  const { members, memberById } = useMembers();
  const [title, setTitle] = useState(task.title);
  const [dueDate, setDueDate] = useState(task.dueDate || "");
  const [dueTime, setDueTime] = useState(task.dueTime || "");
  const [category, setCategory] = useState(task.category || "Household");
  const [priority, setPriority] = useState(task.priority || "Medium");
  const [assignedTo, setAssignedTo] = useState(task.assignedTo || "");
  const [recurrence, setRecurrence] = useState(task.recurrence || "None");
  const [linkedEventId, setLinkedEventId] = useState(task.linkedEventId || "");
  const [notes, setNotes] = useState(task.notes || "");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingAction, setPendingAction] = useState<"save" | "delete" | null>(
    null
  );

  const isRecurring = Boolean(task.recurrence);
  const hasOccurrence = Boolean(isRecurring && task.id.includes("::"));

  const categories = TASK_CATEGORIES.includes(category)
    ? TASK_CATEGORIES
    : [category, ...TASK_CATEGORIES];
  const recurrenceOptions = ["None", "Daily", "Weekly", "Monthly"];
  if (recurrence === "Yearly") recurrenceOptions.push("Yearly");

  function buildUpdates(): TaskUpdateInput {
    const updates: TaskUpdateInput = {};
    const trimmedTitle = title.trim();
    if (trimmedTitle !== task.title) updates.title = trimmedTitle;
    if (dueDate !== (task.dueDate || "")) updates.dueDate = dueDate;
    if ((dueTime || null) !== (task.dueTime || null)) {
      updates.dueTime = dueTime || null;
    }
    if (category !== (task.category || "Household")) updates.category = category;
    if (priority !== (task.priority || "Medium")) updates.priority = priority;
    if ((assignedTo || null) !== (task.assignedTo || null)) {
      updates.assignedTo = assignedTo || null;
    }
    const nextRec = recurrence === "None" ? null : recurrence;
    if (nextRec !== (task.recurrence || null)) {
      updates.recurrence = nextRec;
    }
    if ((linkedEventId || null) !== (task.linkedEventId || null)) {
      updates.linkedEventId = linkedEventId || null;
    }
    if (notes !== (task.notes || "")) updates.notes = notes;
    return updates;
  }

  function requestSave() {
    if (!title.trim()) {
      setError("Please enter a task title.");
      return;
    }
    setError(null);
    const updates = buildUpdates();
    if (Object.keys(updates).length === 0) {
      onClose();
      return;
    }
    if (hasOccurrence && updates.recurrence === undefined) {
      setPendingAction("save");
      return;
    }
    onSave(task.id, updates, "series");
    onClose();
  }

  function commitSave(scope: "instance" | "series") {
    const updates = buildUpdates();
    if (Object.keys(updates).length > 0) {
      onSave(task.id, updates, scope);
    }
    setPendingAction(null);
    onClose();
  }

  function requestDelete() {
    if (!canDelete || !onDelete) return;
    if (hasOccurrence) setPendingAction("delete");
    else if (!confirmDelete) setConfirmDelete(true);
    else {
      onDelete(task.id, "series");
      onClose();
    }
  }

  if (pendingAction) {
    return (
      <ModalShell
        onClose={() => setPendingAction(null)}
        title={pendingAction === "delete" ? "Delete Task" : "Edit Task"}
      >
        <div
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            marginBottom: 16,
            lineHeight: 1.5,
          }}
        >
          &quot;{task.title}&quot; repeats{" "}
          {recurrenceLabel(task.recurrence, task.dueDate)?.toLowerCase()}.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            type="button"
            onClick={() => {
              if (pendingAction === "delete" && onDelete) {
                onDelete(task.id, "instance");
                onClose();
              } else {
                commitSave("instance");
              }
            }}
            style={{
              ...btnStyle,
              background: "var(--bg-surface)",
              border: "1.5px solid var(--border-default)",
              color: "var(--text-primary)",
              textAlign: "left",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>
              This occurrence only
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: "var(--text-muted)",
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
            type="button"
            onClick={() => {
              if (pendingAction === "delete" && onDelete) {
                onDelete(task.id, "series");
                onClose();
              } else {
                commitSave("series");
              }
            }}
            style={{
              ...btnStyle,
              background: "var(--bg-surface)",
              border: `1.5px solid ${
                pendingAction === "delete"
                  ? "var(--danger-border)"
                  : "var(--border-default)"
              }`,
              color:
                pendingAction === "delete"
                  ? "var(--danger)"
                  : "var(--text-primary)",
              textAlign: "left",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>Entire series</div>
            <div
              style={{
                fontSize: 11.5,
                color: "var(--text-muted)",
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
    <ModalShell onClose={onClose} title="Task Details">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 14,
          padding: "8px 10px",
          background: task.completed ? "var(--success-soft)" : "var(--bg-surface-warm)",
          border: `1px solid ${task.completed ? "var(--success-border)" : "var(--border-default)"}`,
          borderRadius: 12,
        }}
      >
        <button
          type="button"
          onClick={() => onToggle(task.id)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: task.completed ? "var(--success-ink)" : "var(--text-primary)",
            fontSize: 12.5,
            fontWeight: 700,
          }}
        >
          {task.completed ? (
            <CheckCircle2 size={17} color="var(--success)" />
          ) : (
            <Circle size={17} color="var(--border-muted)" />
          )}
          {task.completed ? "Completed" : "Mark complete"}
        </button>
        {task.completed && task.completedBy && (
          <span
            suppressHydrationWarning
            style={{ fontSize: 11.5, color: "var(--success-ink)" }}
          >
            by {memberById(task.completedBy).name}
            {task.completedAt ? (
              <>
                {" · "}
                <LocalClock value={task.completedAt} /> (
                {formatRelativeTime(task.completedAt)})
              </>
            ) : null}
          </span>
        )}
        <span
          style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}
        >
          Added by {memberById(task.createdBy).name}
        </span>
      </div>

      {task.linkedEventId && task.linkedEventTitle && onOpenLinkedEvent && (
        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenLinkedEvent(task);
            }}
            style={{
              fontSize: 11.5,
              color: "var(--accent-ink)",
              background: "var(--accent-soft)",
              border: "none",
              borderRadius: 999,
              padding: "4px 10px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            ↳ Linked event: {task.linkedEventTitle}
          </button>
        </div>
      )}

      <FieldLabel>Title</FieldLabel>
      <input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          if (error) setError(null);
          if (confirmDelete) setConfirmDelete(false);
        }}
        placeholder="e.g. Buy diapers"
        style={inputStyle}
      />

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <div style={{ flex: 1 }}>
          <FieldLabel>Due date</FieldLabel>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => {
              setDueDate(e.target.value);
              if (confirmDelete) setConfirmDelete(false);
            }}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <FieldLabel>
              Due time{" "}
              <span style={{ fontWeight: 400, color: "var(--text-faint)" }}>
                (optional)
              </span>
            </FieldLabel>
            {dueTime && (
              <button
                type="button"
                onClick={() => setDueTime("")}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--accent)",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: 0,
                  marginBottom: 6,
                }}
              >
                Clear
              </button>
            )}
          </div>
          <input
            type="time"
            value={dueTime}
            onChange={(e) => {
              setDueTime(e.target.value);
              if (confirmDelete) setConfirmDelete(false);
            }}
            style={inputStyle}
          />
        </div>
      </div>

      <FieldLabel style={{ marginTop: 12 }}>Category</FieldLabel>
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        style={inputStyle}
      >
        {categories.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>

      <FieldLabel style={{ marginTop: 12 }}>Priority</FieldLabel>
      <div style={{ display: "flex", gap: 6 }}>
        {["Low", "Medium", "High"].map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPriority(p)}
            style={pillStyle(priority === p)}
          >
            {p}
          </button>
        ))}
      </div>

      <FieldLabel style={{ marginTop: 12 }}>Assign to</FieldLabel>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setAssignedTo("")}
          style={pillStyle(assignedTo === "")}
        >
          Unassigned
        </button>
        {members.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setAssignedTo(m.id)}
            style={{
              ...pillStyle(assignedTo === m.id),
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <AvatarDot id={m.id} size={18} />
            {m.name}
          </button>
        ))}
      </div>

      <FieldLabel style={{ marginTop: 12 }}>Repeats</FieldLabel>
      <select
        value={recurrence}
        onChange={(e) => setRecurrence(e.target.value)}
        style={inputStyle}
      >
        {recurrenceOptions.map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>

      {existingEvents && existingEvents.length > 0 && (
        <>
          <FieldLabel style={{ marginTop: 12 }}>
            Link to an event{" "}
            <span style={{ fontWeight: 400, color: "var(--text-faint)" }}>
              (optional)
            </span>
          </FieldLabel>
          <select
            value={linkedEventId}
            onChange={(e) => setLinkedEventId(e.target.value)}
            style={inputStyle}
          >
            <option value="">None</option>
            {existingEvents.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </>
      )}

      <FieldLabel style={{ marginTop: 12 }}>
        Notes{" "}
        <span style={{ fontWeight: 400, color: "var(--text-faint)" }}>(optional)</span>
      </FieldLabel>
      <textarea
        placeholder="Anything else worth noting?"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
      />

      {error && (
        <div
          role="alert"
          style={{
            marginTop: 10,
            background: "var(--accent-soft)",
            border: "1px solid var(--accent-border)",
            color: "var(--danger)",
            borderRadius: 10,
            padding: "8px 10px",
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
        {canDelete && onDelete && (
          confirmDelete ? (
            <>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                style={{
                  ...btnStyle,
                  background: "var(--bg-subtle-alt)",
                  color: "var(--text-secondary)",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={requestDelete}
                style={{
                  ...btnStyle,
                  flex: 1,
                  background: "var(--danger)",
                  color: "#fff",
                  border: "1.5px solid var(--danger)",
                }}
              >
                Confirm delete
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={requestDelete}
              style={{
                ...btnStyle,
                background: "var(--bg-surface)",
                color: "var(--danger)",
                border: "1.5px solid var(--danger-border)",
              }}
            >
              Delete
            </button>
          )
        )}
        {!confirmDelete && (
          <button
            type="button"
            onClick={requestSave}
            style={{ ...btnStyle, flex: 1, background: "var(--accent)", color: "#fff" }}
          >
            Save changes
          </button>
        )}
      </div>
    </ModalShell>
  );
}
