import { sql } from "drizzle-orm";
import {
  boolean,
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
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

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
  kind: text("kind", { enum: ["doc", "board", "whiteboard"] }).notNull().default("doc"),
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

export const docVersion = pgTable("doc_version", {
  id: serial("id").primaryKey(),
  documentId: text("document_id").notNull().references(() => document.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  label: text("label").notNull(),
  // Yjs update (Y.encodeStateAsUpdate) at the moment of saving
  state: bytea("state").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const docComment = pgTable("doc_comment", {
  id: serial("id").primaryKey(),
  documentId: text("document_id").notNull().references(() => document.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  quote: text("quote"),
  body: text("body").notNull(),
  resolved: boolean("resolved").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------- Shared platform ----------

// Uploaded files. Bytes live in Postgres so every service (knowledge, worker) can read them without a shared disk.
export const file = pgTable("file", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  app: text("app").notNull(),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  data: bytea("data").notNull(),
  status: text("status", { enum: ["uploaded", "processing", "ready", "failed"] }).notNull().default("uploaded"),
  error: text("error"),
  pages: integer("pages"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Text chunks for retrieval (Postgres full-text search; 'simple' config keeps Indic words intact).
export const chunk = pgTable(
  "chunk",
  {
    id: serial("id").primaryKey(),
    fileId: text("file_id").notNull().references(() => file.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    page: integer("page"),
    content: text("content").notNull(),
    tsv: tsvector("tsv").generatedAlwaysAs(sql`to_tsvector('simple', "content")`),
  },
  (t) => [index("chunk_tsv_idx").using("gin", t.tsv), index("chunk_user_idx").on(t.userId)],
);

export const notification = pgTable(
  "notification",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    app: text("app").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("notification_user_idx").on(t.userId, t.createdAt)],
);

// What people did (feeds, presence). Inserts fire NOTIFY 'activity' for live streams.
export const activity = pgTable("activity", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  actor: text("actor"),
  app: text("app").notNull(),
  verb: text("verb").notNull(),
  target: text("target"),
  meta: jsonb("meta").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Security-relevant changes, for the admin view.
export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  app: text("app").notNull(),
  action: text("action").notNull(),
  target: text("target"),
  meta: jsonb("meta").$type<Record<string, unknown>>(),
  ip: text("ip"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Product analytics events.
export const event = pgTable(
  "event",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    app: text("app").notNull(),
    name: text("name").notNull(),
    props: jsonb("props").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("event_created_idx").on(t.createdAt)],
);

export const pushSubscription = pgTable("push_subscription", {
  endpoint: text("endpoint").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  keys: jsonb("keys").$type<{ p256dh: string; auth: string }>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const payment = pgTable("payment", {
  id: text("id").primaryKey(), // Razorpay order id
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  app: text("app").notNull(),
  amount: integer("amount").notNull(), // paise
  currency: text("currency").notNull().default("INR"),
  status: text("status", { enum: ["created", "paid", "failed"] }).notNull().default("created"),
  paymentId: text("payment_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
