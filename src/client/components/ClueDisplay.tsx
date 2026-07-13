import { MessageCircle } from "lucide-react";
import { Badge } from "@/client/components/ui/badge";
import type { EvidenceCapsule } from "@/shared/evidence";

interface Props {
  speaker: string;
  text: string;
  index: number;
  evidence?: EvidenceCapsule;
}

export default function ClueDisplay({ speaker, text, index, evidence }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-primary text-sm">
          <MessageCircle className="h-3.5 w-3.5" />
          <span className="font-semibold">{speaker}</span>
        </div>
        <Badge variant="outline" className="bg-background text-xs">
          Clue #{index}
        </Badge>
      </div>

      <blockquote className="border-l-2 border-primary/50 pl-3 italic text-foreground text-sm leading-snug clue-display-text">
        "{text}"
      </blockquote>

      {evidence && (
        <div className="mt-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          <div className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-primary">
            Write this down{evidence.role === "context" ? " — context only" : ""}
          </div>
          <p className="mt-1 text-sm font-medium leading-snug text-foreground">
            {evidence.statement}
          </p>
        </div>
      )}
    </div>
  );
}
