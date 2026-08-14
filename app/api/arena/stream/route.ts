import { auth } from "@clerk/nextjs/server";
import { createUIMessageStreamResponse } from "ai";

import {
  latestUserPrompt,
  streamRequestSchema,
} from "@/features/model-call/request";
import { streamModelAnswer } from "@/features/model-call/stream-model-answer";
import { protectArenaStream } from "@/features/security/arcjet";

/**
 * One model per request. The browser opens one of these per selected model so
 * a slow or dead model can only ever affect its own answer.
 *
 * The order here matters: identify, validate, then protect, and only then call
 * a model. Sending a prompt costs real quota, so nothing reaches OpenRouter
 * until Arcjet has allowed it.
 *
 * This route is deliberately the thin HTTP edge. Persistence and voting belong
 * to their own features.
 */
export async function POST(request: Request) {
  // Arcjet's budget is per person, so an anonymous caller has no bucket to
  // charge and is refused before anything else happens.
  const { userId } = await auth();

  if (!userId) {
    return Response.json(
      { error: "Sign in to send a prompt to the arena." },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = streamRequestSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "That request was not something the arena could read." },
      { status: 400 },
    );
  }

  const denial = await protectArenaStream(request, {
    userId,
    prompt: latestUserPrompt(parsed.data.messages),
  });

  if (denial) {
    return Response.json(
      { error: denial.message },
      {
        status: denial.status,
        headers: denial.retryAfterSeconds
          ? { "Retry-After": String(denial.retryAfterSeconds) }
          : undefined,
      },
    );
  }

  return createUIMessageStreamResponse({
    stream: streamModelAnswer(parsed.data),
  });
}
