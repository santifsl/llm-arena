import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";

import { ArenaScreen } from "@/features/arena/arena-screen";
import { loadThread } from "@/features/arena/queries";
import { loadArenaCatalog } from "@/features/models/catalog";

/**
 * One thread, read back out of the database.
 *
 * A thread nobody owns and a thread owned by somebody else are the same plain
 * not-found page, which is what feature 8 already decided a missing thread
 * looks like. Slice 3 is what opens reading up to everyone; until then the
 * owner is the only reader.
 */
export default async function ThreadPage({
  params,
}: PageProps<"/t/[threadId]">) {
  const { threadId } = await params;
  const { userId } = await auth();

  if (!userId) notFound();

  const [thread, catalog] = await Promise.all([
    loadThread(threadId, userId),
    loadArenaCatalog(),
  ]);

  if (thread === null) notFound();

  return <ArenaScreen catalog={catalog} initialThread={thread} />;
}
