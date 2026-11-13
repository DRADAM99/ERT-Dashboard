"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/firebase";
import { drillElapsedMs, formatClock } from "@/lib/drillTime";
import { subscribeActiveDrillRuns } from "@/lib/drillSandbox";

function pickRun(runs) {
  return (runs || []).find((run) => run.status === "running")
    || (runs || []).find((run) => run.status === "paused")
    || null;
}

/**
 * Seconds clock for the signed-in shell. Prefers the drill run while one
 * is running or paused, and freezes for the length of the pause.
 */
export function useDrillClock({ enabled = true, isAdmin = false } = {}) {
  const [lock, setLock] = useState(null);
  const [run, setRun] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return undefined;
    return onSnapshot(
      doc(db, "systemSettings", "drillSandbox"),
      (snap) => setLock(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      () => setLock(null)
    );
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !isAdmin) return undefined;
    return subscribeActiveDrillRuns(setRunFromList, () => setRun(null));
    function setRunFromList(rows) {
      setRun(pickRun(rows));
    }
  }, [enabled, isAdmin]);

  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enabled]);

  const lockActive = lock && (lock.activeStatus === "running" || lock.activeStatus === "paused")
    ? { ...lock, status: lock.activeStatus }
    : null;
  const source = run
    ? {
      ...run,
      pausedMs: lock?.activeRunId === run.id ? (lock.pausedMs ?? run.pausedMs) : run.pausedMs,
      startedAt: run.startedAt || lock?.startedAt,
    }
    : lockActive;
  if (!enabled || !source) {
    return { active: false, label: "00:00:00", frozen: false, nowMs };
  }
  return {
    active: true,
    label: formatClock(drillElapsedMs(source, nowMs)),
    frozen: source.status === "paused",
    nowMs,
  };
}
