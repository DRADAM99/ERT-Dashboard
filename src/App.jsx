import React from 'react';
import TaskManager from './TaskManager';
import StatusOverview from './StatusOverview';
import EventTimeline from './EventTimeline';
import EmergencyMap from './EmergencyMap';
import ResidentsManagement from '../components/ResidentsManagement';

function getCurrentDateTime() {
  return new Date().toLocaleString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function App() {
  const [dateTime, setDateTime] = React.useState(getCurrentDateTime());
  React.useEffect(() => {
    const interval = setInterval(() => setDateTime(getCurrentDateTime()), 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <div style={{color: 'green', fontSize: 32}}>TOP OF APP.JSX</div>
      <div className="min-h-screen bg-gray-100 font-sans flex flex-col">
        {/* Header - CRM style, with more space for logo */}
        <header className="w-full bg-white shadow-md rounded-b-2xl mb-8 flex flex-col items-center py-6">
          <img
            src="/logo.png"
            alt="Logo"
            className="mx-auto mb-2 h-20 w-auto object-contain"
          />
          <h1 className="text-2xl font-bold mb-1">מערכת חירום - נופי פרת</h1>
          <div className="text-gray-500 text-sm mb-1">{dateTime}</div>
          <button className="text-blue-600 underline text-xs">התנתק</button>
        </header>
        {/* Main Grid - CRM style, Card blocks */}
        <main className="flex-1 w-full max-w-7xl mx-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <div className="col-span-1 flex flex-col">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 flex-1 flex flex-col p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">משימות (קאנבן)</h2>
              <TaskManager />
            </div>
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 flex-1 flex flex-col p-6">
              <h2 className="text-xl font-semibold mb-4">סטטוס כללי</h2>
              <StatusOverview />
            </div>
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 flex-1 flex flex-col p-6 mt-6">
              <div style={{color: 'blue'}}>DEBUG: App.jsx ResidentsManagement block</div>
              <ResidentsManagement />
            </div>
          </div>
          <div className="col-span-1 flex flex-col">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 flex-1 flex flex-col p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">יומן אירועים</h2>
              <EventTimeline />
            </div>
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 flex-1 flex flex-col p-6">
              <h2 className="text-xl font-semibold mb-4">מפה</h2>
              <EmergencyMap />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
