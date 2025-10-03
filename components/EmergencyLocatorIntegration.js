'use client';

export default function EmergencyLocatorIntegration() {
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