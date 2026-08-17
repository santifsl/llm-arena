import { ArenaScreen } from "@/features/arena/arena-screen";
import { loadArenaCatalog } from "@/features/models/catalog";

/**
 * The new-thread screen. There is no thread yet, so there is nobody else it
 * could belong to: whoever is here is the one about to start it, and the submit
 * action is what refuses a signed-out caller, with a sentence.
 */
export default async function ArenaPage() {
  return (
    <ArenaScreen
      catalog={await loadArenaCatalog()}
      initialThread={null}
      isOwner
    />
  );
}
