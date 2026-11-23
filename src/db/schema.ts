import { boolean, integer, jsonb, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

/** One row per match (local or online). `state` is the authoritative Game Core snapshot. */
export const games = pgTable("games", {
  code: varchar("code", { length: 8 }).primaryKey(),
  mode: varchar("mode", { length: 12 }).notNull(), // local | online
  status: varchar("status", { length: 12 }).notNull(), // lobby | playing | finished
  isPublic: boolean("is_public").notNull().default(false),
  ruleKey: varchar("rule_key", { length: 16 }).notNull().default("bharat"),
  lobby: jsonb("lobby"),
  state: jsonb("state"),
  seats: jsonb("seats").$type<(string | null)[]>().notNull().default([]),
  seedCommit: text("seed_commit"),
  seedReveal: text("seed_reveal"),
  seq: integer("seq").notNull().default(0),
  resultRecorded: boolean("result_recorded").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Append-only command/event log: enables replay and audit. */
export const gameEvents = pgTable("game_events", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 8 }).notNull(),
  seq: integer("seq").notNull(),
  actor: integer("actor").notNull(),
  command: jsonb("command").notNull(),
  events: jsonb("events").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const matchResults = pgTable("match_results", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 8 }).notNull(),
  winner: text("winner").notNull(),
  winnerKind: varchar("winner_kind", { length: 8 }).notNull(),
  reason: text("reason").notNull(),
  rounds: integer("rounds").notNull(),
  ruleKey: varchar("rule_key", { length: 16 }).notNull(),
  players: jsonb("players").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
