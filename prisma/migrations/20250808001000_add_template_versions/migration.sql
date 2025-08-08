-- Criação de tabela para versionamento de templates
CREATE TABLE IF NOT EXISTS "template_versions" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "template_id" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "author_id" INTEGER,
  CONSTRAINT "template_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

