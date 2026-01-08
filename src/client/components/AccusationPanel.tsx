import { useState } from "react";

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
  onClose: () => void;
  onAccuse: (accusation: {
    suspectId: string;
    itemId: string;
    locationId: string;
    timeId: string;
  }) => Promise<{ correct: boolean; message: string; aiResponse?: string }>;
}

export default function AccusationPanel({ state, onClose, onAccuse }: Props) {
  const [suspectId, setSuspectId] = useState("");
  const [itemId, setItemId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [timeId, setTimeId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    correct: boolean;
    message: string;
    aiResponse?: string;
  } | null>(null);

  const remainingSuspects = SUSPECTS.filter(
    (s) => !state.eliminatedSuspects.includes(s.id)
  );
  const remainingItems = ITEMS.filter(
    (i) => !state.eliminatedItems.includes(i.id)
  );
  const remainingLocations = LOCATIONS.filter(
    (l) => !state.eliminatedLocations.includes(l.id)
  );
  const remainingTimes = TIMES.filter(
    (t) => !state.eliminatedTimes.includes(t.id)
  );

  const canSubmit = suspectId && itemId && locationId && timeId && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const response = await onAccuse({ suspectId, itemId, locationId, timeId });
    setResult(response);
    setSubmitting(false);
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ maxWidth: "600px", width: "100%", maxHeight: "90vh", overflow: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-header">
          <h2>Make Your Accusation</h2>
          <p className="text-muted">
            Declare who committed the theft, what was stolen, where, and when.
          </p>
        </div>

        {result ? (
          <div className="text-center">
            <h3
              style={{
                color: result.correct
                  ? "var(--color-accent-green)"
                  : "var(--color-accent-red)",
              }}
            >
              {result.correct ? "Correct!" : "Incorrect!"}
            </h3>
            <p className="mt-2">{result.message}</p>
            {result.aiResponse && (
              <div
                className="mt-2"
                style={{
                  fontStyle: "italic",
                  padding: "1rem",
                  backgroundColor: "var(--color-bg-secondary)",
                  borderRadius: "4px",
                }}
              >
                "{result.aiResponse}"
              </div>
            )}
            <button className="btn mt-3" onClick={onClose}>
              {result.correct ? "View Solution" : "Continue Investigation"}
            </button>
          </div>
        ) : (
          <>
            <div className="form-group">
              <label>Who did it?</label>
              <select value={suspectId} onChange={(e) => setSuspectId(e.target.value)}>
                <option value="">Select a suspect...</option>
                {remainingSuspects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                <optgroup label="Eliminated">
                  {SUSPECTS.filter((s) => state.eliminatedSuspects.includes(s.id)).map(
                    (s) => (
                      <option key={s.id} value={s.id} disabled>
                        {s.name} (eliminated)
                      </option>
                    )
                  )}
                </optgroup>
              </select>
            </div>

            <div className="form-group">
              <label>What was stolen?</label>
              <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
                <option value="">Select an item...</option>
                {remainingItems.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
                <optgroup label="Eliminated">
                  {ITEMS.filter((i) => state.eliminatedItems.includes(i.id)).map((i) => (
                    <option key={i.id} value={i.id} disabled>
                      {i.name} (eliminated)
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div className="form-group">
              <label>Where did it happen?</label>
              <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="">Select a location...</option>
                {remainingLocations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
                <optgroup label="Eliminated">
                  {LOCATIONS.filter((l) => state.eliminatedLocations.includes(l.id)).map(
                    (l) => (
                      <option key={l.id} value={l.id} disabled>
                        {l.name} (eliminated)
                      </option>
                    )
                  )}
                </optgroup>
              </select>
            </div>

            <div className="form-group">
              <label>When did it occur?</label>
              <select value={timeId} onChange={(e) => setTimeId(e.target.value)}>
                <option value="">Select a time...</option>
                {remainingTimes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
                <optgroup label="Eliminated">
                  {TIMES.filter((t) => state.eliminatedTimes.includes(t.id)).map((t) => (
                    <option key={t.id} value={t.id} disabled>
                      {t.name} (eliminated)
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div className="flex gap-2" style={{ justifyContent: "flex-end" }}>
              <button className="btn" onClick={onClose} disabled={submitting}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handleSubmit}
                disabled={!canSubmit}
              >
                {submitting ? "Submitting..." : "Make Accusation"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
