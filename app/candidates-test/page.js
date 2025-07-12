"use client";
import CandidatesBlock from "../../components/CandidatesBlock";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function CandidatesTestPage() {
  return (
    <TooltipProvider>
      <div className="p-8">
        <CandidatesBlock />
      </div>
    </TooltipProvider>
  );
}