import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors",
  {
    variants: {
      variant: {
        default: "border-cyan-400/20 bg-cyan-500/10 text-cyan-100",
        secondary: "border-slate-700 bg-slate-900/80 text-slate-200",
        outline: "border-slate-700/80 bg-transparent text-slate-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
