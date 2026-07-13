/**
 * Deterministic, player-facing evidence derived from the simulated world.
 *
 * AI prose may add period voice, but this capsule is the canonical fact that
 * players should record and reason from. It never contains hidden answer or
 * solver-state information.
 */
export type EvidenceKind =
  | "gathering"
  | "group_presence"
  | "solo_presence"
  | "departure"
  | "guests_arrived"
  | "item_intact"
  | "item_offsite"
  | "items_secured"
  | "room_closed"
  | "room_undisturbed"
  | "item_home"
  | "discovery"
  | "object_history"
  | "item_handling"
  | "personal_remark"
  | "thread_setup"
  | "thread_resolution"
  | "thread_color";

export type EvidenceCapsule = {
  factId: string;
  kind: EvidenceKind;
  /** Context adds texture but has no formal elimination effect. */
  role: "formal" | "context";
  /** Exact, deterministic statement to show beside the generated narration. */
  statement: string;
  suspectIds: string[];
  itemIds: string[];
  locationIds: string[];
  timeIds: string[];
};
