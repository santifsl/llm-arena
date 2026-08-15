import { z } from "zod";

/**
 * The wire contract for one model's stream, and it is deliberately one field.
 *
 * It used to carry a model id and the whole message list. That was right while
 * there was nothing to check either against, and wrong once threads became
 * real: the browser would be choosing which model gets called and what history
 * it is given. A request now names an answer row that the server already
 * created, and the server reads the model and rebuilds that model's own
 * conversation from the database.
 *
 * The free-tier gate did not go anywhere. It moved to where the row is created,
 * which is the last moment a person can still choose a model.
 */
export const streamRequestSchema = z.object({
  answerId: z.string().min(1),
});

export type StreamRequest = Readonly<z.infer<typeof streamRequestSchema>>;
