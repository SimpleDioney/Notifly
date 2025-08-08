-- Segmentos, Tags, Auditoria, Carteira, Shortlinks, 2FA, reputação de chip, API Keys avançado

ALTER TABLE "users" ADD COLUMN "whatsapp_number" TEXT;
ALTER TABLE "users" ADD COLUMN "two_factor_enabled" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "wallet_balance" REAL NOT NULL DEFAULT 0;

ALTER TABLE "plans" ADD COLUMN "allow_overage" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "plans" ADD COLUMN "overage_price" REAL;

ALTER TABLE "numbers_pool" ADD COLUMN "success_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "numbers_pool" ADD COLUMN "failure_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "numbers_pool" ADD COLUMN "reputation_score" REAL NOT NULL DEFAULT 1.0;

ALTER TABLE "contacts" ADD COLUMN "attributes" TEXT; -- JSON armazenado como TEXT no SQLite

CREATE TABLE IF NOT EXISTS "tags" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "user_id" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  CONSTRAINT "tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "tags_user_id_name_key" ON "tags" ("user_id", "name");

CREATE TABLE IF NOT EXISTS "contact_tags" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "contact_id" INTEGER NOT NULL,
  "tag_id" INTEGER NOT NULL,
  CONSTRAINT "contact_tags_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contact_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "contact_tags_contact_id_tag_id_key" ON "contact_tags" ("contact_id", "tag_id");

CREATE TABLE IF NOT EXISTS "segments" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "user_id" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "filter" TEXT,
  CONSTRAINT "segments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "segments_user_id_name_key" ON "segments" ("user_id", "name");

CREATE TABLE IF NOT EXISTS "segment_members" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "segment_id" INTEGER NOT NULL,
  "contact_id" INTEGER NOT NULL,
  CONSTRAINT "segment_members_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "segments" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "segment_members_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "segment_members_segment_id_contact_id_key" ON "segment_members" ("segment_id", "contact_id");

ALTER TABLE "api_keys" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "api_keys" ADD COLUMN "valid_from" DATETIME;
ALTER TABLE "api_keys" ADD COLUMN "valid_to" DATETIME;
ALTER TABLE "api_keys" ADD COLUMN "allowed_ips" TEXT;

CREATE TABLE IF NOT EXISTS "two_factor_codes" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "user_id" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "expires_at" DATETIME NOT NULL,
  "used_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "two_factor_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "two_factor_codes_user_id_idx" ON "two_factor_codes" ("user_id");

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "user_id" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "metadata" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "audit_logs_user_id_action_idx" ON "audit_logs" ("user_id", "action");

CREATE TABLE IF NOT EXISTS "wallet_transactions" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "user_id" INTEGER NOT NULL,
  "amount" REAL NOT NULL,
  "type" TEXT NOT NULL,
  "reason" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wallet_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "wallet_transactions_user_id_created_at_idx" ON "wallet_transactions" ("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "short_links" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "user_id" INTEGER NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "target_url" TEXT NOT NULL,
  "clicks" INTEGER NOT NULL DEFAULT 0,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "short_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

