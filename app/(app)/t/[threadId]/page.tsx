import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { ArenaScreen } from "@/features/arena/arena-screen";
import { loadThread } from "@/features/arena/queries";
import { loadArenaCatalog } from "@/features/models/catalog";
import { errorLog } from "@/lib/errors";

/**
 * One thread, readable by anyone holding its link.
 *
 * This is the app's only public route, and the only unauthenticated database
 * read it makes. That is a deliberate acceptance rather than an oversight: it
 * is one row fetched by primary key with its turns, thread ids are cuid2 so
 * they are not walkable, and the read exposes nothing a person with the link
 * was not meant to see. No Arcjet rule guards it, because a per-render decision
 * on a page is more machinery than that exposure warrants. If this page ever
 * grows a second query, a search, or a listing of threads, that trade is worth
 * making again rather than inheriting.
 *
 * A made-up id and a deleted thread are the same plain not-found page, and so
 * is somebody else's id, for the same reader, because the lookup does not know
 * who is asking. Being signed in changes nothing about what is found; it only
 * changes whether this reader may use the thread as well as read it.
 */

/**
 * The thread, read once per request however many times it is asked for.
 *
 * `generateMetadata` needs the title and the page needs everything, and Next
 * calls them separately, so without this every thread page load ran the same
 * query, turns and answers and all, twice. `cache` is per request and is not a
 * cache of the thread itself: a reload still reads the database, which is the
 * point, since a reload is the control this page offers a visitor watching a
 * race they are not part of.
 */
const readThread = cache(async (threadId: string) => {
  const found = await loadThread(threadId).catch((error: unknown) => {
    console.error(`[arena] could not read a thread: ${errorLog(error)}`);

    return null;
  });

  if (found === null) return null;

  const { userId } = await auth();

  return {
    ...found,
    isOwner: userId !== null && userId === found.ownerClerkUserId,
  };
});

/**
 * A shared link with a real name on it. Fifty threads all reading "LLM Arena"
 * in a tab strip is the cheapest possible thing to get wrong about sharing.
 * This is a page title and nothing more; rich link previews and an image are
 * still on the not-doing list.
 */
export const generateMetadata = async ({
  params,
}: PageProps<"/t/[threadId]">): Promise<Metadata> => {
  const { threadId } = await params;
  const found = await readThread(threadId);

  return found === null ? {} : { title: found.thread.title };
};

export default async function ThreadPage({
  params,
}: PageProps<"/t/[threadId]">) {
  const { threadId } = await params;

  const [found, catalog] = await Promise.all([
    readThread(threadId),
    loadArenaCatalog(),
  ]);

  if (found === null) notFound();

  return (
    <ArenaScreen
      catalog={catalog}
      initialThread={found.thread}
      isOwner={found.isOwner}
    />
  );
}
