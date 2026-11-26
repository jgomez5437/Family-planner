"use client";

import React, { useMemo, useState } from "react";
import {
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Stethoscope,
} from "lucide-react";
import { btnStyle, CARD_SHADOW } from "@/lib/constants";
import { todayISO } from "@/lib/dates";
import {
  getPlanCounts,
  groupPlanItems,
  type PlanTimelineItem,
  type PlanTypeFilter,
  type TaskSubFilter,
} from "@/lib/plan";
import { recurrenceLabel } from "@/lib/recurrence";
import type { FamilyEvent, FamilyTask, MemberId } from "@/types/family";
import {
  EmptyState,
  ModalShell,
  SectionLabel,
} from "@/components/ui/Primitives";
import type { ComposerKind } from "@/components/layout/QuickAddSheet";
import { TaskRow } from "@/components/plan/TaskItems";
import { AppointmentCard, EventEditModal } from "@/components/plan/EventItems";

const TYPE_FILTERS: {
  id: PlanTypeFilter;
  label: string;
  icon?: typeof CheckSquare;
  activeBorder: string;
  activeBg: string;
  activeColor: string;
}[] = [
  {
    id: "all",
    label: "All",
    activeBorder: "var(--accent)",
    activeBg: "var(--accent-soft)",
    activeColor: "var(--accent-ink)",
  },
  {
    id: "tasks",
    label: "Tasks",
    icon: CheckSquare,
    activeBorder: "var(--success)",
    activeBg: "var(--success-soft)",
    activeColor: "var(--success-ink)",
  },
  {
    id: "events",
    label: "Events",
    icon: Calendar,
    activeBorder: "var(--cat-blue)",
    activeBg: "var(--cat-blue-soft)",
    activeColor: "var(--cat-blue)",
  },
  {
    id: "appointments",
    label: "Appointments",
    icon: Stethoscope,
    activeBorder: "var(--cat-coral)",
    activeBg: "var(--cat-coral-soft)",
    activeColor: "var(--cat-coral)",
  },
];

const TASK_SUB_FILTERS: { id: TaskSubFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "mine", label: "Mine" },
  { id: "family", label: "Family" },
  { id: "unassigned", label: "Unassigned" },
  { id: "overdue", label: "Overdue" },
  { id: "completed", label: "Completed" },
];

type SectionChunk =
  | { type: "tasks"; key: string; tasks: FamilyTask[] }
  | { type: "event"; key: string; event: FamilyEvent };

function chunkSectionItems(items: PlanTimelineItem[]): SectionChunk[] {
  const chunks: SectionChunk[] = [];
  for (const item of items) {
    if (item.kind === "task") {
      const last = chunks[chunks.length - 1];
      if (last && last.type === "tasks") {
        last.tasks.push(item.task);
      } else {
        chunks.push({
          type: "tasks",
          key: `tasks-${item.id}`,
          tasks: [item.task],
        });
      }
    } else {
      chunks.push({
        type: "event",
        key: item.id,
        event: item.event,
      });
    }
  }
  return chunks;
}

export function PlanTab({
  events,
  tasks,
  currentUser,
  typeFilter: controlledFilter,
  onTypeFilterChange,
  toggleTask,
  openHistory,
  openComposer,
  onQuickAdd,
  onEditTask,
  onDeleteTask,
  onOpenLinkedEvent,
  onUpdateEventTime,
  onDeleteEvent,
}: {
  events: FamilyEvent[];
  tasks: FamilyTask[];
  currentUser: MemberId;
  typeFilter?: PlanTypeFilter;
  onTypeFilterChange?: (next: PlanTypeFilter) => void;
  toggleTask: (id: string) => void;
  openHistory: (e: FamilyEvent) => void;
  openComposer?: (type: ComposerKind) => void;
  onQuickAdd?: () => void;
  onEditTask?: (task: FamilyTask) => void;
  onDeleteTask?: (id: string, scope: "instance" | "series") => void;
  onOpenLinkedEvent?: (task: FamilyTask) => void;
  onUpdateEventTime: (
    id: string,
    field: string,
    value: string,
    reason: string,
    scope: "instance" | "series"
  ) => void;
  onDeleteEvent: (id: string, scope: "instance" | "series") => void;
}) {
  const [uncontrolledFilter, setUncontrolledFilter] =
    useState<PlanTypeFilter>("all");
  const typeFilter = controlledFilter ?? uncontrolledFilter;
  const setTypeFilter = (next: PlanTypeFilter) => {
    if (onTypeFilterChange) onTypeFilterChange(next);
    else setUncontrolledFilter(next);
  };

  const [taskSubFilter, setTaskSubFilter] = useState<TaskSubFilter>("all");
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [editingEvent, setEditingEvent] = useState<FamilyEvent | null>(null);
  const [recurringDeleteTarget, setRecurringDeleteTarget] =
    useState<FamilyTask | null>(null);

  const today = todayISO(0);

  const counts = useMemo(
    () => getPlanCounts({ events, tasks, today }),
    [events, tasks, today]
  );

  const { sections, completedTasks } = useMemo(
    () =>
      groupPlanItems({
        events,
        tasks,
        typeFilter,
        taskSubFilter,
        currentUser,
        today,
      }),
    [events, tasks, typeFilter, taskSubFilter, currentUser, today]
  );

  const showCompletedInline =
    typeFilter === "tasks" && taskSubFilter === "completed";
  const showCompletedCollapsible =
    (typeFilter === "all" ||
      (typeFilter === "tasks" && taskSubFilter === "all")) &&
    completedTasks.length > 0;

  const showEmptyState = showCompletedInline
    ? completedTasks.length === 0
    : sections.length === 0;

  function renderTaskCardList(list: FamilyTask[], showDate: boolean) {
    return (
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          boxShadow: CARD_SHADOW,
          borderRadius: 16,
          padding: "2px 14px",
          marginBottom: 10,
        }}
      >
        {list.map((t, idx) => {
          const canDelete = Boolean(onDeleteTask && t.createdBy === currentUser);
          const isRecurring = Boolean(t.recurrence && t.id.includes("::"));
          return (
            <TaskRow
              key={t.id}
              task={t}
              showDate={showDate}
              hideDivider={idx === list.length - 1}
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
    );
  }

  function renderEmptyState() {
    if (typeFilter === "tasks") {
      if (taskSubFilter === "all") {
        return (
          <EmptyState
            text={completedTasks.length > 0 ? "All tasks completed!" : "No tasks yet."}
            sub={
              completedTasks.length > 0
                ? "Add another task or review completed ones below."
                : "Add your family's first task."
            }
            actionLabel={openComposer ? "Add Task" : undefined}
            onAction={openComposer ? () => openComposer("task") : undefined}
          />
        );
      }
      const subEmptyLabels: Record<Exclude<TaskSubFilter, "all">, string> = {
        mine: "No tasks assigned to you.",
        family: "No tasks assigned to other family members.",
        unassigned: "No unassigned tasks.",
        overdue: "No overdue tasks — you're all caught up!",
        completed: "No completed tasks yet.",
      };
      return (
        <EmptyState
          text={subEmptyLabels[taskSubFilter]}
          sub="Try another filter or add a new task."
        />
      );
    }
    if (typeFilter === "events") {
      return (
        <EmptyState
          text="No upcoming events."
          sub="Add a family event to get it on the schedule."
          actionLabel={openComposer ? "Add Event" : undefined}
          onAction={openComposer ? () => openComposer("event") : undefined}
        />
      );
    }
    if (typeFilter === "appointments") {
      return (
        <EmptyState
          text="No upcoming appointments."
          sub="Add a doctor visit, checkup, or appointment."
          actionLabel={openComposer ? "Add Appointment" : undefined}
          onAction={openComposer ? () => openComposer("appointment") : undefined}
        />
      );
    }
    return (
      <EmptyState
        text={completedTasks.length > 0 ? "Nothing upcoming right now." : "Nothing planned yet."}
        sub={
          completedTasks.length > 0
            ? "Add a new task, event, or appointment — or review completed tasks below."
            : "Add a task, event, or appointment to build your family's timeline."
        }
        actionLabel={onQuickAdd ? "Quick Add" : undefined}
        onAction={onQuickAdd}
      />
    );
  }

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
        Plan
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--text-muted)",
          marginBottom: 14,
        }}
      >
        Tasks, events, and appointments in one timeline.
      </div>

      {/* Primary Type Filters */}
      <div
        role="tablist"
        aria-label="Filter plan by item type"
        style={{
          display: "flex",
          gap: 7,
          overflowX: "auto",
          marginBottom: typeFilter === "tasks" ? 10 : 16,
          paddingBottom: 2,
        }}
      >
        {TYPE_FILTERS.map((f) => {
          const active = typeFilter === f.id;
          const Icon = f.icon;
          const count = counts[f.id];
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setTypeFilter(f.id);
                if (f.id !== "tasks") {
                  setTaskSubFilter("all");
                }
              }}
              style={{
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                border: `1.5px solid ${active ? f.activeBorder : "var(--border-default)"}`,
                background: active ? f.activeBg : "var(--bg-surface)",
                color: active ? f.activeColor : "var(--text-secondary)",
                borderRadius: 999,
                padding: "6px 12px",
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {Icon && <Icon size={14} strokeWidth={2.2} />}
              <span>{f.label}</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  opacity: active ? 0.9 : 0.65,
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Secondary Task Filters (Tasks view only) */}
      {typeFilter === "tasks" && (
        <div
          aria-label="Filter tasks"
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            marginBottom: 16,
            paddingBottom: 4,
          }}
        >
          {TASK_SUB_FILTERS.map((sf) => {
            const active = taskSubFilter === sf.id;
            return (
              <button
                key={sf.id}
                type="button"
                onClick={() => setTaskSubFilter(sf.id)}
                style={{
                  flexShrink: 0,
                  border: `1.5px solid ${active ? "var(--success)" : "var(--border-default)"}`,
                  background: active
                    ? "var(--success-soft)"
                    : "var(--bg-surface)",
                  color: active
                    ? "var(--success-ink)"
                    : "var(--text-secondary)",
                  borderRadius: 999,
                  padding: "4px 11px",
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {sf.label}
              </button>
            );
          })}
        </div>
      )}

      {showEmptyState && renderEmptyState()}

      {/* Chronological Timeline Sections */}
      {sections.map((section) => {
        const chunks = chunkSectionItems(section.items);
        return (
          <div key={section.id} style={{ marginBottom: 18 }}>
            <SectionLabel
              text={section.label}
              style={section.isOverdue ? { color: "var(--danger)" } : undefined}
            />
            {chunks.map((chunk) =>
              chunk.type === "tasks" ? (
                <React.Fragment key={chunk.key}>
                  {renderTaskCardList(chunk.tasks, section.isMultiDay)}
                </React.Fragment>
              ) : (
                <AppointmentCard
                  key={chunk.key}
                  event={chunk.event}
                  onEdit={() => setEditingEvent(chunk.event)}
                  onHistory={() => openHistory(chunk.event)}
                />
              )
            )}
          </div>
        );
      })}

      {/* Inline Completed Tasks (Tasks -> Completed) */}
      {showCompletedInline && completedTasks.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <SectionLabel text={`Completed (${completedTasks.length})`} />
          {renderTaskCardList(completedTasks, true)}
        </div>
      )}

      {/* Collapsible Completed Tasks (All / Tasks -> All) */}
      {showCompletedCollapsible && (
        <div style={{ marginTop: 8, marginBottom: 18 }}>
          <button
            type="button"
            onClick={() => setCompletedExpanded((v) => !v)}
            aria-expanded={completedExpanded}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "none",
              border: "none",
              padding: "4px 2px",
              marginBottom: completedExpanded ? 8 : 0,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 700,
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            {completedExpanded ? (
              <ChevronDown size={15} />
            ) : (
              <ChevronRight size={15} />
            )}
            Completed ({completedTasks.length})
          </button>
          {completedExpanded && renderTaskCardList(completedTasks, true)}
        </div>
      )}

      {/* Event Edit Modal */}
      {editingEvent && (
        <EventEditModal
          event={editingEvent}
          canDelete={editingEvent.createdBy === currentUser}
          onClose={() => setEditingEvent(null)}
          onSave={(field, value, reason, scope) => {
            onUpdateEventTime(editingEvent.id, field, value, reason, scope);
            setEditingEvent(null);
          }}
          onDelete={(scope) => {
            onDeleteEvent(editingEvent.id, scope);
            setEditingEvent(null);
          }}
        />
      )}

      {/* Recurring Task Delete Scope Modal */}
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
