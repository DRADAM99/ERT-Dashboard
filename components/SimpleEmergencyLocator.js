'use client';

import { useEffect, useMemo } from 'react';
import { useData } from '@/app/context/DataContext';
import { buildEmergencyMapSrc } from '@/lib/mapConfig';

export default function SimpleEmergencyLocator() {
  const { mapConfig } = useData();
  const mapSrc = useMemo(() => buildEmergencyMapSrc(mapConfig), [mapConfig]);

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) return;
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
        <div className="p-4 border-b">
          <h3 className="text-lg font-semibold">מפת מיקומי חירום</h3>
          <p className="text-sm text-gray-600">Emergency Location Map</p>
        </div>
        <div className="relative" style={{ height: '600px' }}>
          <iframe
            src={mapSrc}
            className="w-full h-full border-0"
            title="Emergency Locator Map"
            allow="geolocation clipboard-write"
          />
        </div>
      </div>
    </div>
  );
}
