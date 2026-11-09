-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('WOMAN', 'MAN', 'NON_BINARY', 'PREFER_NOT_TO_SAY');

-- AlterTable
ALTER TABLE "lifestyle_preferences" ADD COLUMN     "acceptedGenders" "Gender"[] DEFAULT ARRAY[]::"Gender"[];

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "gender" "Gender";
