-- CreateTable
CREATE TABLE "contacts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "contact_lists" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "contact_lists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_ContactToList" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_ContactToList_A_fkey" FOREIGN KEY ("A") REFERENCES "contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ContactToList_B_fkey" FOREIGN KEY ("B") REFERENCES "contact_lists" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "contacts_number_key" ON "contacts"("number");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_user_id_number_key" ON "contacts"("user_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "contact_lists_user_id_name_key" ON "contact_lists"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "_ContactToList_AB_unique" ON "_ContactToList"("A", "B");

-- CreateIndex
CREATE INDEX "_ContactToList_B_index" ON "_ContactToList"("B");
