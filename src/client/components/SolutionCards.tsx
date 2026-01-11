import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import type { Solution } from "../../shared/api-types";

interface CardSymbolData {
  cardId: string;
  cardName: string;
  cardType: string;
  symbols: string[];
  symbolDetails: {
    position: number;
    positionName: string;
    symbol: string;
  }[];
}

interface Props {
  solution: Solution;
  forceReveal?: boolean;
}

// Symbol icons matching the physical card symbols
const SYMBOL_ICONS: Record<string, string> = {
  spyglass: "/images/Card Icon Assets/Magnifying_glass.svg.png",
  fingerprint: "/images/Card Icon Assets/Fingerprint.svg",
  whistle: "/images/Card Icon Assets/whistle.svg",
  notepad: "/images/Card Icon Assets/notepad.svg",
  clock: "/images/Card Icon Assets/Clock.svg",
};

// Grid positions for the 6 symbol slots
const POSITION_GRID: { position: number; row: number; col: number }[] = [
  { position: 1, row: 1, col: 1 }, // Top Left
  { position: 2, row: 1, col: 2 }, // Top Right
  { position: 3, row: 2, col: 1 }, // Middle Left
  { position: 4, row: 2, col: 2 }, // Middle Right
  { position: 5, row: 3, col: 1 }, // Lower Left
  { position: 6, row: 3, col: 2 }, // Lower Right
];

function SolutionCard({
  cardData,
  label,
  forceReveal = false,
}: {
  cardData: CardSymbolData | null;
  label: string;
  forceReveal?: boolean;
}) {
  const [isRevealed, setIsRevealed] = useState(false);
  const showReveal = forceReveal || isRevealed;

  if (!cardData) {
    return (
      <div className="solution-card solution-card-loading">
        <div className="solution-card-label">{label}</div>
        <div className="solution-card-inner">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`solution-card ${showReveal ? "revealed" : ""}`}
      onMouseEnter={() => setIsRevealed(true)}
      onMouseLeave={() => setIsRevealed(false)}
    >
      <div className="solution-card-label">{label}</div>
      <div className="solution-card-inner">
        {/* Symbol grid - no card name shown */}
        <div className="symbol-grid">
          {POSITION_GRID.map(({ position, row, col }) => {
            const symbolData = cardData.symbolDetails.find(
              (s) => s.position === position
            );
            const symbol = symbolData?.symbol || "";
            const symbolIcon = symbol ? SYMBOL_ICONS[symbol] : null;
            const needsMask = symbol === "spyglass";
            return (
              <div
                key={position}
                className="symbol-slot"
                style={{
                  gridRow: row,
                  gridColumn: col,
                }}
                title={`${symbolData?.positionName}: ${symbol}`}
              >
                {/* Red obfuscation layer */}
                <div className="symbol-obfuscation" />
                {/* Blue symbol underneath */}
                <div className="symbol-icon">
                  {symbolIcon ? (
                    needsMask ? (
                      <span
                        className="symbol-icon-masked"
                        style={{ ["--symbol-icon" as never]: `url(\"${symbolIcon}\")` }}
                        aria-hidden="true"
                      />
                    ) : (
                      <img className="symbol-icon-image" src={symbolIcon} alt={symbol} />
                    )
                  ) : (
                    "?"
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Magnifying glass hint */}
        <div className="magnifying-hint">
          <Search className="h-3 w-3" />
          <span>{forceReveal ? "Reveal active" : "Hover to reveal"}</span>
        </div>
      </div>
    </div>
  );
}

export default function SolutionCards({ solution, forceReveal = false }: Props) {
  const [symbolData, setSymbolData] = useState<{
    suspect: CardSymbolData | null;
    item: CardSymbolData | null;
    location: CardSymbolData | null;
    time: CardSymbolData | null;
  }>({
    suspect: null,
    item: null,
    location: null,
    time: null,
  });

  useEffect(() => {
    // Fetch symbol data for all 4 solution cards
    const fetchSymbols = async () => {
      const cards = [
        { type: "suspect", id: solution.suspectId },
        { type: "item", id: solution.itemId },
        { type: "location", id: solution.locationId },
        { type: "time", id: solution.timeId },
      ];

      for (const card of cards) {
        try {
          const response = await fetch(`/api/symbols/cards/${card.id}`);
          if (response.ok) {
            const data = await response.json();
            setSymbolData((prev) => ({
              ...prev,
              [card.type]: data,
            }));
          }
        } catch (error) {
          console.error(`Failed to fetch symbols for ${card.id}:`, error);
        }
      }
    };

    fetchSymbols();
  }, [solution]);

  return (
    <div className="solution-cards-container">
      <h3 className="solution-cards-title">
        <Search className="h-5 w-5" />
        Place These Cards in the Envelope
      </h3>
      <p className="solution-cards-subtitle">
        Use your red magnifying glass to verify the symbols on each card
      </p>

      <div className="solution-cards-grid">
        <SolutionCard
          cardData={symbolData.suspect}
          label="WHO"
          forceReveal={forceReveal}
        />
        <SolutionCard
          cardData={symbolData.item}
          label="WHAT"
          forceReveal={forceReveal}
        />
        <SolutionCard
          cardData={symbolData.location}
          label="WHERE"
          forceReveal={forceReveal}
        />
        <SolutionCard
          cardData={symbolData.time}
          label="WHEN"
          forceReveal={forceReveal}
        />
      </div>

      <p className="solution-cards-instruction">
        Hover over each card to reveal the hidden symbols with your digital magnifying glass
      </p>
    </div>
  );
}
