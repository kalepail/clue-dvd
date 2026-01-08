import { Users, Package, MapPin, Clock } from "lucide-react";
import { SUSPECTS, ITEMS, LOCATIONS, TIMES } from "../../shared/game-elements";
import type { EliminationState, MarkCategory } from "../../shared/api-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Badge } from "@/client/components/ui/badge";
import { cn } from "@/client/lib/utils";

interface Props {
  eliminated: EliminationState;
  onToggle?: (category: MarkCategory, elementId: string) => void;
}

function CategorySection({
  title,
  icon: Icon,
  category,
  items,
  eliminated,
  onToggle,
}: {
  title: string;
  icon: React.ElementType;
  category: MarkCategory;
  items: { id: string; name: string }[];
  eliminated: string[];
  onToggle?: (category: MarkCategory, elementId: string) => void;
}) {
  const remaining = items.filter((i) => !eliminated.includes(i.id));

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            {title}
          </span>
          <Badge variant="secondary" className="font-normal">
            {remaining.length} remaining
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {items.map((item) => {
            const isEliminated = eliminated.includes(item.id);
            return (
              <button
                key={item.id}
                onClick={() => onToggle?.(category, item.id)}
                disabled={!onToggle}
                title={onToggle ? (isEliminated ? "Click to unmark" : "Click to mark as eliminated") : undefined}
                className={cn(
                  "px-3 py-2 text-sm rounded-md border transition-all text-left",
                  onToggle && "cursor-pointer hover:border-primary",
                  !onToggle && "cursor-default",
                  isEliminated
                    ? "bg-muted/50 text-muted-foreground line-through border-border/50 opacity-60"
                    : "bg-card border-border hover:bg-accent"
                )}
              >
                {item.name}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function EliminationTracker({ eliminated, onToggle }: Props) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-semibold mb-1">Investigation Board</h2>
        <p className="text-sm text-muted-foreground">
          Click items to mark/unmark as eliminated based on your deductions.
        </p>
      </div>

      <CategorySection
        title="Suspects"
        icon={Users}
        category="suspect"
        items={SUSPECTS}
        eliminated={eliminated.suspects}
        onToggle={onToggle}
      />
      <CategorySection
        title="Items"
        icon={Package}
        category="item"
        items={ITEMS}
        eliminated={eliminated.items}
        onToggle={onToggle}
      />
      <CategorySection
        title="Locations"
        icon={MapPin}
        category="location"
        items={LOCATIONS}
        eliminated={eliminated.locations}
        onToggle={onToggle}
      />
      <CategorySection
        title="Times"
        icon={Clock}
        category="time"
        items={TIMES}
        eliminated={eliminated.times}
        onToggle={onToggle}
      />
    </div>
  );
}
