"use client";

import { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import {
  collection,
  doc,
  setDoc,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  Settings,
  X,
  UserPlus,
  BookOpen,
  Plus,
  Trash2,
  GripVertical,
  ChevronRight,
  Users,
  Database,
  CheckCircle,
  AlertTriangle,
  MapPin,
} from "lucide-react";
import { DEFAULT_MAP_CENTER, DEFAULT_YISHUV_ZOOM, MAP_CONFIG_DOC, normalizeMapConfig } from "@/lib/mapConfig";

const SECTIONS = {
  MAIN: "main",
  ADD_USER: "add_user",
  DEPARTMENTS: "departments",
  ONLINE_USERS: "online_users",
  LIVE_DRILL_SOURCES: "live_drill_sources",
  MAP_CONFIG: "map_config",
};

const DEFAULT_SOURCE_FORM = {
  live: {
    label: "חי",
    sheetUrl: "",
    sheetId: "",
    sheetName: "גיליון1",
    lastVerified: null,
  },
  drill: {
    label: "תרגיל",
    sheetUrl: "",
    sheetId: "",
    sheetName: "גיליון1",
    lastVerified: null,
  },
};

// A user is "active now" if seen within 10 min, "active today" within 24 h.
const ACTIVE_NOW_MS   = 10 * 60 * 1000;
const ACTIVE_TODAY_MS = 24 * 60 * 60 * 1000;

function getPresence(lastSeen) {
  if (!lastSeen) return "offline";
  const ms = Date.now() - lastSeen.toDate().getTime();
  if (ms < ACTIVE_NOW_MS)   return "now";
  if (ms < ACTIVE_TODAY_MS) return "today";
  return "offline";
}

function PresenceDot({ status }) {
  if (status === "now")
    return <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0 shadow-sm" title="פעיל עכשיו" />;
  if (status === "today")
    return <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 shrink-0" title="פעיל היום" />;
  return <span className="w-2.5 h-2.5 rounded-full bg-gray-300 shrink-0" title="לא מחובר" />;
}

function formatLastSeen(lastSeen) {
  if (!lastSeen) return "לא נצפה";
  const date = lastSeen.toDate();
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1)  return "עכשיו";
  if (diffMin < 60) return `לפני ${diffMin} דק׳`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)   return `לפני ${diffH} שע׳`;
  return date.toLocaleDateString("he-IL");
}

function extractSheetId(input) {
  if (!input) return "";
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  return trimmed.replace(/^https?:\/\/docs\.google\.com\/spreadsheets\/d\//, "")
    .split(/[/?#]/)[0]
    .trim();
}

function formatVerifiedAt(value) {
  if (!value) return "";
  const date = value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("he-IL");
}

function mergeSourceSettings(data = {}) {
  return {
    live: {
      ...DEFAULT_SOURCE_FORM.live,
      ...(data.live || {}),
    },
    drill: {
      ...DEFAULT_SOURCE_FORM.drill,
      ...(data.drill || {}),
    },
  };
}

export default function AdminPanel({
  open,
  onClose,
  taskCategories = [],
  onCategoriesChange,
  onOpenLogs,
  currentUser,
}) {
  const { toast } = useToast();
  const [section, setSection] = useState(SECTIONS.MAIN);

  // Add User state
  const [newUserFullName, setNewUserFullName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserDepartment, setNewUserDepartment] = useState("");
  const [newUserRole, setNewUserRole] = useState("staff");
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  // Departments state
  const [newDeptName, setNewDeptName] = useState("");
  const [isSavingDepts, setIsSavingDepts] = useState(false);

  // Online users state
  const [allUsers, setAllUsers] = useState([]);

  // Live/Drill Google Sheet sources state
  const [sourceForm, setSourceForm] = useState(DEFAULT_SOURCE_FORM);
  const [isSavingSource, setIsSavingSource] = useState({});
  const [isVerifyingSource, setIsVerifyingSource] = useState({});

  // Map יישוב / center config
  const [mapForm, setMapForm] = useState(() => ({
    ...normalizeMapConfig(DEFAULT_MAP_CENTER),
    zoom: DEFAULT_YISHUV_ZOOM,
  }));
  const [isGeocodingMap, setIsGeocodingMap] = useState(false);
  const [isSavingMap, setIsSavingMap] = useState(false);

  // Real-time listener for users — only active while the panel is open
  useEffect(() => {
    if (!open) return;
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      setAllUsers(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      );
    });
    return () => unsub();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const unsub = onSnapshot(doc(db, "systemSettings", "emergencySources"), (snap) => {
      setSourceForm(mergeSourceSettings(snap.exists() ? snap.data() : {}));
    });
    return () => unsub();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const unsub = onSnapshot(doc(db, MAP_CONFIG_DOC.collection, MAP_CONFIG_DOC.id), (snap) => {
      const normalized = normalizeMapConfig(snap.exists() ? snap.data() : DEFAULT_MAP_CENTER);
      setMapForm({
        ...normalized,
        zoom: snap.exists() && Number.isFinite(Number(snap.data()?.zoom))
          ? Number(snap.data().zoom)
          : DEFAULT_YISHUV_ZOOM,
      });
    });
    return () => unsub();
  }, [open]);

  const handleClose = () => {
    setSection(SECTIONS.MAIN);
    onClose();
  };

  const updateSourceField = (mode, field, value) => {
    setSourceForm((prev) => ({
      ...prev,
      [mode]: {
        ...prev[mode],
        [field]: value,
      },
    }));
  };

  const verifySource = async (mode) => {
    const current = sourceForm[mode];
    const sheetUrl = current.sheetUrl.trim();
    const sheetName = current.sheetName.trim() || "גיליון1";
    if (!sheetUrl) {
      toast({ title: "חסר קישור", description: "יש להזין קישור או מזהה Google Sheet", variant: "destructive" });
      return;
    }

    setIsVerifyingSource((prev) => ({ ...prev, [mode]: true }));
    try {
      const verifyFn = httpsCallable(getFunctions(), "verifyEmergencySheetSource");
      const result = await verifyFn({ mode, sheetUrl, sheetName });
      const verification = result.data;
      setSourceForm((prev) => ({
        ...prev,
        [mode]: {
          ...prev[mode],
          sheetUrl,
          sheetId: verification.sheetId,
          sheetName: verification.sheetName,
          lastVerified: verification,
        },
      }));
      toast({
        title: "הגיליון אומת",
        description: `נמצאו ${verification.residentCount} תושבים במצב ${current.label}`,
      });
    } catch (error) {
      toast({
        title: "בדיקת הגיליון נכשלה",
        description: error.message || "לא ניתן לקרוא את הגיליון",
        variant: "destructive",
      });
    } finally {
      setIsVerifyingSource((prev) => ({ ...prev, [mode]: false }));
    }
  };

  const saveSource = async (mode) => {
    const current = sourceForm[mode];
    const sheetUrl = current.sheetUrl.trim();
    const sheetName = current.sheetName.trim() || "גיליון1";
    const sheetId = current.sheetId || extractSheetId(sheetUrl);
    if (!sheetId) {
      toast({ title: "חסר קישור", description: "יש להזין קישור או מזהה Google Sheet", variant: "destructive" });
      return;
    }

    setIsSavingSource((prev) => ({ ...prev, [mode]: true }));
    try {
      await setDoc(
        doc(db, "systemSettings", "emergencySources"),
        {
          [mode]: {
            label: current.label,
            sheetUrl,
            sheetId,
            sheetName,
            lastVerified: current.lastVerified || null,
            updatedAt: serverTimestamp(),
            updatedBy: currentUser?.uid || "",
            updatedByEmail: currentUser?.email || "",
          },
        },
        { merge: true }
      );
      toast({ title: "מקור נשמר", description: `מקור התושבים עבור ${current.label} נשמר בהצלחה` });
    } catch (error) {
      toast({
        title: "שמירה נכשלה",
        description: error.message || "לא ניתן לשמור את מקור התושבים",
        variant: "destructive",
      });
    } finally {
      setIsSavingSource((prev) => ({ ...prev, [mode]: false }));
    }
  };

  // ── Add User ──────────────────────────────────────────────────────────────
  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUserEmail || !newUserPassword || !newUserFullName || !newUserDepartment) {
      toast({ title: "שגיאה", description: "יש למלא את כל השדות הנדרשים", variant: "destructive" });
      return;
    }
    setIsCreatingUser(true);
    try {
      const adminEmail = currentUser.email;
      let adminPassword = window.sessionStorage.getItem("adminPassword");
      if (!adminPassword) {
        adminPassword = prompt("הזן את סיסמת הניהול שלך כדי להמשיך ביצירת משתמש חדש:");
        if (!adminPassword) throw new Error("Admin password required");
        window.sessionStorage.setItem("adminPassword", adminPassword);
      }
      const { createUserWithEmailAndPassword, signInWithEmailAndPassword } = await import("firebase/auth");
      const userCredential = await createUserWithEmailAndPassword(auth, newUserEmail, newUserPassword);
      const newUser = userCredential.user;
      await setDoc(doc(db, "users", newUser.uid), {
        email: newUserEmail,
        alias: newUserFullName,
        fullName: newUserFullName,
        department: newUserDepartment.trim(),
        role: newUserRole,
        createdAt: serverTimestamp(),
        createdBy: currentUser.uid,
      });
      try {
        const { autoSyncUserToEmergencyLocator } = await import("../lib/auto-sync-emergency-locator");
        await autoSyncUserToEmergencyLocator(newUser.uid, {
          email: newUserEmail,
          name: newUserFullName,
          role: newUserRole,
          alias: newUserFullName,
        });
      } catch {
        // Non-fatal: emergency locator sync failure doesn't block user creation
      }
      toast({
        title: "משתמש נוצר בהצלחה",
        description: `המשתמש ${newUserFullName} נוצר בהצלחה במחלקת ${newUserDepartment}`,
      });
      await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
      setNewUserFullName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserDepartment("");
      setNewUserRole("staff");
      setSection(SECTIONS.MAIN);
    } catch (error) {
      let errorMessage = "שגיאה ביצירת המשתמש";
      if (error.code === "auth/email-already-in-use") errorMessage = "כתובת המייל כבר קיימת במערכת";
      else if (error.code === "auth/weak-password") errorMessage = "הסיסמה חייבת להכיל לפחות 6 תווים";
      else if (error.code === "auth/invalid-email") errorMessage = "כתובת המייל אינה תקינה";
      else if (error.message === "Admin password required") errorMessage = "יש להזין סיסמת ניהול כדי להמשיך";
      toast({ title: "שגיאה", description: errorMessage, variant: "destructive" });
    } finally {
      setIsCreatingUser(false);
    }
  };

  // ── Departments ───────────────────────────────────────────────────────────
  const handleAddDepartment = async () => {
    const trimmed = newDeptName.trim();
    if (!trimmed || taskCategories.includes(trimmed)) return;
    const updated = [...taskCategories, trimmed];
    await saveDepartments(updated);
    setNewDeptName("");
  };

  const handleRemoveDepartment = async (dept) => {
    const updated = taskCategories.filter((d) => d !== dept);
    await saveDepartments(updated);
  };

  const saveDepartments = async (updated) => {
    setIsSavingDepts(true);
    try {
      await setDoc(
        doc(db, "systemSettings", "taskCategories"),
        { categories: updated, updatedAt: serverTimestamp(), updatedBy: currentUser?.uid || "" },
        { merge: true }
      );
      onCategoriesChange(updated);
      toast({ title: "מחלקות עודכנו", description: "רשימת המחלקות נשמרה בהצלחה" });
    } catch {
      toast({ title: "שגיאה", description: "שמירת המחלקות נכשלה", variant: "destructive" });
    } finally {
      setIsSavingDepts(false);
    }
  };

  const updateMapField = (field, value) => {
    setMapForm((prev) => ({ ...prev, [field]: value }));
  };

  const geocodeYishuv = async () => {
    const yishuvName = String(mapForm.yishuvName || "").trim();
    if (!yishuvName) {
      toast({ title: "חסר יישוב", description: "יש להזין שם יישוב", variant: "destructive" });
      return null;
    }

    setIsGeocodingMap(true);
    try {
      const response = await fetch(`/api/geocode-yishuv?q=${encodeURIComponent(yishuvName)}`);
      const data = await response.json();
      if (!response.ok) {
        toast({
          title: "אימות מיקום נכשל",
          description: data.error || "לא נמצא מיקום",
          variant: "destructive",
        });
        return null;
      }
      setMapForm((prev) => ({
        ...prev,
        yishuvName,
        lat: data.lat,
        lng: data.lng,
        geocodedAddress: data.formattedAddress || "",
        zoom: prev.zoom || DEFAULT_YISHUV_ZOOM,
      }));
      toast({
        title: "מיקום אומת",
        description: data.formattedAddress || `${data.lat}, ${data.lng}`,
      });
      return data;
    } catch {
      toast({ title: "שגיאה", description: "אימות המיקום נכשל", variant: "destructive" });
      return null;
    } finally {
      setIsGeocodingMap(false);
    }
  };

  const saveMapConfig = async () => {
    const yishuvName = String(mapForm.yishuvName || "").trim();
    if (!yishuvName) {
      toast({ title: "חסר יישוב", description: "יש להזין שם יישוב", variant: "destructive" });
      return;
    }

    let lat = Number(mapForm.lat);
    let lng = Number(mapForm.lng);
    let geocodedAddress = mapForm.geocodedAddress || "";
    const zoom = Number(mapForm.zoom);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      const geocoded = await geocodeYishuv();
      if (!geocoded) return;
      lat = geocoded.lat;
      lng = geocoded.lng;
      geocodedAddress = geocoded.formattedAddress || "";
    }

    setIsSavingMap(true);
    try {
      await setDoc(
        doc(db, MAP_CONFIG_DOC.collection, MAP_CONFIG_DOC.id),
        {
          yishuvName,
          lat,
          lng,
          zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : DEFAULT_YISHUV_ZOOM,
          geocodedAddress,
          updatedAt: serverTimestamp(),
          updatedBy: currentUser?.uid || "",
        },
        { merge: true }
      );
      toast({ title: "נשמר", description: `מרכז המפה עודכן ל־${yishuvName}` });
    } catch {
      toast({ title: "שגיאה", description: "שמירת הגדרות המפה נכשלה", variant: "destructive" });
    } finally {
      setIsSavingMap(false);
    }
  };

  // ── Online users derived data ─────────────────────────────────────────────
  const usersWithPresence = allUsers
    .map((u) => ({ ...u, presence: getPresence(u.lastSeen) }))
    .sort((a, b) => {
      const order = { now: 0, today: 1, offline: 2 };
      return order[a.presence] - order[b.presence];
    });

  const nowCount   = usersWithPresence.filter((u) => u.presence === "now").length;
  const todayCount = usersWithPresence.filter((u) => u.presence === "today").length;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-start justify-end"
      dir="rtl"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={handleClose} />

      {/* Panel */}
      <div className="relative bg-white shadow-2xl rounded-l-2xl w-80 max-w-full h-full flex flex-col overflow-hidden z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          {section !== SECTIONS.MAIN ? (
            <button
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
              onClick={() => setSection(SECTIONS.MAIN)}
            >
              <ChevronRight className="h-4 w-4" />
              חזרה
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-gray-500" />
              <span className="font-semibold text-gray-800 text-sm">פאנל ניהול</span>
            </div>
          )}
          <button
            className="rounded-full p-1 hover:bg-gray-200 transition-colors"
            onClick={handleClose}
            aria-label="סגור"
          >
            <X className="h-4 w-4 text-gray-600" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">

          {/* ── Main menu ── */}
          {section === SECTIONS.MAIN && (
            <div className="space-y-2">
              <button
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:bg-blue-50 hover:border-blue-300 transition-colors text-right"
                onClick={() => setSection(SECTIONS.ADD_USER)}
              >
                <UserPlus className="h-5 w-5 text-blue-600 shrink-0" />
                <div>
                  <div className="font-medium text-gray-800 text-sm">הוסף משתמש</div>
                  <div className="text-xs text-gray-500">יצירת חשבון משתמש חדש</div>
                </div>
              </button>

              <button
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:bg-purple-50 hover:border-purple-300 transition-colors text-right"
                onClick={() => setSection(SECTIONS.DEPARTMENTS)}
              >
                <GripVertical className="h-5 w-5 text-purple-600 shrink-0" />
                <div>
                  <div className="font-medium text-gray-800 text-sm">מחלקות</div>
                  <div className="text-xs text-gray-500">הוסף ועדכן מחלקות</div>
                </div>
              </button>

              <button
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:bg-orange-50 hover:border-orange-300 transition-colors text-right"
                onClick={() => { handleClose(); onOpenLogs(); }}
              >
                <BookOpen className="h-5 w-5 text-orange-600 shrink-0" />
                <div>
                  <div className="font-medium text-gray-800 text-sm">יומן לוגים</div>
                  <div className="text-xs text-gray-500">צפייה ביומן האירועים</div>
                </div>
              </button>

              <button
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:bg-green-50 hover:border-green-300 transition-colors text-right"
                onClick={() => setSection(SECTIONS.ONLINE_USERS)}
              >
                <Users className="h-5 w-5 text-green-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-800 text-sm">משתמשים מחוברים</div>
                  <div className="text-xs text-gray-500">
                    {allUsers.length === 0
                      ? "טוען..."
                      : `${nowCount} פעיל עכשיו · ${todayCount} פעיל היום`}
                  </div>
                </div>
              </button>

              <button
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:bg-cyan-50 hover:border-cyan-300 transition-colors text-right"
                onClick={() => setSection(SECTIONS.LIVE_DRILL_SOURCES)}
              >
                <Database className="h-5 w-5 text-cyan-600 shrink-0" />
                <div>
                  <div className="font-medium text-gray-800 text-sm">מקורות חי / תרגיל</div>
                  <div className="text-xs text-gray-500">ניהול קישורי Google Sheets</div>
                </div>
              </button>

              <button
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:bg-teal-50 hover:border-teal-300 transition-colors text-right"
                onClick={() => setSection(SECTIONS.MAP_CONFIG)}
              >
                <MapPin className="h-5 w-5 text-teal-600 shrink-0" />
                <div>
                  <div className="font-medium text-gray-800 text-sm">יישוב</div>
                  <div className="text-xs text-gray-500">מרכז ברירת מחדל למפת החירום</div>
                </div>
              </button>
            </div>
          )}

          {/* ── Add User ── */}
          {section === SECTIONS.ADD_USER && (
            <form onSubmit={handleCreateUser} className="space-y-4">
              <p className="text-sm font-semibold text-gray-700 mb-3">הוסף משתמש חדש</p>

              <div>
                <Label htmlFor="ap-fullName" className="text-xs font-medium">שם מלא</Label>
                <Input
                  id="ap-fullName"
                  type="text"
                  value={newUserFullName}
                  onChange={(e) => setNewUserFullName(e.target.value)}
                  placeholder="הכנס שם מלא"
                  required
                  className="mt-1 text-sm"
                />
              </div>

              <div>
                <Label htmlFor="ap-email" className="text-xs font-medium">כתובת מייל</Label>
                <Input
                  id="ap-email"
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="user@example.com"
                  required
                  className="mt-1 text-sm"
                />
              </div>

              <div>
                <Label htmlFor="ap-password" className="text-xs font-medium">סיסמה</Label>
                <Input
                  id="ap-password"
                  type="password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder="לפחות 6 תווים"
                  required
                  minLength={6}
                  className="mt-1 text-sm"
                />
              </div>

              <div>
                <Label htmlFor="ap-department" className="text-xs font-medium">מחלקה</Label>
                <Select value={newUserDepartment} onValueChange={(v) => setNewUserDepartment(v.trim())}>
                  <SelectTrigger className="mt-1 text-sm">
                    <SelectValue placeholder="בחר מחלקה" />
                  </SelectTrigger>
                  <SelectContent dir="rtl" className="z-[400] text-right">
                    {taskCategories.map((dept) => (
                      <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="ap-role" className="text-xs font-medium">תפקיד</Label>
                <Select value={newUserRole} onValueChange={setNewUserRole}>
                  <SelectTrigger className="mt-1 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent dir="rtl" className="z-[400] text-right">
                    <SelectItem value="staff">עובד</SelectItem>
                    <SelectItem value="admin">מנהל</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setSection(SECTIONS.MAIN)} disabled={isCreatingUser} className="flex-1 text-sm">
                  ביטול
                </Button>
                <Button type="submit" disabled={isCreatingUser} className="flex-1 text-sm">
                  {isCreatingUser ? "יוצר..." : "צור משתמש"}
                </Button>
              </div>
            </form>
          )}

          {/* ── Departments ── */}
          {section === SECTIONS.DEPARTMENTS && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-gray-700">ניהול מחלקות</p>

              <div className="space-y-1">
                {taskCategories.map((dept) => (
                  <div
                    key={dept}
                    className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 group"
                  >
                    <span className="text-sm text-gray-800">{dept}</span>
                    <button
                      className="p-1 rounded text-red-500 hover:bg-red-100 hover:text-red-600 transition-all"
                      onClick={() => handleRemoveDepartment(dept)}
                      disabled={isSavingDepts}
                      aria-label={`מחק ${dept}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {taskCategories.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">אין מחלקות</p>
                )}
              </div>

              <div className="flex gap-2">
                <Input
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  placeholder="שם מחלקה חדשה"
                  className="text-sm flex-1"
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddDepartment())}
                />
                <Button
                  size="sm"
                  onClick={handleAddDepartment}
                  disabled={!newDeptName.trim() || isSavingDepts}
                  className="shrink-0"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-gray-400">לחץ Enter או על הכפתור להוספה. רחף מעל מחלקה למחיקה.</p>
            </div>
          )}

          {/* ── Live / Drill Sources ── */}
          {section === SECTIONS.LIVE_DRILL_SOURCES && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-gray-700">מקורות תושבים חי / תרגיל</p>
                <p className="text-xs text-gray-500 mt-1">
                  אין צורך ב-API key. יש לשתף את הגיליון עם חשבון השירות של Firebase אם הבדיקה נכשלת בהרשאות.
                </p>
              </div>

              {Object.entries(sourceForm).map(([mode, source]) => {
                const verified = source.lastVerified;
                const warnings = verified?.warnings || [];
                const isVerifying = Boolean(isVerifyingSource[mode]);
                const isSaving = Boolean(isSavingSource[mode]);

                return (
                  <div key={mode} className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-gray-800">{source.label}</div>
                        <div className="text-xs text-gray-500">{mode === "live" ? "מקור אמת" : "מקור תרגיל"}</div>
                      </div>
                      {verified?.ok ? (
                        <span className="flex items-center gap-1 text-xs text-green-700">
                          <CheckCircle className="h-3.5 w-3.5" />
                          אומת
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          לא אומת
                        </span>
                      )}
                    </div>

                    <div>
                      <Label htmlFor={`sheet-url-${mode}`} className="text-xs font-medium">קישור Google Sheet או מזהה</Label>
                      <Input
                        id={`sheet-url-${mode}`}
                        dir="ltr"
                        value={source.sheetUrl}
                        onChange={(e) => updateSourceField(mode, "sheetUrl", e.target.value)}
                        placeholder="https://docs.google.com/spreadsheets/d/..."
                        className="mt-1 text-xs"
                      />
                    </div>

                    <div>
                      <Label htmlFor={`sheet-name-${mode}`} className="text-xs font-medium">שם הטאב</Label>
                      <Input
                        id={`sheet-name-${mode}`}
                        value={source.sheetName}
                        onChange={(e) => updateSourceField(mode, "sheetName", e.target.value)}
                        placeholder="גיליון1"
                        className="mt-1 text-xs"
                      />
                    </div>

                    {source.sheetId && (
                      <div className="rounded border bg-white p-2 text-[11px] text-gray-600 break-all" dir="ltr">
                        {source.sheetId}
                      </div>
                    )}

                    {verified && (
                      <div className="rounded border bg-white p-2 text-xs text-gray-700 space-y-1">
                        <div>{`תושבים שנמצאו: ${verified.residentCount ?? 0}`}</div>
                        <div>{`נבדק לאחרונה: ${formatVerifiedAt(verified.verifiedAt) || "לא ידוע"}`}</div>
                        {warnings.length > 0 && (
                          <div className="text-yellow-700">{`אזהרות: ${warnings.join(", ")}`}</div>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => verifySource(mode)}
                        disabled={isVerifying || isSaving}
                        className="flex-1 text-xs"
                      >
                        {isVerifying ? "בודק..." : "בדוק חיבור"}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => saveSource(mode)}
                        disabled={isSaving || isVerifying}
                        className="flex-1 text-xs"
                      >
                        {isSaving ? "שומר..." : "שמור"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Map יישוב config ── */}
          {section === SECTIONS.MAP_CONFIG && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-gray-700">יישוב — מרכז המפה</p>
                <p className="text-xs text-gray-500 mt-1">
                  הזינו שם יישוב בלבד. המערכת תאמת מיקום בישראל. ניתן לערוך lat/lng/zoom ידנית אם צריך.
                </p>
              </div>

              <div>
                <Label htmlFor="map-yishuv-name" className="text-xs font-medium">יישוב</Label>
                <Input
                  id="map-yishuv-name"
                  value={mapForm.yishuvName}
                  onChange={(e) => updateMapField("yishuvName", e.target.value)}
                  placeholder="לדוגמה: ניר עם"
                  className="mt-1 text-sm"
                />
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={geocodeYishuv}
                disabled={isGeocodingMap || isSavingMap || !String(mapForm.yishuvName || "").trim()}
                className="w-full text-sm"
              >
                {isGeocodingMap ? "מאמת..." : "אמת מיקום"}
              </Button>

              {mapForm.geocodedAddress && (
                <div className="rounded border bg-gray-50 p-2 text-xs text-gray-700">
                  {mapForm.geocodedAddress}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="map-lat" className="text-xs font-medium">קו רוחב (lat)</Label>
                  <Input
                    id="map-lat"
                    dir="ltr"
                    type="number"
                    step="any"
                    value={mapForm.lat}
                    onChange={(e) => updateMapField("lat", e.target.value === "" ? "" : Number(e.target.value))}
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <Label htmlFor="map-lng" className="text-xs font-medium">קו אורך (lng)</Label>
                  <Input
                    id="map-lng"
                    dir="ltr"
                    type="number"
                    step="any"
                    value={mapForm.lng}
                    onChange={(e) => updateMapField("lng", e.target.value === "" ? "" : Number(e.target.value))}
                    className="mt-1 text-xs"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="map-zoom" className="text-xs font-medium">זום</Label>
                <Input
                  id="map-zoom"
                  dir="ltr"
                  type="number"
                  min={1}
                  max={21}
                  value={mapForm.zoom}
                  onChange={(e) => updateMapField("zoom", e.target.value === "" ? "" : Number(e.target.value))}
                  className="mt-1 text-xs"
                />
              </div>

              <Button
                type="button"
                onClick={saveMapConfig}
                disabled={isSavingMap || isGeocodingMap}
                className="w-full text-sm"
              >
                {isSavingMap ? "שומר..." : "שמור"}
              </Button>
            </div>
          )}

          {/* ── Online Users ── */}
          {section === SECTIONS.ONLINE_USERS && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">משתמשים מחוברים</p>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                    עכשיו
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />
                    היום
                  </span>
                </div>
              </div>

              {usersWithPresence.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-6">טוען משתמשים...</p>
              )}

              <div className="space-y-1">
                {usersWithPresence.map((u) => (
                  <div
                    key={u.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-right ${
                      u.presence === "offline"
                        ? "border-gray-100 bg-white opacity-50"
                        : "border-gray-200 bg-gray-50"
                    }`}
                  >
                    <PresenceDot status={u.presence} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">
                        {u.alias || u.email}
                      </div>
                      {u.department && (
                        <div className="text-xs text-gray-500 truncate">{u.department}</div>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 shrink-0 ltr:text-left rtl:text-right">
                      {formatLastSeen(u.lastSeen)}
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-xs text-gray-400 text-center pt-1">
                מתעדכן בזמן אמת · ●&nbsp;עכשיו = פעיל עד 10 דק׳ אחרונות
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
