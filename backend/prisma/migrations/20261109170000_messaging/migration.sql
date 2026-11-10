-- Messaging: per-match sequence counter, messages and per-member receipt cursors.
ALTER TABLE "matches"
  ADD COLUMN "lastMessageSeq" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastMessageAt" TIMESTAMPTZ(3);
ALTER TABLE "matches" ADD CONSTRAINT "matches_last_seq_chk" CHECK ("lastMessageSeq" >= 0);

CREATE TABLE "messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "matchId" UUID NOT NULL,
  "senderId" UUID NOT NULL,
  "clientMessageId" UUID NOT NULL,
  "seq" INTEGER NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "messages_seq_chk" CHECK ("seq" > 0),
  CONSTRAINT "messages_body_len_chk" CHECK (char_length("body") BETWEEN 1 AND 2000 AND octet_length("body") <= 16384)
);
CREATE UNIQUE INDEX "messages_matchId_seq_key" ON "messages"("matchId", "seq");
CREATE UNIQUE INDEX "messages_matchId_senderId_clientMessageId_key" ON "messages"("matchId", "senderId", "clientMessageId");
CREATE INDEX "messages_senderId_idx" ON "messages"("senderId");
ALTER TABLE "messages" ADD CONSTRAINT "messages_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "chat_member_states" (
  "matchId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "deliveredThroughSeq" INTEGER NOT NULL DEFAULT 0,
  "readThroughSeq" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_member_states_pkey" PRIMARY KEY ("matchId", "userId"),
  CONSTRAINT "chat_member_states_bounds_chk" CHECK ("readThroughSeq" >= 0 AND "readThroughSeq" <= "deliveredThroughSeq")
);
CREATE INDEX "chat_member_states_userId_matchId_idx" ON "chat_member_states"("userId", "matchId");
ALTER TABLE "chat_member_states" ADD CONSTRAINT "chat_member_states_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_member_states" ADD CONSTRAINT "chat_member_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
