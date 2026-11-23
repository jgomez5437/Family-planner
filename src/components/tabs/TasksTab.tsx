"use client";

import React, { useState } from "react";
import { CheckCircle2, Circle, Trash2 } from "lucide-react";
import { btnStyle, CARD_SHADOW } from "@/lib/constants";
import { useMembers } from "@/components/MembersContext";
import { formatRelativeTime, relativeDay, todayISO } from "@/lib/dates";
import { recurrenceLabel } from "@/lib/recurrence";
import type { FamilyTask, MemberId } from "@/types/family";
import {
  AvatarDot,
  EmptyState,
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
  onDeleteTask,
}: {
  tasks: FamilyTask[];
  toggleTask: (id: string) => void;
  currentUser: MemberId;
  openComposer?: (type: ComposerKind) => void;
  onOpenLinkedEvent?: (task: FamilyTask) => void;
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
              border: `1.5px solid ${filter === c ? "#1F6F5C" : "#EFE4D2"}`,
              background: filter === c ? "#E4F1EC" : "#fff",
              color: filter === c ? "#155C4A" : "#6B6259",
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
              background: "#fff",
              border: "1px solid #F1E8D9",
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
              color: "#6B6259",
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
                background: "#fff",
                border: "1.5px solid #F3D9D2",
                color: "#C4402A",
                textAlign: "left",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                Entire series
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: "#948C80",
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
  compact,
  onOpenLinkedEvent,
  canDelete,
  isRecurring,
  onDelete,
}: {
  task: FamilyTask;
  onToggle: () => void;
  compact?: boolean;
  onOpenLinkedEvent?: (task: FamilyTask) => void;
  canDelete?: boolean;
  isRecurring?: boolean;
  onDelete?: () => void;
}) {
  const { memberById } = useMembers();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const overdue = !task.completed && task.dueDate < todayISO(0);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: compact ? "7px 0" : "11px 0",
        borderBottom: "1px solid #F3ECE0",
      }}
    >
      <button
        onClick={onToggle}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          color: task.completed ? "#1F6F5C" : "#C9BEAC",
        }}
        aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
      >
        {task.completed ? <CheckCircle2 size={20} /> : <Circle size={20} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 500,
            textDecoration: task.completed ? "line-through" : "none",
            color: task.completed ? "#A69C8E" : "#2B2622",
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
                style={{ fontSize: 10.5, color: "#1F6F5C", fontWeight: 600 }}
              >
                ✓ {memberById(task.completedBy).name} completed
                {task.completedAt
                  ? ` · ${formatRelativeTime(task.completedAt)}`
                  : ""}
              </span>
            ) : (
              <>
                <span style={{ fontSize: 10.5, color: "#A69C8E" }}>
                  {task.category}
                </span>
                {task.priority === "High" && (
                  <span
                    style={{ fontSize: 10, fontWeight: 700, color: "#C4402A" }}
                  >
                    ● High
                  </span>
                )}
                {overdue && (
                  <span
                    style={{ fontSize: 10, fontWeight: 700, color: "#C4402A" }}
                  >
                    Overdue
                  </span>
                )}
                {task.recurrence && (
                  <span style={{ fontSize: 10, color: "#A69C8E" }}>
                    🔁 {recurrenceLabel(task.recurrence, task.dueDate)}
                  </span>
                )}
                {task.linkedEventTitle && (
                  <button
                    onClick={() => onOpenLinkedEvent?.(task)}
                    style={{
                      fontSize: 10,
                      color: "#B24A1D",
                      background: "#FCE9DF",
                      border: "none",
                      borderRadius: 999,
                      padding: "1px 7px",
                      cursor: onOpenLinkedEvent ? "pointer" : "default",
                      fontWeight: 600,
                    }}
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
                background: "#C4402A",
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
                background: "#F5EFE3",
                color: "#6B6259",
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
              color: "#B7AE9F",
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
