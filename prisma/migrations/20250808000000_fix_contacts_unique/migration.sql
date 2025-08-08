-- Ajuste de unicidade de contatos por usuário
-- Remove índice global único em contacts(number) se existir
DROP INDEX IF EXISTS "contacts_number_key";

-- Garante que o índice de unicidade por usuário já exista (criado em migrações anteriores):
-- CREATE UNIQUE INDEX IF NOT EXISTS "contacts_user_id_number_key" ON "contacts"("user_id", "number");


