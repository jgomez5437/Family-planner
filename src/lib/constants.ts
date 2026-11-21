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

export const CARD_SHADOW = "0 1px 2px rgba(74,50,24,0.05), 0 6px 18px rgba(74,50,24,0.06)";

export const MEMBERS: Member[] = [
  { id: "dad",  name: "Dad",  emoji: "👨", color: "#1F6F5C", light: "#E4F1EC" },
  { id: "mom",  name: "Mom",  emoji: "👩", color: "#E8622C", light: "#FCE9DF" },
  { id: "alex", name: "Alex", emoji: "👦", color: "#3E6FD9", light: "#E6ECFC", isChild: true },
  { id: "mia",  name: "Mia",  emoji: "👧", color: "#B25CC9", light: "#F3E5F7", isChild: true },
];

export const CHILDREN = MEMBERS.filter((m) => m.isChild);

export const memberById = (id?: MemberId | null): Member =>
  MEMBERS.find((m) => m.id === id) || MEMBERS[0];

export const CATEGORY_META: Record<string, { icon: LucideIcon; color: string }> = {
  Family:      { icon: Users,          color: "#1F6F5C" },
  School:      { icon: School,         color: "#3E6FD9" },
  Work:        { icon: Briefcase,      color: "#6B6259" },
  Medical:     { icon: Stethoscope,    color: "#E8622C" },
  Sports:      { icon: Trophy,         color: "#C9972B" },
  Appointment: { icon: Clock,          color: "#B25CC9" },
  Birthday:    { icon: Cake,           color: "#E8622C" },
  Holiday:     { icon: PartyPopper,    color: "#1F6F5C" },
  Other:       { icon: MoreHorizontal, color: "#6B6259" },
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
  Announcement: "#E8622C",
  Update: "#3E6FD9",
  Reminder: "#C9972B",
  Change: "#B25CC9",
  Photo: "#1F6F5C",
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
  background: "rgba(43,38,34,0.42)",
  zIndex: 100,
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
};

export const sheetStyle: React.CSSProperties = {
  background: "#FFF9F0",
  width: "100%",
  maxWidth: 560,
  borderRadius: "22px 22px 0 0",
  padding: "14px 20px calc(20px + env(safe-area-inset-bottom))",
  boxShadow: "0 -8px 30px rgba(0,0,0,0.2)",
  animation: "slideUp 0.25s ease",
};

export const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1.5px solid #EFE4D2",
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 14,
  fontFamily: "inherit",
  background: "#fff",
  color: "#2B2622",
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
  background: "#F5EFE3",
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
  background: "#fff",
  border: "1px solid #F1E8D9",
  boxShadow: CARD_SHADOW,
  borderRadius: 16,
  padding: 14,
  marginBottom: 10,
};

export const textBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#E8622C",
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
  padding: "8px 6px",
  minHeight: 36,
};

export function pillStyle(active: boolean): React.CSSProperties {
  return {
    border: `1.5px solid ${active ? "#E8622C" : "#EFE4D2"}`,
    background: active ? "#FCE9DF" : "#fff",
    color: active ? "#B24A1D" : "#6B6259",
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
  };
}
