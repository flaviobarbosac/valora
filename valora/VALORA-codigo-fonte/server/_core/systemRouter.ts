import { z } from "zod";
import { isMailConfigured } from "./mailer";
import { publicProcedure, router } from "./trpc";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),
  // Whether this server can send e-mail (sign-up codes, invitations).
  mailStatus: publicProcedure.query(() => ({ mailConfigured: isMailConfigured() })),
});
