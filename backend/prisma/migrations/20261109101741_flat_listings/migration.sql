-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "RoomType" AS ENUM ('PRIVATE', 'SHARED');

-- CreateEnum
CREATE TYPE "Furnishing" AS ENUM ('UNFURNISHED', 'SEMI_FURNISHED', 'FURNISHED');

-- CreateEnum
CREATE TYPE "PhotoState" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'DELETE_PENDING');

-- CreateEnum
CREATE TYPE "PhotoCategory" AS ENUM ('ROOM', 'SHARED_SPACE', 'OTHER');

-- CreateTable
CREATE TABLE "flat_listings" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 0,
    "title" VARCHAR(100),
    "description" VARCHAR(2000),
    "cityId" TEXT,
    "localityId" TEXT,
    "bedrooms" INTEGER,
    "availablePlaces" INTEGER,
    "roomType" "RoomType",
    "furnishing" "Furnishing",
    "monthlyRentPaise" INTEGER,
    "depositPaise" INTEGER,
    "chargesNote" VARCHAR(500),
    "availableFrom" DATE,
    "availableFlexible" BOOLEAN,
    "permissionConfirmedAt" TIMESTAMPTZ(3),
    "publishedAt" TIMESTAMPTZ(3),
    "coverPhotoId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "flat_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flat_photos" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "stagingKey" TEXT NOT NULL,
    "finalKey" TEXT,
    "state" "PhotoState" NOT NULL DEFAULT 'PENDING',
    "category" "PhotoCategory" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "mimeType" TEXT,
    "bytes" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "contentHash" TEXT,
    "originalName" VARCHAR(200),
    "uploadExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "processingLeaseUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "flat_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "flat_listings_ownerId_key" ON "flat_listings"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "flat_listings_coverPhotoId_key" ON "flat_listings"("coverPhotoId");

-- CreateIndex
CREATE INDEX "flat_listings_status_cityId_localityId_idx" ON "flat_listings"("status", "cityId", "localityId");

-- CreateIndex
CREATE UNIQUE INDEX "flat_photos_stagingKey_key" ON "flat_photos"("stagingKey");

-- CreateIndex
CREATE UNIQUE INDEX "flat_photos_finalKey_key" ON "flat_photos"("finalKey");

-- CreateIndex
CREATE INDEX "flat_photos_listingId_state_idx" ON "flat_photos"("listingId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "flat_photos_listingId_contentHash_key" ON "flat_photos"("listingId", "contentHash");

-- AddForeignKey
ALTER TABLE "flat_listings" ADD CONSTRAINT "flat_listings_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flat_listings" ADD CONSTRAINT "flat_listings_coverPhotoId_fkey" FOREIGN KEY ("coverPhotoId") REFERENCES "flat_photos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flat_photos" ADD CONSTRAINT "flat_photos_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "flat_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Local invariants (docs/flat-listing.md sections 4-6). Drafts stay nullable; supplied values must be valid.
ALTER TABLE "flat_listings"
  ADD CONSTRAINT "listing_version_nonneg" CHECK ("version" >= 0),
  ADD CONSTRAINT "listing_title_valid" CHECK ("title" IS NULL OR ("title" = btrim("title") AND char_length("title") BETWEEN 10 AND 100)),
  ADD CONSTRAINT "listing_description_valid" CHECK ("description" IS NULL OR ("description" = btrim("description") AND char_length("description") BETWEEN 30 AND 2000)),
  ADD CONSTRAINT "listing_charges_valid" CHECK ("chargesNote" IS NULL OR ("chargesNote" = btrim("chargesNote") AND char_length("chargesNote") BETWEEN 1 AND 500)),
  ADD CONSTRAINT "listing_bedrooms_range" CHECK ("bedrooms" IS NULL OR "bedrooms" BETWEEN 1 AND 10),
  ADD CONSTRAINT "listing_places_range" CHECK ("availablePlaces" IS NULL OR "availablePlaces" BETWEEN 1 AND 10),
  ADD CONSTRAINT "listing_rent_positive" CHECK ("monthlyRentPaise" IS NULL OR "monthlyRentPaise" > 0),
  ADD CONSTRAINT "listing_deposit_nonneg" CHECK ("depositPaise" IS NULL OR "depositPaise" >= 0),
  ADD CONSTRAINT "listing_date_flex" CHECK ("availableFlexible" IS NOT TRUE OR "availableFrom" IS NULL),
  ADD CONSTRAINT "listing_published_has_time" CHECK ("status" <> 'PUBLISHED' OR "publishedAt" IS NOT NULL);

ALTER TABLE "flat_photos"
  ADD CONSTRAINT "photo_order_nonneg" CHECK ("sortOrder" >= 0),
  ADD CONSTRAINT "photo_bytes_bounds" CHECK ("bytes" IS NULL OR "bytes" BETWEEN 1 AND 5242880),
  ADD CONSTRAINT "photo_dims_positive" CHECK (("width" IS NULL OR "width" > 0) AND ("height" IS NULL OR "height" > 0)),
  ADD CONSTRAINT "photo_ready_complete" CHECK ("state" <> 'READY' OR ("finalKey" IS NOT NULL AND "contentHash" IS NOT NULL AND "mimeType" IS NOT NULL AND "bytes" IS NOT NULL AND "width" IS NOT NULL AND "height" IS NOT NULL));
