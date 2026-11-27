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
  hasAccount?: boolean;
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
  title?: string;
  category?: string;
  assignedTo?: MemberId | null;
  priority?: "Low" | "Medium" | "High" | string;
  dueDate?: string;
  dueTime?: string | null;
  notes?: string;
  linkedEventId?: string | null;
  linkedEventTitle?: string | null;
  completed?: boolean;
  completedBy?: MemberId | null;
  completedAt?: string | null;
}

export interface TaskUpdateInput {
  title?: string;
  category?: string;
  assignedTo?: MemberId | null;
  priority?: "Low" | "Medium" | "High" | string;
  dueDate?: string;
  dueTime?: string | null;
  notes?: string;
  recurrence?: RecurrenceFrequency | string | null;
  linkedEventId?: string | null;
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
  linkedEventId?: string | null;
  linkedEventTitle?: string | null;
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

export type NotificationCategory =
  | "wall_post"
  | "wall_comment"
  | "event"
  | "task"
  | "medication"
  | "game";

export type AppTabId = "home" | "manager" | "plan" | "wall" | "games";

export interface NotificationTarget {
  tab: AppTabId;
  entityId?: string | null;
}

export interface FamilyNotification {
  id: string;
  familyId: string;
  recipientId: MemberId;
  actorId: MemberId;
  category: NotificationCategory;
  title: string;
  body: string;
  target: NotificationTarget;
  read: boolean;
  createdAt: string; // ISO 8601 timestamp
}

export type GameTypeId = "tic_tac_toe" | "pool" | "dots_and_boxes";

export type GameMode = "remote" | "pass_and_play";

export type GameStatus =
  | "pending"
  | "active"
  | "completed"
  | "declined"
  | "cancelled";

export type GameOutcome = "win" | "draw" | "forfeit" | null;

export interface GameMoveEntry<TMove = unknown> {
  by: MemberId;
  move: TMove;
  at: string; // ISO 8601 timestamp
}

export interface FamilyGame<TState = Record<string, unknown>> {
  id: string;
  familyId: string;
  gameType: GameTypeId;
  mode: GameMode;
  status: GameStatus;
  challengerId: MemberId;
  opponentId: MemberId;
  /** Ordered as [firstMoverId, secondMoverId]. */
  players: [MemberId, MemberId];
  currentTurnId: MemberId | null;
  winnerId: MemberId | null;
  outcome: GameOutcome;
  state: TState;
  moves: GameMoveEntry[];
  rematchOfId?: string | null;
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
  completedAt?: string | null;
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
  notifications: FamilyNotification[];
  games: FamilyGame[];
  dbConnected?: boolean;
}
