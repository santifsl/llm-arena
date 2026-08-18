import { auth } from "@clerk/nextjs/server";

import { ArenaScreen } from "@/features/arena/arena-screen";
import { loadArenaCatalog } from "@/features/models/catalog";
import { resolveDefaultModelIds } from "@/features/models/default-models";

/**
 * The new-thread screen. There is no thread yet, so there is nobody else it
 * could belong to: whoever is here is the one about to start it, and the submit
 * action is what refuses a signed-out caller, with a sentence.
 *
 * This is the only page that decides an opening trio, which is why the flag is
 * read here and not inside the screen. The two network calls are sequential and
 * have to be: the flag's payload is only usable once there is a catalog to
 * check its model ids against, and handing a screen a chip for a model that is
 * not listed is the exact failure that check exists to prevent.
 */
export default async function ArenaPage() {
  const { userId } = await auth();
  const catalog = await loadArenaCatalog();

  return (
    <ArenaScreen
      catalog={catalog}
      defaultModelIds={await resolveDefaultModelIds(catalog, userId)}
      initialThread={null}
      isOwner
    />
  );
}
