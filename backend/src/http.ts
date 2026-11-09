import type { ErrorRequestHandler } from "express";
import { z } from "zod";
import { Prisma } from "./generated/prisma/client.js";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string>) {
    super(message);
  }
}

// Shared `{ error: { code, message, fields? } }` envelope for onboarding and listings.
export const apiErrorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const send = (status: number, code: string, message: string, fields?: Record<string, string>) =>
    res.status(status).json({ error: { code, message, ...(fields && { fields }) } });
  if (err instanceof ApiError) return send(err.status, err.code, err.message, err.fields);
  if (err instanceof z.ZodError) {
    return send(422, "VALIDATION_ERROR", "Please check your answers.",
      Object.fromEntries(err.issues.map((i) => [i.path.join(".") || "_", i.message])));
  }
  if (typeof err?.status === "number" && err.status >= 400 && err.status < 500) return send(err.status, "BAD_REQUEST", "Invalid request body.");
  console.error(err);
  const down = err instanceof Prisma.PrismaClientInitializationError ||
    (err instanceof Prisma.PrismaClientKnownRequestError && /^P(1|2024)/.test(err.code)) ||
    /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|Connection terminated/.test(String(err?.message ?? err?.cause?.message));
  return down ? send(503, "TEMPORARILY_UNAVAILABLE", "Service temporarily unavailable. Please retry.") : send(500, "INTERNAL", "Something went wrong.");
};
