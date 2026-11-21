export type MemberId = string;

export type MemberRole = "admin" | "adult" | "child";

export interface Member {
  id: MemberId;
  name: string;
  emoji: string;
  avatarUrl?: string | null;
  color: string;
  light: string;
  isChild?: boolean;
  role?: MemberRole;
  email?: string | null;
}

export type EventCategory =
  | "Family"
  | "School"
  | "Work"
  | "Medical"
  | "Sports"
  | "Appointment"
  | "Birthday"
  | "Holiday"
  | "Other";

export type RecurrenceFrequency = "Daily" | "Weekly" | "Monthly" | "Yearly";

export interface EventHistoryEntry {
  by: MemberId;
  at: string;
  note: string;
  reason?: string;
}

export interface EventOverride {
  startTime?: string | null;
  endTime?: string | null;
  location?: string;
  title?: string;
  description?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface FamilyEvent {
  id: string;
  masterId?: string;
  occurrenceDate?: string;
  isRecurring?: boolean;
  title: string;
  description?: string;
  notes?: string;
  date: string; // YYYY-MM-DD
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  location: string;
  category: EventCategory | string;
  participants: MemberId[];
  createdBy: MemberId;
  recurrence?: RecurrenceFrequency | string | null;
  reminder?: string | null;
  overrides?: Record<string, EventOverride>;
  exceptions?: string[];
  history: EventHistoryEntry[];
}

export interface TaskOverride {
  completed?: boolean;
  completedBy?: MemberId | null;
  completedAt?: string | null;
}

export interface FamilyTask {
  id: string;
  masterId?: string;
  occurrenceDate?: string;
  isRecurring?: boolean;
  title: string;
  category: string;
  assignedTo: MemberId | null;
  priority: "Low" | "Medium" | "High" | string;
  dueDate: string;
  dueTime?: string | null;
  notes?: string;
  completed: boolean;
  completedBy?: MemberId | null;
  completedAt?: string | null;
  createdBy: MemberId;
  linkedEventId?: string;
  linkedEventTitle?: string;
  recurrence?: RecurrenceFrequency | string | null;
  overrides?: Record<string, TaskOverride>;
  exceptions?: string[];
}

export type MedFrequency = "Every day" | "Once a week" | "As needed";

export interface Medication {
  id: string;
  kidId: MemberId;
  name: string;
  dose: string;
  frequency: MedFrequency | string;
  times: string[];
  startDate: string;
  endDate: string | null;
  instructions: string;
}

export interface ScheduledDose {
  med: Medication;
  date: string;
  time: string;
  key: string;
  overdue?: boolean;
}

export interface DoseLogEntry {
  by: MemberId;
  at: string;
}

export type DoseLogMap = Record<string, DoseLogEntry>;

export interface ChildProfile {
  allergies: string;
  doctor: string;
  contact: string;
  notes: string;
}

export type ProfilesMap = Record<MemberId, ChildProfile>;

export type PostType = "Announcement" | "Update" | "Reminder" | "Change" | "Photo";

export interface PostComment {
  id: string;
  by: MemberId;
  text: string;
  at: string;
}

export interface WallPost {
  id: string;
  author: MemberId;
  type: PostType | string;
  content: string;
  images: string[];
  createdAt: string;
  reactions: Record<string, MemberId[]>;
  comments: PostComment[];
}

export interface ActivityItem {
  id: string;
  text: string;
  sub?: string | null;
  by: MemberId;
  at: string;
  target?: FamilyEvent | null;
  targetEventId?: string | null;
}

export interface FamilyStatePayload {
  familyId: string;
  familyName: string;
  inviteCode: string;
  currentUser: Member;
  members: Member[];
  events: FamilyEvent[];
  tasks: FamilyTask[];
  posts: WallPost[];
  activity: ActivityItem[];
  meds: Medication[];
  doseLog: DoseLogMap;
  profiles: ProfilesMap;
  dbConnected?: boolean;
}
