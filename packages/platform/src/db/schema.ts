import {
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

// Shared better-auth tables: one account works across all four apps.
export * from "./auth-schema";

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

// ---------- Kestrel (finance risk) ----------
export const riskCase = pgTable(
  "risk_case",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    reference: text("reference").notNull(),
    input: jsonb("input").$type<Record<string, number>>().notNull(),
    score: real("score").notNull(),
    contributions: jsonb("contributions")
      .$type<{ feature: string; value: number; contribution: number }[]>()
      .notNull(),
    summary: text("summary"),
    status: text("status", { enum: ["open", "escalated", "cleared"] }).notNull().default("open"),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("risk_case_user_idx").on(t.userId, t.createdAt)],
);

// ---------- Boli (Bhashini voice assistant) ----------
export const conversation = pgTable("conversation", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  language: text("language").notNull(),
  domain: text("domain").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const utterance = pgTable("utterance", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversation.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  textNative: text("text_native").notNull(),
  textEnglish: text("text_english"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------- Onboard (on-device AI) ----------
// Only metadata is stored. Frames never leave the device.
export const detectionRun = pgTable("detection_run", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  task: text("task").notNull(),
  model: text("model").notNull(),
  backend: text("backend").notNull(),
  latencyMs: real("latency_ms").notNull(),
  labels: jsonb("labels").$type<{ label: string; score: number }[]>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------- Margin (collaborative editor) ----------
export const document = pgTable("document", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Untitled"),
  // Yjs state, written by services/collab
  ydoc: bytea("ydoc"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const documentMember = pgTable(
  "document_member",
  {
    documentId: text("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["editor", "viewer"] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.documentId, t.userId] })],
);
