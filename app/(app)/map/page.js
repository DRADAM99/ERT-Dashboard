"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import MapWorkspace from "@/components/v2/MapWorkspace";

export default function MapPage() {
  return (
    <Suspense fallback={<div className="v2-sub py-10 text-center">טוען...</div>}>
      <MapPageInner />
    </Suspense>
  );
}

function MapPageInner() {
  const searchParams = useSearchParams();
  return <MapWorkspace openResidentId={searchParams.get("open")} />;
}
