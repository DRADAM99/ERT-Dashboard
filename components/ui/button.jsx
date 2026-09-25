import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-[#3B82F6] text-white shadow-md hover:bg-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 disabled:bg-blue-200 disabled:text-blue-800 disabled:shadow-none",
        destructive:
          "bg-[#EF4444] text-white shadow-md hover:bg-[#DC2626] focus-visible:ring-2 focus-visible:ring-[#EF4444]/30 disabled:bg-red-200 disabled:text-red-800 disabled:shadow-none",
        outline:
          "border bg-white text-gray-900 shadow-sm border-gray-300 hover:bg-gray-50 hover:border-gray-400 focus-visible:ring-2 focus-visible:ring-[#3B82F6]/30 disabled:bg-gray-100 disabled:text-gray-500 disabled:border-gray-200",
        secondary:
          "bg-[#6B7280] text-white shadow-md hover:bg-[#4B5563] focus-visible:ring-2 focus-visible:ring-[#6B7280]/40 disabled:bg-gray-300 disabled:text-gray-600 disabled:shadow-none",
        ghost:
          "text-gray-700 hover:bg-gray-100 hover:text-gray-900 disabled:text-gray-400",
        link: "text-[#3B82F6] underline-offset-4 hover:underline disabled:text-blue-300",
        success:
          "bg-[#10B981] text-white shadow-md hover:bg-[#059669] focus-visible:ring-2 focus-visible:ring-[#10B981]/40 disabled:bg-emerald-200 disabled:text-emerald-800 disabled:shadow-none",
        filteractive: "bg-black text-white shadow-md border border-black hover:bg-gray-900 focus-visible:ring-2 focus-visible:ring-black/40 disabled:bg-gray-400 disabled:border-gray-400 disabled:shadow-none",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-7 rounded-md gap-1 px-2 text-xs has-[>svg]:px-1.5",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
