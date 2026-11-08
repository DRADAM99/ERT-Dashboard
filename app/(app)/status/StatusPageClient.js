"use client";

import { useEffect, useState } from "react";
import StatusWorkspace from "@/components/v2/StatusWorkspace";
import WidgetSitrepDashboard from "@/components/v2/WidgetSitrepDashboard";

const VIEW_STORAGE_KEY = "ert.statusView.v1";

export default function StatusPageClient() {
  const [view, setView] = useState("widgets");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (saved === "classic" || saved === "widgets") setView(saved);
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  const switchView = (next) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  if (!ready) {
    return (
      <div className="v2-sub p-4" dir="rtl">
        טוען תמונת מצב…
      </div>
    );
  }

  if (view === "classic") {
    return (
      <StatusWorkspace
        onSwitchToWidgets={() => switchView("widgets")}
      />
    );
  }

  return (
    <WidgetSitrepDashboard
      initialDataSource="live"
      showDemoToggle={false}
      onSwitchToClassic={() => switchView("classic")}
      embedded
    />
  );
}
