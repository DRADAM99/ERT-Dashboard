"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import EventLogWorkspace from "@/components/v2/EventLogWorkspace";

export default function EventsPage() {
  return (
    <Suspense fallback={<div className="v2-sub py-10 text-center">טוען...</div>}>
      <EventsPageInner />
    </Suspense>
  );
}

function EventsPageInner() {
  const searchParams = useSearchParams();
  return <EventLogWorkspace openEventId={searchParams.get("open")} />;
}
