"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, ChevronDown, ChevronUp, Edit2, MessageCircle, Phone, UserPlus } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import "@fontsource/rubik/400.css";
import "@fontsource/rubik/500.css";
import "@fontsource/rubik/700.css";
import "@/app/v2.css";

/**
 * Unauthenticated layout demo for classic→v2 parity affordances.
 * Mock data only — no Firebase. For screenshots / Try Live without credentials.
 */
export default function ParityDemoPage() {
  const [expanded, setExpanded] = useState(true);
  const [editingStatus, setEditingStatus] = useState(false);
  const [status, setStatus] = useState("זקוקים לסיוע");
  const [taskStatus, setTaskStatus] = useState("בטיפול");
  const [eventStatus, setEventStatus] = useState("מחכה");
  const [replyOpen, setReplyOpen] = useState(false);
  const [boardView, setBoardView] = useState("list");
  const [eventView, setEventView] = useState("table");

  return (
    <div className="v2-shell min-h-[100dvh] bg-[var(--v2-bg,#eaf3f6)] p-4 text-[var(--v2-ink,#1a2e52)]" dir="rtl">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="v2-card flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h1 className="v2-h1">דמו פריסת classic→v2</h1>
            <p className="v2-sub">ללא התחברות · נתוני דמה להצגת השינויים ששוחזרו</p>
          </div>
          <div className="v2-row">
            <Link className="v2-btn" href="/login">התחברות</Link>
            <Link className="v2-btn v2-btn-primary" href="/">למערכת</Link>
          </div>
        </header>

        <section className="space-y-3">
          <h2 className="font-bold">תושבים — סטטוס בשורה · צ׳יפים · הרחבה · הקצה</h2>
          <div className={`v2-card v2-res-card ${expanded ? "is-expanded" : ""}`}>
            <div className="v2-res-card-top">
              <div className="v2-res-card-main">
                <div className="v2-res-card-open">
                  <div className="v2-res-card-title">
                    <span className="v2-res-card-name">כהן דנה</span>
                    <span className="v2-task-dots">
                      <i className="v2-task-dot pending" />
                      <i className="v2-task-dot progress" />
                    </span>
                    <span className="v2-task-chips">
                      <span className="v2-task-chip pending">2 מחכות</span>
                      <span className="v2-task-chip progress">1 בטיפול</span>
                    </span>
                  </div>
                  <div className="v2-res-card-line">
                    <span className="v2-res-card-hood">נווה צדק</span>
                  </div>
                </div>
                <div className="v2-res-card-status">
                  {editingStatus ? (
                    <div className="v2-inline-status">
                      <select className="v2-select v2-select-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
                        <option>כולם בסדר</option>
                        <option>זקוקים לסיוע</option>
                        <option>לא בטוח</option>
                        <option>פצוע</option>
                      </select>
                      <button className="v2-btn v2-btn-primary v2-btn-sm" type="button" onClick={() => setEditingStatus(false)}>שמור</button>
                    </div>
                  ) : (
                    <div className="v2-inline-status-display">
                      <span className="v2-pill v2-pill-compact">
                        <i className="v2-dot v2-st-help" />
                        {status}
                      </span>
                      <button type="button" className="v2-btn v2-btn-icon" aria-label="ערוך סטטוס" onClick={() => setEditingStatus(true)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="v2-res-card-side">
                <button type="button" className="v2-btn v2-btn-icon" aria-label="הרחב" onClick={() => setExpanded((v) => !v)}>
                  {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                <div className="v2-res-actions">
                  <button type="button" className="v2-btn v2-btn-sm v2-btn-assign has-tasks">
                    <UserPlus className="h-3.5 w-3.5" />
                    <span>3 משימות</span>
                  </button>
                  <span className="v2-btn v2-btn-icon v2-btn-wa"><FaWhatsapp className="h-4 w-4" /></span>
                  <span className="v2-btn v2-btn-icon v2-btn-call"><Phone className="h-4 w-4" /></span>
                </div>
              </div>
            </div>
            {expanded && (
              <div className="v2-res-expand">
                <div className="v2-res-expand-grid">
                  <div><span className="v2-muted-label">הורה/ילד</span> הורה</div>
                  <div><span className="v2-muted-label">סטטוס מגורים</span> בבית</div>
                  <div><span className="v2-muted-label">מספר בית</span> 12</div>
                  <div><span className="v2-muted-label">משימות</span> 3</div>
                </div>
              </div>
            )}
          </div>
          <div className="v2-card overflow-auto p-2">
            <table className="v2-data">
              <thead>
                <tr>
                  <th />
                  <th>שם משפחה</th>
                  <th>שם פרטי</th>
                  <th>סטטוס</th>
                  <th>פעולות</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><ChevronDown className="h-4 w-4" /></td>
                  <td>לוי</td>
                  <td>יוסי</td>
                  <td>
                    <span className="v2-pill v2-pill-compact"><i className="v2-dot v2-st-ok" />כולם בסדר</span>
                    <Edit2 className="ms-1 inline h-3.5 w-3.5 align-middle" />
                  </td>
                  <td>הקצה · ☎ · WA</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">משימות — תצוגה מוקטנת · סטטוס · תגובה · תזכורת · מטא</h2>
            <div className="v2-seg">
              <button type="button" className={boardView === "kanban" ? "on" : ""} onClick={() => setBoardView("kanban")}>תצוגה מלאה</button>
              <button type="button" className={boardView === "list" ? "on" : ""} onClick={() => setBoardView("list")}>תצוגה מוקטנת</button>
            </div>
          </div>
          <div className="v2-card v2-task-list">
            <div className="v2-task-item is-compact">
              <div className="flex items-start justify-between gap-2">
                <strong>
                  <i className="v2-task-unread inline-block align-middle ms-1" />
                  בדיקת בית עם תושב
                  <span className="v2-task-new"> (חדש)</span>
                </strong>
                <div className="flex gap-1">
                  <button className="v2-btn v2-btn-icon" type="button" aria-label="תזכורת"><Bell className="h-3.5 w-3.5" /></button>
                  <button className="v2-btn v2-btn-sm" type="button">✓</button>
                </div>
              </div>
              <div className="v2-task-card-controls">
                <select className="v2-select v2-select-sm" value={taskStatus} onChange={(e) => setTaskStatus(e.target.value)}>
                  <option>מחכה</option>
                  <option>בטיפול</option>
                  <option>טופל</option>
                </select>
                <button className="v2-btn v2-btn-sm" type="button" onClick={() => setReplyOpen((v) => !v)}>
                  <MessageCircle className="h-3.5 w-3.5" />
                  <span>תגובה</span>
                </button>
              </div>
              {replyOpen && (
                <div className="v2-inline-reply">
                  <textarea className="v2-textarea" rows={2} defaultValue="הגעתי לכתובת…" />
                </div>
              )}
              <div className="meta" style={{ color: "var(--v2-muted)", fontSize: 11, marginTop: 4 }}>
                דחוף · 26/09/2026, 14:30 · לוגיסטיקה · אדם · 2 תגובות
              </div>
              <div className="v2-task-links">
                <span className="v2-task-link">תושב: כהן דנה</span>
                <div className="v2-task-resident-meta">
                  <span>050-1234567</span>
                  <span>שכונה: נווה צדק</span>
                </div>
              </div>
              <div className="mt-2 flex gap-1">
                <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800">דחוף שטח</span>
                <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">מעקב</span>
              </div>
            </div>
          </div>
          <div className="v2-card p-3 text-sm">
            <div className="mb-2 font-semibold">טופס משימה — מחלקה ≠ קטגוריה</div>
            <div className="v2-fields">
              <label>
                <span className="v2-label">מחלקה</span>
                <select className="v2-select"><option>לוגיסטיקה</option><option>רפואה</option></select>
              </label>
              <label>
                <span className="v2-label">קטגוריה</span>
                <select className="v2-select"><option>שטח</option><option>מנהלה</option></select>
              </label>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">יומן — סטטוס בשורה · תצוגה מלאה</h2>
            <div className="v2-seg">
              <button type="button" className={eventView === "cards" ? "on" : ""} onClick={() => setEventView("cards")}>כרטיסים</button>
              <button type="button" className={eventView === "table" ? "on" : ""} onClick={() => setEventView("table")}>תצוגה מלאה</button>
            </div>
          </div>
          {eventView === "table" ? (
            <div className="v2-card overflow-auto">
              <table className="v2-data v2-events-table">
                <thead>
                  <tr>
                    <th>שעה</th>
                    <th>מדווח</th>
                    <th>תיאור</th>
                    <th>מחלקה</th>
                    <th>סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>14:12</td>
                    <td>מיכל</td>
                    <td className="v2-name">דיווח על נתק חשמל ברחוב הרצל</td>
                    <td>תשתיות</td>
                    <td>
                      <select className="v2-select v2-select-sm" value={eventStatus} onChange={(e) => setEventStatus(e.target.value)}>
                        <option>מחכה</option>
                        <option>בטיפול</option>
                        <option>טופל</option>
                      </select>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="v2-card">
              <div className="v2-appt-row">
                <button type="button" className="v2-appt-open">
                  <div className="v2-appt-time">14:12</div>
                  <div className="min-w-0 flex-1 text-right">
                    <div className="v2-appt-name">דיווח על נתק חשמל ברחוב הרצל</div>
                    <div className="v2-appt-meta"><span>מיכל</span><span>תשתיות</span></div>
                  </div>
                </button>
                <select className="v2-select v2-select-sm" value={eventStatus} onChange={(e) => setEventStatus(e.target.value)}>
                  <option>מחכה</option>
                  <option>בטיפול</option>
                  <option>טופל</option>
                </select>
              </div>
            </div>
          )}
        </section>

        <section className="v2-card space-y-2 p-4">
          <h2 className="font-bold">מעטפת — Notes מ־md · סיום אירוע · ירוק בעיניים</h2>
          <p className="text-sm text-[var(--v2-muted)]">
            Notes/Links מוצגים מה־breakpoint של md; דיאלוג סיום אירוע כולל מזהה + רשימת ניקוי;
            ירוק בעיניים מציג מספר תושבים שאומתו כשיש lastVerified.
          </p>
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <strong>סיום אירוע — דוגמה:</strong>
            <ul className="mt-1 list-disc pe-5 text-xs">
              <li>יומן אירועים</li>
              <li>משימות</li>
              <li>סטטוסי תושבים</li>
              <li>מחיקת תושבים / משימות / לידים</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
