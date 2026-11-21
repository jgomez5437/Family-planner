"use client";

import React, { useMemo, useState } from "react";
import { CheckSquare, Search, X } from "lucide-react";
import { CARD_SHADOW, CATEGORY_META, memberById } from "@/lib/constants";
import { relativeDay } from "@/lib/dates";
import type { FamilyEvent, FamilyTask, WallPost } from "@/types/family";
import { AvatarDot, SectionLabel } from "@/components/ui/Primitives";

function highlightMatch(text: string, query: string) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark
        style={{
          background: "#F4C95D",
          color: "#2B2622",
          borderRadius: 3,
          padding: "0 1px",
        }}
      >
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

const searchRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  background: "#fff",
  border: "1px solid #F1E8D9",
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
  tasks,
  posts,
  onOpenEvent,
}: {
  onClose: () => void;
  events: FamilyEvent[];
  tasks: FamilyTask[];
  posts: WallPost[];
  onOpenEvent: (e: FamilyEvent) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const grouped = useMemo(() => {
    if (!q) return null;
    const eventHits = events.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.location?.toLowerCase().includes(q) ||
        e.notes?.toLowerCase().includes(q)
    );
    const taskHits = tasks.filter(
      (t) => t.title.toLowerCase().includes(q) || t.notes?.toLowerCase().includes(q)
    );
    const postHits = posts.filter((p) => p.content.toLowerCase().includes(q));
    return { events: eventHits, tasks: taskHits, posts: postHits };
  }, [q, events, tasks, posts]);

  const totalResults = grouped
    ? grouped.events.length + grouped.tasks.length + grouped.posts.length
    : 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#FFF9F0",
        zIndex: 150,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "14px 16px 10px",
          borderBottom: "1px solid #EFE4D2",
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
            background: "#fff",
            border: "1.5px solid #EFE4D2",
            borderRadius: 12,
            padding: "9px 12px",
          }}
        >
          <Search size={16} color="#A69C8E" />
          <input
            autoFocus
            placeholder="Search events, tasks, appointments, wall…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              border: "none",
              outline: "none",
              flex: 1,
              fontSize: 14,
              background: "transparent",
              fontFamily: "inherit",
            }}
          />
        </div>
        <button
          onClick={onClose}
          style={{
            background: "#F5EFE3",
            border: "none",
            borderRadius: "50%",
            width: 32,
            height: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <X size={16} />
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px 40px" }}>
        {!q && (
          <div
            style={{
              textAlign: "center",
              color: "#A69C8E",
              fontSize: 13,
              marginTop: 40,
            }}
          >
            Search across events, appointments, tasks, and the Family Wall.
          </div>
        )}
        {q && totalResults === 0 && (
          <div style={{ textAlign: "center", marginTop: 40 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "#6B6259" }}>
              Nothing found for &quot;{query}&quot;
            </div>
            <div style={{ fontSize: 12.5, color: "#A69C8E", marginTop: 4 }}>
              Try searching for an event, task, appointment, or family update.
            </div>
          </div>
        )}
        {grouped && grouped.events.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <SectionLabel text="Events" />
            {grouped.events.map((e) => (
              <SearchResultRow
                key={e.id}
                kind="event"
                data={e}
                query={query}
                onOpenEvent={onOpenEvent}
              />
            ))}
          </div>
        )}
        {grouped && grouped.tasks.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <SectionLabel text="Tasks" />
            {grouped.tasks.map((t) => (
              <SearchResultRow key={t.id} kind="task" data={t} query={query} />
            ))}
          </div>
        )}
        {grouped && grouped.posts.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <SectionLabel text="Family Wall" />
            {grouped.posts.map((p) => (
              <SearchResultRow key={p.id} kind="post" data={p} query={query} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SearchResultRow({
  kind,
  data,
  query,
  onOpenEvent,
}:
  | {
      kind: "event";
      data: FamilyEvent;
      query: string;
      onOpenEvent: (e: FamilyEvent) => void;
    }
  | { kind: "task"; data: FamilyTask; query: string; onOpenEvent?: undefined }
  | { kind: "post"; data: WallPost; query: string; onOpenEvent?: undefined }) {
  if (kind === "event") {
    const meta = CATEGORY_META[data.category] || CATEGORY_META.Other;
    const Icon = meta.icon;
    return (
      <button onClick={() => onOpenEvent(data)} style={searchRowStyle}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            background: `${meta.color}15`,
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
            {highlightMatch(data.title, query)}
          </div>
          <div style={{ fontSize: 11.5, color: "#A69C8E" }}>
            {relativeDay(data.occurrenceDate || data.date)}
            {data.location ? ` · ${data.location}` : ""}
          </div>
        </div>
      </button>
    );
  }
  if (kind === "task") {
    return (
      <div style={searchRowStyle}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            background: "#E4F1EC",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <CheckSquare size={14} color="#1F6F5C" />
        </div>
        <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              textDecoration: data.completed ? "line-through" : "none",
              color: data.completed ? "#A69C8E" : "#2B2622",
            }}
          >
            {highlightMatch(data.title, query)}
          </div>
          <div style={{ fontSize: 11.5, color: "#A69C8E" }}>
            {data.dueDate ? relativeDay(data.dueDate) : "No due date"}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={searchRowStyle}>
      <AvatarDot id={data.author} size={30} />
      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
        <div style={{ fontSize: 13, color: "#2B2622" }}>
          {highlightMatch(data.content, query)}
        </div>
        <div style={{ fontSize: 11.5, color: "#A69C8E" }}>
          {memberById(data.author).name} · {data.createdAt}
        </div>
      </div>
    </div>
  );
}
