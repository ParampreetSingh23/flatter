-- CreateEnum
CREATE TYPE "HousingIntent" AS ENUM ('HAVE_ROOM', 'TEAM_UP', 'NEED_ROOM');

-- CreateEnum
CREATE TYPE "Occupation" AS ENUM ('STUDENT', 'WORKING_PROFESSIONAL', 'SELF_EMPLOYED', 'OTHER');

-- CreateEnum
CREATE TYPE "SleepSchedule" AS ENUM ('EARLY_BIRD', 'NIGHT_OWL', 'FLEXIBLE');

-- CreateEnum
CREATE TYPE "Cleanliness" AS ENUM ('RELAXED', 'REGULAR', 'VERY_TIDY');

-- CreateEnum
CREATE TYPE "FoodHabit" AS ENUM ('VEGAN', 'VEGETARIAN', 'EGGETARIAN', 'NON_VEGETARIAN');

-- CreateEnum
CREATE TYPE "SmokingHabit" AS ENUM ('NON_SMOKER', 'OUTDOORS_ONLY', 'INDOORS');

-- CreateEnum
CREATE TYPE "GuestFrequency" AS ENUM ('RARELY', 'OCCASIONALLY', 'FREQUENTLY');

-- CreateEnum
CREATE TYPE "PetPreference" AS ENUM ('OK_WITH_PETS', 'NO_PETS', 'NO_PREFERENCE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "housingIntent" "HousingIntent",
    "onboardingRevision" INTEGER NOT NULL DEFAULT 0,
    "onboardingCompletedAt" TIMESTAMPTZ(3),
    "discoveryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "userId" UUID NOT NULL,
    "displayName" VARCHAR(80),
    "birthDate" DATE,
    "occupation" "Occupation",
    "bio" VARCHAR(500),
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "housing_preferences" (
    "userId" UUID NOT NULL,
    "city" VARCHAR(100),
    "preferredLocations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "locationsFlexible" BOOLEAN,
    "monthlyRentMinPaise" INTEGER,
    "monthlyRentMaxPaise" INTEGER,
    "moveInDate" DATE,
    "moveInFlexible" BOOLEAN,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "housing_preferences_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "lifestyle_preferences" (
    "userId" UUID NOT NULL,
    "sleepSchedule" "SleepSchedule",
    "cleanliness" "Cleanliness",
    "foodHabit" "FoodHabit",
    "smokingHabit" "SmokingHabit",
    "bringingPet" BOOLEAN,
    "guestFrequency" "GuestFrequency",
    "acceptedSleepSchedules" "SleepSchedule"[] DEFAULT ARRAY[]::"SleepSchedule"[],
    "acceptedCleanlinessLevels" "Cleanliness"[] DEFAULT ARRAY[]::"Cleanliness"[],
    "acceptedFoodHabits" "FoodHabit"[] DEFAULT ARRAY[]::"FoodHabit"[],
    "acceptedSmokingHabits" "SmokingHabit"[] DEFAULT ARRAY[]::"SmokingHabit"[],
    "flatmatePetPreference" "PetPreference",
    "acceptedGuestFrequencies" "GuestFrequency"[] DEFAULT ARRAY[]::"GuestFrequency"[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lifestyle_preferences_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_clerkUserId_key" ON "users"("clerkUserId");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "housing_preferences" ADD CONSTRAINT "housing_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lifestyle_preferences" ADD CONSTRAINT "lifestyle_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
