'use client';

export default function SimpleEmergencyLocator() {
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
            src="https://emergency-locator-585a5.web.app/map-osm.html"
            className="w-full h-full border-0"
            title="Emergency Locator Map"
            allow="geolocation"
          />
        </div>
      </div>
    </div>
  );
} 