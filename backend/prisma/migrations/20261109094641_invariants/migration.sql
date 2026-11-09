-- Local invariants Prisma cannot express (docs/onbaordig.md section 5).
ALTER TABLE "users"
  ADD CONSTRAINT "users_revision_nonneg" CHECK ("onboardingRevision" >= 0),
  ADD CONSTRAINT "users_completed_requires_intent" CHECK ("onboardingCompletedAt" IS NULL OR "housingIntent" IS NOT NULL),
  ADD CONSTRAINT "users_discovery_requires_completed" CHECK ("discoveryEnabled" = false OR "onboardingCompletedAt" IS NOT NULL);

ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_name_trimmed" CHECK ("displayName" IS NULL OR ("displayName" = btrim("displayName") AND char_length("displayName") >= 1)),
  ADD CONSTRAINT "profiles_bio_nonblank" CHECK ("bio" IS NULL OR btrim("bio") <> '');

ALTER TABLE "housing_preferences"
  ADD CONSTRAINT "housing_city_trimmed" CHECK ("city" IS NULL OR ("city" = btrim("city") AND char_length("city") >= 1)),
  ADD CONSTRAINT "housing_rent_positive" CHECK (("monthlyRentMinPaise" IS NULL OR "monthlyRentMinPaise" > 0) AND ("monthlyRentMaxPaise" IS NULL OR "monthlyRentMaxPaise" > 0)),
  ADD CONSTRAINT "housing_rent_range" CHECK ("monthlyRentMinPaise" IS NULL OR "monthlyRentMaxPaise" IS NULL OR "monthlyRentMinPaise" <= "monthlyRentMaxPaise"),
  ADD CONSTRAINT "housing_date_flex" CHECK (("moveInFlexible" IS NOT TRUE OR "moveInDate" IS NULL) AND ("moveInFlexible" IS NOT FALSE OR "moveInDate" IS NOT NULL)),
  ADD CONSTRAINT "housing_locations_flex" CHECK (("locationsFlexible" IS NOT TRUE OR cardinality("preferredLocations") = 0) AND ("locationsFlexible" IS NOT FALSE OR cardinality("preferredLocations") BETWEEN 1 AND 5));
