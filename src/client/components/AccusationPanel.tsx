import { useState } from "react";
import { Gavel, CheckCircle, XCircle } from "lucide-react";
import { SUSPECTS, ITEMS, LOCATIONS, TIMES } from "../../shared/game-elements";
import type { EliminationState } from "../../shared/api-types";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/client/components/ui/select";
import { Label } from "@/client/components/ui/label";

interface Props {
  eliminated: EliminationState;
  onClose: () => void;
  onAccuse: (accusation: {
    suspectId: string;
    itemId: string;
    locationId: string;
    timeId: string;
  }) => Promise<{ correct: boolean; message: string; aiResponse?: string }>;
}

export default function AccusationPanel({ eliminated, onClose, onAccuse }: Props) {
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
    (s) => !eliminated.suspects.includes(s.id)
  );
  const remainingItems = ITEMS.filter(
    (i) => !eliminated.items.includes(i.id)
  );
  const remainingLocations = LOCATIONS.filter(
    (l) => !eliminated.locations.includes(l.id)
  );
  const remainingTimes = TIMES.filter(
    (t) => !eliminated.times.includes(t.id)
  );

  const eliminatedSuspects = SUSPECTS.filter((s) => eliminated.suspects.includes(s.id));
  const eliminatedItems = ITEMS.filter((i) => eliminated.items.includes(i.id));
  const eliminatedLocations = LOCATIONS.filter((l) => eliminated.locations.includes(l.id));
  const eliminatedTimes = TIMES.filter((t) => eliminated.times.includes(t.id));

  const canSubmit = suspectId && itemId && locationId && timeId && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const response = await onAccuse({ suspectId, itemId, locationId, timeId });
    setResult(response);
    setSubmitting(false);
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Gavel className="h-6 w-6" />
            Make Your Accusation
          </DialogTitle>
          <DialogDescription>
            Declare who committed the theft, what was stolen, where, and when.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="text-center py-6 space-y-4">
            <div className={`flex items-center justify-center gap-2 text-2xl font-bold ${
              result.correct ? "text-success" : "text-destructive"
            }`}>
              {result.correct ? (
                <CheckCircle className="h-8 w-8" />
              ) : (
                <XCircle className="h-8 w-8" />
              )}
              {result.correct ? "Correct!" : "Incorrect!"}
            </div>
            <p className="text-muted-foreground">{result.message}</p>
            {result.aiResponse && (
              <div className="italic p-4 bg-secondary rounded-lg text-sm">
                "{result.aiResponse}"
              </div>
            )}
            <Button onClick={onClose} className="mt-4">
              {result.correct ? "View Solution" : "Continue Investigation"}
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-5 py-4">
              <div className="space-y-2">
                <Label htmlFor="suspect">Who did it?</Label>
                <Select value={suspectId} onValueChange={setSuspectId}>
                  <SelectTrigger id="suspect">
                    <SelectValue placeholder="Select a suspect..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Available Suspects</SelectLabel>
                      {remainingSuspects.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    {eliminatedSuspects.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Eliminated</SelectLabel>
                        {eliminatedSuspects.map((s) => (
                          <SelectItem key={s.id} value={s.id} disabled className="opacity-50">
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="item">What was stolen?</Label>
                <Select value={itemId} onValueChange={setItemId}>
                  <SelectTrigger id="item">
                    <SelectValue placeholder="Select an item..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Available Items</SelectLabel>
                      {remainingItems.map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    {eliminatedItems.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Eliminated</SelectLabel>
                        {eliminatedItems.map((i) => (
                          <SelectItem key={i.id} value={i.id} disabled className="opacity-50">
                            {i.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Where did it happen?</Label>
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger id="location">
                    <SelectValue placeholder="Select a location..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Available Locations</SelectLabel>
                      {remainingLocations.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    {eliminatedLocations.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Eliminated</SelectLabel>
                        {eliminatedLocations.map((l) => (
                          <SelectItem key={l.id} value={l.id} disabled className="opacity-50">
                            {l.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="time">When did it occur?</Label>
                <Select value={timeId} onValueChange={setTimeId}>
                  <SelectTrigger id="time">
                    <SelectValue placeholder="Select a time..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Available Times</SelectLabel>
                      {remainingTimes.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    {eliminatedTimes.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Eliminated</SelectLabel>
                        {eliminatedTimes.map((t) => (
                          <SelectItem key={t.id} value={t.id} disabled className="opacity-50">
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleSubmit}
                disabled={!canSubmit}
              >
                {submitting ? (
                  <>
                    <div className="loading-spinner mr-2" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Gavel className="mr-2 h-4 w-4" />
                    Make Accusation
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
