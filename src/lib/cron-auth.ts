import { NextRequest } from "next/server";

/**
 * If CRON_SECRET is set, require `Authorization: Bearer <secret>`. If it is not
 * set (local dev), allow the request. Vercel Cron sends this header automatically
 * when CRON_SECRET is configured.
 */
export function authorizeCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
