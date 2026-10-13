import { z } from 'zod';

/** The one field this feature reads off `GET /auth/me` · `PATCH /auth/me`: the chosen topic ids. */
export const chosenInterestsDtoSchema = z.object({ interests: z.array(z.string()) });

/** `GET /interest-topics` — the topics a user can choose, in the server's order. */
export const interestTopicsDtoSchema = z.object({
  topics: z.array(z.object({ id: z.string(), label: z.string() })),
});
