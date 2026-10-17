import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { authenticateRequest } from "./session";

/** Header a super administrator sends to see the app as another person (read-only). */
export const VIEW_AS_HEADER = "x-valora-view-as";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  /** The person whose data is shown. While viewing as someone, this is that person. */
  user: User | null;
  /** The signed-in super administrator when `viewingAs` is true. */
  actor?: User | null;
  viewingAs?: boolean;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await authenticateRequest(opts.req);
  } catch {
    // Authentication is optional for public procedures.
    user = null;
  }

  const viewAs = opts.req.headers[VIEW_AS_HEADER];
  if (user?.role === "super_admin" && typeof viewAs === "string" && viewAs && viewAs !== user.openId) {
    const target = await db.getUserByOpenId(viewAs.slice(0, 64));
    if (target) return { req: opts.req, res: opts.res, user: target, actor: user, viewingAs: true };
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    actor: user,
    viewingAs: false,
  };
}
