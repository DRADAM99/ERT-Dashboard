'use client';

import { useEffect } from 'react';

const EMERGENCY_LOCATOR_ORIGIN = 'https://emergency-locator-585a5.web.app';

export default function EmergencyLocatorIntegration() {
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.origin !== EMERGENCY_LOCATOR_ORIGIN) return;
      if (event.data?.type === 'COPY_LOCATION' && event.data?.url) {
        navigator.clipboard.writeText(event.data.url);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div className="space-y-4">
      {/* Emergency Locator Map Display */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="relative" style={{ height: '600px' }}>
          <div className="absolute top-0 left-0 right-0 p-4 bg-white bg-opacity-75 z-10">
            <h3 className="text-lg font-semibold">מפת מיקומי חירום</h3>
            <p className="text-sm text-gray-600">Emergency Location Map</p>
          </div>
          <iframe
            src="https://emergency-locator-585a5.web.app/map.html"
            className="w-full h-full border-0"
            title="Emergency Locator Map"
            allow="geolocation clipboard-write"
          />
        </div>
      </div>
    </div>
  );
} 