import React, { useState, useEffect, useMemo, useRef } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, arrayUnion, setDoc } from "firebase/firestore";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { FaWhatsapp, FaCodeBranch } from "react-icons/fa";
import { Search, ChevronDown } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

// --- Status config (copy from page.js) ---
const leadStatusConfig = {
  "נקבע יעוץ": { color: "bg-green-500", priority: 1 },
  "הומלץ טיפול": { color: "bg-blue-500", priority: 2 },
  "לא הומלץ טיפול": { color: "bg-gray-400", priority: 3 },
  "ניתן מידע": { color: "bg-yellow-400", priority: 4 },
  "הסדר תשלום": { color: "bg-purple-400", priority: 5 },
  "נקבעה סדרה": { color: "bg-emerald-400", priority: 6 },
  "לא מעוניינים": { color: "bg-gray-500", priority: 7 },
  "יעוץ בוטל": { color: "bg-red-400", priority: 8 },
  Default: { color: "bg-gray-300", priority: 99 }
};
const leadColorTab = (status) => leadStatusConfig[status]?.color || leadStatusConfig.Default.color;

const candidatesStatuses = [
  "נקבע יעוץ",
  "הומלץ טיפול",
  "לא הומלץ טיפול",
  "ניתן מידע",
  "הסדר תשלום",
  "נקבעה סדרה",
  "לא מעוניינים",
  "יעוץ בוטל"
];

// Utility for date formatting (copy from page.js)
const formatDateTime = (date) => {
  if (!date) return "";
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return "";
    return `${d.toLocaleDateString("he-IL")} ${d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
  } catch (error) { return ""; }
};

// Restore getPref/savePref helpers for local persistence
function savePref(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}
function getPref(key, def) {
  try { const v = localStorage.getItem(key); if (v !== null) return JSON.parse(v); } catch (e) {} return def; }

export default function CandidatesBlock({ isFullView: parentIsFullView, setIsFullView: parentSetIsFullView }) {
  // --- State ---
  const [leads, setLeads] = useState([]);
  // Multi-select status filter
  const [selectedStatuses, setSelectedStatuses] = useState(() => getPref('candidates_selectedStatuses', candidatesStatuses));
  const [searchTerm, setSearchTerm] = useState(() => getPref('candidates_searchTerm', ""));
  const [blockOrder, setBlockOrder] = useState(() => getPref('candidates_blockOrder', 4));
  const [sortBy, setSortBy] = useState(() => getPref('candidates_sortBy', "priority"));
  const [sortDirection, setSortDirection] = useState(() => getPref('candidates_sortDirection', "desc"));
  const [editingLeadId, setEditingLeadId] = useState(null);
  const [editLeadFullName, setEditLeadFullName] = useState("");
  const [editLeadPhone, setEditLeadPhone] = useState("");
  const [editLeadMessage, setEditLeadMessage] = useState("");
  const [editLeadStatus, setEditLeadStatus] = useState("");
  const [editLeadSource, setEditLeadSource] = useState("");
  // Conversation update state
  const [showConvUpdate, setShowConvUpdate] = useState(null);
  const [newConversationText, setNewConversationText] = useState("");
  const [holdLeadId, setHoldLeadId] = useState(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdAnimationRef = useRef();
  const holdDelayTimeout = useRef();
  const HOLD_DURATION = 1500;
  // Add state for new task creation:
  const [newTaskText, setNewTaskText] = useState("");
  const [newTaskAlias, setNewTaskAlias] = useState("");

  const didMountStatuses = useRef(false);

  // --- Persist filters and view ---
  useEffect(() => {
    if (didMountStatuses.current) {
      savePref('candidates_selectedStatuses', selectedStatuses);
    } else {
      didMountStatuses.current = true;
    }
  }, [selectedStatuses]);

  useEffect(() => {
    if (!parentIsFullView) {
      savePref('candidates_searchTerm', searchTerm);
      savePref('candidates_sortBy', sortBy);
      savePref('candidates_sortDirection', sortDirection);
    }
  }, [selectedStatuses, searchTerm, sortBy, sortDirection, parentIsFullView]);

  // --- Real-time Firestore listener ---
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "leads"), (snapshot) => {
      const fetchedLeads = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          createdAt: data.createdAt?.toDate?.() || new Date(),
          fullName: data.fullName || "",
          phoneNumber: data.phoneNumber || "",
          message: data.message || "",
          status: data.status || "",
          source: data.source || "",
          followUpCall: data.followUpCall || { active: false, count: 0 },
          conversationSummary: data.conversationSummary || [],
        };
      });
      setLeads(fetchedLeads);
    });
    return () => unsubscribe();
  }, []);

  // --- Sorting logic ---
  const compareLeads = (a, b) => {
    if (sortBy === "priority") {
      const priorityDiff = (leadStatusConfig[a.status]?.priority || 99) - (leadStatusConfig[b.status]?.priority || 99);
      if (priorityDiff !== 0) return sortDirection === "asc" ? priorityDiff : -priorityDiff;
      // fallback to date
      const dateA = new Date(a.createdAt);
      const dateB = new Date(b.createdAt);
      return sortDirection === "asc" ? dateA - dateB : dateB - dateA;
    } else {
      // sortBy === "date"
      const dateA = new Date(a.createdAt);
      const dateB = new Date(b.createdAt);
      return sortDirection === "asc" ? dateA - dateB : dateB - dateA;
    }
  };

  // --- Filtered and sorted candidates ---
  const filteredCandidates = useMemo(() => {
    return leads
      .filter(lead => selectedStatuses.includes(lead.status))
      .filter(lead => lead.status !== "בבדיקת לקוח")
      .filter(lead => {
        const term = searchTerm.toLowerCase();
        return (
          !term ||
          lead.fullName?.toLowerCase().includes(term) ||
          lead.phoneNumber?.includes(term) ||
          lead.message?.toLowerCase().includes(term) ||
          lead.status?.toLowerCase().includes(term)
        );
      })
      .sort(compareLeads);
  }, [leads, selectedStatuses, searchTerm, sortBy, sortDirection]);

  // --- Actions ---
  const handleDuplicateLead = async (lead) => {
    try {
      const duplicatedLead = {
        ...lead,
        fullName: lead.fullName + " משוכפל",
        createdAt: new Date(),
      };
      delete duplicatedLead.id;
      await addDoc(collection(db, "leads"), duplicatedLead);
      alert("הליד שוכפל");
    } catch (error) {
      alert("שגיאה בשכפול ליד");
    }
  };

  // --- Click2Call cloud PBX logic ---
  const handleClick2Call = async (phoneNumber) => {
    const apiUrl = "https://master.ippbx.co.il/ippbx_api/v1.4/api/info/click2call";
    const payload = {
      token_id: "22K3TWfeifaCPUyA",
      phone_number: phoneNumber,
      extension_number: "104",
      extension_password: "bdb307dc55bf1e679c296ee5c73215cb"
    };
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        alert(`שיחה ל-${phoneNumber} הופעלה דרך המרכזיה.`);
      } else {
        const errorText = await response.text();
        alert(errorText || "לא ניתן היה להפעיל שיחה דרך המרכזיה.");
      }
    } catch (error) {
      alert(error.message || "לא ניתן היה להפעיל שיחה דרך המרכזיה.");
    }
  };

  // --- Edit logic ---
  const handleEditLead = (lead) => {
    setEditingLeadId(lead.id);
    setEditLeadFullName(lead.fullName);
    setEditLeadPhone(lead.phoneNumber);
    setEditLeadMessage(lead.message);
    setEditLeadStatus(lead.status);
    setEditLeadSource(lead.source || "");
  };
  const handleSaveLead = async (e, leadId) => {
    e.preventDefault();
    console.log('Saving lead', leadId, editLeadFullName, editLeadPhone);
    setEditingLeadId(null); // Optimistically close the form
    try {
      const leadRef = doc(db, "leads", leadId);
      await updateDoc(leadRef, {
        fullName: editLeadFullName,
        phoneNumber: editLeadPhone,
        message: editLeadMessage,
        status: editLeadStatus,
        source: editLeadSource,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      alert("שגיאה בשמירת הליד");
      setEditingLeadId(leadId); // Reopen the form if there was an error
    }
  };
  const handleCancelEdit = () => {
    setEditingLeadId(null);
  };

  // --- Location button logic ---
  const handleToggleBlockOrder = () => {
    // Cycle between 1, 2, 3, 4 (for test/demo)
    setBlockOrder((prev) => (prev === 4 ? 1 : prev + 1));
  };

  // --- Conversation update logic ---
  const handleAddConversation = async (leadId) => {
    if (!newConversationText.trim()) return;
    try {
      const leadRef = doc(db, "leads", leadId);
      const newEntry = {
        text: newConversationText,
        timestamp: new Date(),
      };
      await updateDoc(leadRef, {
        conversationSummary: arrayUnion(newEntry),
        updatedAt: serverTimestamp(),
      });
      setNewConversationText("");
      setShowConvUpdate(leadId); // keep open
    } catch (error) {
      alert("שגיאה בהוספת עדכון שיחה");
    }
  };

  // --- Follow-up counter logic ---
  const handleIncrementFollowUp = async (leadId, currentCount) => {
    try {
      const leadRef = doc(db, "leads", leadId);
      await updateDoc(leadRef, {
        followUpCall: {
          active: true,
          count: (currentCount || 0) + 1,
        },
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      alert("שגיאה בעדכון ספירת מעקב");
    }
  };

  // --- Follow-up button logic ---
  const handleFollowUpClick = async (lead) => {
    if (holdLeadId === lead.id) return;
    if (!lead.followUpCall?.active && (!lead.followUpCall || lead.followUpCall.count === 0)) {
      const leadRef = doc(db, 'leads', lead.id);
      await updateDoc(leadRef, { followUpCall: { active: true, count: 1 } });
    } else if (lead.followUpCall?.active) {
      const leadRef = doc(db, 'leads', lead.id);
      await updateDoc(leadRef, { followUpCall: { active: true, count: (lead.followUpCall.count || 1) + 1 } });
    }
  };
  const handleFollowUpReset = async (lead) => {
    const leadRef = doc(db, 'leads', lead.id);
    await updateDoc(leadRef, { followUpCall: { active: false, count: 0 } });
    setTimeout(() => {
      setHoldLeadId(null);
      setHoldProgress(0);
    }, 50);
  };
  const handleHoldStart = (lead) => {
    setHoldLeadId(lead.id);
    setHoldProgress(0);
    holdDelayTimeout.current = setTimeout(() => {
      const start = Date.now();
      function animate() {
        const elapsed = Date.now() - start;
        const progress = Math.min(elapsed / 1200, 1);
        setHoldProgress(progress);
        if (progress < 1) {
          holdAnimationRef.current = requestAnimationFrame(animate);
        } else {
          handleFollowUpReset(lead);
        }
      }
      holdAnimationRef.current = requestAnimationFrame(animate);
    }, 300);
  };
  const handleHoldEnd = () => {
    setHoldLeadId(null);
    setHoldProgress(0);
    if (holdDelayTimeout.current) clearTimeout(holdDelayTimeout.current);
    if (holdAnimationRef.current) cancelAnimationFrame(holdAnimationRef.current);
  };

  // --- Add handler for creating a task from a lead:
  const handleCreateTaskFromLead = async (lead) => {
    if (!newTaskText.trim() || !newTaskAlias.trim()) return;
    try {
      const taskRef = doc(collection(db, "tasks"));
      await setDoc(taskRef, {
        id: taskRef.id,
        userId: lead.id, // or current user if available
        creatorId: lead.id, // or current user if available
        title: newTaskText,
        subtitle: `נוצר מליד: ${lead.fullName}`,
        assignTo: newTaskAlias.replace(/^@/, ""),
        status: "פתוח",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        replies: [],
        isRead: false,
        isArchived: false,
        done: false,
        completedBy: null,
        completedAt: null
      });
      setNewTaskText("");
      setNewTaskAlias("");
      alert("המשימה נוצרה בהצלחה");
    } catch (error) {
      alert("שגיאה ביצירת משימה");
    }
  };

  // --- UI ---
  return (
    <div
      style={{ order: blockOrder }}
      className={`col-span-1 ${parentIsFullView ? 'lg:col-span-8' : 'lg:col-span-4'} transition-all duration-300 ease-in-out`}
    >
      <Card className="h-full flex flex-col">
        <CardHeader>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <CardTitle>{'מועמדים לתוכניות טיפול'}</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => parentSetIsFullView(v => !v)} variant="outline">
                  {parentIsFullView ? 'תצוגה מקוצרת' : 'תצוגה מלאה'}
                </Button>
                <Button size="xs" onClick={handleToggleBlockOrder} variant="outline">
                  {'מיקום: '}{blockOrder}
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2 border-t pt-2">
              <div>
                <Label className="ml-1 text-sm font-medium">{'סטטוס:'}</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 text-sm w-[180px] justify-between">
                      <span>
                        {selectedStatuses.length === candidatesStatuses.length
                          ? "כל הסטטוסים"
                          : selectedStatuses.length === 1
                            ? candidatesStatuses.find(cat => cat === selectedStatuses[0])
                            : `${selectedStatuses.length} נבחרו`}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[180px]" dir="rtl">
                    <DropdownMenuLabel>{'סינון סטטוס'}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {candidatesStatuses.map((status) => (
                      <DropdownMenuCheckboxItem
                        key={status}
                        checked={selectedStatuses.includes(status)}
                        onCheckedChange={() => setSelectedStatuses(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status])}
                        onSelect={e => e.preventDefault()}
                        className="flex flex-row-reverse items-center justify-between"
                      >
                        <span className={`inline-block w-4 h-4 rounded mr-2 ${leadStatusConfig[status].color}`}></span>
                        {status}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  type="search"
                  placeholder="חפש מועמד..."
                  className="h-8 text-sm pl-8 w-[180px]"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <div>
                <Label className="ml-1 text-sm font-medium">{'סדר לפי:'}</Label>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="h-8 text-sm w-[120px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="priority">עדיפות</SelectItem>
                    <SelectItem value="date">תאריך יצירה</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="ml-1 text-sm font-medium">{'כיוון:'}</Label>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-sm w-[40px] px-2"
                  onClick={() => setSortDirection(dir => dir === 'asc' ? 'desc' : 'asc')}
                  title={sortDirection === 'asc' ? 'סדר עולה' : 'סדר יורד'}
                >
                  {sortDirection === 'asc' ? '⬆️' : '⬇️'}
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-grow flex flex-col overflow-hidden">
          {parentIsFullView ? (
            // --- Expanded Table View ---
            <div className="flex-grow overflow-auto">
              <table className="w-full table-fixed text-sm border-collapse">
                <thead className="sticky top-0 bg-gray-100 z-10">
                  <tr>
                    <th className="px-2 py-2 text-right font-semibold w-16">{'עדיפות'}</th>
                    <th className="px-2 py-2 text-right font-semibold w-32">{'תאריך'}</th>
                    <th className="px-2 py-2 text-right font-semibold w-32">{'שם מלא'}</th>
                    <th className="px-2 py-2 text-right font-semibold w-24">{'סטטוס'}</th>
                    <th className="px-2 py-2 text-right font-semibold max-w-xs truncate">{'הודעה'}</th>
                    <th className="px-2 py-2 text-right font-semibold w-20">{'פעולות'}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCandidates.map(lead => {
                    const colorTab = leadColorTab(lead.status);
                    return (
                      <React.Fragment key={lead.id}>
                        <tr className="border-b hover:bg-gray-50 group">
                          <td className="px-2 py-2 align-top"><div className={`w-3 h-6 ${colorTab} rounded mx-auto`} /></td>
                          <td className="px-2 py-2 align-top whitespace-nowrap">{formatDateTime(lead.createdAt)}</td>
                          <td className="px-2 py-2 align-top font-medium">{lead.fullName}</td>
                          <td className="px-2 py-2 align-top">{lead.status}</td>
                          <td className="px-2 py-2 align-top truncate" title={lead.message}>{lead.message}</td>
                          <td className="px-2 py-2 align-top text-center">
                            <button
                              className="relative group"
                              style={{ outline: 'none', border: 'none', background: 'none', cursor: 'pointer' }}
                              onClick={() => handleFollowUpClick(lead)}
                              onMouseDown={() => handleHoldStart(lead)}
                              onMouseUp={handleHoldEnd}
                              onMouseLeave={handleHoldEnd}
                              tabIndex={0}
                              aria-label="סמן פולואפ טלפון"
                            >
                              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                                <circle
                                  cx="14" cy="14" r="13"
                                  stroke={lead.followUpCall?.active ? '#22c55e' : '#e5e7eb'}
                                  strokeWidth="2"
                                  fill={lead.followUpCall?.active ? '#22c55e' : 'white'}
                                />
                                <circle
                                  cx="14" cy="14" r="13"
                                  stroke="#22c55e"
                                  strokeWidth="3"
                                  fill="none"
                                  strokeDasharray={2 * Math.PI * 13}
                                  strokeDashoffset={(1 - (holdLeadId === lead.id ? holdProgress : 0)) * 2 * Math.PI * 13}
                                  style={{ transition: 'stroke-dashoffset 0.1s linear' }}
                                />
                                <path d="M19.5 17.5c-1.5 0-3-.5-4.5-2s-2-3-2-4.5c0-.5.5-1 1-1h2c.5 0 1 .5 1 1 0 .5.5 1 1 1s1-.5 1-1c0-2-1.5-3.5-3.5-3.5S9.5 9.5 9.5 11.5c0 4.5 3.5 8 8 8 .5 0 1-.5 1-1v-2c0-.5-.5-1-1-1z" fill={lead.followUpCall?.active ? 'white' : '#a3a3a3'} />
                              </svg>
                              {lead.followUpCall?.active && lead.followUpCall?.count > 1 && (
                                <span className="absolute -top-1 -right-1 bg-green-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center border-2 border-white">{lead.followUpCall.count}</span>
                              )}
                            </button>
                          </td>
                          <td className="px-2 py-2 align-top">
                            <div className="flex items-center gap-1">
                              <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="w-6 h-6 text-gray-500 hover:text-blue-600" title="פתח לעריכה" onClick={() => handleEditLead(lead)}><span role="img" aria-label="Edit" className="w-3 h-3">✎</span></Button></TooltipTrigger><TooltipContent>{'פתח/ערוך ליד'}</TooltipContent></Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <a href={`https://wa.me/${lead.phoneNumber}`} target="_blank" rel="noopener noreferrer">
                                    <Button size="icon" variant="ghost" className="w-6 h-6 text-green-600 hover:text-green-700">
                                      <FaWhatsapp className="w-3 h-3" />
                                    </Button>
                                  </a>
                                </TooltipTrigger>
                                <TooltipContent>{'שלח וואטסאפ'}</TooltipContent>
                              </Tooltip>
                              <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="w-6 h-6 text-blue-600 hover:text-blue-700" onClick={() => handleClick2Call(lead.phoneNumber)}><span role="img" aria-label="Call" className="w-3 h-3">📞</span></Button></TooltipTrigger><TooltipContent>{'התקשר דרך המרכזיה'}</TooltipContent></Tooltip>
                            </div>
                          </td>
                        </tr>
                        {editingLeadId === lead.id && (
                          <tr className="border-b bg-blue-50">
                            <td colSpan={7} className="p-4">
                              <form onSubmit={e => handleSaveLead(e, lead.id)} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                  <Label className="block"><span className="text-gray-700 text-sm font-medium">{'שם מלא:'}</span><Input type="text" className="mt-1 h-8 text-sm" value={editLeadFullName} onChange={ev => setEditLeadFullName(ev.target.value)} required /></Label>
                                  <Label className="block"><span className="text-gray-700 text-sm font-medium">{'טלפון:'}</span><Input type="tel" className="mt-1 h-8 text-sm" value={editLeadPhone} onChange={ev => setEditLeadPhone(ev.target.value)} required /></Label>
                                  <Textarea rows={4} className="mt-1 text-sm resize-y" value={editLeadMessage} onChange={ev => setEditLeadMessage(ev.target.value)} />
                                  <Label className="block"><span className="text-gray-700 text-sm font-medium">{'סטטוס:'}</span>
                                    <Select value={editLeadStatus} onValueChange={setEditLeadStatus}>
                                      <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="בחר..." /></SelectTrigger>
                                      <SelectContent className="text-right" dir="rtl">
                                        {candidatesStatuses.map(status => (
                                          <SelectItem key={status} value={status} className="flex items-center gap-3 pl-2 text-right" showDefaultCheck={false}>
                                            <span className={`inline-flex items-center justify-center w-5 h-5 rounded ${leadStatusConfig[status].color} ml-2`}>
                                              {editLeadStatus === status && (
                                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 20 20">
                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 10l3 3 5-5" />
                                                </svg>
                                              )}
                                            </span>
                                            <span>{status}</span>
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </Label>
                                  <Label className="block"><span className="text-gray-700 text-sm font-medium">{'מקור:'}</span><Input type="text" className="mt-1 h-8 text-sm" value={editLeadSource} onChange={ev => setEditLeadSource(ev.target.value)} /></Label>
                                </div>
                                <div className="border-t pt-3">
                                  <div className="flex justify-between items-center mb-2">
                                    <div className="font-semibold text-sm">{'היסטוריית שיחה:'}</div>
                                    <Button type="button" variant="link" size="sm" onClick={() => setShowConvUpdate(showConvUpdate === lead.id ? null : lead.id)} className="text-blue-600 hover:underline p-0 h-auto">{showConvUpdate === lead.id ? 'הסתר הוספה' : '+ הוסף עדכון'}</Button>
                                  </div>
                                  {showConvUpdate === lead.id && (
                                    <div className="flex gap-2 mb-3">
                                      <Textarea className="text-sm" rows={2} value={newConversationText} onChange={ev => setNewConversationText(ev.target.value)} placeholder="כתוב עדכון שיחה..." />
                                      <Button size="sm" type="button" onClick={() => handleAddConversation(lead.id)} className="shrink-0">{'הוסף'}</Button>
                                    </div>
                                  )}
                                  <ul className="space-y-1.5 max-h-40 overflow-y-auto border rounded p-2 bg-white">
                                    {(lead.conversationSummary || []).length === 0 && <li className="text-xs text-gray-500 text-center py-2">{'אין עדכוני שיחה.'}</li>}
                                    {(lead.conversationSummary || []).map((c, idx) => (
                                      <li key={idx} className="text-xs bg-gray-50 p-1.5 border rounded">
                                        <div className="font-semibold text-gray-700">{formatDateTime(c.timestamp)}</div>
                                        <div className="text-gray-800">{c.text}</div>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                                <div className="border-t pt-3">
                                  <Label className="font-semibold text-sm block mb-1">{'הוסף משימה מהליד (כולל @ מוקצה):'}</Label>
                                  <div className="flex gap-2">
                                    <Input type="text" className="h-8 text-sm" placeholder="תיאור משימה..." value={newTaskText} onChange={ev => setNewTaskText(ev.target.value)} />
                                    <Input type="text" className="h-8 text-sm w-32" placeholder="@מוקצה" value={newTaskAlias} onChange={ev => setNewTaskAlias(ev.target.value)} />
                                    <Button type="button" size="sm" onClick={() => handleCreateTaskFromLead(lead)} className="shrink-0">{'➕ משימה'}</Button>
                                  </div>
                                </div>
                                <div className="flex gap-2 justify-end border-t pt-3 mt-4">
                                  <Button type="submit" size="sm">{'שמור שינויים'}</Button>
                                  <Button type="button" variant="outline" size="sm" onClick={handleCancelEdit}>{'ביטול'}</Button>
                                </div>
                              </form>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            // --- Compact List View ---
            <ul className="space-y-2 h-[calc(100vh-280px)] min-h-[400px] overflow-y-auto pr-1">
              {filteredCandidates.length === 0 && (<li className="text-center text-gray-500 py-6">{'אין לידים להצגה'}</li>)}
              {filteredCandidates.map(lead => {
                const colorTab = leadColorTab(lead.status);
                return (
                  <li key={lead.id} className="p-2 border rounded shadow-sm flex items-center gap-2 bg-white hover:bg-gray-50">
                    <div className={`w-2 h-10 ${colorTab} rounded shrink-0`} />
                    <div className="flex-grow overflow-hidden">
                      <div className="font-bold text-sm truncate">{lead.fullName}</div>
                      <p className="text-xs text-gray-600 truncate">{lead.message}</p>
                      <p className="text-xs text-gray-500 truncate">{lead.status} - {formatDateTime(lead.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button size="icon" variant="ghost" className="w-6 h-6 text-gray-500 hover:text-blue-600" title="פתח לעריכה" onClick={() => handleEditLead(lead)}><span role="img" aria-label="Edit" className="w-3 h-3">✎</span></Button>
                      <Tooltip><TooltipTrigger asChild><a href={`https://wa.me/${lead.phoneNumber}`} target="_blank" rel="noopener noreferrer"><Button size="icon" variant="ghost" className="w-6 h-6 text-green-600 hover:text-green-700"><span role="img" aria-label="WhatsApp">💬</span></Button></a></TooltipTrigger><TooltipContent>{'שלח וואטסאפ'}</TooltipContent></Tooltip>
                      <Button size="icon" variant="ghost" className="w-6 h-6 text-blue-600 hover:text-blue-700" title="התקשר דרך המרכזיה" onClick={() => handleClick2Call(lead.phoneNumber)}><span role="img" aria-label="Call" className="w-3 h-3">📞</span></Button>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="w-6 h-6 text-orange-600 hover:text-orange-700 text-xs"
                            onClick={() => handleIncrementFollowUp(lead.id, lead.followUpCall?.count)}
                            title="הוסף שיחת מעקב"
                          >
                            🔁 {lead.followUpCall?.count || 0}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{'הוסף שיחת מעקב'}</TooltipContent>
                      </Tooltip>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}