import { auth } from "@clerk/nextjs/server";
import { randomUUID } from "node:crypto";
import { consumeStream, createUIMessageStreamResponse } from "ai";

import {
  claimAnswerForStream,
  completeAnswer,
  countCompleteAnswers,
  failAnswer,
} from "@/features/arena/queries";
import { streamRequestSchema } from "@/features/model-call/request";
import { streamModelAnswer } from "@/features/model-call/stream-model-answer";
import {
  captureArenaEvent,
  captureModelCall,
} from "@/features/analytics/server";
import { protectArenaStream } from "@/features/security/arcjet";

/**
 * One answer row per request. The browser opens one of these per selected model
 * so a slow or dead model can only ever affect its own answer.
 *
 * The order here matters: identify, validate, protect, and only then load the
 * row. Loading it is also the ownership check, since the query filters on the
 * caller's own threads, so streaming into somebody else's thread is impossible
 * rather than merely refused.
 *
 * This route is deliberately the thin HTTP edge. What gets written belongs to
 * the arena's queries, and the budget belongs to the action that sent the
 * prompt in the first place.
 */
export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return Response.json(
      { error: "Sign in to send a prompt to the arena." },
      { status: 401 },
    );
  }

  const parsed = streamRequestSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return Response.json(
      { error: "That request was not something the arena could read." },
      { status: 400 },
    );
  }

  const denial = await protectArenaStream(request);

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

  const { answerId } = parsed.data;

  // One stream owns one answer row. Claiming it is the ownership check and the
  // mutual exclusion at once: a second request for the same answer, from a
  // duplicate submit or a reconnect, is refused here rather than calling the
  // provider a second time and racing the first one to write the result.
  const claimId = randomUUID();
  const context = await claimAnswerForStream(answerId, userId, claimId);

  if (context === null) {
    return Response.json(
      {
        error:
          "That answer is already being written, or is not one this account can stream. Reload the page to see where it got to.",
      },
      { status: 409 },
    );
  }

  // Whether this call has reached an ending of any kind. Read by the
  // disconnect listener below, which is the one thing here that fires from
  // outside the stream and therefore cannot be told any other way.
  let settled = false;

  // A tab that closes mid-answer is invisible to every other event this route
  // sends: the server keeps draining its own copy of the stream on purpose, so
  // the answer still lands and `answer_completed` still fires exactly as if
  // somebody had watched it. Without this, "people leave before the models
  // finish" is not a question the funnel can ask at all.
  //
  // A retry aborts its own request too, and is counted here as well, because
  // the server genuinely cannot tell the two apart. `answer_retried` is the
  // event that separates them, which is why it exists.
  request.signal.addEventListener("abort", () => {
    if (settled) return;

    captureArenaEvent(userId, "answer_abandoned", {
      answer_id: answerId,
      model_id: context.modelId,
      turn_id: context.turnId,
    });
  });

  const stream = streamModelAnswer({
    modelId: context.modelId,
    messages: context.messages,
    onComplete: async (text, metrics) => {
      // A write that no longer holds the claim describes a call the product has
      // already moved on from, so it is not worth an event either.
      if (!(await completeAnswer(answerId, claimId, text, metrics))) return;

      settled = true;

      captureArenaEvent(userId, "answer_completed", {
        answer_id: answerId,
        model_id: context.modelId,
        ...metrics,
      });

      // The moment a vote becomes possible, sent once. Exactly two, not two or
      // more: this fires on the completion that crosses the line, so a third
      // model finishing afterwards does not report the turn as newly votable a
      // second time.
      if ((await countCompleteAnswers(context.turnId)) === 2) {
        captureArenaEvent(userId, "turn_ready_for_vote", {
          turn_id: context.turnId,
        });
      }

      // PostHog's own LLM analytics, which is a different thing from the
      // funnel: tokens, cost, and latency for this one call.
      await captureModelCall({
        distinctId: userId,
        answerId,
        modelId: context.modelId,
        input: context.messages,
        output: text,
        metrics,
      });
    },
    onFail: async (reason, kind) => {
      if (!(await failAnswer(answerId, claimId, reason, kind))) return;

      settled = true;

      // The reason is kept for the log and for the row. It is a property of an
      // analytics event too, because a model failing is something worth seeing
      // a trend in, and nobody reading a funnel is a reader of the product.
      captureArenaEvent(userId, "answer_failed", {
        answer_id: answerId,
        model_id: context.modelId,
        reason,
        // Worth a property of its own: "how often does the arena run out of
        // free requests" is a different question from "which models fail", and
        // a free-text reason is not something a funnel can group by.
        failure_kind: kind,
      });

      await captureModelCall({
        distinctId: userId,
        answerId,
        modelId: context.modelId,
        input: context.messages,
        output: null,
        error: reason,
      });
    },
  });

  return createUIMessageStreamResponse({
    stream,
    // A closed tab must not leave a half-written row behind: the server keeps
    // draining its own copy of the stream, so the answer still lands.
    consumeSseStream: ({ stream: sse }) => consumeStream({ stream: sse }),
  });
}
