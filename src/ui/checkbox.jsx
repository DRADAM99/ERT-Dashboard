import * as React from "react"
// You may need to install @radix-ui/react-checkbox and lucide-react for icons
// import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
// import { CheckIcon } from "lucide-react"

function cn(...args) { return args.filter(Boolean).join(' '); }

function Checkbox({
  className,
  ...props
}) {
  return (
    <input
      type="checkbox"
      className={cn(
        "peer border-input dark:bg-input/30 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Checkbox } 