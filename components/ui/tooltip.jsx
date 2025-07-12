"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip" // Ensure Radix UI tooltip is installed

import { cn } from "@/lib/utils" // Assuming you have this utility function

// Use TooltipPrimitive.Provider directly, optionally setting delayDuration
const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

// --- TooltipTrigger Definition (Alternative Style) ---
// Using a standard function declaration inside forwardRef and removing TS generics
const TooltipTrigger = React.forwardRef(function TooltipTriggerFn( // Named function
  { children, ...props },
  ref
) {
  return (
    // Use asChild to merge props and behavior onto the immediate child element
    <TooltipPrimitive.Trigger ref={ref} asChild {...props}>
      {children}
    </TooltipPrimitive.Trigger>
  );
});
// Set displayName AFTER the component definition
// Trying again to assign from primitive, assuming syntax error was the previous blocker
TooltipTrigger.displayName = TooltipPrimitive.Trigger.displayName;


// --- TooltipContent Definition (Alternative Style) ---
// Using a standard function declaration inside forwardRef and removing TS generics
const TooltipContent = React.forwardRef(function TooltipContentFn( // Named function
  { className, sideOffset = 4, children, ...props },
  ref
) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          "z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className // Use your project's specific styling classes here
        )}
        {...props}
      >
        {children}
        {/* Optional: Arrow - ensure styling matches */}
        {/* <TooltipPrimitive.Arrow className="fill-primary" /> */}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
});
// Set displayName AFTER the component definition
// Trying again to assign from primitive
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
