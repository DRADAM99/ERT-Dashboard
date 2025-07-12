"use client";

import React, { useState, useRef, useEffect } from 'react';
import { FaWhatsapp } from 'react-icons/fa';

const leadStatusesDefault = [
  { key: 'חדש', label: 'חדש', color: 'bg-red-500' },
  { key: 'בבדיקת לקוח', label: 'בבדיקת לקוח', color: 'bg-orange-500' },
  { key: 'ממתין ליעוץ עם אדם', label: 'ממתין ליעוץ', color: 'bg-purple-500' },
  { key: 'נקבע יעוץ', label: 'נקבע יעוץ', color: 'bg-green-500' },
  { key: 'בסדרת טיפולים', label: 'בסדרת טיפולים', color: 'bg-emerald-400' },
  { key: 'אין מענה', label: 'אין מענה', color: 'bg-yellow-500' },
  { key: 'לא מתאים', label: 'לא מתאים', color: 'bg-gray-400' },
];

const initialLeads = [
  { id: 1, name: 'יוסי כהן', status: 'חדש', phone: '0501234567', source: 'פייסבוק' },
  { id: 2, name: 'שרה לוי', status: 'בבדיקת לקוח', phone: '0527654321', source: 'אתר' },
  { id: 3, name: 'דנה מזרחי', status: 'נקבע יעוץ', phone: '0541122334', source: 'טלפון' },
  { id: 4, name: 'רון בן דוד', status: 'אין מענה', phone: '0509876543', source: 'פייסבוק' },
  { id: 5, name: 'אורית גפן', status: 'בסדרת טיפולים', phone: '0533333333', source: 'אתר' },
  { id: 6, name: 'דוד אברמוב', status: 'חדש', phone: '0502222222', source: 'טלפון' },
  { id: 7, name: 'מיכל ברק', status: 'בבדיקת לקוח', phone: '0521111111', source: 'פייסבוק' },
  { id: 8, name: 'איילת רון', status: 'ממתין ליעוץ עם אדם', phone: '0545555555', source: 'אתר' },
  { id: 9, name: 'גדי לוי', status: 'נקבע יעוץ', phone: '0509999999', source: 'טלפון' },
  { id: 10, name: 'רונית כהן', status: 'אין מענה', phone: '0534444444', source: 'פייסבוק' },
  { id: 11, name: 'שלומי דגן', status: 'לא מתאים', phone: '0528888888', source: 'אתר' },
  { id: 12, name: 'תמר שחר', status: 'חדש', phone: '0507777777', source: 'פייסבוק' },
  { id: 13, name: 'יואב שמואלי', status: 'בבדיקת לקוח', phone: '0526666666', source: 'טלפון' },
  { id: 14, name: 'אורן בן עמי', status: 'בסדרת טיפולים', phone: '0543333333', source: 'אתר' },
  { id: 15, name: 'דנה בר', status: 'ממתין ליעוץ עם אדם', phone: '0505555555', source: 'פייסבוק' },
];

function EditLeadModal({ open, lead, statuses, onClose, onSave }) {
  const [form, setForm] = useState(lead || {});
  const [updateText, setUpdateText] = useState('');
  const [taskText, setTaskText] = useState('');
  const initialRef = useRef();
  React.useEffect(() => { setForm(lead || {}); }, [lead]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <form dir="rtl" className="bg-white rounded shadow-lg p-4 w-full max-w-md" onClick={e => e.stopPropagation()} onSubmit={e => {e.preventDefault();onSave(form);}}>
        <div className="flex justify-between items-center mb-2">
          <div className="font-bold text-lg">עריכת ליד</div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-red-500">✕</button>
        </div>
        <div className="flex gap-2 mb-2">
          <input ref={initialRef} autoFocus className="input w-28 border rounded px-2 py-1 text-sm" placeholder="שם" value={form.name||''} onChange={e=>setForm(f=>({...f,name:e.target.value}))} required />
          <input className="input w-28 border rounded px-2 py-1 text-sm" placeholder="טלפון" value={form.phone||''} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} required />
          <select className="input w-28 border rounded px-2 py-1 text-sm" value={form.status||''} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
            {statuses.map(s=>(<option key={s.key} value={s.key}>{s.label}</option>))}
          </select>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <input className="input w-20 border rounded px-2 py-1 text-sm" placeholder="מקור" value={form.source||''} onChange={e=>setForm(f=>({...f,source:e.target.value}))} />
          <a href={`https://wa.me/${form.phone}`} target="_blank" rel="noopener noreferrer" className="text-green-500 hover:text-green-600"><FaWhatsapp size={20} /></a>
          <a href={`tel:${form.phone}`} className="text-blue-500 hover:text-blue-600"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h0a2.25 2.25 0 002.25-2.25v-2.386a2.25 2.25 0 00-1.687-2.183l-2.262-.566a2.25 2.25 0 00-2.591 1.01l-.422.704a11.048 11.048 0 01-4.943-4.943l.704-.422a2.25 2.25 0 001.01-2.591l-.566-2.262A2.25 2.25 0 008.886 4.5H6.75A2.25 2.25 0 004.5 6.75v0z" /></svg></a>
        </div>
        <textarea className="input w-full border rounded px-2 py-1 text-sm mb-2" placeholder="הערות" value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2} />
        <div className="flex gap-2 mb-2">
          <input className="input flex-1 border rounded px-2 py-1 text-sm" placeholder="הוסף עדכון שיחה..." value={updateText} onChange={e=>setUpdateText(e.target.value)} />
          <button type="button" className="bg-gray-200 rounded px-2 py-1 text-sm" onClick={() => {
            if (updateText) {
              setForm(f => ({
                ...f,
                updates: [...(f.updates || []), { text: updateText, date: new Date().toISOString() }]
              }));
              setUpdateText('');
            }
          }}>הוסף עדכון</button>
        </div>
        <div className="flex gap-2 mb-2">
          <input className="input flex-1 border rounded px-2 py-1 text-sm" placeholder="הוסף משימה חדשה..." value={taskText} onChange={e=>setTaskText(e.target.value)} />
          <button type="button" className="bg-blue-200 rounded px-2 py-1 text-sm" onClick={()=>{if(taskText){/* handle task */ setTaskText('');}}}>הוסף משימה</button>
        </div>
        <div className="flex gap-2 mt-4">
          <button type="submit" className="flex-1 bg-blue-600 text-white rounded py-1">שמור</button>
          <button type="button" className="flex-1 bg-gray-200 rounded py-1" onClick={onClose}>ביטול</button>
        </div>
      </form>
    </div>
  );
}

function KanbanView() {
  const [leads, setLeads] = useState(initialLeads);
  const [collapsed, setCollapsed] = useState({});
  const [draggedLead, setDraggedLead] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState(null);
  const [statuses, setStatuses] = useState(leadStatusesDefault);
  const [draggedStatus, setDraggedStatus] = useState(null);
  const [dragOverStatusCol, setDragOverStatusCol] = useState(null);
  const [editLead, setEditLead] = useState(null);

  // Lead DND
  const handleToggleCollapse = (statusKey) => {
    setCollapsed((prev) => ({ ...prev, [statusKey]: !prev[statusKey] }));
  };
  const handleDragStart = (lead) => {
    setDraggedLead(lead);
  };
  const handleDragEnd = () => {
    setDraggedLead(null);
    setDragOverStatus(null);
  };
  const handleDragOver = (e, statusKey) => {
    e.preventDefault();
    setDragOverStatus(statusKey);
  };
  const handleDrop = (e, statusKey) => {
    e.preventDefault();
    if (draggedLead && draggedLead.status !== statusKey) {
      setLeads((prev) =>
        prev.map((l) =>
          l.id === draggedLead.id ? { ...l, status: statusKey } : l
        )
      );
    }
    setDraggedLead(null);
    setDragOverStatus(null);
  };

  // Column DND
  const handleStatusDragStart = (status) => {
    setDraggedStatus(status.key);
  };
  const handleStatusDragOver = (e, statusKey) => {
    e.preventDefault();
    setDragOverStatusCol(statusKey);
  };
  const handleStatusDrop = (e, statusKey) => {
    e.preventDefault();
    if (draggedStatus && draggedStatus !== statusKey) {
      const fromIdx = statuses.findIndex((s) => s.key === draggedStatus);
      const toIdx = statuses.findIndex((s) => s.key === statusKey);
      if (fromIdx !== -1 && toIdx !== -1) {
        const newStatuses = [...statuses];
        const [removed] = newStatuses.splice(fromIdx, 1);
        newStatuses.splice(toIdx, 0, removed);
        setStatuses(newStatuses);
      }
    }
    setDraggedStatus(null);
    setDragOverStatusCol(null);
  };
  const handleStatusDragEnd = () => {
    setDraggedStatus(null);
    setDragOverStatusCol(null);
  };

  return (
    <div className="p-4 bg-white rounded shadow mb-8" dir="rtl">
      <h2 className="font-bold text-lg mb-2">1. תצוגת קנבן (צינור לידים)</h2>
      <p className="mb-4 text-sm text-gray-600">כל סטטוס הוא עמודה. ניתן למזער/להרחיב עמודות, לגרור לידים בין סטטוסים, ולסדר את סדר הסטטוסים (הדגמה).</p>
      <div className="flex gap-4 overflow-x-auto">
        {statuses.map((status) => (
          <div
            key={status.key}
            className={`min-w-[220px] bg-gray-50 rounded p-2 flex flex-col transition-all duration-200 border ${dragOverStatus === status.key ? 'border-4 border-blue-400' : 'border-transparent'} ${dragOverStatusCol === status.key ? 'ring-4 ring-blue-500' : ''} ${draggedStatus === status.key ? 'opacity-60' : ''}`}
            onDragOver={(e) => { handleDragOver(e, status.key); handleStatusDragOver(e, status.key); }}
            onDrop={(e) => { handleDrop(e, status.key); handleStatusDrop(e, status.key); }}
            onDragLeave={() => { setDragOverStatus(null); setDragOverStatusCol(null); }}
            draggable
            onDragStart={() => handleStatusDragStart(status)}
            onDragEnd={handleStatusDragEnd}
            style={{ cursor: 'grab' }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className={`font-semibold text-center ${status.color} text-white rounded py-1 px-2 flex-1`}>{status.label}</div>
              <button
                className="ml-2 text-xs text-gray-600 hover:text-blue-600 focus:outline-none"
                onClick={(e) => { e.stopPropagation(); handleToggleCollapse(status.key); }}
                title={collapsed[status.key] ? 'הצג עמודה' : 'מזער עמודה'}
              >
                {collapsed[status.key] ? '▶' : '▼'}
              </button>
            </div>
            {!collapsed[status.key] && (
              <>
                {leads.filter((l) => l.status === status.key).map((lead) => (
                  <div
                    key={lead.id}
                    className={`bg-white border rounded p-2 mb-2 shadow-sm cursor-move ${draggedLead && draggedLead.id === lead.id ? 'ring-2 ring-blue-500 opacity-70' : ''}`}
                    draggable
                    onDragStart={() => handleDragStart(lead)}
                    onDragEnd={handleDragEnd}
                    onClick={() => {
                      if (editLead && editLead.id === lead.id) {
                        setLeads(ls => ls.map(l => l.id === lead.id ? { ...l, ...editLead } : l));
                        setEditLead(null);
                      } else {
                        setEditLead(lead);
                      }
                    }}
                  >
                    <div className="font-bold">{lead.name}</div>
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                      <a href={`tel:${lead.phone}`} className="hover:underline text-blue-600">{lead.phone}</a>
                      <a href={`https://wa.me/${lead.phone}`} target="_blank" rel="noopener noreferrer" className="text-green-500 hover:text-green-600"><FaWhatsapp size={14} /></a>
                      <span className="mx-1">|</span>
                      <span>{lead.source}</span>
                    </div>
                  </div>
                ))}
                {leads.filter((l) => l.status === status.key).length === 0 && (
                  <div className="text-xs text-gray-400 text-center py-2">אין לידים בסטטוס זה</div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      <EditLeadModal
        open={!!editLead}
        lead={editLead}
        statuses={statuses}
        onClose={()=>setEditLead(null)}
        onSave={updated=>{
          setLeads(ls=>ls.map(l=>l.id===updated.id?{...l,...updated}:l));
          setEditLead(null);
        }}
      />
    </div>
  );
}

function TimelineView() {
  return (
    <div className="p-4 bg-white rounded shadow mb-8" dir="rtl">
      <h2 className="font-bold text-lg mb-2">2. תצוגת מסע לקוח (טיימליין)</h2>
      <p className="mb-4 text-sm text-gray-600">כל ליד מוצג כנקודה/כרטיס על מסע אופקי. לחיצה על נקודה תציג פרטים (הדגמה בלבד).</p>
      <div className="overflow-x-auto">
        {initialLeads.map(lead => {
          const statusIdx = leadStatusesDefault.findIndex(s => s.key === lead.status);
          return (
            <div key={lead.id} className="mb-6">
              <div className="flex items-center gap-2 mb-1">
                {leadStatusesDefault.map((status, idx) => (
                  <React.Fragment key={status.key}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${idx <= statusIdx ? status.color : 'bg-gray-200'} text-white`} title={status.label}>
                      {idx === statusIdx ? <span>👤</span> : ''}
                    </div>
                    {idx < leadStatusesDefault.length - 1 && <div className={`h-1 w-8 ${idx < statusIdx ? status.color : 'bg-gray-200'}`}></div>}
                  </React.Fragment>
                ))}
                <span className="mr-2 font-bold">{lead.name}</span>
              </div>
              <div className="text-xs text-gray-500 mr-10">סטטוס: {lead.status} | {lead.phone} | {lead.source}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FunnelView() {
  return (
    <div className="p-4 bg-white rounded shadow mb-8" dir="rtl">
      <h2 className="font-bold text-lg mb-2">3. תצוגת משפך</h2>
      <p className="mb-4 text-sm text-gray-600">משפך אנכי המציג כמה לידים יש בכל שלב. לחיצה על שלב תאפשר מיקוד (הדגמה בלבד).</p>
      <div className="flex flex-col items-center gap-2">
        {leadStatusesDefault.map((status, idx) => {
          const count = initialLeads.filter(l => l.status === status.key).length;
          return (
            <div key={status.key} className={`w-[${180 + idx*30}px] transition-all flex items-center justify-between px-4 py-2 rounded ${status.color} text-white font-semibold shadow`}>
              <span>{status.label}</span>
              <span>{count} לידים</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Section 4: Semi-functional demo of the original Leads Manager
function LeadsManagerDemo() {
  // Mock data and localStorage persistence
  const defaultLeads = [
    { id: 1, fullName: 'יוסי כהן', phoneNumber: '0501234567', message: 'פולו-אפ על פגישה', status: 'חדש', source: 'פייסבוק', createdAt: new Date(), conversationSummary: [], expanded: false },
    { id: 2, fullName: 'שרה לוי', phoneNumber: '0527654321', message: 'בירור מצב', status: 'בבדיקת לקוח', source: 'אתר', createdAt: new Date(), conversationSummary: [], expanded: false },
    { id: 3, fullName: 'דנה מזרחי', phoneNumber: '0541122334', message: 'נקבעה פגישה', status: 'נקבע יעוץ', source: 'טלפון', createdAt: new Date(), conversationSummary: [], expanded: false },
  ];
  const [leads, setLeads] = useState(() => {
    const saved = localStorage.getItem('leads-demo');
    if (saved) try { return JSON.parse(saved).map(l => ({...l, createdAt: new Date(l.createdAt)})); } catch {}
    return defaultLeads;
  });
  useEffect(() => { localStorage.setItem('leads-demo', JSON.stringify(leads)); }, [leads]);
  const [editingId, setEditingId] = useState(null);
  const [edit, setEdit] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [add, setAdd] = useState({ fullName: '', phoneNumber: '', message: '', status: 'חדש', source: '' });
  const statuses = ['חדש','בבדיקת לקוח','ממתין ליעוץ עם אדם','נקבע יעוץ','בסדרת טיפולים','אין מענה','לא מתאים'];
  // Edit modal logic
  const openEdit = lead => { setEditingId(lead.id); setEdit({ ...lead }); };
  const saveEdit = () => { setLeads(ls => ls.map(l => l.id === editingId ? { ...edit } : l)); setEditingId(null); };
  // Add modal logic
  const saveAdd = () => { setLeads(ls => [{ ...add, id: Date.now(), createdAt: new Date(), conversationSummary: [], expanded: false }, ...ls]); setShowAdd(false); setAdd({ fullName: '', phoneNumber: '', message: '', status: 'חדש', source: '' }); };
  // UI
  return (
    <div className="p-4 bg-white rounded shadow mb-8" dir="rtl">
      <h2 className="font-bold text-lg mb-2">4. מנהל לידים מקורי (דמו)</h2>
      <p className="mb-4 text-sm text-gray-600">דמו חצי-פונקציונלי של מנהל הלידים המקורי.    .</p>
      <div className="flex justify-end mb-2"><button className="bg-blue-500 text-white rounded px-3 py-1 text-sm" onClick={()=>setShowAdd(true)}>+ הוסף ליד</button></div>
      <div className="overflow-auto max-h-[400px]">
        <table className="w-full table-fixed text-sm border-collapse">
          <thead className="sticky top-0 bg-gray-100 z-10">
            <tr>
              <th className="px-2 py-2 text-right font-semibold w-40">שם מלא</th>
              <th className="px-2 py-2 text-right font-semibold w-32">טלפון</th>
              <th className="px-2 py-2 text-right font-semibold">הודעה</th>
              <th className="px-2 py-2 text-right font-semibold w-36">סטטוס</th>
              <th className="px-2 py-2 text-right font-semibold w-28">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {leads.map(lead => (
              <tr key={lead.id} className="border-b hover:bg-gray-50">
                <td className="px-2 py-2 align-top font-medium">{lead.fullName}</td>
                <td className="px-2 py-2 align-top whitespace-nowrap">{lead.phoneNumber}</td>
                <td className="px-2 py-2 align-top truncate" title={lead.message}>{lead.message}</td>
                <td className="px-2 py-2 align-top">{lead.status}</td>
                <td className="px-2 py-2 align-top">
                  <div className="flex items-center gap-1">
                    <button className="text-blue-600 hover:underline text-xs" onClick={()=>openEdit(lead)}>ערוך</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Edit Modal */}
      {editingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={()=>setEditingId(null)}>
          <form className="bg-white rounded shadow-lg p-4 w-full max-w-md" onClick={e=>e.stopPropagation()} onSubmit={e=>{e.preventDefault();saveEdit();}}>
            <div className="flex justify-between items-center mb-2">
              <div className="font-bold text-lg">עריכת ליד</div>
              <button type="button" onClick={()=>setEditingId(null)} className="text-gray-400 hover:text-red-500">✕</button>
            </div>
            <div className="flex gap-2 mb-2">
              <input className="input flex-1 border rounded px-2 py-1 text-sm" placeholder="שם" value={edit.fullName||''} onChange={e=>setEdit(f=>({...f,fullName:e.target.value}))} required />
              <input className="input w-32 border rounded px-2 py-1 text-sm" placeholder="טלפון" value={edit.phoneNumber||''} onChange={e=>setEdit(f=>({...f,phoneNumber:e.target.value}))} required />
              <select className="input w-32 border rounded px-2 py-1 text-sm" value={edit.status||''} onChange={e=>setEdit(f=>({...f,status:e.target.value}))}>
                {statuses.map(s=>(<option key={s} value={s}>{s}</option>))}
              </select>
            </div>
            <input className="input w-full border rounded px-2 py-1 text-sm mb-2" placeholder="מקור" value={edit.source||''} onChange={e=>setEdit(f=>({...f,source:e.target.value}))} />
            <textarea className="input w-full border rounded px-2 py-1 text-sm mb-2" placeholder="הערות" value={edit.message||''} onChange={e=>setEdit(f=>({...f,message:e.target.value}))} rows={2} />
            <div className="flex gap-2 mt-4">
              <button type="submit" className="flex-1 bg-blue-600 text-white rounded py-1">שמור</button>
              <button type="button" className="flex-1 bg-gray-200 rounded py-1" onClick={()=>setEditingId(null)}>ביטול</button>
            </div>
          </form>
        </div>
      )}
      {/* Add Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={()=>setShowAdd(false)}>
          <form className="bg-white rounded shadow-lg p-4 w-full max-w-md" onClick={e=>e.stopPropagation()} onSubmit={e=>{e.preventDefault();saveAdd();}}>
            <div className="flex justify-between items-center mb-2">
              <div className="font-bold text-lg">הוסף ליד</div>
              <button type="button" onClick={()=>setShowAdd(false)} className="text-gray-400 hover:text-red-500">✕</button>
            </div>
            <div className="flex gap-2 mb-2">
              <input className="input flex-1 border rounded px-2 py-1 text-sm" placeholder="שם" value={add.fullName||''} onChange={e=>setAdd(f=>({...f,fullName:e.target.value}))} required />
              <input className="input w-32 border rounded px-2 py-1 text-sm" placeholder="טלפון" value={add.phoneNumber||''} onChange={e=>setAdd(f=>({...f,phoneNumber:e.target.value}))} required />
              <select className="input w-32 border rounded px-2 py-1 text-sm" value={add.status||''} onChange={e=>setAdd(f=>({...f,status:e.target.value}))}>
                {statuses.map(s=>(<option key={s} value={s}>{s}</option>))}
              </select>
            </div>
            <input className="input w-full border rounded px-2 py-1 text-sm mb-2" placeholder="מקור" value={add.source||''} onChange={e=>setAdd(f=>({...f,source:e.target.value}))} />
            <textarea className="input w-full border rounded px-2 py-1 text-sm mb-2" placeholder="הערות" value={add.message||''} onChange={e=>setAdd(f=>({...f,message:e.target.value}))} rows={2} />
            <div className="flex gap-2 mt-4">
              <button type="submit" className="flex-1 bg-blue-600 text-white rounded py-1">הוסף</button>
              <button type="button" className="flex-1 bg-gray-200 rounded py-1" onClick={()=>setShowAdd(false)}>ביטול</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default function NewLeadsManager() {
  return (
    <div className="max-w-5xl mx-auto my-8" dir="rtl">
      <KanbanView />
      <TimelineView />
      <FunnelView />
      <LeadsManagerDemo />
    </div>
  );
} 