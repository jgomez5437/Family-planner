"use client";

import React from "react";
import { Calendar, Camera, CheckSquare, Stethoscope } from "lucide-react";
import { CARD_SHADOW, overlayStyle, sheetStyle } from "@/lib/constants";

export type ComposerKind = "event" | "task" | "appointment" | "post";

export function QuickAddSheet({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (type: ComposerKind) => void;
}) {
  const options: {
    id: ComposerKind;
    label: string;
    icon: typeof Calendar;
    color: string;
  }[] = [
    { id: "event", label: "Event", icon: Calendar, color: "#3E6FD9" },
    { id: "task", label: "Task", icon: CheckSquare, color: "#1F6F5C" },
    { id: "appointment", label: "Appointment", icon: Stethoscope, color: "#E8622C" },
    { id: "post", label: "Family Update", icon: Camera, color: "#B25CC9" },
  ];
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...sheetStyle }} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            width: 36,
            height: 4,
            background: "#E4D9C6",
            borderRadius: 4,
            margin: "0 auto 16px",
          }}
        />
        <div
          style={{
            fontFamily: "'Baloo 2', sans-serif",
            fontSize: 17,
            fontWeight: 700,
            marginBottom: 14,
          }}
        >
          What do you want to add?
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {options.map((o) => (
            <button
              key={o.id}
              onClick={() => onSelect(o.id)}
              style={{
                border: "1px solid #F1E8D9",
                boxShadow: CARD_SHADOW,
                background: "#FFFDF9",
                borderRadius: 16,
                padding: "18px 10px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: `${o.color}15`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <o.icon size={22} color={o.color} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{o.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
