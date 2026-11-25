"use client";

import React, { useEffect, useMemo, useState } from "react";
import { CheckSquare, ChevronRight, Pill, Search, X } from "lucide-react";
import { CARD_SHADOW, CATEGORY_META } from "@/lib/constants";
import { useMembers } from "@/components/MembersContext";
import { fmtTime, formatRelativeTime, relativeDay } from "@/lib/dates";
import { medWhenLabel, nextDoseLabel } from "@/lib/meds";
import {
  getHighlightSegments,
  runFamilySearch,
  type EventSearchHit,
  type MedSearchHit,
  type PersonSearchHit,
  type PostSearchHit,
  type TaskSearchHit,
} from "@/lib/search";
import type {
  DoseLogMap,
  FamilyEvent,
  FamilyTask,
  Medication,
  Member,
  ProfilesMap,
  WallPost,
} from "@/types/family";
import { AvatarDot, SectionLabel } from "@/components/ui/Primitives";

function HighlightedText({ text, query }: { text: string; query: string }) {
  const segments = getHighlightSegments(text, query);
  return (
    <>
      {segments.map((seg, idx) =>
        seg.match ? (
          <mark
            key={idx}
            style={{
              background: "var(--highlight-bg)",
              color: "var(--highlight-ink)",
              borderRadius: 3,
              padding: "0 2px",
            }}
          >
            {seg.text}
          </mark>
        ) : (
          <React.Fragment key={idx}>{seg.text}</React.Fragment>
        )
      )}
    </>
  );
}

const searchRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-subtle)",
  boxShadow: CARD_SHADOW,
  borderRadius: 12,
  padding: "10px 12px",
  marginBottom: 8,
  cursor: "pointer",
  textAlign: "left",
};

export function SearchOverlay({
  onClose,
  events,
  expandedEvents,
  tasks,
  expandedTasks,
  posts,
  meds,
  doseLog,
  profiles,
  onOpenPerson,
  onOpenMed,
  onOpenEvent,
  onOpenTask,
  onOpenPost,
}: {
  onClose: () => void;
  events: FamilyEvent[];
  expandedEvents: FamilyEvent[];
  tasks: FamilyTask[];
  expandedTasks: FamilyTask[];
  posts: WallPost[];
  meds: Medication[];
  doseLog: DoseLogMap;
  profiles: ProfilesMap;
  onOpenPerson: (member: Member) => void;
  onOpenMed: (med: Medication) => void;
  onOpenEvent: (event: FamilyEvent) => void;
  onOpenTask: (task: FamilyTask) => void;
  onOpenPost: (post: WallPost) => void;
}) {
  const { members, memberById } = useMembers();
  const [query, setQuery] = useState("");
  const trimmed = query.trim();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const results = useMemo(() => {
    if (!trimmed) return null;
    return runFamilySearch({
      query: trimmed,
      members,
      meds,
      doseLog,
      profiles,
      events,
      expandedEvents,
      tasks,
      expandedTasks,
      posts,
    });
  }, [
    trimmed,
    members,
    meds,
    doseLog,
    profiles,
    events,
    expandedEvents,
    tasks,
    expandedTasks,
    posts,
  ]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search Family Planner"
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--bg-app)",
        color: "var(--text-primary)",
        zIndex: 150,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "calc(14px + env(safe-area-inset-top)) 16px 10px",
          borderBottom: "1px solid var(--border-default)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "var(--bg-surface)",
            border: "1.5px solid var(--border-default)",
            borderRadius: 12,
            padding: "9px 12px",
          }}
        >
          <Search size={16} color="var(--text-faint)" />
          <input
            autoFocus
            aria-label="Search query"
            placeholder="Search people, medications, events, tasks, wall…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              border: "none",
              outline: "none",
              flex: 1,
              fontSize: 14,
              background: "transparent",
              color: "var(--text-primary)",
              fontFamily: "inherit",
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              style={{
                background: "var(--bg-subtle-alt)",
                color: "var(--text-secondary)",
                border: "none",
                borderRadius: "50%",
                width: 22,
                height: 22,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close search"
          style={{
            background: "var(--bg-subtle-alt)",
            color: "var(--text-primary)",
            border: "none",
            borderRadius: "50%",
            width: 32,
            height: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <X size={16} />
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "14px 16px calc(40px + env(safe-area-inset-bottom))",
        }}
      >
        {!trimmed && (
          <div
            style={{
              textAlign: "center",
              color: "var(--text-faint)",
              fontSize: 13,
              marginTop: 40,
            }}
          >
            Search across people, medications, care info, events, tasks, and the
            Family Wall.
          </div>
        )}

        {results && results.total === 0 && (
          <div style={{ textAlign: "center", marginTop: 40 }}>
            <div
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: "var(--text-secondary)",
              }}
            >
              Nothing found for &quot;{query}&quot;
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: "var(--text-faint)",
                marginTop: 4,
              }}
            >
              Try searching for a family member, medication, event, task, or
              wall post.
            </div>
          </div>
        )}

        {results && results.people.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <SectionLabel text="People" />
            {results.people.map((hit) => (
              <PersonResultRow
                key={hit.member.id}
                hit={hit}
                query={trimmed}
                onSelect={() => onOpenPerson(hit.member)}
              />
            ))}
          </div>
        )}

        {results && results.meds.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <SectionLabel text="Medications" />
            {results.meds.map((hit) => (
              <MedResultRow
                key={hit.med.id}
                hit={hit}
                query={trimmed}
                onSelect={() => onOpenMed(hit.med)}
              />
            ))}
          </div>
        )}

        {results && results.events.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <SectionLabel text="Events" />
            {results.events.map((hit) => (
              <EventResultRow
                key={hit.event.id}
                hit={hit}
                query={trimmed}
                memberName={(id) => memberById(id).name}
                onSelect={() => onOpenEvent(hit.event)}
              />
            ))}
          </div>
        )}

        {results && results.tasks.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <SectionLabel text="Tasks" />
            {results.tasks.map((hit) => (
              <TaskResultRow
                key={hit.task.id}
                hit={hit}
                query={trimmed}
                memberName={(id) => memberById(id).name}
                onSelect={() => onOpenTask(hit.task)}
              />
            ))}
          </div>
        )}

        {results && results.posts.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <SectionLabel text="Family Wall" />
            {results.posts.map((hit) => (
              <PostResultRow
                key={hit.post.id}
                hit={hit}
                query={trimmed}
                authorName={memberById(hit.post.author).name}
                onSelect={() => onOpenPost(hit.post)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PersonResultRow({
  hit,
  query,
  onSelect,
}: {
  hit: PersonSearchHit;
  query: string;
  onSelect: () => void;
}) {
  const { member, medCount, upcomingEventCount, matchedCareField } = hit;
  const roleLabel = member.isChild
    ? "Child"
    : member.role === "admin"
      ? "Admin"
      : "Adult";

  const summaryParts: string[] = [roleLabel];
  if (member.isChild) {
    summaryParts.push(
      medCount === 0
        ? "No active meds"
        : `${medCount} med${medCount === 1 ? "" : "s"}`
    );
  }
  if (upcomingEventCount > 0) {
    summaryParts.push(
      `${upcomingEventCount} upcoming event${upcomingEventCount === 1 ? "" : "s"}`
    );
  }

  return (
    <button type="button" onClick={onSelect} style={searchRowStyle}>
      <AvatarDot id={member.id} size={32} />
      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>
          <HighlightedText text={member.name} query={query} />
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
          {summaryParts.join(" · ")}
        </div>
        {matchedCareField && (
          <div
            style={{
              fontSize: 11.5,
              color: "var(--text-secondary)",
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ fontWeight: 600 }}>{matchedCareField.label}: </span>
            <HighlightedText text={matchedCareField.value} query={query} />
          </div>
        )}
      </div>
      <ChevronRight size={16} color="var(--text-faint)" />
    </button>
  );
}

function MedResultRow({
  hit,
  query,
  onSelect,
}: {
  hit: MedSearchHit;
  query: string;
  onSelect: () => void;
}) {
  const { med, kid, isCurrent, nextDose: nd } = hit;
  const nextLabel = nd ? nextDoseLabel(nd) : null;

  return (
    <button type="button" onClick={onSelect} style={searchRowStyle}>
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          background: isCurrent ? "var(--accent-soft)" : "var(--bg-subtle-alt)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Pill
          size={15}
          color={isCurrent ? "var(--accent)" : "var(--text-faint)"}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>
          <HighlightedText text={med.name} query={query} />{" "}
          <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>
            · <HighlightedText text={med.dose} query={query} />
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
          <HighlightedText text={kid.name} query={query} /> ·{" "}
          {medWhenLabel(med)}
          {!isCurrent
            ? " · Ended"
            : nextLabel
              ? ` · Next ${nextLabel}`
              : ""}
        </div>
        {med.instructions && (
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              marginTop: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            <HighlightedText text={med.instructions} query={query} />
          </div>
        )}
      </div>
      <ChevronRight size={16} color="var(--text-faint)" />
    </button>
  );
}

function EventResultRow({
  hit,
  query,
  memberName,
  onSelect,
}: {
  hit: EventSearchHit;
  query: string;
  memberName: (id: string) => string;
  onSelect: () => void;
}) {
  const data = hit.event;
  const meta = CATEGORY_META[data.category] || CATEGORY_META.Other;
  const Icon = meta.icon;
  const participantNames = (data.participants || []).map(memberName);

  return (
    <button type="button" onClick={onSelect} style={searchRowStyle}>
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          background: meta.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={15} color={meta.color} />
      </div>
      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>
          <HighlightedText text={data.title} query={query} />
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
          {data.recurrence ? "🔁 " : ""}
          {relativeDay(data.occurrenceDate || data.date)}
          {!data.allDay && data.startTime ? ` · ${fmtTime(data.startTime)}` : ""}
          {data.location ? (
            <>
              {" · "}
              <HighlightedText text={data.location} query={query} />
            </>
          ) : null}
          {participantNames.length > 0 ? (
            <>
              {" · "}
              <HighlightedText
                text={participantNames.join(", ")}
                query={query}
              />
            </>
          ) : null}
        </div>
      </div>
      <ChevronRight size={16} color="var(--text-faint)" />
    </button>
  );
}

function TaskResultRow({
  hit,
  query,
  memberName,
  onSelect,
}: {
  hit: TaskSearchHit;
  query: string;
  memberName: (id: string) => string;
  onSelect: () => void;
}) {
  const data = hit.task;
  const assignee = data.assignedTo ? memberName(data.assignedTo) : null;

  return (
    <button type="button" onClick={onSelect} style={searchRowStyle}>
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          background: "var(--success-soft)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <CheckSquare size={14} color="var(--success)" />
      </div>
      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            textDecoration: data.completed ? "line-through" : "none",
            color: data.completed ? "var(--text-faint)" : "var(--text-primary)",
          }}
        >
          <HighlightedText text={data.title} query={query} />
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
          {data.recurrence ? "🔁 " : ""}
          {data.dueDate ? relativeDay(data.dueDate) : "No due date"}
          {assignee ? (
            <>
              {" · "}
              <HighlightedText text={assignee} query={query} />
            </>
          ) : null}
          {data.completed ? " · Done" : ""}
        </div>
      </div>
      <ChevronRight size={16} color="var(--text-faint)" />
    </button>
  );
}

function PostResultRow({
  hit,
  query,
  authorName,
  onSelect,
}: {
  hit: PostSearchHit;
  query: string;
  authorName: string;
  onSelect: () => void;
}) {
  const { post, matchedComment } = hit;
  return (
    <button type="button" onClick={onSelect} style={searchRowStyle}>
      <AvatarDot id={post.author} size={30} />
      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
        <div
          style={{
            fontSize: 13,
            color: "var(--text-primary)",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          <HighlightedText
            text={post.content || `${post.type} post`}
            query={query}
          />
        </div>
        {matchedComment && (
          <div
            style={{
              fontSize: 11.5,
              color: "var(--text-secondary)",
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ fontWeight: 600 }}>
              <HighlightedText text={matchedComment.byName} query={query} />:{" "}
            </span>
            <HighlightedText text={matchedComment.text} query={query} />
          </div>
        )}
        <div
          suppressHydrationWarning
          style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 1 }}
        >
          <HighlightedText text={authorName} query={query} /> · {post.type} ·{" "}
          {formatRelativeTime(post.createdAt)}
        </div>
      </div>
      <ChevronRight size={16} color="var(--text-faint)" />
    </button>
  );
}
