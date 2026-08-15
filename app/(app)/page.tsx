import { ArenaScreen } from "@/features/arena/arena-screen";
import { loadArenaCatalog } from "@/features/models/catalog";

export default async function ArenaPage() {
  return (
    <ArenaScreen catalog={await loadArenaCatalog()} initialThread={null} />
  );
}
