import React, { useEffect, useState } from "react";

const SHEET_ID = "1raVDAVFs8UzEEWQE7N0uVLUft3lM9Xq9VFS_FXxWuok";
const API_KEY = "AIzaSyBR53KDvquviY4yq4bqsmHrw8LoH86-wZs";
const RANGE = "גליון1!A1:Z500";

function ResidentsManagement({ residents, statusColorMap = {}, statusKey = 'סטטוס' }) {
  if (!residents || !residents.length) {
    return <div className="text-center text-gray-500 py-6">אין נתונים להצגה</div>;
  }

  // Helper to get color for a status
  const getStatusColor = (status) => statusColorMap[status] || 'bg-gray-300';

  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed text-sm border-collapse">
        <thead className="sticky top-0 bg-gray-100 z-10">
          <tr>
            {/* Add a column for the color tab */}
            <th className="w-2"></th>
            {Object.keys(residents[0]).map((key) => (
              <th key={key} className="px-2 py-2 text-right font-semibold">
                {key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {residents.map((row, idx) => {
            const status = row[statusKey] || '';
            const colorClass = getStatusColor(status);
            return (
              <tr key={idx} className={`border-b hover:bg-gray-50`}>
                {/* Color tab cell */}
                <td className="align-top px-1">
                  <span className={`inline-block w-2 h-6 rounded-full ${colorClass}`}></span>
                </td>
                {Object.values(row).map((cell, i) => (
                  <td key={i} className="px-2 py-2 align-top">
                    {cell}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default ResidentsManagement;