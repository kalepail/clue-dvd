import { MessageCircle } from "lucide-react";
import { Badge } from "@/client/components/ui/badge";

interface Props {
  speaker: string;
  text: string;
  eliminated?: { type: string; id: string };
  index: number;
}

export default function ClueDisplay({ speaker, text, eliminated, index }: Props) {
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

      {null}
    </div>
  );
}
