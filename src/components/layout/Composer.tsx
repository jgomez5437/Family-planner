"use client";

import React, { useRef, useState } from "react";
import { Camera, Crop, X } from "lucide-react";
import {
  btnStyle,
  inputStyle,
  pillStyle,
  TASK_CATEGORIES,
} from "@/lib/constants";
import { todayISO } from "@/lib/dates";
import {
  compressWallPhoto,
  isLikelyImageFile,
  type ImageTransformState,
} from "@/lib/images";
import { useMembers } from "@/components/MembersContext";
import type { FamilyEvent, FamilyTask, MemberId } from "@/types/family";
import {
  AvatarDot,
  CategoryPicker,
  FieldLabel,
  MemberPicker,
  ModalShell,
} from "@/components/ui/Primitives";
import {
  ImageCropModal,
  type ImageCropResult,
} from "@/components/ui/ImageCropModal";
import type { ComposerKind } from "./QuickAddSheet";

interface DraftPostImage {
  id: string;
  dataUrl: string;
  source: File | string;
  transform?: ImageTransformState;
}

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
  onAddPost: (post: {
    type: string;
    content: string;
    images: string[];
  }) => Promise<string | null>;
  initialDate?: string | null;
  existingEvents?: FamilyEvent[];
  initialParticipants?: MemberId[];
  initialPostType?: string;
}) {
  const { members } = useMembers();
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
  const [postImages, setPostImages] = useState<DraftPostImage[]>([]);
  const [cropQueue, setCropQueue] = useState<File[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [processingPhotos, setProcessingPhotos] = useState(0);
  const [saving, setSaving] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function toggleParticipant(id: MemberId) {
    setParticipants((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  function handleFiles(fileList: FileList | null) {
    const remainingSlots = Math.max(0, 6 - postImages.length - cropQueue.length);
    const selected = Array.from(fileList || []).slice(0, remainingSlots);
    if (selected.length === 0) return;

    const validFiles = selected.filter(isLikelyImageFile);
    if (validFiles.length === 0) {
      setPostError("Please select an image file (JPEG, PNG, or WebP).");
      return;
    }

    setPostError(
      validFiles.length < selected.length
        ? "Some files were skipped because they are not supported images."
        : null
    );
    setQueueTotal(validFiles.length);
    setCropQueue(validFiles);
  }

  function handleCropApply(result: ImageCropResult) {
    if (editingIndex !== null) {
      setPostImages((imgs) =>
        imgs.map((item, idx) =>
          idx === editingIndex
            ? { ...item, dataUrl: result.dataUrl, transform: result.transform }
            : item
        )
      );
      setEditingIndex(null);
      return;
    }

    const currentFile = cropQueue[0];
    if (!currentFile) return;

    const nextId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setPostImages((imgs) =>
      imgs.length < 6
        ? [
            ...imgs,
            {
              id: nextId,
              dataUrl: result.dataUrl,
              source: currentFile,
              transform: result.transform,
            },
          ]
        : imgs
    );
    setCropQueue((q) => {
      const next = q.slice(1);
      if (next.length === 0) setQueueTotal(0);
      return next;
    });
  }

  function handleCropCancel() {
    if (editingIndex !== null) {
      setEditingIndex(null);
      return;
    }
    setCropQueue([]);
    setQueueTotal(0);
  }

  async function handleAutoFitRest() {
    const remaining = [...cropQueue];
    setCropQueue([]);
    setQueueTotal(0);
    if (remaining.length === 0) return;

    setPostError(null);
    setProcessingPhotos((count) => count + remaining.length);

    const failures: string[] = [];
    for (const file of remaining) {
      try {
        const compressed = await compressWallPhoto(file);
        const nextId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setPostImages((imgs) =>
          imgs.length < 6
            ? [...imgs, { id: nextId, dataUrl: compressed, source: file }]
            : imgs
        );
      } catch (err) {
        failures.push(
          err instanceof Error ? err.message : `Could not process "${file.name}".`
        );
      } finally {
        setProcessingPhotos((count) => Math.max(0, count - 1));
      }
    }

    if (failures.length > 0) {
      setPostError(failures[0]);
    }
  }

  function removeImage(i: number) {
    setPostError(null);
    setPostImages((imgs) => imgs.filter((_, idx) => idx !== i));
  }

  async function submit() {
    if (saving || processingPhotos > 0) return;

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
      onClose();
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
      onClose();
    } else if (type === "post") {
      if (!content.trim() && postImages.length === 0) {
        setPostError("Please write a message or add a photo.");
        return;
      }
      setPostError(null);
      setSaving(true);
      const err = await onAddPost({
        type: postType,
        content,
        images: postImages.map((img) => img.dataUrl),
      });
      setSaving(false);
      if (err) {
        setPostError(err);
        return;
      }
      onClose();
    }
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
            {postImages.map((img, i) => (
              <div
                key={img.id}
                style={{
                  position: "relative",
                  width: 68,
                  height: 68,
                  borderRadius: 10,
                  overflow: "hidden",
                  border: "1px solid #EFE4D2",
                }}
              >
                <button
                  type="button"
                  onClick={() => setEditingIndex(i)}
                  aria-label={`Adjust photo ${i + 1}`}
                  title="Tap to zoom or reposition"
                  style={{
                    width: "100%",
                    height: "100%",
                    padding: 0,
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    display: "block",
                  }}
                >
                  <img
                    src={img.dataUrl}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingIndex(i)}
                  aria-label={`Edit framing for photo ${i + 1}`}
                  title="Edit framing"
                  style={{
                    position: "absolute",
                    bottom: 3,
                    left: 3,
                    background: "rgba(20,17,14,0.72)",
                    border: "none",
                    borderRadius: 6,
                    padding: "2px 5px",
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                    cursor: "pointer",
                    color: "#fff",
                    fontSize: 9.5,
                    fontWeight: 700,
                  }}
                >
                  <Crop size={9} color="#fff" /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  aria-label={`Remove photo ${i + 1}`}
                  style={{
                    position: "absolute",
                    top: 3,
                    right: 3,
                    background: "rgba(20,17,14,0.68)",
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
            {postImages.length + processingPhotos + cropQueue.length < 6 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving}
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: 10,
                  border: "1.5px dashed #E4D9C6",
                  background: "#FFFDF9",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 3,
                  cursor: saving ? "default" : "pointer",
                  color: "#A69C8E",
                }}
              >
                <Camera size={19} />
                <span style={{ fontSize: 9, fontWeight: 600 }}>Add</span>
              </button>
            )}
          </div>
          {postImages.length > 0 && (
            <div style={{ fontSize: 11.5, color: "#8A7F70", marginTop: 6 }}>
              Tap any photo to zoom or adjust its framing before posting.
            </div>
          )}
          {processingPhotos > 0 && (
            <div style={{ fontSize: 12, color: "#8A7F70", marginTop: 8 }}>
              Optimizing {processingPhotos} photo
              {processingPhotos === 1 ? "" : "s"}…
            </div>
          )}
          {postError && (
            <div
              role="alert"
              style={{
                marginTop: 10,
                background: "#FCE9DF",
                border: "1px solid #F2C4AF",
                color: "#B23A1D",
                borderRadius: 10,
                padding: "8px 10px",
                fontSize: 12.5,
                fontWeight: 600,
              }}
            >
              {postError}
            </div>
          )}
        </>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={saving || processingPhotos > 0}
        style={{
          ...btnStyle,
          width: "100%",
          background: "#E8622C",
          color: "#fff",
          marginTop: 18,
          opacity: saving || processingPhotos > 0 ? 0.65 : 1,
          cursor: saving || processingPhotos > 0 ? "default" : "pointer",
        }}
      >
        {saving
          ? "Posting..."
          : processingPhotos > 0
            ? "Processing photos..."
            : "Save"}
      </button>

      {editingIndex !== null && postImages[editingIndex] && (
        <ImageCropModal
          mode="wall"
          source={postImages[editingIndex].source}
          initialTransform={postImages[editingIndex].transform}
          defaultAspectKey={postImages.length > 1 ? "1:1" : "4:3"}
          onCancel={handleCropCancel}
          onApply={handleCropApply}
        />
      )}

      {editingIndex === null && cropQueue.length > 0 && (
        <ImageCropModal
          mode="wall"
          source={cropQueue[0]}
          defaultAspectKey={
            postImages.length + cropQueue.length > 1 ? "1:1" : "4:3"
          }
          queueInfo={
            queueTotal > 1
              ? {
                  current: queueTotal - cropQueue.length + 1,
                  total: queueTotal,
                  onAutoFitRest: handleAutoFitRest,
                }
              : undefined
          }
          onCancel={handleCropCancel}
          onApply={handleCropApply}
        />
      )}
    </ModalShell>
  );
}
