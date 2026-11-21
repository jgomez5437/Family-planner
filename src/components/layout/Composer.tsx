"use client";

import React, { useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import {
  btnStyle,
  inputStyle,
  MEMBERS,
  pillStyle,
  TASK_CATEGORIES,
} from "@/lib/constants";
import { todayISO } from "@/lib/dates";
import type { FamilyEvent, FamilyTask, MemberId } from "@/types/family";
import {
  CategoryPicker,
  FieldLabel,
  MemberPicker,
  ModalShell,
} from "@/components/ui/Primitives";
import type { ComposerKind } from "./QuickAddSheet";

export function Composer({
  type,
  onClose,
  onAddEvent,
  onAddTask,
  onAddPost,
  initialDate,
  existingEvents,
  initialParticipants,
  initialPostType,
}: {
  type: ComposerKind;
  onClose: () => void;
  onAddEvent: (ev: Partial<FamilyEvent>) => void;
  onAddTask: (tk: Partial<FamilyTask>) => void;
  onAddPost: (post: { type: string; content: string; images: string[] }) => void;
  initialDate?: string | null;
  existingEvents?: FamilyEvent[];
  initialParticipants?: MemberId[];
  initialPostType?: string;
}) {
  const isAppointment = type === "appointment";
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(initialDate || todayISO(0));
  const [time, setTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState(
    type === "task" ? "Household" : isAppointment ? "Appointment" : "Family"
  );
  const [assignedTo, setAssignedTo] = useState("");
  const [participants, setParticipants] = useState<MemberId[]>(initialParticipants || []);
  const [postType, setPostType] = useState(initialPostType || "Update");
  const [content, setContent] = useState("");
  const [recurrence, setRecurrence] = useState("None");
  const [reminder, setReminder] = useState("None");
  const [priority, setPriority] = useState("Medium");
  const [notes, setNotes] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [linkedEventId, setLinkedEventId] = useState("");
  const [postImages, setPostImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function toggleParticipant(id: MemberId) {
    setParticipants((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  function handleFiles(fileList: FileList | null) {
    const files = Array.from(fileList || []).slice(0, 6 - postImages.length);
    files.forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setPostImages((imgs) => [...imgs, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  }

  function removeImage(i: number) {
    setPostImages((imgs) => imgs.filter((_, idx) => idx !== i));
  }

  function submit() {
    if (type === "event" || isAppointment) {
      if (!title.trim()) return;
      onAddEvent({
        title,
        date,
        startTime: allDay ? null : time || null,
        endTime: allDay ? null : endTime || null,
        allDay,
        location,
        category,
        participants,
        notes,
        recurrence: recurrence === "None" ? null : recurrence,
        reminder: reminder === "None" ? null : reminder,
      });
    } else if (type === "task") {
      if (!title.trim()) return;
      const linked = existingEvents?.find((e) => e.id === linkedEventId);
      onAddTask({
        title,
        dueDate: date,
        dueTime: dueTime || null,
        category,
        assignedTo: assignedTo || null,
        priority,
        notes,
        recurrence: recurrence === "None" ? null : recurrence,
        linkedEventId: linked ? linked.id : undefined,
        linkedEventTitle: linked ? linked.title : undefined,
      });
    } else if (type === "post") {
      if (!content.trim() && postImages.length === 0) return;
      onAddPost({ type: postType, content, images: postImages });
    }
    onClose();
  }

  const titles: Record<ComposerKind, string> = {
    event: "New Event",
    appointment: "New Appointment",
    task: "New Task",
    post: "New Family Update",
  };

  return (
    <ModalShell onClose={onClose} title={titles[type]}>
      {(type === "event" || isAppointment) && (
        <>
          <FieldLabel>{isAppointment ? "What's the appointment?" : "Event name"}</FieldLabel>
          <input
            autoFocus
            placeholder={isAppointment ? "e.g. Pediatrician checkup" : "e.g. Soccer practice"}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={inputStyle}
          />

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <div style={{ flex: 1 }}>
              <FieldLabel>Date</FieldLabel>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={inputStyle}
              />
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                color: "#6B6259",
                paddingTop: 18,
                whiteSpace: "nowrap",
              }}
            >
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
              />
              All day
            </label>
          </div>

          {!allDay && (
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <div style={{ flex: 1 }}>
                <FieldLabel>Start time</FieldLabel>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <FieldLabel>
                  End time <span style={{ fontWeight: 400, color: "#A69C8E" }}>(optional)</span>
                </FieldLabel>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
          )}

          <FieldLabel style={{ marginTop: 12 }}>Location</FieldLabel>
          <input
            placeholder={
              isAppointment ? "e.g. Children's Medical Center" : "e.g. Riverside Field"
            }
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            style={inputStyle}
          />

          <FieldLabel style={{ marginTop: 12 }}>Category</FieldLabel>
          <CategoryPicker value={category} onChange={setCategory} />

          <FieldLabel style={{ marginTop: 12 }}>Who&apos;s involved?</FieldLabel>
          <MemberPicker selected={participants} onToggle={toggleParticipant} />

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <div style={{ flex: 1 }}>
              <FieldLabel>Repeats</FieldLabel>
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value)}
                style={inputStyle}
              >
                {["None", "Daily", "Weekly", "Monthly", "Yearly"].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <FieldLabel>Reminder</FieldLabel>
              <select
                value={reminder}
                onChange={(e) => setReminder(e.target.value)}
                style={inputStyle}
              >
                {[
                  "None",
                  "At time of event",
                  "15 min before",
                  "1 hour before",
                  "1 day before",
                ].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>

          <FieldLabel style={{ marginTop: 12 }}>
            Notes <span style={{ fontWeight: 400, color: "#A69C8E" }}>(optional)</span>
          </FieldLabel>
          <textarea
            placeholder="Anything else worth noting?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
          />
        </>
      )}
      {type === "task" && (
        <>
          <FieldLabel>Title</FieldLabel>
          <input
            autoFocus
            placeholder="e.g. Buy diapers"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={inputStyle}
          />

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <div style={{ flex: 1 }}>
              <FieldLabel>Due date</FieldLabel>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <FieldLabel>
                Due time <span style={{ fontWeight: 400, color: "#A69C8E" }}>(optional)</span>
              </FieldLabel>
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
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
            {TASK_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>

          <FieldLabel style={{ marginTop: 12 }}>Priority</FieldLabel>
          <div style={{ display: "flex", gap: 6 }}>
            {["Low", "Medium", "High"].map((p) => (
              <button key={p} onClick={() => setPriority(p)} style={pillStyle(priority === p)}>
                {p}
              </button>
            ))}
          </div>

          <FieldLabel style={{ marginTop: 12 }}>Assign to</FieldLabel>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={() => setAssignedTo("")} style={pillStyle(assignedTo === "")}>
              Unassigned
            </button>
            {MEMBERS.map((m) => (
              <button
                key={m.id}
                onClick={() => setAssignedTo(m.id)}
                style={pillStyle(assignedTo === m.id)}
              >
                {m.emoji} {m.name}
              </button>
            ))}
          </div>

          <FieldLabel style={{ marginTop: 12 }}>Repeats</FieldLabel>
          <select
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value)}
            style={inputStyle}
          >
            {["None", "Daily", "Weekly", "Monthly"].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>

          {existingEvents && existingEvents.length > 0 && (
            <>
              <FieldLabel style={{ marginTop: 12 }}>
                Link to an event{" "}
                <span style={{ fontWeight: 400, color: "#A69C8E" }}>(optional)</span>
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
            Notes <span style={{ fontWeight: 400, color: "#A69C8E" }}>(optional)</span>
          </FieldLabel>
          <textarea
            placeholder="Anything else worth noting?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
          />
        </>
      )}
      {type === "post" && (
        <>
          <FieldLabel>What do you want to share with the family?</FieldLabel>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 6,
              marginBottom: 4,
            }}
          >
            {[
              { id: "Announcement", emoji: "📢" },
              { id: "Update", emoji: "💬" },
              { id: "Reminder", emoji: "🔔" },
              { id: "Change", emoji: "🔄" },
              { id: "Photo", emoji: "📸" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setPostType(t.id)}
                style={{
                  ...pillStyle(postType === t.id),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "9px 10px",
                }}
              >
                <span>{t.emoji}</span> {t.id}
              </button>
            ))}
          </div>
          <FieldLabel style={{ marginTop: 12 }}>Message</FieldLabel>
          <textarea
            autoFocus
            placeholder="What does your family need to know?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
          />

          <FieldLabel style={{ marginTop: 12 }}>
            Photos <span style={{ fontWeight: 400, color: "#A69C8E" }}>(optional)</span>
          </FieldLabel>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {postImages.map((src, i) => (
              <div
                key={i}
                style={{
                  position: "relative",
                  width: 64,
                  height: 64,
                  borderRadius: 10,
                  overflow: "hidden",
                }}
              >
                <img
                  src={src}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
                <button
                  onClick={() => removeImage(i)}
                  style={{
                    position: "absolute",
                    top: 2,
                    right: 2,
                    background: "rgba(20,17,14,0.65)",
                    border: "none",
                    borderRadius: "50%",
                    width: 18,
                    height: 18,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <X size={10} color="#fff" />
                </button>
              </div>
            ))}
            {postImages.length < 6 && (
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 10,
                  border: "1.5px dashed #E4D9C6",
                  background: "#FFFDF9",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 3,
                  cursor: "pointer",
                  color: "#A69C8E",
                }}
              >
                <Camera size={19} />
                <span style={{ fontSize: 9, fontWeight: 600 }}>Add</span>
              </button>
            )}
          </div>
        </>
      )}
      <button
        onClick={submit}
        style={{
          ...btnStyle,
          width: "100%",
          background: "#E8622C",
          color: "#fff",
          marginTop: 18,
        }}
      >
        Save
      </button>
    </ModalShell>
  );
}
