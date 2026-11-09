import { auth } from "@clerk/nextjs/server";
import { api } from "./api";

// Server-side GET with the caller's Clerk session token (Express verifies it independently).
export async function serverGet<T>(path: string) {
  return api<T>(await (await auth()).getToken(), "GET", path);
}
