"use client";

import { useEffect, useMemo, useState } from "react";
import "@fontsource/rubik/400.css";
import "@fontsource/rubik/500.css";
import "@fontsource/rubik/700.css";
import "@/app/v2.css";
import DrillSandboxDesigner from "@/components/drill/DrillSandboxDesigner";
import { DEMO_RESIDENTS } from "@/components/v2/sitrepDemoData";
import { buildDrillPlan, emptyScenario } from "@/lib/drillPlan";
import { drillMinuteIndex } from "@/lib/drillTime";

/**
 * Local preview of the designer. Sample residents only.
 * Nothing here writes Firestore, resident statuses, or WhatsApp.
 */
export default function DrillSandboxDemoPage() {
  const [scenarios, setScenarios] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(() => emptyScenario());
  const [activeRun, setActiveRun] = useState(null);
  const [notice, setNotice] = useState("תצוגה מקומית עם תושבי דמו. לא נכתב ל-Firestore ולא נשלח וואטסאפ.");
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const onSave = () => {
    const id = selectedId || `demo-${Date.now()}`;
    const next = { ...draft, id, name: draft.name.trim() };
    setScenarios((current) => {
      const without = current.filter((item) => item.id !== id);
      return [{ ...next }, ...without];
    });
    setSelectedId(id);
    setNotice("הטיוטה נשמרה רק במסך הזה.");
  };

  const onActivate = () => {
    const plan = buildDrillPlan({
      residentIds: DEMO_RESIDENTS.map((row) => row.id),
      scenario: draft,
    });
    if (!plan.ok) {
      setNotice(plan.error);
      return;
    }
    setActiveRun({
      id: "demo-run",
      scenarioName: draft.name.trim() || "תרחיש דמו",
      status: "running",
      startedAt: Date.now(),
      durationMinutes: plan.durationMinutes,
      pausedMs: 0,
      pausedAt: null,
      pauseReason: "",
      buckets: plan.buckets,
    });
    setNowMs(Date.now());
    const first = plan.perMinute[0];
    setNotice(`תצוגה מקומית: לא נכתבו סטטוסים ולא פורסמה הודעה. דקה 1 הייתה כותבת ${first?.ok || 0} הכל בסדר, ${first?.help || 0} זקוקים לסיוע, ${first?.unsure || 0} לא בטוח.`);
  };

  const buckets = useMemo(() => {
    if (!activeRun?.buckets) return null;
    const minuteIndex = drillMinuteIndex(activeRun, nowMs);
    return activeRun.buckets.map((bucket) => ({
      ...bucket,
      applied: bucket.minuteIndex < minuteIndex,
    }));
  }, [activeRun, nowMs]);

  return (
    <div className="v2-shell min-h-[100dvh] px-4 py-6 sm:px-6" dir="rtl">
      <DrillSandboxDesigner
        residents={DEMO_RESIDENTS}
        scenarios={scenarios}
        draft={draft}
        selectedId={selectedId}
        activeRun={activeRun}
        buckets={buckets}
        notice={notice}
        nowMs={nowMs}
        onChangeDraft={setDraft}
        onSelectScenario={(id) => {
          const row = scenarios.find((item) => item.id === id);
          if (!row) return;
          setSelectedId(id);
          setDraft(row);
        }}
        onNewScenario={() => {
          setSelectedId(null);
          setDraft(emptyScenario());
        }}
        onSave={onSave}
        onDelete={(id) => {
          setScenarios((current) => current.filter((item) => item.id !== id));
          if (selectedId === id) {
            setSelectedId(null);
            setDraft(emptyScenario());
          }
        }}
        onActivate={onActivate}
        onPause={() => {
          setActiveRun((current) => current && {
            ...current,
            status: "paused",
            pauseReason: "manual",
            pausedAt: Date.now(),
          });
          setNotice("תצוגה מקומית: השעון עצר. אין ריצה בענן.");
        }}
        onResume={() => {
          setActiveRun((current) => {
            if (!current) return current;
            const extra = typeof current.pausedAt === "number" ? Math.max(0, Date.now() - current.pausedAt) : 0;
            return {
              ...current,
              status: "running",
              pauseReason: "",
              pausedMs: Math.round((Number(current.pausedMs) || 0) + extra),
              pausedAt: null,
            };
          });
          setNotice("תצוגה מקומית: ההמשך מאותה נקודה. אין כתיבה ל-Firestore.");
        }}
      />
    </div>
  );
}
