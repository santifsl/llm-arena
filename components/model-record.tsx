import { ModelBadge } from "@/components/model-badge";
import { WinRate } from "@/components/trace";

/**
 * A model's record inside this thread, for the top bar: who, and how they are
 * doing, in one pill. The sketch shrinks these to a mark and a number when the
 * bar gets crowded, which is what the `sm` badge and the hidden count do.
 */
export const ModelRecord = ({
  initial,
  name,
  won,
  of,
  leading = false,
}: {
  readonly initial: string;
  readonly name: string;
  readonly won: number;
  readonly of: number;
  readonly leading?: boolean;
}) => (
  <span
    title={`${name}: won ${won} of ${of} in this thread`}
    className="inline-flex items-center gap-2 rounded-sm border border-rule px-2 py-1"
  >
    <ModelBadge initial={initial} size="sm" />
    <span className="sr-only">{name}</span>
    <WinRate won={won} of={of} scale="badge" leading={leading} />
  </span>
);
