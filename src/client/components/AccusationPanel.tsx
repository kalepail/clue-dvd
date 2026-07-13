import { useEffect, useState } from "react";
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

interface Props {
  eliminated: EliminationState;
  onClose: () => void;
  onAccuse: (accusation: {
    suspectId: string;
    itemId: string;
    locationId: string;
    timeId: string;
  }) => Promise<{ correct: boolean; message: string; aiResponse?: string; correctCount: number; wrongCount: number }>;
  presetAccusation?: {
    suspectId: string;
    itemId: string;
    locationId: string;
    timeId: string;
  } | null;
  autoSubmit?: boolean;
}

function AccusationCard({
  option,
  imageSrc,
  isSelected,
  isEliminated,
  onPick,
}: {
  option: { id: string; name: string };
  imageSrc?: string;
  isSelected: boolean;
  isEliminated: boolean;
  onPick: () => void;
}) {
  const [imageOk, setImageOk] = useState(true);
  const showImage = Boolean(imageSrc && imageOk);

  return (
    <button
      type="button"
      className={`accusation-card ${isSelected ? "is-selected" : ""}`}
      onClick={onPick}
      disabled={isEliminated}
      aria-pressed={isSelected}
      aria-label={`Select ${option.name}`}
    >
      {showImage ? (
        <img
          className="accusation-card-image"
          src={imageSrc}
          alt={option.name}
          onError={() => setImageOk(false)}
        />
      ) : (
        <span className="accusation-card-text">{option.name}</span>
      )}
      {isEliminated && <span className="accusation-card-disabled">Eliminated</span>}
    </button>
  );
}

export default function AccusationPanel({
  eliminated,
  onClose,
  onAccuse,
  presetAccusation,
  autoSubmit = false,
}: Props) {
  const [suspectId, setSuspectId] = useState("");
  const [itemId, setItemId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [timeId, setTimeId] = useState("");
  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    correct: boolean;
    message: string;
    aiResponse?: string;
    correctCount: number;
    wrongCount: number;
  } | null>(null);

  const canSubmit = suspectId && itemId && locationId && timeId && !submitting;

  useEffect(() => {
    if (!presetAccusation) return;
    setSuspectId(presetAccusation.suspectId);
    setItemId(presetAccusation.itemId);
    setLocationId(presetAccusation.locationId);
    setTimeId(presetAccusation.timeId);
    setStepIndex(3);
  }, [presetAccusation]);

  useEffect(() => {
    if (!autoSubmit || !presetAccusation) return;
    if (!canSubmit || result || submitting) return;
    handleSubmit();
  }, [autoSubmit, presetAccusation, canSubmit, result, submitting]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const response = await onAccuse({ suspectId, itemId, locationId, timeId });
    setResult(response);
    setSubmitting(false);
  };

  const renderAccuracy = (correctCount: number) => {
    const icons = Array.from({ length: 4 }, (_, idx) => (
      idx < correctCount
        ? <CheckCircle key={`ok-${idx}`} className="h-5 w-5 text-success" />
        : <XCircle key={`bad-${idx}`} className="h-5 w-5 text-destructive" />
    ));
    return <div className="flex items-center justify-center gap-2">{icons}</div>;
  };

  const suspectImageById: Record<string, string> = {
    S01: "/images/suspects/Miss_Scarlet.png",
    S02: "/images/suspects/Mustard.png",
    S03: "/images/suspects/Mrs._White.png",
    S04: "/images/suspects/Mr._Green.png",
    S05: "/images/suspects/Mrs_ Peacock.png",
    S06: "/images/suspects/Prof._Plum.png",
    S07: "/images/suspects/Mrs._Meadow-brook.png",
    S08: "/images/suspects/Prince_Azure.png",
    S09: "/images/suspects/Lady Lavendar.png",
    S10: "/images/suspects/Rusty.png",
  };

  const itemImageById: Record<string, string> = {
    I01: "/images/items/Spyglass.png",
    I02: "/images/items/Revolver.png",
    I03: "/images/items/Rare_Book.png",
    I04: "/images/items/Medal.png",
    I05: "/images/items/Billfold.png",
    I06: "/images/items/Gold_Pen.png",
    I07: "/images/items/Letter_Opener.png",
    I08: "/images/items/Crystal_Paperweight.png",
    I09: "/images/items/Pocket_watch.png",
    I10: "/images/items/Jade_Hairpin.png",
    I11: "/images/items/Scarab_Broach.png",
  };

  const locationImageById: Record<string, string> = {
    L01: "/images/locations/Hall.png",
    L02: "/images/locations/Lounge.png",
    L03: "/images/locations/Dining Room.png",
    L04: "/images/locations/Kitchen.png",
    L05: "/images/locations/Ballroom.png",
    L06: "/images/locations/Conservatory.png",
    L07: "/images/locations/Billiard_Room.png",
    L08: "/images/locations/Library.png",
    L09: "/images/locations/Study.png",
    L10: "/images/locations/Rose Garden.png",
    L11: "/images/locations/Fountain.png",
  };

  const timeImageById: Record<string, string> = {
    T01: "/images/times/Dawn.png",
    T02: "/images/times/Breakfast.png",
    T03: "/images/times/Late Morning.png",
    T04: "/images/times/Lunch.png",
    T05: "/images/times/Early Afternoon.png",
    T06: "/images/times/Tea_Time.png",
    T07: "/images/times/Dusk.png",
    T08: "/images/times/Dinner.png",
    T09: "/images/times/Night.png",
    T10: "/images/times/Midnight.png",
  };

  const steps = [
    {
      key: "suspect",
      label: "WHO",
      title: "Who did it?",
      options: SUSPECTS,
      eliminatedIds: eliminated.suspects,
      value: suspectId,
      setValue: setSuspectId,
      imageMap: suspectImageById,
    },
    {
      key: "item",
      label: "WHAT",
      title: "What was stolen?",
      options: ITEMS,
      eliminatedIds: eliminated.items,
      value: itemId,
      setValue: setItemId,
      imageMap: itemImageById,
    },
    {
      key: "location",
      label: "WHERE",
      title: "Where did it happen?",
      options: LOCATIONS,
      eliminatedIds: eliminated.locations,
      value: locationId,
      setValue: setLocationId,
      imageMap: locationImageById,
    },
    {
      key: "time",
      label: "WHEN",
      title: "When did it occur?",
      options: TIMES,
      eliminatedIds: eliminated.times,
      value: timeId,
      setValue: setTimeId,
      imageMap: timeImageById,
    },
  ] as const;

  const currentStep = steps[stepIndex];
  const canContinue = Boolean(currentStep.value);

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[900px]">
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
            {!result.correct && (
              <div className="space-y-2">
                {renderAccuracy(result.correctCount)}
                <p className="text-sm text-muted-foreground">
                  {result.correctCount}/4 correct
                </p>
                <p className="text-sm text-muted-foreground">
                  Turn in {result.wrongCount} card{result.wrongCount === 1 ? "" : "s"} face up to the Evidence Room.
                </p>
                <p className="text-xs text-muted-foreground">
                  Your turn is over.
                </p>
              </div>
            )}
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
              <div className="text-center">
                <div className="text-lg">{currentStep.title}</div>
              </div>

              <div className="accusation-selection-summary">
                <span>WHO: {suspectId ? SUSPECTS.find((s) => s.id === suspectId)?.name : "—"}</span>
                <span>WHAT: {itemId ? ITEMS.find((i) => i.id === itemId)?.name : "—"}</span>
                <span>WHERE: {locationId ? LOCATIONS.find((l) => l.id === locationId)?.name : "—"}</span>
                <span>WHEN: {timeId ? TIMES.find((t) => t.id === timeId)?.name : "—"}</span>
              </div>

              <div className="accusation-grid" role="list">
                {currentStep.options.map((option) => {
                  const isSelected = currentStep.value === option.id;
                  const isEliminated = currentStep.eliminatedIds.includes(option.id);
                  const imageSrc = currentStep.imageMap ? currentStep.imageMap[option.id] : undefined;
                  return (
                    <AccusationCard
                      key={option.id}
                      option={option}
                      imageSrc={imageSrc}
                      isSelected={isSelected}
                      isEliminated={isEliminated}
                      onPick={() => currentStep.setValue(option.id)}
                    />
                  );
                })}
              </div>
            </div>

            <DialogFooter>
              <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <div className="flex gap-3">
                  <Button variant="outline" onClick={onClose} disabled={submitting}>
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
                    disabled={stepIndex === 0}
                  >
                    Back
                  </Button>
                </div>
                {stepIndex < steps.length - 1 ? (
                  <Button
                    onClick={() => setStepIndex((prev) => Math.min(steps.length - 1, prev + 1))}
                    disabled={!canContinue}
                  >
                    Next
                  </Button>
                ) : (
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
                )}
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
