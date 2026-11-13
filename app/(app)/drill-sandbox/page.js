"use client";

import { useEffect, useState } from "react";
import { useData } from "@/app/context/DataContext";
import DrillSandboxDesigner from "@/components/drill/DrillSandboxDesigner";
import { emptyScenario, scenarioFromDoc } from "@/lib/drillPlan";
import {
  activateDrillScenario,
  deleteDrillScenario,
  pauseDrillRun,
  publishDrillClock,
  resumeDrillRun,
  saveDrillScenario,
  subscribeActiveDrillRuns,
  subscribeDrillBuckets,
  subscribeDrillLock,
  subscribeDrillScenarios,
} from "@/lib/drillSandbox";

export default function DrillSandboxPage() {
  const { currentUserData, residents, loading } = useData();
  const [scenarios, setScenarios] = useState([]);
  const [activeRuns, setActiveRuns] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(() => emptyScenario());
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [listenError, setListenError] = useState("");
  const [buckets, setBuckets] = useState(null);
  const [clockLock, setClockLock] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const role = currentUserData?.role || "";
  const updatedBy = currentUserData?.alias || currentUserData?.email || "";

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (role !== "admin") return undefined;
    const unsubScenarios = subscribeDrillScenarios(setScenarios, (error) => {
      setListenError(error?.message || "לא ניתן לקרוא תרחישים. צריך לפרוס את כללי Firestore.");
    });
    const unsubRuns = subscribeActiveDrillRuns(setActiveRuns, (error) => {
      setListenError(error?.message || "לא ניתן לקרוא ריצות תרגיל. צריך לפרוס את כללי Firestore.");
    });
    return () => {
      unsubScenarios();
      unsubRuns();
    };
  }, [role]);

  const applyScenario = (row) => {
    setSelectedId(row.id);
    setDraft(scenarioFromDoc(row.id, row));
    setDirty(false);
    setNotice("");
  };

  const selectScenario = (id) => {
    if (dirty && !window.confirm("יש שינויים שלא נשמרו. לעבור לתרחיש אחר?")) return;
    const row = scenarios.find((item) => item.id === id);
    if (row) applyScenario(row);
  };

  const onNewScenario = () => {
    if (dirty && !window.confirm("יש שינויים שלא נשמרו. להתחיל תרחיש חדש?")) return;
    setSelectedId(null);
    setDraft(emptyScenario());
    setDirty(false);
    setNotice("");
  };

  const onChangeDraft = (next) => {
    setDraft(next);
    setDirty(true);
  };

  const onSave = async () => {
    setBusy(true);
    setNotice("");
    try {
      const id = await saveDrillScenario({ id: selectedId, scenario: draft, updatedBy });
      setSelectedId(id);
      setDirty(false);
      setNotice("הטיוטה נשמרה.");
    } catch (error) {
      setNotice(error?.message || "שמירת הטיוטה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id) => {
    if (!window.confirm("למחוק את הטיוטה?")) return;
    setBusy(true);
    setNotice("");
    try {
      await deleteDrillScenario(id);
      if (selectedId === id) {
        setSelectedId(null);
        setDraft(emptyScenario());
        setDirty(false);
      }
      setNotice("הטיוטה נמחקה.");
    } catch (error) {
      setNotice(error?.message || "מחיקת הטיוטה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  const onActivate = async () => {
    setBusy(true);
    setNotice("");
    try {
      const id = await saveDrillScenario({ id: selectedId, scenario: draft, updatedBy });
      setSelectedId(id);
      setDirty(false);
      const result = await activateDrillScenario({
        scenarioId: id,
        scenario: draft,
        residentIds: (residents || []).map((row) => row.id),
        updatedBy,
      });
      if (result.announcementError) {
        setNotice(`התרגיל עלה לאוויר, אבל פרסום ההודעה לציבור נכשל: ${result.announcementError}`);
      } else {
        setNotice("התרגיל פעיל. ההודעה פורסמה, והסטטוסים ייכתבו לפי הדקות.");
      }
    } catch (error) {
      setNotice(error?.message || "ההפעלה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  const onPause = async (runId) => {
    setBusy(true);
    setNotice("");
    try {
      await pauseDrillRun({ runId, updatedBy });
      setNotice("התרגיל הושהה. השעון עצר, ודקות שטרם נכתבו ייכתבו אחרי המשך.");
    } catch (error) {
      setNotice(error?.message || "ההשהיה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  const onResume = async (runId) => {
    setBusy(true);
    setNotice("");
    try {
      await resumeDrillRun({ runId, updatedBy });
      setNotice("התרגיל המשיך מאותה נקודה. דקות שכבר הגיע זמנן לא דולגו.");
    } catch (error) {
      setNotice(error?.message || "ההמשך נכשל");
    } finally {
      setBusy(false);
    }
  };

  const activeRun = activeRuns.find((run) => run.status === "running")
    || activeRuns.find((run) => run.status === "paused")
    || null;
  const activeRunId = activeRun?.id || "";
  const pausedAtMs = activeRun?.pausedAt?.toMillis?.()
    || (typeof activeRun?.pausedAt === "number" ? activeRun.pausedAt : 0);

  useEffect(() => {
    if (role !== "admin") return undefined;
    return subscribeDrillLock(setClockLock, () => setClockLock(null));
  }, [role]);

  useEffect(() => {
    if (role !== "admin" || !activeRunId) {
      setBuckets(null);
      return undefined;
    }
    setBuckets(null);
    return subscribeDrillBuckets(activeRunId, setBuckets, () => setBuckets([]));
  }, [role, activeRunId]);

  useEffect(() => {
    if (role !== "admin" || !activeRun) return undefined;
    publishDrillClock(activeRun).catch(() => {});
    return undefined;
  }, [role, activeRun, activeRunId, activeRun?.status, activeRun?.pausedMs, pausedAtMs]);

  const displayRun = activeRun && clockLock?.activeRunId === activeRun.id
    ? { ...activeRun, pausedMs: clockLock.pausedMs ?? activeRun.pausedMs }
    : activeRun;

  if (loading || !currentUserData) {
    return <div className="p-6 text-sm text-[var(--v2-muted)]">טוען...</div>;
  }
  if (role !== "admin") {
    return <div className="v2-card p-6 text-sm">העמוד זמין למנהלים בלבד.</div>;
  }

  return (
    <DrillSandboxDesigner
      residents={residents || []}
      scenarios={scenarios.map((row) => scenarioFromDoc(row.id, row))}
      draft={draft}
      selectedId={selectedId}
      activeRun={displayRun}
      buckets={buckets}
      busy={busy}
      listenError={listenError}
      notice={notice}
      nowMs={nowMs}
      onChangeDraft={onChangeDraft}
      onSelectScenario={selectScenario}
      onNewScenario={onNewScenario}
      onSave={onSave}
      onDelete={onDelete}
      onActivate={onActivate}
      onPause={onPause}
      onResume={onResume}
    />
  );
}
