-- Existing profiles get a unique random public reference (volatile default is evaluated per row).
ALTER TABLE "profiles" ADD COLUMN "publicId" UUID NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "profiles_publicId_key" ON "profiles"("publicId");

ALTER TABLE "profiles" ADD CONSTRAINT "profiles_version_nonneg" CHECK ("version" >= 0);
