import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/client/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-primary bg-transparent text-primary",
        secondary:
          "border-border bg-secondary text-muted-foreground",
        destructive:
          "border-destructive bg-transparent text-destructive",
        success:
          "border-success bg-transparent text-success",
        outline: "border-border text-foreground",
        setup: "border-border bg-secondary text-muted-foreground",
        "in-progress": "border-primary bg-transparent text-primary",
        solved: "border-success bg-transparent text-success",
        abandoned: "border-destructive bg-transparent text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div
      className={cn(badgeVariants({ variant }), className)}
      style={{ fontFamily: "var(--font-display)" }}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
