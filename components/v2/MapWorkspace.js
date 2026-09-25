"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useData } from "@/app/context/DataContext";
import { NEED_HELP_STATUSES, getFieldValue, residentName, residentStatus } from "@/lib/residents";
import { residentStatusDotClass } from "@/components/v2/format";
import ResidentRecord from "@/components/v2/ResidentRecord";
import RecordOverlay from "@/components/v2/RecordOverlay";

const EMERGENCY_LOCATOR_ORIGIN = "https://emergency-locator-585a5.web.app";

export default function MapWorkspace({ openResidentId }) {
  const { residents } = useData();
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.origin !== EMERGENCY_LOCATOR_ORIGIN) return;
      if (event.data?.type === "COPY_LOCATION" && event.data?.url) {
        navigator.clipboard.writeText(event.data.url).catch(() => {});
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    if (!openResidentId) return;
    const found = (residents || []).find((row) => row.id === openResidentId);
    if (found) setSelected(found);
  }, [openResidentId, residents]);

  const needHelp = useMemo(
    () => (residents || []).filter((row) => NEED_HELP_STATUSES.includes(residentStatus(row))),
    [residents]
  );
  const liveSelected = selected ? (residents || []).find((row) => row.id === selected.id) || selected : null;

  return (
    <div className="v2-page-fill">
      <div className="v2-toolbar">
        <div>
          <h1 className="v2-h1">מפת מיקומי חירום</h1>
          <p className="v2-sub">תושבים שצריכים מענה לצד המפה החיה</p>
        </div>
        <div className="v2-row">
          <span className="v2-pill"><i className="v2-dot v2-st-help" /> זקוקים לסיוע</span>
          <span className="v2-pill"><i className="v2-dot v2-st-unsure" /> לא בטוח</span>
          <span className="v2-pill"><i className="v2-dot v2-st-hurt" /> פצוע</span>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[280px_1fr]">
        <div className="v2-card min-h-0 overflow-auto">
          {needHelp.length === 0 && <div className="p-4 text-sm text-[var(--v2-muted)]">אין תושבים שסומנו כצריכים מענה.</div>}
          {needHelp.map((row) => (
            <Link
              key={row.id}
              href={`/residents?open=${row.id}`}
              className={`v2-split-row no-underline text-[var(--v2-ink)] ${liveSelected?.id === row.id ? "on" : ""}`}
            >
              <i className={`v2-tab ${residentStatusDotClass(residentStatus(row))}`} />
              <div>
                <div className="n">{residentName(row)}</div>
                <div className="m">{residentStatus(row)} · {getFieldValue(row, "שכונה") || "ללא שכונה"}</div>
              </div>
            </Link>
          ))}
        </div>
        <div className="v2-card min-h-[42vh] overflow-hidden lg:min-h-0">
          <iframe
            src={`${EMERGENCY_LOCATOR_ORIGIN}/map.html`}
            className="h-full w-full min-h-[42vh] border-0 lg:min-h-full"
            title="Emergency Locator Map"
            allow="geolocation clipboard-write"
          />
        </div>
      </div>

      <RecordOverlay open={!!liveSelected} onClose={() => setSelected(null)}>
        {liveSelected && (
          <ResidentRecord key={liveSelected.id} resident={liveSelected} variant="sheet" onClose={() => setSelected(null)} />
        )}
      </RecordOverlay>
    </div>
  );
}
