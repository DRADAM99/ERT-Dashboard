"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import TasksWorkspace from "@/components/v2/TasksWorkspace";

export default function TasksPage() {
  return (
    <Suspense fallback={<div className="v2-sub py-10 text-center">טוען...</div>}>
      <TasksPageInner />
    </Suspense>
  );
}

function TasksPageInner() {
  const searchParams = useSearchParams();
  return <TasksWorkspace openTaskId={searchParams.get("open")} startNew={searchParams.get("new") === "1"} />;
}
