"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signOut } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Menu, Settings } from "lucide-react";
import { auth, db } from "@/firebase";
import { useAuth } from "@/app/context/AuthContext";
import { useData } from "@/app/context/DataContext";
import { useToast } from "@/components/ui/use-toast";
import NotesAndLinks from "@/components/NotesAndLinks";
import NotificationBell from "@/components/NotificationBell";
import AdminPanel from "@/components/AdminPanel";
import AdminLogsPanel from "@/components/AdminLogsPanel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NEED_HELP_STATUSES, residentStatus } from "@/lib/residents";
import { formatElapsed, toDate } from "@/components/v2/format";
import {
  EMERGENCY_MODES,
  activateGreenEyes,
  endEmergencyEvent,
  makeEmergencyEventId,
  updateEmergencyMode,
} from "@/lib/emergencyActions";
import "@fontsource/rubik/400.css";
import "@fontsource/rubik/500.css";
import "@fontsource/rubik/700.css";
import "@/app/v2.css";

function HeaderResidentSearch() {
  const router = useRouter();
  const pathname = usePathname() || "";
  const searchParams = useSearchParams();
  const onResidents = pathname === "/residents" || pathname.startsWith("/residents/");
  const urlQuery = onResidents ? searchParams.get("q") || "" : "";
  const [draft, setDraft] = useState(urlQuery);
  const debounceRef = useRef(null);

  useEffect(() => {
    setDraft(urlQuery);
  }, [urlQuery]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const commitToUrl = (value) => {
    const params = new URLSearchParams(onResidents ? searchParams.toString() : "");
    const trimmed = value.trim();
    if (trimmed) params.set("q", value);
    else params.delete("q");
    const qs = params.toString();
    router.replace(qs ? `/residents?${qs}` : "/residents", { scroll: false });
  };

  const onChange = (event) => {
    const next = event.target.value;
    setDraft(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => commitToUrl(next), 150);
  };

  return (
    <input
      className="hidden max-w-sm flex-1 rounded-lg border border-[var(--v2-line)] bg-[var(--v2-bg)] px-3 py-1.5 text-sm text-[var(--v2-ink)] placeholder:text-[var(--v2-muted)] md:block"
      placeholder="חיפוש תושב…"
      aria-label="חיפוש תושב"
      type="search"
      value={draft}
      onChange={onChange}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          if (debounceRef.current) clearTimeout(debounceRef.current);
          commitToUrl(draft);
        }
      }}
    />
  );
}

const NAV = [
  { href: "/status", label: "תמונת מצב", icon: "◎" },
  { href: "/residents", label: "תושבים", icon: "▣" },
  { href: "/map", label: "מפה", icon: "⌖" },
  { href: "/tasks", label: "משימות", icon: "☐" },
  { href: "/events", label: "יומן", icon: "≡" },
];

function orderNav(items, savedHrefs) {
  if (!Array.isArray(savedHrefs) || savedHrefs.length === 0) return items;
  const remaining = new Map(items.map((item) => [item.href, item]));
  const ordered = [];
  savedHrefs.forEach((href) => {
    const item = remaining.get(href);
    if (item) {
      ordered.push(item);
      remaining.delete(href);
    }
  });
  remaining.forEach((item) => ordered.push(item));
  return ordered;
}

function SortableNavRow({ item, active, counts }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.href });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.55 : 1,
        zIndex: isDragging ? 20 : 1,
      }}
      className="flex items-center"
    >
      <button type="button" className="v2-nav-handle" aria-label={`גרור את ${item.label}`} title="גרור לשינוי סדר" {...attributes} {...listeners}>
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <Link
        href={item.href}
        className={`mb-0.5 flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-[13.5px] ${
          active ? "v2-nav-on" : "hover:bg-[var(--v2-bg)]"
        }`}
      >
        <span className="opacity-70">{item.icon}</span>
        {item.label}
        {item.href === "/residents" && counts.needHelp > 0 && (
          <span className="v2-chip ms-auto rounded-full px-1.5 text-[10px]">{counts.needHelp}</span>
        )}
        {item.href === "/status" && counts.openEvents > 0 && (
          <span className="v2-chip ms-auto rounded-full px-1.5 text-[10px]">{counts.openEvents}</span>
        )}
        {item.href === "/tasks" && counts.overdue > 0 && (
          <span className="ms-auto rounded-full bg-[var(--v2-ink)] px-1.5 text-[10px] text-white">{counts.overdue}</span>
        )}
      </Link>
    </div>
  );
}

export default function AppShell({ children }) {
  const pathname = usePathname() || "";
  const router = useRouter();
  const { currentUser } = useAuth();
  const {
    currentUserData,
    residents,
    tasks,
    eventLogs,
    taskCategories,
    setTaskCategories,
    emergencyMode,
    emergencySources,
    isEmergencyConfigLoaded,
  } = useData();
  const { toast } = useToast();
  const [moreOpen, setMoreOpen] = useState(false);
  const [navItems, setNavItems] = useState(NAV);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showAdminLogs, setShowAdminLogs] = useState(false);
  const [showGreenEyes, setShowGreenEyes] = useState(false);
  const [showEndEmergency, setShowEndEmergency] = useState(false);
  const [emergencyEventId] = useState(() => makeEmergencyEventId());
  const [savingEmergency, setSavingEmergency] = useState(false);
  const [elapsedClock, setElapsedClock] = useState("00:00:00");
  const role = currentUserData?.role || "";
  const isAdmin = role === "admin";
  const alias = currentUserData?.alias || currentUser?.email || "";
  const isDrill = emergencyMode !== EMERGENCY_MODES.LIVE;
  const emergencyModeLabel = isDrill ? "תרגיל" : "חי";
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    setNavItems(orderNav(NAV, currentUserData?.navOrder));
  }, [currentUserData?.navOrder]);

  useEffect(() => {
    if (!currentUser) router.replace("/login");
  }, [currentUser, router]);

  const counts = useMemo(() => {
    const needHelp = (residents || []).filter((row) => NEED_HELP_STATUSES.includes(residentStatus(row))).length;
    const overdue = (tasks || []).filter((task) => !task.done && task.dueDate && toDate(task.dueDate) < new Date()).length;
    const openEvents = (eventLogs || []).filter((event) => event.status && event.status !== "טופל").length;
    return { needHelp, overdue, openEvents };
  }, [residents, tasks, eventLogs]);

  const eventStart = useMemo(() => (eventLogs?.[0] ? toDate(eventLogs[0].createdAt) : null), [eventLogs]);
  useEffect(() => {
    const tick = () => setElapsedClock(formatElapsed(eventStart));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [eventStart]);

  const persistNavOrder = (items) => {
    setNavItems(items);
    if (!currentUser) return;
    setDoc(
      doc(db, "users", currentUser.uid),
      { navOrder: items.map((item) => item.href), updatedAt: serverTimestamp() },
      { merge: true }
    ).catch(() => {});
  };

  const onNavDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = navItems.findIndex((item) => item.href === active.id);
    const newIndex = navItems.findIndex((item) => item.href === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    persistNavOrder(arrayMove(navItems, oldIndex, newIndex));
  };

  const navActive = (href) => pathname === href || pathname.startsWith(`${href}/`);
  const opsDisabled = !isEmergencyConfigLoaded || savingEmergency;
  const activeSource = emergencySources?.[emergencyMode] || null;

  const onToggleMode = async (toLive) => {
    if (!isAdmin) return;
    setSavingEmergency(true);
    try {
      await updateEmergencyMode({
        nextMode: toLive ? EMERGENCY_MODES.LIVE : EMERGENCY_MODES.DRILL,
        isAdmin,
        alias,
        email: currentUser?.email,
      });
      toast({
        title: "מצב חירום עודכן",
        description: `המערכת עברה למצב ${toLive ? "חי" : "תרגיל"}`,
      });
    } catch (error) {
      toast({ title: "שגיאה בעדכון מצב", description: error.message, variant: "destructive" });
    } finally {
      setSavingEmergency(false);
    }
  };

  const onGreenEyes = async () => {
    setSavingEmergency(true);
    try {
      const result = await activateGreenEyes({
        alias,
        email: currentUser?.email,
        emergencyMode,
        emergencySources,
        emergencyEventId,
      });
      setShowGreenEyes(false);
      toast({
        title: result.isDrill ? "תרגיל ירוק בעיניים הופעל" : "נוהל ירוק בעיניים הופעל",
        description: result.isDrill ? "תרגיל נרשם במערכת" : "אירוע חירום נרשם במערכת",
      });
    } catch (error) {
      toast({ title: "שגיאה בהפעלת נוהל ירוק בעיניים", description: error.message, variant: "destructive" });
    } finally {
      setSavingEmergency(false);
    }
  };

  const onEndEmergency = async () => {
    setSavingEmergency(true);
    try {
      const summary = await endEmergencyEvent({ emergencyEventId });
      setShowEndEmergency(false);
      if (summary.sheetCleanupError) {
        toast({
          title: "אירוע החירום הסתיים עם אזהרה",
          description: `Firebase נוקה, אך ניקוי הגיליון נכשל: ${summary.sheetCleanupError}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "אירוע החירום הסתיים",
          description: `הנתונים יוצאו ונוקו (${summary.deletedResidents || 0} תושבים, ${summary.deletedTasks || 0} משימות)`,
        });
      }
    } catch (error) {
      setShowEndEmergency(false);
      toast({ title: "שגיאה בסיום אירוע החירום", description: error.message, variant: "destructive" });
    } finally {
      setSavingEmergency(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--v2-bg,#eaf3f6)] text-[var(--v2-ink,#1a2e52)]" dir="rtl">
        טוען...
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="v2-shell flex min-h-[100dvh] flex-col" dir="rtl">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--v2-line)] bg-white px-3 pt-[env(safe-area-inset-top)] sm:gap-5 sm:px-5">
          <div className="flex shrink-0 items-center gap-2.5 text-sm font-bold">
            <img src="/logo.png" alt="לוגו ניהול אירוע חירום" className="v2-logo" />
            <span className="hidden sm:inline">ניהול אירוע חירום</span>
          </div>
          <div className="v2-clock v2-clock-sm hidden md:block" title="זמן מתחילת האירוע" aria-label="זמן מתחילת האירוע">
            {elapsedClock}
          </div>
          <Suspense
            fallback={
              <input
                className="hidden max-w-sm flex-1 rounded-lg border border-[var(--v2-line)] bg-[var(--v2-bg)] px-3 py-1.5 text-sm text-[var(--v2-muted)] md:block"
                placeholder="חיפוש תושב…"
                aria-label="חיפוש תושב"
                disabled
              />
            }
          >
            <HeaderResidentSearch />
          </Suspense>
          <div className="ms-auto flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 lg:flex">
              <NotesAndLinks section="links" />
              <NotesAndLinks section="notes" />
            </div>
            <NotificationBell />
            {isAdmin && (
              <div className="hidden items-center gap-1 text-[11px] text-[var(--v2-muted)] md:flex">
                <span>חי</span>
                <button
                  type="button"
                  className={`relative h-5 w-9 rounded-full ${emergencyMode === EMERGENCY_MODES.LIVE ? "bg-[var(--v2-accent)]" : "bg-[var(--v2-line)]"}`}
                  disabled={opsDisabled}
                  onClick={() => onToggleMode(emergencyMode !== EMERGENCY_MODES.LIVE)}
                  aria-label="החלפת מצב חי/תרגיל"
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${emergencyMode === EMERGENCY_MODES.LIVE ? "start-0.5" : "end-0.5"}`} />
                </button>
                <span>תרגיל</span>
              </div>
            )}
            {isAdmin && (
              <button
                type="button"
                className={`v2-btn v2-btn-sm hidden text-white md:inline-flex ${isDrill ? "bg-amber-500 border-amber-500" : "bg-red-600 border-red-600"}`}
                disabled={opsDisabled}
                onClick={() => setShowGreenEyes(true)}
              >
                {isDrill ? "תרגיל" : "ירוק בעיניים"}
              </button>
            )}
            {isAdmin && (
              <button type="button" className="v2-btn v2-btn-sm hidden bg-emerald-600 text-white border-emerald-600 md:inline-flex" disabled={opsDisabled} onClick={() => setShowEndEmergency(true)}>
                סיים אירוע
              </button>
            )}
            {isAdmin && (
              <button type="button" className="hidden rounded-full p-1.5 hover:bg-[var(--v2-bg)] md:inline-flex" onClick={() => setShowAdminPanel(true)} title="פאנל ניהול">
                <Settings className="h-4 w-4 text-[var(--v2-muted)]" />
              </button>
            )}
            <Button size="sm" className="hidden bg-[var(--v2-accent)] px-3 text-white hover:bg-[#244a8f] sm:inline-flex" onClick={() => router.push("/tasks?new=1")}>
              + משימה
            </Button>
            <div className="flex items-center gap-2 text-sm">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--v2-accent-soft)] text-xs font-semibold text-[var(--v2-accent)]">
                {(alias || "א").slice(0, 1)}
              </span>
              <span className="hidden max-w-[7.5rem] truncate lg:inline">{alias}</span>
            </div>
            <button type="button" className="rounded-full p-1.5 hover:bg-[var(--v2-bg)] md:hidden" onClick={() => setMoreOpen(true)} aria-label="תפריט">
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="sticky top-14 hidden h-[calc(100dvh-56px)] w-[220px] shrink-0 border-l border-[var(--v2-line)] bg-white p-2 md:block">
            <div className="px-2 pb-1 pt-2 text-[11px] font-medium text-[var(--v2-muted)]">עבודה יומית · גרור לסידור</div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis, restrictToParentElement]} onDragEnd={onNavDragEnd}>
              <SortableContext items={navItems.map((item) => item.href)} strategy={verticalListSortingStrategy}>
                {navItems.map((item) => (
                  <SortableNavRow key={item.href} item={item} active={navActive(item.href)} counts={counts} />
                ))}
              </SortableContext>
            </DndContext>
            <div className="px-2 pb-1 pt-4 text-[11px] font-medium text-[var(--v2-muted)]">ניהול</div>
            {isAdmin && (
              <button type="button" className="mb-0.5 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-[13.5px] hover:bg-[var(--v2-bg)]" onClick={() => setShowAdminPanel(true)}>
                ⚙ ניהול
              </button>
            )}
            <Link href="/classic" className="mb-0.5 flex items-center gap-2 rounded-lg px-3 py-2 text-[13.5px] font-medium text-[var(--v2-accent)] hover:bg-[var(--v2-bg)]">
              עיצוב ישן
            </Link>
            <button
              className="mt-6 w-full rounded-lg px-3 py-2 text-right text-sm text-red-600 hover:bg-red-50"
              onClick={() => signOut(auth).then(() => router.push("/login"))}
            >
              התנתק
            </button>
          </aside>

          <main className="min-w-0 flex-1 overflow-auto px-3 pb-[calc(72px+env(safe-area-inset-bottom))] pt-4 sm:px-5 md:pb-6">
            {children}
          </main>
        </div>

        <nav className="fixed bottom-0 right-0 left-0 z-30 grid grid-cols-5 border-t border-[var(--v2-line)] bg-white/90 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_rgba(27,58,120,0.08)] backdrop-blur-md md:hidden">
          {navItems.map((tab) => {
            const active = navActive(tab.href);
            const badge =
              tab.href === "/status" ? { value: counts.openEvents, color: "v2-chip" }
              : tab.href === "/residents" ? { value: counts.needHelp, color: "v2-chip" }
              : tab.href === "/tasks" ? { value: counts.overdue, color: "bg-[var(--v2-ink)] text-white" }
              : null;
            return (
              <Link key={tab.href} href={tab.href} className="flex flex-col items-center gap-0.5 pb-1 pt-1.5">
                <span className={`relative grid h-7 w-12 place-items-center rounded-full text-base transition ${active ? "v2-nav-on" : "text-[var(--v2-muted)]"}`}>
                  {tab.icon}
                  {badge && badge.value > 0 && (
                    <span className={`absolute -top-1 -left-1 min-w-[16px] rounded-full px-1 text-center text-[9px] font-bold leading-4 ${badge.color}`}>
                      {badge.value}
                    </span>
                  )}
                </span>
                <span className={`text-[10px] ${active ? "font-semibold text-[var(--v2-accent)]" : "text-[var(--v2-muted)]"}`}>{tab.label}</span>
              </Link>
            );
          })}
        </nav>

        {moreOpen && (
          <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMoreOpen(false)}>
            <div className="absolute bottom-0 right-0 left-0 rounded-t-2xl bg-white p-4 pb-[calc(16px+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 text-sm font-semibold">עוד</div>
              <button className="block w-full rounded-lg px-3 py-2 text-right hover:bg-[var(--v2-bg)]" onClick={() => { setMoreOpen(false); router.push("/tasks?new=1"); }}>+ משימה</button>
              {isAdmin && (
                <button className="block w-full rounded-lg px-3 py-2 text-right hover:bg-[var(--v2-bg)]" disabled={opsDisabled} onClick={() => { setMoreOpen(false); onToggleMode(emergencyMode !== EMERGENCY_MODES.LIVE); }}>
                  מצב: {emergencyModeLabel}
                </button>
              )}
              {isAdmin && (
                <button className="block w-full rounded-lg px-3 py-2 text-right text-red-600 hover:bg-[var(--v2-bg)]" disabled={opsDisabled} onClick={() => { setMoreOpen(false); setShowGreenEyes(true); }}>
                  {isDrill ? "הפעל תרגיל" : "ירוק בעיניים"}
                </button>
              )}
              {isAdmin && (
                <button className="block w-full rounded-lg px-3 py-2 text-right hover:bg-[var(--v2-bg)]" disabled={opsDisabled} onClick={() => { setMoreOpen(false); setShowEndEmergency(true); }}>
                  סיים אירוע
                </button>
              )}
              {isAdmin && (
                <button className="block w-full rounded-lg px-3 py-2 text-right hover:bg-[var(--v2-bg)]" onClick={() => { setMoreOpen(false); setShowAdminPanel(true); }}>
                  ניהול
                </button>
              )}
              <div className="px-3 py-2">
                <NotesAndLinks section="notes" />
                <NotesAndLinks section="links" />
              </div>
              <Link className="block rounded-lg px-3 py-2 font-medium text-[var(--v2-accent)] hover:bg-[var(--v2-bg)]" href="/classic" onClick={() => setMoreOpen(false)}>
                עיצוב ישן
              </Link>
              <button className="w-full rounded-lg px-3 py-2 text-right text-red-600" onClick={() => signOut(auth).then(() => router.push("/login"))}>
                התנתק
              </button>
            </div>
          </div>
        )}

        <AdminPanel
          open={showAdminPanel}
          onClose={() => setShowAdminPanel(false)}
          taskCategories={taskCategories}
          onCategoriesChange={setTaskCategories}
          onOpenLogs={() => setShowAdminLogs(true)}
          currentUser={currentUser}
        />
        <AdminLogsPanel open={showAdminLogs} onClose={() => setShowAdminLogs(false)} />

        <Dialog open={showGreenEyes} onOpenChange={setShowGreenEyes}>
          <DialogContent className="bg-white text-center" dir="rtl">
            <DialogHeader>
              <DialogTitle>{isDrill ? "הפעלת תרגיל ירוק בעיניים" : "הפעלת נוהל ירוק בעיניים"}</DialogTitle>
            </DialogHeader>
            {isDrill && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">מצב תרגיל — תישלח הודעת תרגיל בלבד</div>}
            <p className="text-sm">{isDrill ? "האם אתה בטוח שאתה רוצה להפעיל תרגיל?" : "האם אתה בטוח שאתה רוצה להפעיל נוהל ירוק בעיניים?"}</p>
            {activeSource?.sheetId && (
              <div className="rounded border bg-[var(--v2-bg)] p-2 text-xs text-[var(--v2-muted)]">
                {`מקור תושבים: ${emergencyModeLabel} / ${activeSource.sheetName || "גיליון1"}`}
              </div>
            )}
            <DialogFooter className="gap-2">
              <button className="v2-btn" type="button" onClick={() => setShowGreenEyes(false)}>לא</button>
              <button className={`v2-btn text-white ${isDrill ? "bg-amber-500 border-amber-500" : "bg-red-600 border-red-600"}`} type="button" onClick={onGreenEyes}>
                {isDrill ? "הפעל תרגיל" : "כן"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showEndEmergency} onOpenChange={setShowEndEmergency}>
          <DialogContent className="bg-white" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-red-600">סיום אירוע חירום</DialogTitle>
            </DialogHeader>
            <p className="text-sm">פעולה זו תייצא את כל הנתונים לקובץ CSV ותנקה את המערכת לאירוע הבא.</p>
            <DialogFooter className="gap-2">
              <button className="v2-btn" type="button" onClick={() => setShowEndEmergency(false)}>ביטול</button>
              <button className="v2-btn bg-red-600 text-white border-red-600" type="button" onClick={onEndEmergency}>סיים אירוע וייצא נתונים</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
