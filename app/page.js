"use client";

import React from "react";

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">
          ERT Dashboard
        </h1>
        
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Welcome to the Dashboard</h2>
          <p className="text-gray-600 mb-4">
            This is a minimal test page to verify Vercel deployment is working.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-medium text-blue-900 mb-2">Status</h3>
              <p className="text-blue-700">✅ Page is loading successfully</p>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <h3 className="font-medium text-green-900 mb-2">Deployment</h3>
              <p className="text-green-700">🚀 Vercel build successful</p>
            </div>
          </div>
          
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              If you can see this page, the root route (/) is working correctly.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

  




