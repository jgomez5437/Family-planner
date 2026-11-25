import {
  Users,
  School,
  Briefcase,
  Stethoscope,
  Trophy,
  Clock,
  Cake,
  PartyPopper,
  MoreHorizontal,
  Home,
  Heart,
  CheckSquare,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import type { Member, MemberId } from "@/types/family";
import type React from "react";

export const CARD_SHADOW = "var(--card-shadow)";

export const MEMBER_COLOR_PALETTES = [
  { name: "Forest", color: "#1F6F5C", light: "#E4F1EC" },
  { name: "Terracotta", color: "#E8622C", light: "#FCE9DF" },
  { name: "Cobalt", color: "#3E6FD9", light: "#E6ECFC" },
  { name: "Plum", color: "#B25CC9", light: "#F3E5F7" },
  { name: "Ochre", color: "#C9972B", light: "#FBF1D9" },
  { name: "Rose", color: "#D94E73", light: "#FDE7EE" },
  { name: "Teal", color: "#1E8898", light: "#E2F4F7" },
  { name: "Slate", color: "#5E6B78", light: "#EAEFF3" },
] as const;

export const MEMBER_EMOJIS = [
  "👩",
  "👨",
  "🧑",
  "👧",
  "👦",
  "🧒",
  "👶",
  "👵",
  "👴",
  "🌟",
  "🐶",
  "🐱",
] as const;

export const FALLBACK_MEMBER: Member = {
  id: "unknown",
  name: "Family Member",
  emoji: "🧑",
  color: "#6B6259",
  light: "#F5EFE3",
};

export function findMemberById(
  id: MemberId | null | undefined,
  membersList: Member[]
): Member {
  if (!id) return membersList[0] || FALLBACK_MEMBER;
  return (
    membersList.find((m) => m.id === id) || {
      ...FALLBACK_MEMBER,
      id,
      name: "Former Member",
    }
  );
}

export const CATEGORY_META: Record<string, { icon: LucideIcon; color: string; bg: string }> = {
  Family:      { icon: Users,          color: "var(--success)",   bg: "var(--success-soft)" },
  School:      { icon: School,         color: "var(--cat-blue)",  bg: "var(--cat-blue-soft)" },
  Work:        { icon: Briefcase,      color: "var(--cat-slate)", bg: "var(--cat-slate-soft)" },
  Medical:     { icon: Stethoscope,    color: "var(--cat-coral)", bg: "var(--cat-coral-soft)" },
  Sports:      { icon: Trophy,         color: "var(--cat-ochre)", bg: "var(--cat-ochre-soft)" },
  Appointment: { icon: Clock,          color: "var(--cat-plum)",  bg: "var(--cat-plum-soft)" },
  Birthday:    { icon: Cake,           color: "var(--cat-coral)", bg: "var(--cat-coral-soft)" },
  Holiday:     { icon: PartyPopper,    color: "var(--success)",   bg: "var(--success-soft)" },
  Other:       { icon: MoreHorizontal, color: "var(--cat-slate)", bg: "var(--cat-slate-soft)" },
};

export const TASK_CATEGORIES = [
  "Household",
  "Shopping",
  "Kids",
  "School",
  "Work",
  "Errands",
  "Medical",
  "Other",
];

export const MED_FREQUENCIES = ["Every day", "Once a week", "As needed"];

export const REACTIONS = ["❤️", "👍", "😂"];
export const REACTION_LABELS: Record<string, string> = {
  "❤️": "Love",
  "👍": "Like",
  "😂": "Haha",
};

export const POST_TYPE_COLORS: Record<string, string> = {
  Announcement: "var(--cat-coral)",
  Update: "var(--cat-blue)",
  Reminder: "var(--cat-ochre)",
  Change: "var(--cat-plum)",
  Photo: "var(--success)",
};

export const POST_TYPE_BG: Record<string, string> = {
  Announcement: "var(--cat-coral-soft)",
  Update: "var(--cat-blue-soft)",
  Reminder: "var(--cat-ochre-soft)",
  Change: "var(--cat-plum-soft)",
  Photo: "var(--success-soft)",
};

export const POST_TYPE_EMOJI: Record<string, string> = {
  Announcement: "📢",
  Update: "💬",
  Reminder: "🔔",
  Change: "🔄",
  Photo: "📸",
};

export const TABS = [
  { id: "home",    label: "Home",        icon: Home },
  { id: "manager", label: "Manager",     icon: Heart },
  { id: "tasks",   label: "Tasks",       icon: CheckSquare },
  { id: "events",  label: "Events",      icon: Clock },
  { id: "wall",    label: "Family Wall", icon: MessageSquare },
];

export const DESKTOP_BREAKPOINT = 900;

export const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "var(--bg-overlay)",
  zIndex: 100,
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
};

export const sheetStyle: React.CSSProperties = {
  background: "var(--bg-app)",
  color: "var(--text-primary)",
  width: "100%",
  maxWidth: 560,
  borderRadius: "22px 22px 0 0",
  padding: "14px 20px calc(20px + env(safe-area-inset-bottom))",
  boxShadow: "var(--sheet-shadow)",
  borderTop: "1px solid var(--border-subtle)",
  animation: "slideUp 0.25s ease",
};

export const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1.5px solid var(--border-default)",
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 14,
  fontFamily: "inherit",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  boxSizing: "border-box",
};

export const btnStyle: React.CSSProperties = {
  border: "none",
  borderRadius: 12,
  padding: "12px 18px",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};

export const iconBtnStyle: React.CSSProperties = {
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
};

export const managerCard: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-subtle)",
  boxShadow: CARD_SHADOW,
  borderRadius: 16,
  padding: 14,
  marginBottom: 10,
};

export const textBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--accent)",
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
  padding: "8px 6px",
  minHeight: 36,
};

export function pillStyle(active: boolean): React.CSSProperties {
  return {
    border: `1.5px solid ${active ? "var(--accent)" : "var(--border-default)"}`,
    background: active ? "var(--accent-soft)" : "var(--bg-surface)",
    color: active ? "var(--accent-ink)" : "var(--text-secondary)",
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
  };
}
