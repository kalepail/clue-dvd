import type { LucideIcon } from "lucide-react";
import { cn } from "@/client/lib/utils";

interface IconStatProps {
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
}

export function IconStat({ icon: Icon, children, className }: IconStatProps) {
  return (
    <div className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
      <Icon className="h-4 w-4" />
      <span>{children}</span>
    </div>
  );
}
