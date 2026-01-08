import { MessageCircle, XCircle } from "lucide-react";
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
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-primary">
          <MessageCircle className="h-4 w-4" />
          <span className="font-semibold">{speaker}</span>
        </div>
        <Badge variant="outline" className="bg-background">
          Clue #{index}
        </Badge>
      </div>

      <blockquote className="border-l-2 border-primary/50 pl-4 italic text-foreground">
        "{text}"
      </blockquote>

      {eliminated && (
        <div className="mt-4 flex items-center gap-2 text-sm text-destructive">
          <XCircle className="h-4 w-4" />
          <span>
            Eliminates <span className="font-medium">{eliminated.type}</span>: {eliminated.id}
          </span>
        </div>
      )}
    </div>
  );
}
