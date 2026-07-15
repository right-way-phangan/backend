-- Lease registered at the Land Office (DD-confirmed). Nullable: null =
-- unverified, true = registered. Applied manually to Neon ahead of the code
-- deploy (migration-before-code rule); IF NOT EXISTS keeps it idempotent.
ALTER TABLE "objects" ADD COLUMN IF NOT EXISTS "lease_registered" boolean;
