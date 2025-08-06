-- CreateTable
CREATE TABLE "chip_contact_map" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "contact_number" TEXT NOT NULL,
    "chip_id" TEXT NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "plan_id" INTEGER NOT NULL DEFAULT 1,
    "messages_sent" INTEGER NOT NULL DEFAULT 0,
    "reset_date" DATETIME,
    "mercadopago_subscription_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_users" ("created_at", "email", "id", "mercadopago_subscription_id", "messages_sent", "password", "plan_id", "reset_date") SELECT "created_at", "email", "id", "mercadopago_subscription_id", "messages_sent", "password", "plan_id", "reset_date" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "chip_contact_map_contact_number_chip_id_key" ON "chip_contact_map"("contact_number", "chip_id");
