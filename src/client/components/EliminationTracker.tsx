// Game element data embedded for client-side use
const SUSPECTS = [
  { id: "S01", name: "Miss Scarlet" },
  { id: "S02", name: "Colonel Mustard" },
  { id: "S03", name: "Mrs. White" },
  { id: "S04", name: "Mr. Green" },
  { id: "S05", name: "Mrs. Peacock" },
  { id: "S06", name: "Professor Plum" },
  { id: "S07", name: "Mrs. Meadow-Brook" },
  { id: "S08", name: "Prince Azure" },
  { id: "S09", name: "Lady Lavender" },
  { id: "S10", name: "Rusty" },
];

const ITEMS = [
  { id: "I01", name: "Spyglass" },
  { id: "I02", name: "Revolver" },
  { id: "I03", name: "Rare Book" },
  { id: "I04", name: "Medal" },
  { id: "I05", name: "Billfold" },
  { id: "I06", name: "Gold Pen" },
  { id: "I07", name: "Letter Opener" },
  { id: "I08", name: "Crystal Paperweight" },
  { id: "I09", name: "Pocket Watch" },
  { id: "I10", name: "Jade Hairpin" },
  { id: "I11", name: "Scarab Brooch" },
];

const LOCATIONS = [
  { id: "L01", name: "Hall" },
  { id: "L02", name: "Lounge" },
  { id: "L03", name: "Dining Room" },
  { id: "L04", name: "Kitchen" },
  { id: "L05", name: "Ballroom" },
  { id: "L06", name: "Conservatory" },
  { id: "L07", name: "Billiard Room" },
  { id: "L08", name: "Library" },
  { id: "L09", name: "Study" },
  { id: "L10", name: "Rose Garden" },
  { id: "L11", name: "Fountain" },
];

const TIMES = [
  { id: "T01", name: "Dawn" },
  { id: "T02", name: "Breakfast" },
  { id: "T03", name: "Late Morning" },
  { id: "T04", name: "Lunch" },
  { id: "T05", name: "Early Afternoon" },
  { id: "T06", name: "Tea Time" },
  { id: "T07", name: "Dusk" },
  { id: "T08", name: "Dinner" },
  { id: "T09", name: "Night" },
  { id: "T10", name: "Midnight" },
];

interface Props {
  state: {
    eliminatedSuspects: string[];
    eliminatedItems: string[];
    eliminatedLocations: string[];
    eliminatedTimes: string[];
  };
}

function CategorySection({
  title,
  items,
  eliminated,
}: {
  title: string;
  items: { id: string; name: string }[];
  eliminated: string[];
}) {
  const remaining = items.filter((i) => !eliminated.includes(i.id));
  return (
    <div className="card">
      <h3 className="mb-1">
        {title}{" "}
        <span className="text-muted" style={{ fontWeight: 400, fontSize: "0.9rem" }}>
          ({remaining.length} remaining)
        </span>
      </h3>
      <div className="game-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))" }}>
        {items.map((item) => (
          <div
            key={item.id}
            className={`game-item ${eliminated.includes(item.id) ? "eliminated" : ""}`}
            style={{ padding: "0.75rem", fontSize: "0.85rem" }}
          >
            {item.name}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function EliminationTracker({ state }: Props) {
  return (
    <div>
      <h2 className="mb-2">Investigation Board</h2>
      <CategorySection
        title="Suspects"
        items={SUSPECTS}
        eliminated={state.eliminatedSuspects}
      />
      <CategorySection
        title="Items"
        items={ITEMS}
        eliminated={state.eliminatedItems}
      />
      <CategorySection
        title="Locations"
        items={LOCATIONS}
        eliminated={state.eliminatedLocations}
      />
      <CategorySection
        title="Times"
        items={TIMES}
        eliminated={state.eliminatedTimes}
      />
    </div>
  );
}
