"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { arrayUnion, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { ArrowUpDown, Phone, RefreshCw, UserPlus, X } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { db } from "@/firebase";
import { useAuth } from "@/app/context/AuthContext";
import { useData } from "@/app/context/DataContext";
import { useToast } from "@/components/ui/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createTask } from "@/lib/createTask";
import {
  BOARD_STATUSES,
  DEFAULT_TASK_CATEGORIES,
  getFieldValue,
  phoneHref,
  residentName,
  residentStatus,
  residentTaskSummary,
  RESIDENT_STATUSES,
  whatsAppHref,
} from "@/lib/residents";
import { relativeTime, residentStatusDotClass, toDate } from "@/components/v2/format";
import ResidentRecord from "@/components/v2/ResidentRecord";
import RecordOverlay from "@/components/v2/RecordOverlay";

const ADVANCED_FILTER_FIELDS = ["שכונה", "הורה/ילד", "סטטוס מגורים"];
const PREFS_FIELD = "residentsManagement";
const STATUS_PRIORITY = {
  פצוע: 1,
  "זקוקים לסיוע": 2,
  "לא בטוח": 3,
  "כולם בסדר": 4,
  "ללא סטטוס": 5,
};

function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

function localPrefsKey(uid) {
  return `ert.residentsManagement.${uid}`;
}

function fieldText(row, field) {
  const value = getFieldValue(row, field);
  if (value == null) return "";
  return String(value).trim();
}

function sanitizePrefs(raw = {}) {
  const selectedStatusFilters = Array.isArray(raw.selectedStatusFilters)
    ? raw.selectedStatusFilters.filter((status) => RESIDENT_STATUSES.includes(status))
    : [];
  const advancedFilters = Array.isArray(raw.advancedFilters)
    ? raw.advancedFilters.filter(
        (filter) =>
          filter &&
          ADVANCED_FILTER_FIELDS.includes(filter.field) &&
          typeof filter.value === "string" &&
          filter.value.trim()
      )
    : [];
  return {
    selectedStatusFilters,
    advancedFilters,
    sortBy: raw.sortBy === "status" || raw.sortBy === "name" ? raw.sortBy : "syncedAt",
    sortDirection: raw.sortDirection === "asc" ? "asc" : "desc",
    searchTerm: typeof raw.searchTerm === "string" ? raw.searchTerm : "",
  };
}

function readLocalPrefs(uid) {
  if (!uid || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(localPrefsKey(uid));
    return raw ? sanitizePrefs(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeLocalPrefs(uid, prefs) {
  if (!uid || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(localPrefsKey(uid), JSON.stringify(prefs));
  } catch {
    /* ignore quota / private mode */
  }
}

function TaskIndicators({ summary, unread }) {
  if (!summary && !unread) return null;
  return (
    <span className="v2-task-dots" title={summary ? `${summary.total} משימות מקושרות` : "הערה חדשה"}>
      {unread && <i className="v2-task-unread" title="יש הערה או תגובה חדשה" />}
      {summary?.pending > 0 && <i className="v2-task-dot pending" title={`${summary.pending} מחכות`} />}
      {summary?.inProgress > 0 && <i className="v2-task-dot progress" title={`${summary.inProgress} בטיפול`} />}
      {summary?.completed > 0 && <i className="v2-task-dot done" title={`${summary.completed} טופלו`} />}
    </span>
  );
}

function ResidentQuickActions({
  row,
  summary,
  onAssign,
  showAssign = true,
  showLabels = false,
}) {
  const phoneValue = fieldText(row, "טלפון");
  const tel = phoneHref(phoneValue);
  const wa = whatsAppHref(phoneValue);
  const assignLabel =
    summary?.total > 0 ? `${summary.total} משימות` : showLabels ? "הקצה משימה" : "הקצה";

  return (
    <div className="v2-res-actions" onClick={(event) => event.stopPropagation()}>
      {showAssign && (
        <button
          type="button"
          className={`v2-btn v2-btn-sm v2-btn-assign ${summary?.total > 0 ? "has-tasks" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            onAssign?.(row);
          }}
          title="הקצה משימה"
          aria-label="הקצה משימה"
        >
          <UserPlus className="h-3.5 w-3.5" />
          <span>{assignLabel}</span>
        </button>
      )}
      {wa ? (
        <a
          className="v2-btn v2-btn-icon v2-btn-wa"
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
          title={`WhatsApp ל-${phoneValue}`}
          aria-label="WhatsApp"
        >
          <FaWhatsapp className="h-4 w-4" />
        </a>
      ) : (
        <span className="v2-btn v2-btn-icon v2-btn-wa is-disabled" aria-disabled="true" title="אין טלפון">
          <FaWhatsapp className="h-4 w-4" />
        </span>
      )}
      {tel ? (
        <a
          className="v2-btn v2-btn-icon v2-btn-call"
          href={tel}
          onClick={(event) => event.stopPropagation()}
          title={`חייג ל-${phoneValue}`}
          aria-label="חייג"
        >
          <Phone className="h-4 w-4" strokeWidth={1.75} />
        </a>
      ) : (
        <span className="v2-btn v2-btn-icon v2-btn-call is-disabled" aria-disabled="true" title="אין טלפון">
          <Phone className="h-4 w-4" strokeWidth={1.75} />
        </span>
      )}
    </div>
  );
}

export default function ResidentsWorkspace({ view, onViewChange, openResidentId, urlQuery = "" }) {
  const { currentUser } = useAuth();
  const { residents, currentUserData, tasks, taskCategories } = useData();
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const isAdmin = currentUserData?.role === "admin";
  const alias = currentUserData?.alias || currentUser?.email || "";
  const department = currentUserData?.department || "";
  const categories = taskCategories?.length ? taskCategories : DEFAULT_TASK_CATEGORIES;
  const [queryText, setQueryText] = useState(() => (typeof urlQuery === "string" ? urlQuery : ""));
  const [selected, setSelected] = useState(null);
  const [sortBy, setSortBy] = useState("syncedAt");
  const [sortDirection, setSortDirection] = useState("desc");
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [advancedFilters, setAdvancedFilters] = useState([]);
  const [draftFilter, setDraftFilter] = useState({ field: "", value: "" });
  const [statusOpen, setStatusOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [assignResident, setAssignResident] = useState(null);
  const [assignForm, setAssignForm] = useState({ title: "", category: DEFAULT_TASK_CATEGORIES[0], priority: "רגיל" });
  const [savingAssign, setSavingAssign] = useState(false);
  const openedRef = useRef(null);
  const skipSave = useRef(true);
  const searchDirtyRef = useRef(Boolean(urlQuery));
  const lastUrlQueryRef = useRef(typeof urlQuery === "string" ? urlQuery : "");

  useEffect(() => {
    const first = categories[0];
    if (first && !categories.includes(assignForm.category)) {
      setAssignForm((prev) => ({ ...prev, category: first }));
    }
  }, [categories, assignForm.category]);

  const applyPrefs = (prefs, { applySearch = true } = {}) => {
    setSelectedStatuses(prefs.selectedStatusFilters);
    setAdvancedFilters(prefs.advancedFilters);
    setSortBy(prefs.sortBy);
    setSortDirection(prefs.sortDirection);
    if (applySearch && !searchDirtyRef.current) {
      setQueryText(prefs.searchTerm);
    }
  };

  const replaceQuery = (updates) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    Object.entries(updates).forEach(([key, value]) => {
      if (value == null || value === "") params.delete(key);
      else params.set(key, value);
    });
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const setSearchQuery = (value) => {
    searchDirtyRef.current = true;
    setQueryText(value);
  };

  useEffect(() => {
    const next = typeof urlQuery === "string" ? urlQuery : "";
    if (lastUrlQueryRef.current === next) return;
    lastUrlQueryRef.current = next;
    setQueryText(next);
    if (next) searchDirtyRef.current = true;
  }, [urlQuery]);

  useEffect(() => {
    if (!prefsLoaded) return;
    if (lastUrlQueryRef.current === queryText) return;
    lastUrlQueryRef.current = queryText;
    replaceQuery({ q: queryText || null });
    // pathname/router are used inside replaceQuery; sync only when the typed query changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryText, prefsLoaded]);

  useEffect(() => {
    if (!openResidentId) {
      openedRef.current = null;
      return;
    }
    if (openedRef.current === openResidentId) return;
    const found = (residents || []).find((row) => row.id === openResidentId);
    if (found) {
      setSelected(found);
      openedRef.current = openResidentId;
    }
  }, [openResidentId, residents]);

  useEffect(() => {
    skipSave.current = true;
    setPrefsLoaded(false);
    const uid = currentUser?.uid;
    if (!uid) {
      setPrefsLoaded(true);
      return undefined;
    }

    const hasUrlQuery = Boolean(typeof urlQuery === "string" && urlQuery);
    const local = readLocalPrefs(uid);
    if (local) applyPrefs(local, { applySearch: !hasUrlQuery && !searchDirtyRef.current });

    let cancelled = false;
    (async () => {
      try {
        const [prefSnap, userSnap] = await Promise.all([
          getDoc(doc(db, "userPreferences", uid)),
          getDoc(doc(db, "users", uid)),
        ]);
        if (cancelled) return;
        const classicRaw = prefSnap.exists() ? prefSnap.data()?.[PREFS_FIELD] : null;
        const classic = classicRaw ? sanitizePrefs(classicRaw) : null;
        const userData = userSnap.exists() ? userSnap.data() : {};
        const fromUser = sanitizePrefs({
          selectedStatusFilters: userData.resident_selectedStatuses,
          advancedFilters: userData.resident_advancedFilters,
          sortBy: userData.resident_sortBy,
          sortDirection: userData.resident_sortDirection,
          searchTerm: userData.resident_searchTerm,
        });
        const hasUserFilters =
          Array.isArray(userData.resident_selectedStatuses) ||
          Array.isArray(userData.resident_advancedFilters) ||
          userData.resident_sortBy ||
          userData.resident_sortDirection ||
          typeof userData.resident_searchTerm === "string";

        const next = classic || (hasUserFilters ? fromUser : local) || sanitizePrefs({});
        if (classic && !classic.searchTerm && fromUser.searchTerm) next.searchTerm = fromUser.searchTerm;
        if (classic && classic.sortBy !== "name" && fromUser.sortBy === "name") next.sortBy = "name";
        applyPrefs(next, { applySearch: !hasUrlQuery && !searchDirtyRef.current });
        writeLocalPrefs(uid, next);
      } finally {
        if (!cancelled) setPrefsLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Only reload prefs when the signed-in user changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.uid]);

  const persistPrefs = useMemo(
    () =>
      debounce((userId, prefs) => {
        setDoc(doc(db, "userPreferences", userId), { [PREFS_FIELD]: prefs }, { merge: true }).catch(() => {});
      }, 1200),
    []
  );

  useEffect(() => {
    if (!prefsLoaded || !currentUser?.uid) return;
    const prefs = {
      selectedStatusFilters: selectedStatuses,
      advancedFilters,
      sortBy,
      sortDirection,
      searchTerm: queryText,
    };
    writeLocalPrefs(currentUser.uid, prefs);
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    persistPrefs(currentUser.uid, prefs);
  }, [prefsLoaded, currentUser?.uid, queryText, sortBy, sortDirection, selectedStatuses, advancedFilters, persistPrefs]);

  const advancedFilterOptions = useMemo(() => {
    const options = {};
    ADVANCED_FILTER_FIELDS.forEach((field) => {
      options[field] = [...new Set((residents || []).map((row) => fieldText(row, field)).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "he")
      );
    });
    return options;
  }, [residents]);

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    const rows = (residents || []).filter((row) => {
      const status = residentStatus(row);
      if (selectedStatuses.length && !selectedStatuses.includes(status)) return false;
      if (advancedFilters.some((filter) => fieldText(row, filter.field) !== filter.value)) return false;
      if (!q) return true;
      const hay = [
        residentName(row),
        fieldText(row, "שם פרטי"),
        fieldText(row, "שם משפחה"),
        fieldText(row, "טלפון"),
        fieldText(row, "שכונה"),
        fieldText(row, "הורה/ילד"),
        fieldText(row, "סטטוס מגורים"),
        status,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
    rows.sort((a, b) => {
      if (sortBy === "name") {
        const cmp = residentName(a).localeCompare(residentName(b), "he");
        return sortDirection === "asc" ? cmp : -cmp;
      }
      if (sortBy === "status") {
        const priorityA = STATUS_PRIORITY[residentStatus(a)] ?? 99;
        const priorityB = STATUS_PRIORITY[residentStatus(b)] ?? 99;
        if (priorityA !== priorityB) return sortDirection === "asc" ? priorityA - priorityB : priorityB - priorityA;
      }
      const dateA = toDate(a.syncedAt || a.updatedAt || a.createdAt)?.getTime() || 0;
      const dateB = toDate(b.syncedAt || b.updatedAt || b.createdAt)?.getTime() || 0;
      return sortDirection === "asc" ? dateA - dateB : dateB - dateA;
    });
    return rows;
  }, [residents, queryText, selectedStatuses, advancedFilters, sortBy, sortDirection]);

  const liveSelected = selected ? (residents || []).find((row) => row.id === selected.id) || selected : null;
  const active = view === "split" ? liveSelected || filtered[0] : liveSelected;
  const statusLabel = selectedStatuses.length === 0
    ? "כל הסטטוסים"
    : selectedStatuses.length === 1
      ? selectedStatuses[0]
      : `${selectedStatuses.length} סטטוסים`;

  const toggleStatusFilter = (status) => {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((item) => item !== status) : [...prev, status]
    );
  };

  const addAdvancedFilter = () => {
    if (!draftFilter.field || !draftFilter.value) return;
    setAdvancedFilters((prev) => {
      if (prev.some((item) => item.field === draftFilter.field && item.value === draftFilter.value)) return prev;
      return [...prev, { ...draftFilter }];
    });
    setDraftFilter({ field: "", value: "" });
    setFilterOpen(false);
  };

  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const syncFn = httpsCallable(getFunctions(), "syncResidentsManual");
      const result = await syncFn({});
      toast({
        title: "סנכרון הושלם",
        description: `${result.data?.count ?? 0} תושבים עודכנו בהצלחה`,
      });
    } catch (error) {
      toast({
        title: "שגיאת סנכרון",
        description: error.message || "הסנכרון נכשל",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const openRow = (row) => {
    setSelected(row);
    if (row?.id) {
      openedRef.current = row.id;
      replaceQuery({ open: row.id });
    }
  };

  const closeRow = () => {
    setSelected(null);
    openedRef.current = null;
    replaceQuery({ open: null });
  };

  const openAssign = (row) => {
    setAssignResident(row);
    setAssignForm({
      title: "",
      category: categories[0] || DEFAULT_TASK_CATEGORIES[0],
      priority: "רגיל",
    });
  };

  const closeAssign = () => {
    if (savingAssign) return;
    setAssignResident(null);
  };

  const submitAssign = async (event) => {
    event?.preventDefault?.();
    if (!assignResident || !currentUser) return;
    if (!assignForm.title.trim()) {
      toast({ title: "נא למלא כותרת משימה" });
      return;
    }
    if (savingAssign) return;
    setSavingAssign(true);
    try {
      const title = assignForm.title.trim();
      const name = residentName(assignResident);
      const phone = fieldText(assignResident, "טלפון");
      const neighborhood = fieldText(assignResident, "שכונה");
      const status = residentStatus(assignResident);
      const taskId = await createTask({
        currentUser,
        alias,
        department,
        fallbackCategories: categories,
        taskData: {
          title,
          subtitle: `תושב: ${name} - ${neighborhood}`,
          priority: assignForm.priority,
          category: assignForm.category,
          department: assignForm.category,
          status: "מחכה",
          dueDate: new Date(),
          residentId: assignResident.id,
          residentName: name,
          residentPhone: phone,
          residentNeighborhood: neighborhood,
          residentStatus: status === "ללא סטטוס" ? "" : status,
        },
      });
      if (taskId) {
        await updateDoc(doc(db, "residents", assignResident.id), {
          assignedTasks: arrayUnion({
            taskId,
            title,
            category: assignForm.category,
            assignedAt: new Date(),
            assignedBy: alias,
          }),
          updatedAt: new Date(),
        });
      }
      toast({ title: "משימה הוקצתה" });
      setAssignResident(null);
    } catch (error) {
      toast({ title: "שגיאה בהקצאת משימה", description: error.message, variant: "destructive" });
    } finally {
      setSavingAssign(false);
    }
  };

  const renderResidentCard = (row) => {
    const neighborhood = fieldText(row, "שכונה");
    const familyRole = fieldText(row, "הורה/ילד");
    const housing = fieldText(row, "סטטוס מגורים");
    const metaLine = [familyRole, housing].filter(Boolean).join(" · ");
    const summary = residentTaskSummary(tasks, row.id, currentUser?.uid);
    const unread = Boolean(summary?.hasUnreadReplies || row.hasNewComment || row.hasNewReply);
    return (
      <div key={row.id} className="v2-card v2-res-card">
        <button type="button" className="v2-res-card-main" onClick={() => openRow(row)}>
          <div className="v2-res-card-title">
            <span className="v2-res-card-name">{residentName(row)}</span>
            <TaskIndicators summary={summary} unread={unread} />
          </div>
          <div className="v2-res-card-line">
            <span className="v2-pill v2-pill-compact">
              <i className={`v2-dot ${residentStatusDotClass(residentStatus(row))}`} />
              {residentStatus(row)}
            </span>
            <span className="v2-res-card-hood">{neighborhood || "ללא שכונה"}</span>
          </div>
          {metaLine && <div className="v2-res-card-meta">{metaLine}</div>}
        </button>
        <ResidentQuickActions row={row} summary={summary} onAssign={openAssign} />
      </div>
    );
  };

  return (
    <div className={view === "split" ? "v2-page-fill" : undefined}>
      <div className="v2-toolbar">
        <div>
          <h1 className="v2-h1">תושבים</h1>
          <p className="v2-sub">ניהול סטטוס, הערות ומשימות</p>
        </div>
        <div className="v2-seg">
          {["table", "board", "split"].map((item) => (
            <button key={item} type="button" className={view === item ? "on" : ""} onClick={() => onViewChange(item)}>
              {item === "table" ? "טבלה" : item === "board" ? "לוח" : "פיצול"}
            </button>
          ))}
        </div>
      </div>

      <div className="v2-filters v2-res-filters">
        <input
          className="v2-search v2-q"
          placeholder="חיפוש תושב, טלפון, שכונה…"
          value={queryText}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="v2-filter-status min-w-0">
          <Popover open={statusOpen} onOpenChange={setStatusOpen}>
            <PopoverTrigger asChild>
              <button className="v2-btn v2-btn-sm" type="button">
                <span className="truncate">{statusLabel}</span>
                <span aria-hidden>▾</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 max-w-[calc(100vw-24px)] p-3" align="end" collisionPadding={12} dir="rtl">
              <div className="mb-2">
                <div className="text-sm font-medium">סינון לפי סטטוס</div>
                <div className="mt-1 text-xs text-[var(--v2-muted)]">ניתן לבחור כמה סטטוסים יחד.</div>
              </div>
              <div className="space-y-1">
                {RESIDENT_STATUSES.map((status) => (
                  <label key={status} className="v2-check cursor-pointer">
                    <Checkbox checked={selectedStatuses.includes(status)} onCheckedChange={() => toggleStatusFilter(status)} />
                    <span className="flex-1">{status}</span>
                  </label>
                ))}
              </div>
              <button
                className="v2-btn v2-btn-sm mt-2 w-full"
                type="button"
                disabled={selectedStatuses.length === 0}
                onClick={() => setSelectedStatuses([])}
              >
                כל הסטטוסים
              </button>
            </PopoverContent>
          </Popover>
        </div>
        <div className="v2-res-tools">
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <button className="v2-btn v2-btn-sm" type="button">
                סנן לפי ▾
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 max-w-[calc(100vw-24px)] p-3" align="end" collisionPadding={12} dir="rtl">
              <div className="mb-3">
                <div className="text-sm font-medium">הוסף פילטר</div>
                <div className="mt-1 text-xs text-[var(--v2-muted)]">שכונה, הורה/ילד, סטטוס מגורים</div>
              </div>
              <select
                className="v2-select mb-2"
                value={draftFilter.field}
                onChange={(e) => setDraftFilter({ field: e.target.value, value: "" })}
              >
                <option value="">בחר שדה</option>
                {ADVANCED_FILTER_FIELDS.map((field) => (
                  <option key={field} value={field}>{field}</option>
                ))}
              </select>
              {draftFilter.field && (
                <select
                  className="v2-select mb-2"
                  value={draftFilter.value}
                  onChange={(e) => setDraftFilter((prev) => ({ ...prev, value: e.target.value }))}
                >
                  <option value="">בחר ערך</option>
                  {(advancedFilterOptions[draftFilter.field] || []).map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              )}
              <button
                className="v2-btn v2-btn-primary v2-btn-sm w-full"
                type="button"
                disabled={!draftFilter.field || !draftFilter.value}
                onClick={addAdvancedFilter}
              >
                הוסף
              </button>
            </PopoverContent>
          </Popover>
          <select className="v2-select v2-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="סדר לפי">
            <option value="syncedAt">זמן תגובה</option>
            <option value="status">סטטוס</option>
            <option value="name">שם</option>
          </select>
          <button
            className="v2-btn v2-btn-icon"
            type="button"
            title={sortDirection === "asc" ? "סדר עולה" : "סדר יורד"}
            aria-label={sortDirection === "asc" ? "סדר עולה" : "סדר יורד"}
            onClick={() => setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))}
          >
            <ArrowUpDown className="h-4 w-4" />
          </button>
          <span className="v2-count">{filtered.length} מתוך {(residents || []).length}</span>
          {isAdmin && (
            <button
              className="v2-btn v2-btn-icon"
              type="button"
              onClick={handleManualSync}
              disabled={isSyncing}
              title="סנכרן תושבים מהגיליון"
              aria-label="סנכרן תושבים מהגיליון"
            >
              <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
            </button>
          )}
        </div>
      </div>

      {advancedFilters.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {advancedFilters.map((filter) => (
            <button
              key={`${filter.field}:${filter.value}`}
              type="button"
              className="v2-chip-filter"
              onClick={() => setAdvancedFilters((prev) => prev.filter((item) => !(item.field === filter.field && item.value === filter.value)))}
            >
              <span className="truncate">{filter.field}: {filter.value}</span>
              <X className="h-3 w-3 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {view === "table" && (
        <>
          <div className="v2-res-cards">
            {filtered.length ? filtered.map(renderResidentCard) : <div className="v2-sub py-8 text-center">אין תושבים תואמים</div>}
          </div>
          <div className="v2-card v2-res-table overflow-auto">
            <table className="v2-data">
              <thead>
                <tr>
                  <th>שם</th>
                  <th>סטטוס</th>
                  <th>טלפון</th>
                  <th>שכונה</th>
                  <th>עודכן</th>
                  <th>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const tel = phoneHref(fieldText(row, "טלפון"));
                  const summary = residentTaskSummary(tasks, row.id, currentUser?.uid);
                  const unread = Boolean(summary?.hasUnreadReplies || row.hasNewComment || row.hasNewReply);
                  return (
                    <tr key={row.id} className={selected?.id === row.id ? "sel" : ""} onClick={() => openRow(row)}>
                      <td className="v2-name">
                        <div className="flex items-center gap-2">
                          <span>{residentName(row)}</span>
                          <TaskIndicators summary={summary} unread={unread} />
                        </div>
                      </td>
                      <td>
                        <span className="v2-pill">
                          <i className={`v2-dot ${residentStatusDotClass(residentStatus(row))}`} />
                          {residentStatus(row)}
                        </span>
                      </td>
                      <td>
                        {tel ? (
                          <a href={tel} className="v2-phone" onClick={(event) => event.stopPropagation()}>
                            {fieldText(row, "טלפון")}
                          </a>
                        ) : (
                          fieldText(row, "טלפון") || "—"
                        )}
                      </td>
                      <td>{fieldText(row, "שכונה")}</td>
                      <td>{relativeTime(row.syncedAt || row.updatedAt)}</td>
                      <td onClick={(event) => event.stopPropagation()}>
                        <ResidentQuickActions row={row} summary={summary} onAssign={openAssign} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filtered.length && <div className="v2-sub py-8 text-center">אין תושבים תואמים</div>}
          </div>
        </>
      )}

      {view === "board" && (
        <div className="v2-board">
          {BOARD_STATUSES.map((status) => {
            const cards = filtered.filter((row) => residentStatus(row) === status);
            return (
              <div key={status} className="v2-col">
                <h4>
                  {status} <span>{cards.length}</span>
                </h4>
                {cards.map((row) => {
                  const summary = residentTaskSummary(tasks, row.id, currentUser?.uid);
                  const unread = Boolean(summary?.hasUnreadReplies || row.hasNewComment || row.hasNewReply);
                  return (
                    <button key={row.id} type="button" className="v2-mini" onClick={() => openRow(row)}>
                      <div className="flex items-center justify-between gap-2">
                        <div>{residentName(row)}</div>
                        <TaskIndicators summary={summary} unread={unread} />
                      </div>
                      <div className="meta">{fieldText(row, "שכונה")} · {fieldText(row, "טלפון")}</div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {view === "split" && (
        <div className="v2-card v2-split">
          <div className="v2-split-list">
            {filtered.map((row) => {
              const summary = residentTaskSummary(tasks, row.id, currentUser?.uid);
              const unread = Boolean(summary?.hasUnreadReplies || row.hasNewComment || row.hasNewReply);
              return (
                <button
                  key={row.id}
                  type="button"
                  className={`v2-split-row ${active?.id === row.id ? "on" : ""}`}
                  onClick={() => openRow(row)}
                >
                  <i className={`v2-tab ${residentStatusDotClass(residentStatus(row))}`} />
                  <div>
                    <div className="n flex items-center gap-2">
                      {residentName(row)}
                      <TaskIndicators summary={summary} unread={unread} />
                    </div>
                    <div className="m">{residentStatus(row)} · {fieldText(row, "שכונה") || "ללא שכונה"}</div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="v2-split-pane">
            {active && <ResidentRecord key={active.id} resident={active} onClose={closeRow} />}
          </div>
        </div>
      )}

      {(view === "table" || view === "board") && liveSelected && (
        <RecordOverlay open onClose={closeRow}>
          <ResidentRecord key={liveSelected.id} resident={liveSelected} variant="sheet" onClose={closeRow} />
        </RecordOverlay>
      )}

      {view === "split" && liveSelected && (
        <RecordOverlay open variant="split" onClose={closeRow}>
          <ResidentRecord key={liveSelected.id} resident={liveSelected} variant="sheet" onClose={closeRow} />
        </RecordOverlay>
      )}

      {assignResident && (
        <div className="v2-modal" onClick={closeAssign}>
          <form
            className="v2-card max-h-[90vh] max-w-lg overflow-auto p-4"
            onClick={(event) => event.stopPropagation()}
            onSubmit={submitAssign}
            dir="rtl"
          >
            <h2 className="v2-h1">הקצאת משימה</h2>
            <p className="v2-sub">תושב: {residentName(assignResident)}</p>
            <div className="v2-fields">
              <label className="span-2">
                <span className="v2-label">כותרת המשימה</span>
                <input
                  className="v2-search"
                  style={{ width: "100%", minWidth: 0 }}
                  value={assignForm.title}
                  onChange={(e) => setAssignForm((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="הזן כותרת משימה…"
                  required
                  autoFocus
                />
              </label>
              <label>
                <span className="v2-label">קטגוריה</span>
                <select
                  className="v2-select"
                  value={assignForm.category}
                  onChange={(e) => setAssignForm((prev) => ({ ...prev, category: e.target.value }))}
                >
                  {categories.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="v2-label">עדיפות</span>
                <select
                  className="v2-select"
                  value={assignForm.priority}
                  onChange={(e) => setAssignForm((prev) => ({ ...prev, priority: e.target.value }))}
                >
                  <option value="דחוף">דחוף</option>
                  <option value="רגיל">רגיל</option>
                  <option value="נמוך">נמוך</option>
                </select>
              </label>
            </div>
            <div className="v2-row mt-3">
              <button className="v2-btn v2-btn-primary" type="submit" disabled={savingAssign || !assignForm.title.trim()}>
                צור משימה
              </button>
              <button className="v2-btn" type="button" onClick={closeAssign} disabled={savingAssign}>
                ביטול
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
