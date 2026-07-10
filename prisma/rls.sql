-- DocFlow Row Level Security (RLS)
-- Apply after: npx prisma db push
-- Run with: psql "$DATABASE_URL" -f prisma/rls.sql
--
-- App uses Prisma ORM scoping as the primary tenant isolation layer.
-- These policies add defense-in-depth when connecting with a restricted DB role.
-- The application role should SET app.current_user_id = '<userId>' per request
-- (optional enhancement). For the assignment, Prisma membership checks are enforced
-- in every API route via requireDocumentAccess().

ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Operation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentVersion" ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running
DROP POLICY IF EXISTS document_member_access ON "Document";
DROP POLICY IF EXISTS document_member_select ON "DocumentMember";
DROP POLICY IF EXISTS operation_member_access ON "Operation";
DROP POLICY IF EXISTS version_member_access ON "DocumentVersion";

-- Documents: only members can see/update
CREATE POLICY document_member_access ON "Document"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "DocumentMember" m
      WHERE m."documentId" = "Document".id
        AND m."userId" = current_setting('app.current_user_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "DocumentMember" m
      WHERE m."documentId" = "Document".id
        AND m."userId" = current_setting('app.current_user_id', true)
        AND m.role IN ('OWNER', 'EDITOR')
    )
  );

-- Memberships: members can read; owners manage via app layer
CREATE POLICY document_member_select ON "DocumentMember"
  FOR SELECT
  USING (
    "userId" = current_setting('app.current_user_id', true)
    OR EXISTS (
      SELECT 1 FROM "DocumentMember" m
      WHERE m."documentId" = "DocumentMember"."documentId"
        AND m."userId" = current_setting('app.current_user_id', true)
    )
  );

-- Operations: only document members
CREATE POLICY operation_member_access ON "Operation"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "DocumentMember" m
      WHERE m."documentId" = "Operation"."documentId"
        AND m."userId" = current_setting('app.current_user_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "DocumentMember" m
      WHERE m."documentId" = "Operation"."documentId"
        AND m."userId" = current_setting('app.current_user_id', true)
        AND m.role IN ('OWNER', 'EDITOR')
    )
  );

-- Versions: only document members
CREATE POLICY version_member_access ON "DocumentVersion"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "DocumentMember" m
      WHERE m."documentId" = "DocumentVersion"."documentId"
        AND m."userId" = current_setting('app.current_user_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "DocumentMember" m
      WHERE m."documentId" = "DocumentVersion"."documentId"
        AND m."userId" = current_setting('app.current_user_id', true)
        AND m.role IN ('OWNER', 'EDITOR')
    )
  );
