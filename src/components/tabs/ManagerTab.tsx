"use client";

import React, { useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  Circle,
  Printer,
  X,
} from "lucide-react";
import {
  btnStyle,
  CARD_SHADOW,
  CATEGORY_META,
  iconBtnStyle,
  inputStyle,
  managerCard,
  MED_FREQUENCIES,
  pillStyle,
  textBtn,
} from "@/lib/constants";
import { useMembers } from "@/components/MembersContext";
import {
  fmtDayLong,
  fmtShortDate,
  fmtTime,
  nowHHMM,
  relativeDay,
  todayISO,
  uid,
} from "@/lib/dates";
import {
  buildSheet,
  buildSheetText,
  dosesFor,
  groupKidSeries,
  medCourseLabel,
  medIsCurrent,
  medWhenLabel,
  nextDose,
  nextDoseLabel,
} from "@/lib/meds";
import { recurrenceLabel } from "@/lib/recurrence";
import type {
  ChildProfile,
  DoseLogEntry,
  DoseLogMap,
  FamilyEvent,
  Medication,
  MemberId,
  ProfilesMap,
  ScheduledDose,
} from "@/types/family";
import {
  AvatarDot,
  EmptyRow,
  EmptyState,
  FieldLabel,
  ModalShell,
  SectionLabel,
} from "@/components/ui/Primitives";

export function DoseChip({
  dose,
  entry,
  onToggle,
}: {
  dose: ScheduledDose;
  entry?: DoseLogEntry;
  onToggle: (dose: ScheduledDose) => void;
}) {
  const { memberById } = useMembers();
  const given = !!entry;
  return (
    <button
      onClick={() => onToggle(dose)}
      aria-pressed={given}
      aria-label={`${dose.med.name} ${fmtTime(dose.time)} dose, ${
        given ? "given. Tap to undo" : "not given yet. Tap to mark as given"
      }`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        minHeight: 36,
        border: `1.5px solid ${given ? "#1F6F5C" : "#E4D9C6"}`,
        background: given ? "#E4F1EC" : "#fff",
        color: given ? "#155C4A" : "#2B2622",
        borderRadius: 999,
        padding: "6px 12px",
        fontSize: 12.5,
        fontWeight: 700,
        cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      {given ? <Check size={13} strokeWidth={3} /> : <Circle size={13} />}
      {fmtTime(dose.time)}
      {given && entry && (
        <span style={{ fontWeight: 500, fontSize: 11 }}>
          · {memberById(entry.by).name}
        </span>
      )}
    </button>
  );
}

export function MedCard({
  med,
  doseLog,
  onToggleDose,
  onEdit,
}: {
  med: Medication;
  doseLog: DoseLogMap;
  onToggleDose: (dose: ScheduledDose) => void;
  onEdit: () => void;
}) {
  const todays = dosesFor(med, todayISO(0));
  const nd = nextDose(med, doseLog);
  return (
    <div style={managerCard}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {med.name}{" "}
            <span style={{ fontWeight: 500, color: "#6B6259" }}>· {med.dose}</span>
          </div>
          <div style={{ fontSize: 12.5, color: "#6B6259", marginTop: 3 }}>
            {medWhenLabel(med)}
          </div>
          {med.instructions && (
            <div
              style={{
                fontSize: 12,
                color: "#8A7F70",
                marginTop: 3,
                fontStyle: "italic",
              }}
            >
              {med.instructions}
            </div>
          )}
        </div>
        <button
          onClick={onEdit}
          style={textBtn}
          aria-label={`Edit ${med.name}`}
        >
          Edit
        </button>
      </div>

      {todays.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              color: "#A69C8E",
              letterSpacing: 0.5,
              marginBottom: 6,
            }}
          >
            TODAY
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {todays.map((d) => (
              <DoseChip
                key={d.key}
                dose={d}
                entry={doseLog[d.key]}
                onToggle={onToggleDose}
              />
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          flexWrap: "wrap",
          marginTop: 10,
          paddingTop: 9,
          borderTop: "1px solid #F3ECE0",
          fontSize: 11.5,
          color: "#948C80",
        }}
      >
        <span>{medCourseLabel(med)}</span>
        {nd && (
          <span
            style={{
              color: nd.overdue ? "#C4402A" : "#948C80",
              fontWeight: nd.overdue ? 700 : 500,
            }}
          >
            Next: {nextDoseLabel(nd)}
          </span>
        )}
      </div>
    </div>
  );
}

function ManagerOverview({
  meds,
  doseLog,
  profiles,
  events,
  onToggleDose,
  onSelectKid,
  onOpenSheet,
  onAddChild,
}: {
  meds: Medication[];
  doseLog: DoseLogMap;
  profiles: ProfilesMap;
  events: FamilyEvent[];
  onToggleDose: (dose: ScheduledDose) => void;
  onSelectKid: (kidId: MemberId) => void;
  onOpenSheet: (kidIds: MemberId[]) => void;
  onAddChild?: () => void;
}) {
  const { childrenMembers, memberById } = useMembers();
  const today = todayISO(0);
  const nowT = nowHHMM();
  const todays = meds
    .flatMap((m) => dosesFor(m, today))
    .sort((a, b) => a.time.localeCompare(b.time));
  const pending = todays.filter((d) => !doseLog[d.key]).length;
  const todayLabel =
    todays.length === 0
      ? "Medications today"
      : pending === 0
        ? "Medications today · all given ✓"
        : `Medications today · ${pending} to go`;

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 4,
        }}
      >
        <div
          style={{
            fontFamily: "'Baloo 2', sans-serif",
            fontSize: 22,
            fontWeight: 700,
          }}
        >
          Family Manager
        </div>
        {childrenMembers.length > 0 && (
          <button
            onClick={() => onOpenSheet(childrenMembers.map((c) => c.id))}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "#fff",
              border: "1.5px solid #EFE4D2",
              borderRadius: 10,
              padding: "8px 12px",
              fontSize: 12.5,
              fontWeight: 700,
              cursor: "pointer",
              color: "#2B2622",
              minHeight: 38,
            }}
          >
            <Printer size={15} /> Caregiver sheet
          </button>
        )}
      </div>
      <div style={{ fontSize: 13, color: "#948C80", marginBottom: 18 }}>
        Who takes what, who has appointments, and what a sitter needs to know.
      </div>

      <SectionLabel text={todayLabel} />
      {todays.length === 0 ? (
        <EmptyRow text="No medications scheduled today." />
      ) : (
        <div
          style={{
            background: "#fff",
            border: "1px solid #F1E8D9",
            boxShadow: CARD_SHADOW,
            borderRadius: 14,
            padding: "2px 14px",
            marginBottom: 10,
          }}
        >
          {todays.map((d, i) => {
            const entry = doseLog[d.key];
            const overdue = !entry && d.time < nowT;
            return (
              <div
                key={d.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 0",
                  borderBottom:
                    i === todays.length - 1 ? "none" : "1px solid #F3ECE0",
                  opacity: entry ? 0.65 : 1,
                }}
              >
                <button
                  onClick={() => onToggleDose(d)}
                  aria-pressed={!!entry}
                  aria-label={`${memberById(d.med.kidId).name}, ${
                    d.med.name
                  } at ${fmtTime(d.time)}: ${
                    entry ? "given. Tap to undo" : "tap to mark as given"
                  }`}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 4,
                    color: entry ? "#1F6F5C" : "#C9BEAC",
                    display: "flex",
                  }}
                >
                  {entry ? (
                    <CheckCircle2 size={24} />
                  ) : (
                    <Circle size={24} />
                  )}
                </button>
                <div
                  style={{
                    width: 62,
                    flexShrink: 0,
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: overdue ? "#C4402A" : "#948C80",
                  }}
                >
                  {fmtTime(d.time)}
                </div>
                <AvatarDot id={d.med.kidId} size={24} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 600,
                      textDecoration: entry ? "line-through" : "none",
                    }}
                  >
                    {memberById(d.med.kidId).name} · {d.med.name}{" "}
                    <span
                      style={{
                        fontWeight: 500,
                        color: "#6B6259",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {d.med.dose}
                    </span>
                  </div>
                  {entry ? (
                    <div
                      style={{
                        fontSize: 11,
                        color: "#1F6F5C",
                        fontWeight: 600,
                      }}
                    >
                      ✓ Given by {memberById(entry.by).name} · {entry.at}
                    </div>
                  ) : overdue ? (
                    <div
                      style={{
                        fontSize: 11,
                        color: "#C4402A",
                        fontWeight: 700,
                      }}
                    >
                      Overdue
                      {d.med.instructions ? ` · ${d.med.instructions}` : ""}
                    </div>
                  ) : d.med.instructions ? (
                    <div style={{ fontSize: 11, color: "#A69C8E" }}>
                      {d.med.instructions}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SectionHeader
        title="Kids"
        action={onAddChild ? "+ Add child" : undefined}
        onAction={onAddChild}
      />
      {childrenMembers.length === 0 ? (
        <EmptyState
          text="No children added yet."
          sub="Add a child profile to track medications, allergies, and caregiver sheets."
          actionLabel={onAddChild ? "+ Add a Child" : undefined}
          onAction={onAddChild}
        />
      ) : (
        childrenMembers.map((kid) => {
          const kidMeds = meds.filter(
            (m) => m.kidId === kid.id && medIsCurrent(m)
          );
          const nextDoses = kidMeds
            .map((m) => nextDose(m, doseLog))
            .filter((d): d is ScheduledDose => d !== null)
            .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
          const nextAppt = groupKidSeries(events, kid.id)[0];
          const allergies = profiles[kid.id]?.allergies;
          return (
            <button
              key={kid.id}
              onClick={() => onSelectKid(kid.id)}
              style={{
                ...managerCard,
                width: "100%",
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <AvatarDot id={kid.id} size={46} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15.5, fontWeight: 700 }}>{kid.name}</div>
                <div style={{ fontSize: 12.5, color: "#6B6259", marginTop: 2 }}>
                  {kidMeds.length === 0
                    ? "No medications"
                    : `${kidMeds.length} medication${kidMeds.length > 1 ? "s" : ""}`}
                  {nextDoses[0] && ` · next ${nextDoseLabel(nextDoses[0])}`}
                </div>
                {nextAppt && (
                  <div style={{ fontSize: 12, color: "#948C80", marginTop: 2 }}>
                    {nextAppt.recurrence ? "🔁 " : ""}
                    {nextAppt.title} · {relativeDay(nextAppt.date)}
                  </div>
                )}
                {allergies && (
                  <div
                    style={{
                      fontSize: 11.5,
                      color: "#C4402A",
                      fontWeight: 600,
                      marginTop: 3,
                    }}
                  >
                    ⚠ Allergies: {allergies}
                  </div>
                )}
              </div>
              <ChevronRightIcon size={18} color="#C9BEAC" />
            </button>
          );
        })
      )}
    </div>
  );
}

function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 20,
        marginBottom: 8,
      }}
    >
      <SectionLabel text={title} style={{ marginBottom: 0 }} />
      {action && (
        <button onClick={onAction} style={textBtn}>
          {action}
        </button>
      )}
    </div>
  );
}

function KidProfile({
  kidId,
  meds,
  doseLog,
  profile,
  events,
  onBack,
  onToggleDose,
  onAddMed,
  onEditMed,
  onEditCare,
  onOpenEvent,
  onAddAppointment,
  onOpenSheet,
}: {
  kidId: MemberId;
  meds: Medication[];
  doseLog: DoseLogMap;
  profile: ChildProfile;
  events: FamilyEvent[];
  onBack: () => void;
  onToggleDose: (dose: ScheduledDose) => void;
  onAddMed: () => void;
  onEditMed: (med: Medication) => void;
  onEditCare: () => void;
  onOpenEvent: (e: FamilyEvent) => void;
  onAddAppointment: () => void;
  onOpenSheet: (kidIds: MemberId[]) => void;
}) {
  const { memberById } = useMembers();
  const kid = memberById(kidId);
  const kidMeds = meds.filter((m) => m.kidId === kidId && medIsCurrent(m));
  const series = groupKidSeries(events, kidId);
  const hasCare = Boolean(
    profile.allergies || profile.doctor || profile.contact || profile.notes
  );

  return (
    <div>
      <button
        onClick={onBack}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 3,
          background: "none",
          border: "none",
          color: "#6B6259",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          padding: "6px 0",
          minHeight: 36,
        }}
      >
        <ChevronLeft size={16} /> Family Manager
      </button>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          margin: "8px 0 14px",
        }}
      >
        <AvatarDot id={kidId} size={56} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "'Baloo 2', sans-serif",
              fontSize: 24,
              fontWeight: 700,
              lineHeight: 1.1,
            }}
          >
            {kid.name}
          </div>
          <div style={{ fontSize: 12.5, color: "#948C80", marginTop: 2 }}>
            {kidMeds.length} medication{kidMeds.length === 1 ? "" : "s"} ·{" "}
            {series.length} upcoming appointment{series.length === 1 ? "" : "s"}
          </div>
        </div>
        <button
          onClick={() => onOpenSheet([kidId])}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "#fff",
            border: "1.5px solid #EFE4D2",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 12.5,
            fontWeight: 700,
            cursor: "pointer",
            color: "#2B2622",
            minHeight: 38,
          }}
        >
          <Printer size={15} /> Care sheet
        </button>
      </div>

      {profile.allergies && (
        <div
          role="note"
          style={{
            background: "#FDECE8",
            border: "1px solid #F3C9BF",
            borderRadius: 12,
            padding: "10px 12px",
            fontSize: 13,
            color: "#8F2F1D",
            fontWeight: 600,
          }}
        >
          ⚠ Allergies: {profile.allergies}
        </div>
      )}

      <SectionHeader
        title="Medications"
        action="+ Add medication"
        onAction={onAddMed}
      />
      {kidMeds.length === 0 ? (
        <EmptyState
          text={`No medications for ${kid.name}.`}
          sub="Add one and it will show up in today's list and on the care sheet."
          actionLabel="Add medication"
          onAction={onAddMed}
        />
      ) : (
        kidMeds.map((m) => (
          <MedCard
            key={m.id}
            med={m}
            doseLog={doseLog}
            onToggleDose={onToggleDose}
            onEdit={() => onEditMed(m)}
          />
        ))
      )}

      <SectionHeader
        title="Appointments & activities"
        action="+ Add"
        onAction={onAddAppointment}
      />
      {series.length === 0 ? (
        <EmptyState
          text={`Nothing scheduled for ${kid.name}.`}
          sub="Add an appointment and pick them as a participant."
          actionLabel="Add appointment"
          onAction={onAddAppointment}
        />
      ) : (
        series.map((e) => {
          const meta = CATEGORY_META[e.category] || CATEGORY_META.Other;
          const Icon = meta.icon;
          return (
            <button
              key={e.id}
              onClick={() => onOpenEvent(e)}
              style={{
                ...managerCard,
                width: "100%",
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 11,
                  background: `${meta.color}15`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon size={17} color={meta.color} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{e.title}</div>
                <div style={{ fontSize: 12, color: "#6B6259", marginTop: 2 }}>
                  {e.recurrence
                    ? `🔁 ${recurrenceLabel(e.recurrence, e.date)} · next `
                    : ""}
                  {fmtDayLong(e.date)}
                  {!e.allDay && e.startTime ? ` · ${fmtTime(e.startTime)}` : ""}
                </div>
                {e.location && (
                  <div
                    style={{ fontSize: 11.5, color: "#A69C8E", marginTop: 1 }}
                  >
                    {e.location}
                  </div>
                )}
              </div>
            </button>
          );
        })
      )}

      <SectionHeader
        title="Care info"
        action={hasCare ? "Edit" : undefined}
        onAction={onEditCare}
      />
      {!hasCare ? (
        <EmptyState
          text="No care info yet."
          sub="Allergies, doctor and notes appear on the care sheet."
          actionLabel="Add care info"
          onAction={onEditCare}
        />
      ) : (
        <div style={managerCard}>
          {(
            [
              ["Allergies", profile.allergies],
              ["Doctor", profile.doctor],
              ["Emergency contact", profile.contact],
              ["Notes", profile.notes],
            ] as const
          ).map(([label, value]) =>
            value ? (
              <div
                key={label}
                style={{
                  padding: "7px 0",
                  borderBottom: "1px solid #F3ECE0",
                }}
              >
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: "#A69C8E",
                    letterSpacing: 0.5,
                  }}
                >
                  {label.toUpperCase()}
                </div>
                <div
                  style={{ fontSize: 13.5, marginTop: 2, lineHeight: 1.4 }}
                >
                  {value}
                </div>
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}

function MedModal({
  kidId,
  med,
  onClose,
  onSave,
  onDelete,
}: {
  kidId: MemberId;
  med: Medication | null;
  onClose: () => void;
  onSave: (med: Medication, isNew: boolean) => void;
  onDelete: () => void;
}) {
  const { memberById } = useMembers();
  const isEdit = !!med;
  const [name, setName] = useState(med?.name || "");
  const [dose, setDose] = useState(med?.dose || "");
  const [frequency, setFrequency] = useState(med?.frequency || "Every day");
  const [times, setTimes] = useState<string[]>(
    med?.times?.length ? med.times : ["08:00"]
  );
  const [startDate, setStartDate] = useState(med?.startDate || todayISO(0));
  const [hasEnd, setHasEnd] = useState(!!med?.endDate);
  const [endDate, setEndDate] = useState(med?.endDate || todayISO(7));
  const [instructions, setInstructions] = useState(med?.instructions || "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const asNeeded = frequency === "As needed";

  function save() {
    if (!name.trim()) return setError("Add the medication name.");
    if (!dose.trim())
      return setError("Add the dose, for example 5 mL or 1 tablet.");
    if (!asNeeded && times.filter(Boolean).length === 0)
      return setError("Add at least one time.");
    if (hasEnd && endDate < startDate)
      return setError("The end date is before the start date.");
    onSave(
      {
        id: med?.id || uid("med"),
        kidId,
        name: name.trim(),
        dose: dose.trim(),
        frequency,
        times: asNeeded ? [] : [...new Set(times.filter(Boolean))].sort(),
        startDate,
        endDate: hasEnd ? endDate : null,
        instructions: instructions.trim(),
      },
      !isEdit
    );
  }

  return (
    <ModalShell
      onClose={onClose}
      title={`${isEdit ? "Edit" : "Add"} medication · ${memberById(kidId).name}`}
    >
      <FieldLabel>Medication</FieldLabel>
      <input
        aria-label="Medication name"
        autoFocus
        placeholder="e.g. Amoxicillin"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={inputStyle}
      />

      <FieldLabel style={{ marginTop: 12 }}>Dose</FieldLabel>
      <input
        aria-label="Dose"
        placeholder="e.g. 5 mL, 1 tablet, 2 puffs"
        value={dose}
        onChange={(e) => setDose(e.target.value)}
        style={inputStyle}
      />

      <FieldLabel style={{ marginTop: 12 }}>How often</FieldLabel>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {MED_FREQUENCIES.map((f) => (
          <button
            key={f}
            onClick={() => setFrequency(f)}
            style={pillStyle(frequency === f)}
          >
            {f}
          </button>
        ))}
      </div>

      {!asNeeded && (
        <>
          <FieldLabel style={{ marginTop: 12 }}>
            Time{times.length > 1 ? "s" : ""} of day
          </FieldLabel>
          {times.map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <input
                type="time"
                aria-label={`Dose time ${i + 1}`}
                value={t}
                onChange={(e) =>
                  setTimes((ts) =>
                    ts.map((x, idx) => (idx === i ? e.target.value : x))
                  )
                }
                style={{ ...inputStyle, flex: 1 }}
              />
              {times.length > 1 && (
                <button
                  onClick={() =>
                    setTimes((ts) => ts.filter((_, idx) => idx !== i))
                  }
                  aria-label="Remove this time"
                  style={{
                    ...iconBtnStyle,
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                  }}
                >
                  <X size={15} />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => setTimes((ts) => [...ts, "20:00"])}
            style={{ ...textBtn, padding: "6px 2px" }}
          >
            + Add another time
          </button>
        </>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <div style={{ flex: 1 }}>
          <FieldLabel>
            {frequency === "Once a week" ? "First dose" : "Starts"}
          </FieldLabel>
          <input
            type="date"
            aria-label="Start date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={inputStyle}
          />
        </div>
        {hasEnd && (
          <div style={{ flex: 1 }}>
            <FieldLabel>Last day</FieldLabel>
            <input
              type="date"
              aria-label="Last day"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={inputStyle}
            />
          </div>
        )}
      </div>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          fontWeight: 600,
          color: "#6B6259",
          marginTop: 10,
          minHeight: 32,
        }}
      >
        <input
          type="checkbox"
          checked={hasEnd}
          onChange={(e) => setHasEnd(e.target.checked)}
        />
        It&apos;s a short course (has a last day)
      </label>

      <FieldLabel style={{ marginTop: 12 }}>
        Instructions{" "}
        <span style={{ fontWeight: 400, color: "#A69C8E" }}>(optional)</span>
      </FieldLabel>
      <input
        aria-label="Instructions"
        placeholder="e.g. Give with food"
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        style={inputStyle}
      />

      {error && (
        <div
          role="alert"
          style={{
            marginTop: 12,
            fontSize: 12.5,
            fontWeight: 600,
            color: "#C4402A",
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
        {isEdit && (
          <button
            onClick={() =>
              confirmDelete ? onDelete() : setConfirmDelete(true)
            }
            style={{
              ...btnStyle,
              background: confirmDelete ? "#C4402A" : "#fff",
              color: confirmDelete ? "#fff" : "#C4402A",
              border: "1.5px solid #F3D9D2",
            }}
          >
            {confirmDelete ? "Tap again to delete" : "Delete"}
          </button>
        )}
        <button
          onClick={save}
          style={{ ...btnStyle, flex: 1, background: "#E8622C", color: "#fff" }}
        >
          {isEdit ? "Save changes" : "Add medication"}
        </button>
      </div>
    </ModalShell>
  );
}

function CareInfoModal({
  kidId,
  profile,
  onClose,
  onSave,
}: {
  kidId: MemberId;
  profile: ChildProfile;
  onClose: () => void;
  onSave: (data: ChildProfile) => void;
}) {
  const { memberById } = useMembers();
  const [allergies, setAllergies] = useState(profile.allergies || "");
  const [doctor, setDoctor] = useState(profile.doctor || "");
  const [contact, setContact] = useState(profile.contact || "");
  const [notes, setNotes] = useState(profile.notes || "");

  return (
    <ModalShell onClose={onClose} title={`Care info · ${memberById(kidId).name}`}>
      <FieldLabel>Allergies</FieldLabel>
      <input
        aria-label="Allergies"
        autoFocus
        placeholder="e.g. Peanuts, bee stings"
        value={allergies}
        onChange={(e) => setAllergies(e.target.value)}
        style={inputStyle}
      />
      <FieldLabel style={{ marginTop: 12 }}>Doctor</FieldLabel>
      <input
        aria-label="Doctor"
        placeholder="Name and practice"
        value={doctor}
        onChange={(e) => setDoctor(e.target.value)}
        style={inputStyle}
      />
      <FieldLabel style={{ marginTop: 12 }}>Emergency contact</FieldLabel>
      <input
        aria-label="Emergency contact"
        placeholder="Name and phone number"
        value={contact}
        onChange={(e) => setContact(e.target.value)}
        style={inputStyle}
      />
      <FieldLabel style={{ marginTop: 12 }}>Notes for caregivers</FieldLabel>
      <textarea
        aria-label="Notes for caregivers"
        rows={3}
        placeholder="Bedtime routine, comfort items, anything a sitter should know"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
      />
      <button
        onClick={() =>
          onSave({
            allergies: allergies.trim(),
            doctor: doctor.trim(),
            contact: contact.trim(),
            notes: notes.trim(),
          })
        }
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

export function ManagerTab({
  meds,
  doseLog,
  profiles,
  events,
  onToggleDose,
  onSaveMed,
  onDeleteMed,
  onSaveProfile,
  onOpenEvent,
  onAddAppointment,
  onOpenSheet,
  onAddChild,
}: {
  meds: Medication[];
  doseLog: DoseLogMap;
  profiles: ProfilesMap;
  events: FamilyEvent[];
  onToggleDose: (dose: ScheduledDose) => void;
  onSaveMed: (med: Medication, isNew: boolean) => void;
  onDeleteMed: (id: string) => void;
  onSaveProfile: (kidId: MemberId, data: ChildProfile) => void;
  onOpenEvent: (e: FamilyEvent) => void;
  onAddAppointment: (kidId: MemberId) => void;
  onOpenSheet: (kidIds: MemberId[]) => void;
  onAddChild?: () => void;
}) {
  const [kidId, setKidId] = useState<MemberId | null>(null);
  const [medModal, setMedModal] = useState<{
    kidId: MemberId;
    med: Medication | null;
  } | null>(null);
  const [careModal, setCareModal] = useState<MemberId | null>(null);

  return (
    <div>
      {kidId ? (
        <KidProfile
          kidId={kidId}
          meds={meds}
          doseLog={doseLog}
          profile={
            profiles[kidId] || {
              allergies: "",
              doctor: "",
              contact: "",
              notes: "",
            }
          }
          events={events}
          onBack={() => setKidId(null)}
          onToggleDose={onToggleDose}
          onAddMed={() => setMedModal({ kidId, med: null })}
          onEditMed={(med) => setMedModal({ kidId, med })}
          onEditCare={() => setCareModal(kidId)}
          onOpenEvent={onOpenEvent}
          onAddAppointment={() => onAddAppointment(kidId)}
          onOpenSheet={onOpenSheet}
        />
      ) : (
        <ManagerOverview
          meds={meds}
          doseLog={doseLog}
          profiles={profiles}
          events={events}
          onToggleDose={onToggleDose}
          onSelectKid={setKidId}
          onOpenSheet={onOpenSheet}
          onAddChild={onAddChild}
        />
      )}

      {medModal && (
        <MedModal
          kidId={medModal.kidId}
          med={medModal.med}
          onClose={() => setMedModal(null)}
          onSave={(m, isNew) => {
            onSaveMed(m, isNew);
            setMedModal(null);
          }}
          onDelete={() => {
            if (medModal.med) onDeleteMed(medModal.med.id);
            setMedModal(null);
          }}
        />
      )}
      {careModal && (
        <CareInfoModal
          kidId={careModal}
          profile={
            profiles[careModal] || {
              allergies: "",
              doctor: "",
              contact: "",
              notes: "",
            }
          }
          onClose={() => setCareModal(null)}
          onSave={(data) => {
            onSaveProfile(careModal, data);
            setCareModal(null);
          }}
        />
      )}
    </div>
  );
}

const sheetTh: React.CSSProperties = {
  textAlign: "left",
  border: "1px solid #999",
  padding: "5px 8px",
  background: "#F2F2F2",
  fontSize: 12,
};

const sheetTd: React.CSSProperties = {
  border: "1px solid #999",
  padding: "5px 8px",
  verticalAlign: "top",
  fontSize: 12.5,
};

const sheetH2: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  margin: "18px 0 6px",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

export function CaregiverSheet({
  initialKidIds,
  meds,
  profiles,
  events,
  doseLog,
  preparedBy,
  onClose,
}: {
  initialKidIds: MemberId[];
  meds: Medication[];
  profiles: ProfilesMap;
  events: FamilyEvent[];
  doseLog: DoseLogMap;
  preparedBy: string;
  onClose: () => void;
}) {
  const { members, childrenMembers, memberById } = useMembers();
  const [kidIds, setKidIds] = useState<MemberId[]>(initialKidIds);
  const [days, setDays] = useState(3);
  const [forWho, setForWho] = useState("");
  const [extra, setExtra] = useState("");
  const [msg, setMsg] = useState("");
  const [showText, setShowText] = useState(false);

  const sections = useMemo(
    () => buildSheet({ kidIds, days, meds, profiles, events, members }),
    [kidIds, days, meds, profiles, events, members]
  );
  const today = todayISO(0);
  const rangeLabel =
    days === 1
      ? `Today, ${fmtDayLong(today)}`
      : `${fmtDayLong(today)} to ${fmtDayLong(todayISO(days - 1))}`;
  const text = buildSheetText(sections, {
    forWho,
    extra,
    preparedBy,
    doseLog,
    rangeLabel,
    members,
  });

  function toggleKid(id: MemberId) {
    setKidIds((ids) => {
      if (ids.includes(id))
        return ids.length > 1 ? ids.filter((x) => x !== id) : ids;
      return childrenMembers
        .map((c) => c.id)
        .filter((c) => c === id || ids.includes(c));
    });
  }

  function doPrint() {
    setMsg("");
    try {
      window.print();
    } catch {
      setMsg(
        "Printing is blocked in this preview. Use Copy text, or open the app in a full browser window."
      );
    }
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      setMsg("Copied. Paste it into a text or email.");
      setShowText(false);
    } catch {
      setMsg("Couldn't copy automatically. Select the text below instead.");
      setShowText(true);
    }
  }

  return (
    <div
      className="sheet-root"
      style={{
        minHeight: "100vh",
        background: "#F5EFE3",
        paddingBottom: 40,
      }}
    >
      <div
        className="no-print"
        style={{
          background: "#FFF9F0",
          borderBottom: "1px solid #EFE4D2",
          padding: "12px 16px",
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <div
          style={{
            maxWidth: 760,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <button
            onClick={onClose}
            style={{ ...iconBtnStyle, width: 38, height: 38 }}
            aria-label="Back to Family Manager"
          >
            <ChevronLeft size={18} />
          </button>
          <div
            style={{
              flex: 1,
              fontFamily: "'Baloo 2', sans-serif",
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            Caregiver sheet
          </div>
          <button
            onClick={copyText}
            style={{
              ...btnStyle,
              background: "#fff",
              border: "1.5px solid #EFE4D2",
              color: "#2B2622",
              padding: "9px 14px",
              fontSize: 13,
            }}
          >
            Copy text
          </button>
          <button
            onClick={doPrint}
            style={{
              ...btnStyle,
              background: "#E8622C",
              color: "#fff",
              padding: "9px 14px",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Printer size={15} /> Print
          </button>
        </div>
      </div>

      <div
        className="no-print"
        style={{ maxWidth: 760, margin: "14px auto 0", padding: "0 16px" }}
      >
        <div
          style={{
            background: "#fff",
            border: "1px solid #F1E8D9",
            boxShadow: CARD_SHADOW,
            borderRadius: 14,
            padding: 14,
          }}
        >
          <FieldLabel>Who&apos;s it for?</FieldLabel>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {childrenMembers.map((c) => (
              <button
                key={c.id}
                onClick={() => toggleKid(c.id)}
                aria-pressed={kidIds.includes(c.id)}
                style={{
                  ...pillStyle(kidIds.includes(c.id)),
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {kidIds.includes(c.id) ? "✓" : ""}
                <AvatarDot id={c.id} size={18} />
                {c.name}
              </button>
            ))}
          </div>
          <FieldLabel style={{ marginTop: 12 }}>How long?</FieldLabel>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(
              [
                [1, "Today"],
                [3, "3 days"],
                [7, "A week"],
              ] as const
            ).map(([n, label]) => (
              <button
                key={n}
                onClick={() => setDays(n)}
                aria-pressed={days === n}
                style={pillStyle(days === n)}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: "1 1 200px" }}>
              <FieldLabel>
                Prepared for{" "}
                <span style={{ fontWeight: 400, color: "#A69C8E" }}>
                  (optional)
                </span>
              </FieldLabel>
              <input
                aria-label="Prepared for"
                placeholder="e.g. Grandma"
                value={forWho}
                onChange={(e) => setForWho(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ flex: "2 1 260px" }}>
              <FieldLabel>
                Extra notes{" "}
                <span style={{ fontWeight: 400, color: "#A69C8E" }}>
                  (optional)
                </span>
              </FieldLabel>
              <input
                aria-label="Extra notes"
                placeholder="e.g. Bedtime is 8:00 PM"
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
          {msg && (
            <div
              role="status"
              style={{
                marginTop: 10,
                fontSize: 12.5,
                fontWeight: 600,
                color: "#6B6259",
              }}
            >
              {msg}
            </div>
          )}
          <div style={{ marginTop: 8, fontSize: 11.5, color: "#A69C8E" }}>
            If Print does nothing, your preview may block printing. Copy text
            works anywhere.
          </div>
          {showText && (
            <textarea
              readOnly
              aria-label="Sheet as plain text"
              value={text}
              rows={8}
              onFocus={(e) => e.target.select()}
              style={{
                ...inputStyle,
                marginTop: 10,
                fontFamily: "monospace",
                fontSize: 12,
              }}
            />
          )}
        </div>
      </div>

      <div
        className="care-sheet"
        style={{
          maxWidth: 760,
          margin: "16px auto 0",
          background: "#fff",
          color: "#111",
          padding: "28px 32px",
          border: "1px solid #E4D9C6",
          borderRadius: 8,
          fontSize: 13,
          lineHeight: 1.45,
        }}
      >
        {sections.map((s, idx) => (
          <div
            key={s.kid.id}
            style={{
              breakAfter: idx < sections.length - 1 ? "page" : "auto",
              pageBreakAfter: idx < sections.length - 1 ? "always" : "auto",
              marginBottom: idx < sections.length - 1 ? 40 : 0,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 1,
                color: "#666",
              }}
            >
              CARE SHEET
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1 }}>
              {s.kid.name}
            </div>
            <div style={{ fontSize: 13, color: "#444", marginTop: 2 }}>
              {rangeLabel}
              {forWho ? ` · Prepared for ${forWho}` : ""}
            </div>

            <div
              style={{
                border: "2px solid #111",
                borderRadius: 6,
                padding: "8px 12px",
                margin: "14px 0 8px",
                fontWeight: 700,
              }}
            >
              ALLERGIES: {s.profile.allergies || "None listed"}
            </div>
            <div style={{ fontSize: 13 }}>
              <strong>Doctor:</strong>{" "}
              {s.profile.doctor || "______________________"}
            </div>
            <div style={{ fontSize: 13 }}>
              <strong>Emergency contact:</strong>{" "}
              {s.profile.contact || "______________________"}
            </div>

            <div style={sheetH2}>Medications</div>
            {s.scheduled.length === 0 && s.asNeeded.length === 0 ? (
              <div style={{ fontSize: 13 }}>No regular medications.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={sheetTh}>Medication</th>
                    <th style={sheetTh}>Dose</th>
                    <th style={sheetTh}>When</th>
                    <th style={sheetTh}>Instructions</th>
                    <th style={sheetTh}>Through</th>
                  </tr>
                </thead>
                <tbody>
                  {[...s.scheduled, ...s.asNeeded].map((m) => (
                    <tr key={m.id}>
                      <td style={{ ...sheetTd, fontWeight: 700 }}>{m.name}</td>
                      <td style={sheetTd}>{m.dose}</td>
                      <td style={sheetTd}>{medWhenLabel(m)}</td>
                      <td style={sheetTd}>{m.instructions || "-"}</td>
                      <td style={sheetTd}>
                        {m.endDate ? fmtShortDate(m.endDate) : "Ongoing"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {s.scheduled.length > 0 && (
              <>
                <div style={sheetH2}>Schedule</div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ ...sheetTh, width: 80 }}>Time</th>
                      <th style={sheetTh}>Medication</th>
                      <th style={sheetTh}>Dose</th>
                      <th style={{ ...sheetTh, width: 170 }}>
                        Given (initials, time)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.schedule.map((day) => (
                      <React.Fragment key={day.date}>
                        <tr>
                          <td
                            colSpan={4}
                            style={{
                              ...sheetTd,
                              background: "#F7F7F7",
                              fontWeight: 800,
                            }}
                          >
                            {fmtDayLong(day.date)}
                            {day.date === today ? " (today)" : ""}
                          </td>
                        </tr>
                        {day.doses.length === 0 ? (
                          <tr>
                            <td colSpan={4} style={{ ...sheetTd, color: "#666" }}>
                              No scheduled doses
                            </td>
                          </tr>
                        ) : (
                          day.doses.map((d) => {
                            const entry = doseLog[d.key];
                            return (
                              <tr key={d.key}>
                                <td style={{ ...sheetTd, fontWeight: 700 }}>
                                  {fmtTime(d.time)}
                                </td>
                                <td style={sheetTd}>{d.med.name}</td>
                                <td style={sheetTd}>{d.med.dose}</td>
                                <td style={sheetTd}>
                                  {entry
                                    ? `✓ ${memberById(entry.by).name} · ${entry.at}`
                                    : "☐  ____________"}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {s.appts.length > 0 && (
              <>
                <div style={sheetH2}>Appointments</div>
                {s.appts.map((e) => (
                  <div key={e.id} style={{ fontSize: 13, marginBottom: 3 }}>
                    <strong>
                      {fmtDayLong(e.date)}
                      {!e.allDay && e.startTime
                        ? `, ${fmtTime(e.startTime)}`
                        : ""}
                    </strong>{" "}
                    · {e.title}
                    {e.location ? ` (${e.location})` : ""}
                  </div>
                ))}
              </>
            )}

            {(s.profile.notes || extra) && (
              <>
                <div style={sheetH2}>Notes</div>
                {s.profile.notes && (
                  <div style={{ fontSize: 13 }}>{s.profile.notes}</div>
                )}
                {extra && (
                  <div style={{ fontSize: 13, marginTop: 4 }}>{extra}</div>
                )}
              </>
            )}

            <div
              style={{
                marginTop: 22,
                paddingTop: 8,
                borderTop: "1px solid #999",
                fontSize: 10.5,
                color: "#555",
              }}
            >
              Prepared by {preparedBy} on{" "}
              {new Date().toLocaleDateString(undefined, {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
              . Medication details are as entered by the family. Follow the
              label and the doctor&apos;s instructions. This sheet is not medical
              advice.
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
