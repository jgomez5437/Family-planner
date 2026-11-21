import {
  pgTable,
  text,
  boolean,
  timestamp,
  jsonb,
  serial,
} from "drizzle-orm/pg-core";
import type {
  EventHistoryEntry,
  EventOverride,
  MemberId,
  TaskOverride,
} from "@/types/family";

export const DEFAULT_FAMILY_ID = "default-family";

export const families = pgTable("families", {
  id: text("id").primaryKey().default(DEFAULT_FAMILY_ID),
  name: text("name").notNull().default("The Martinez Family"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const members = pgTable("members", {
  id: text("id").primaryKey(), // e.g. 'dad', 'mom', 'alex', 'mia'
  familyId: text("family_id")
    .notNull()
    .references(() => families.id, { onDelete: "cascade" })
    .default(DEFAULT_FAMILY_ID),
  name: text("name").notNull(),
  emoji: text("emoji").notNull(),
  color: text("color").notNull(),
  light: text("light").notNull(),
  isChild: boolean("is_child").notNull().default(false),
  email: text("email"), // Reserved for future individual authentication accounts
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const childProfiles = pgTable("child_profiles", {
  kidId: text("kid_id")
    .primaryKey()
    .references(() => members.id, { onDelete: "cascade" }),
  familyId: text("family_id")
    .notNull()
    .references(() => families.id, { onDelete: "cascade" })
    .default(DEFAULT_FAMILY_ID),
  allergies: text("allergies").notNull().default(""),
  doctor: text("doctor").notNull().default(""),
  contact: text("contact").notNull().default(""),
  notes: text("notes").notNull().default(""),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const events = pgTable("events", {
  id: text("id").primaryKey(),
  familyId: text("family_id")
    .notNull()
    .references(() => families.id, { onDelete: "cascade" })
    .default(DEFAULT_FAMILY_ID),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  notes: text("notes").notNull().default(""),
  date: text("date").notNull(), // YYYY-MM-DD
  startTime: text("start_time"),
  endTime: text("end_time"),
  allDay: boolean("all_day").notNull().default(false),
  location: text("location").notNull().default(""),
  category: text("category").notNull().default("Family"),
  participants: jsonb("participants").$type<MemberId[]>().notNull().default([]),
  createdBy: text("created_by").notNull(),
  recurrence: text("recurrence"), // 'Daily' | 'Weekly' | 'Monthly' | 'Yearly' | null
  reminder: text("reminder"),
  overrides: jsonb("overrides")
    .$type<Record<string, EventOverride>>()
    .notNull()
    .default({}),
  exceptions: jsonb("exceptions").$type<string[]>().notNull().default([]),
  history: jsonb("history")
    .$type<EventHistoryEntry[]>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tasks = pgTable("tasks", {
  id: text("id").primaryKey(),
  familyId: text("family_id")
    .notNull()
    .references(() => families.id, { onDelete: "cascade" })
    .default(DEFAULT_FAMILY_ID),
  title: text("title").notNull(),
  category: text("category").notNull().default("Household"),
  assignedTo: text("assigned_to"),
  priority: text("priority").notNull().default("Medium"),
  dueDate: text("due_date").notNull(), // YYYY-MM-DD
  dueTime: text("due_time"),
  notes: text("notes").notNull().default(""),
  completed: boolean("completed").notNull().default(false),
  completedBy: text("completed_by"),
  completedAt: text("completed_at"),
  createdBy: text("created_by").notNull(),
  linkedEventId: text("linked_event_id"),
  linkedEventTitle: text("linked_event_title"),
  recurrence: text("recurrence"),
  overrides: jsonb("overrides")
    .$type<Record<string, TaskOverride>>()
    .notNull()
    .default({}),
  exceptions: jsonb("exceptions").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const medications = pgTable("medications", {
  id: text("id").primaryKey(),
  familyId: text("family_id")
    .notNull()
    .references(() => families.id, { onDelete: "cascade" })
    .default(DEFAULT_FAMILY_ID),
  kidId: text("kid_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  dose: text("dose").notNull(),
  frequency: text("frequency").notNull(), // 'Every day' | 'Once a week' | 'As needed'
  times: jsonb("times").$type<string[]>().notNull().default([]),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  instructions: text("instructions").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const doseLogs = pgTable("dose_logs", {
  key: text("key").primaryKey(), // `${medId}|${date}|${time}`
  familyId: text("family_id")
    .notNull()
    .references(() => families.id, { onDelete: "cascade" })
    .default(DEFAULT_FAMILY_ID),
  medId: text("med_id")
    .notNull()
    .references(() => medications.id, { onDelete: "cascade" }),
  givenBy: text("given_by").notNull(),
  givenAt: text("given_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const posts = pgTable("posts", {
  id: text("id").primaryKey(),
  familyId: text("family_id")
    .notNull()
    .references(() => families.id, { onDelete: "cascade" })
    .default(DEFAULT_FAMILY_ID),
  author: text("author").notNull(),
  type: text("type").notNull().default("Update"),
  content: text("content").notNull().default(""),
  images: jsonb("images").$type<string[]>().notNull().default([]),
  createdAtLabel: text("created_at_label").notNull().default("just now"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const postComments = pgTable("post_comments", {
  id: text("id").primaryKey(),
  postId: text("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  by: text("by").notNull(),
  text: text("text").notNull(),
  at: text("at").notNull().default("just now"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const postReactions = pgTable("post_reactions", {
  id: serial("id").primaryKey(),
  postId: text("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  emoji: text("emoji").notNull(),
  memberId: text("member_id").notNull(),
});

export const activities = pgTable("activities", {
  id: text("id").primaryKey(),
  familyId: text("family_id")
    .notNull()
    .references(() => families.id, { onDelete: "cascade" })
    .default(DEFAULT_FAMILY_ID),
  text: text("text").notNull(),
  sub: text("sub"),
  by: text("by").notNull(),
  at: text("at").notNull().default("just now"),
  targetEventId: text("target_event_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
