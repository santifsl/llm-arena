import { auth } from "@clerk/nextjs/server";

import { listThreads } from "@/features/arena/queries";
import { AppShell } from "@/features/shell/app-shell";
import { toSidebarThread, type SidebarThread } from "@/features/shell/threads";
import { errorLog } from "@/lib/errors";

/**
 * Everything the product actually is sits in this group, so it gets the shell.
 *
 * The sidebar's thread list is read here rather than in the sidebar itself,
 * which is a client component: the same rule the model catalog already follows,
 * fetched on the server and handed down, so the browser never talks to the
 * database and no second public route exists for Arcjet to cover.
 *
 * A new thread reaches this list because `submitPrompt` revalidates this layout
 * when it creates one. Without that, a person's first prompt of the sitting
 * would be missing from their own sidebar until a full page load.
 */

/** Null means the list could not be read, which the sidebar says out loud. */
const sidebarThreads = async (): Promise<readonly SidebarThread[] | null> => {
  const { userId } = await auth();

  if (!userId) return [];

  const now = new Date();

  return listThreads(userId)
    .then((threads) => threads.map((thread) => toSidebarThread(thread, now)))
    .catch((error: unknown) => {
      console.error(
        `[shell] could not list a person's threads: ${errorLog(error)}`,
      );

      return null;
    });
};

export default async function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell threads={await sidebarThreads()}>{children}</AppShell>;
}
