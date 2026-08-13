import { z } from "zod";

/**
 * The wire contract for one model's stream. One request carries one model id,
 * never a list: each selected model gets its own connection so a failure can
 * only ever kill its own answer.
 */
const textPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

type TextPart = z.infer<typeof textPartSchema>;

/**
 * Only text survives. The client legitimately sends bookkeeping parts the model
 * has no use for, and images and files are not part of the product yet, so
 * dropping them is right where rejecting the whole message would not be.
 */
const keepTextParts = (parts: readonly unknown[]): TextPart[] =>
  parts.flatMap((part) => {
    const parsed = textPartSchema.safeParse(part);

    return parsed.success ? [parsed.data] : [];
  });

const messageSchema = z
  .object({
    id: z.string().min(1),
    role: z.enum(["system", "user", "assistant"]),
    parts: z.array(z.unknown()),
  })
  .transform(({ id, role, parts }) => ({ id, role, parts: keepTextParts(parts) }))
  .refine(({ parts }) => parts.length > 0, {
    message: "a message needs at least one text part",
  });

export const streamRequestSchema = z.object({
  modelId: z.string().min(1),
  messages: z.array(messageSchema).min(1),
});

export type StreamRequest = Readonly<z.infer<typeof streamRequestSchema>>;

/**
 * The text the person actually just typed, which is what prompt-injection
 * detection needs to read. Earlier turns and the models' own replies are not
 * the thing being screened, so only the last user message counts. Lives here
 * because this file already owns the shape of a message.
 */
export const latestUserPrompt = (messages: StreamRequest["messages"]): string =>
  messages
    .filter((message) => message.role === "user")
    .at(-1)
    ?.parts.map((part) => part.text)
    .join("\n") ?? "";
