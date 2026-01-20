import pools from "../../data/generative-pools.json";
import templates from "../../data/pool-templates.json";
import { SeededRandom } from "./seeded-random";
import type { CampaignPlan } from "../types/campaign";

type PoolMap = Record<string, string[]>;

export type StorySpec = {
  theme: string;
  archetype: string;
  components: Record<string, string[]>;
  templates: Array<{
    id: string;
    tag: string;
    template: string;
    sourceClue: string;
  }>;
};

const DEFAULT_POOL_COUNTS: Record<string, number> = {
  StoryThemes: 1,
  CaseArchetypes: 1,
  TimeStructures: 2,
  HouseUsagePatterns: 2,
  SocialDynamics: 2,
  SuspectRoles: 2,
  ItemNarrativeFunctions: 2,
  MovementPatterns: 2,
  ClueMechanics: 4,
  NarrativeCovers: 2,
  MotiveShapes: 1,
  InventoryMechanics: 1,
  EvidenceTypes: 1,
  StoryEngines: 2,
  ScheduleStoryEngines: 1,
  AccessMechanics: 1,
  HouseInfrastructureUses: 1,
  ItemStateChanges: 1,
  OpportunityMechanics: 2,
};

export function buildStorySpec(plan: CampaignPlan): StorySpec {
  const rng = new SeededRandom(plan.seed);
  const poolMap = pools as PoolMap;
  const components: Record<string, string[]> = {};

  Object.keys(poolMap).forEach((key) => {
    const values = poolMap[key] ?? [];
    if (values.length === 0) return;
    const count = Math.min(DEFAULT_POOL_COUNTS[key] ?? 1, values.length);
    components[key] = pickUnique(rng, values, count);
  });

  const theme = components.StoryThemes?.[0] ?? "HouseFullOfGuests";
  const archetype = components.CaseArchetypes?.[0] ?? "EliminationLattice";

  const templateMap = templates as Record<string, { tag: string; source_clue: string; template: string }>;
  const selectedTemplates = Object.values(components)
    .flat()
    .filter((id) => Boolean(templateMap[id]))
    .map((id) => ({
      id,
      tag: templateMap[id].tag,
      template: templateMap[id].template,
      sourceClue: templateMap[id].source_clue,
    }));

  return { theme, archetype, components, templates: selectedTemplates };
}

function pickUnique(rng: SeededRandom, values: string[], count: number): string[] {
  const remaining = [...values];
  const picked: string[] = [];
  while (picked.length < count && remaining.length > 0) {
    const item = rng.pick(remaining);
    picked.push(item);
    const index = remaining.indexOf(item);
    if (index >= 0) remaining.splice(index, 1);
  }
  return picked;
}
