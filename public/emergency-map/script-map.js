// Firebase config — same emergency-locator RTDB so share-location pins still appear
const firebaseConfig = {
  apiKey: "AIzaSyANnCy_sWB1j8tNsqQFz-VXtY_8ejfWlI8",
  authDomain: "emergency-locator-585a5.firebaseapp.com",
  databaseURL: "https://emergency-locator-585a5-default-rtdb.firebaseio.com",
  projectId: "emergency-locator-585a5",
  storageBucket: "emergency-locator-585a5.firebasestorage.app",
  messagingSenderId: "1044762436700",
  appId: "1:1044762436700:web:c659c52661785f4c27b299"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

window.__emergencyLocatorCopy = function (url) {
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'COPY_LOCATION', url }, '*');
  } else {
    navigator.clipboard.writeText(url);
    alert('הקישור הועתק');
  }
};

window.__emergencyLocatorWhatsApp = function (url) {
  const text = encodeURIComponent(`מיקום חירום: ${url}`);
  window.open(`https://wa.me/?text=${text}`, '_blank');
};

let map;
let markers = [];
let addPinListener = null;

function parseMapParams() {
  const params = new URLSearchParams(window.location.search);
  const lat = Number(params.get('lat'));
  const lng = Number(params.get('lng'));
  const zoom = Number(params.get('zoom'));
  const mapTypeRaw = (params.get('mapType') || 'roadmap').toUpperCase();
  const allowedTypes = ['ROADMAP', 'SATELLITE', 'HYBRID', 'TERRAIN'];
  return {
    lat: Number.isFinite(lat) ? lat : 32.0853,
    lng: Number.isFinite(lng) ? lng : 34.7818,
    zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : 12,
    mapTypeId: allowedTypes.includes(mapTypeRaw) ? mapTypeRaw.toLowerCase() : 'roadmap',
  };
}

function clearMarkers() {
  markers.forEach(m => m.setMap(null));
  markers = [];
}

function addMarker(lat, lng, name) {
  const marker = new google.maps.Marker({
    position: { lat, lng },
    map,
    title: name,
    icon: {
      url: "https://maps.google.com/mapfiles/ms/icons/red-dot.png"
    }
  });

  const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;

  const contentString = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <span style="font-size: 1em; font-weight: bold;">${name}</span>
      <button onclick="window.__emergencyLocatorCopy('${mapsUrl.replace(/'/g, "\\'")}')" style="background: none; border: none; cursor: pointer; padding: 0; line-height: 0;" title="העתק קישור">
        <img src="https://icongr.am/clarity/copy.svg?size=20&color=currentColor" alt="Copy Link" width="20" height="20">
      </button>
      <button onclick="window.__emergencyLocatorWhatsApp('${mapsUrl.replace(/'/g, "\\'")}')" style="background: none; border: none; cursor: pointer; padding: 0; line-height: 0;" title="שלח בוואטסאפ">
        <img src="https://icongr.am/fontawesome/whatsapp.svg?size=20&color=25D366" alt="WhatsApp" width="20" height="20">
      </button>
    </div>
  `;

  const infowindow = new google.maps.InfoWindow({
    content: contentString,
  });

  marker.addListener("click", () => {
    infowindow.open({
      anchor: marker,
      map,
      shouldFocus: false,
    });
  });

  markers.push(marker);
}

function showLocations(snapshot) {
  clearMarkers();
  const now = Date.now();
  const SIXTY_MIN = 60 * 60 * 1000;
  snapshot.forEach(child => {
    const data = child.val();
    if (data.lat && data.lng && data.name && data.timestamp && (now - data.timestamp < SIXTY_MIN)) {
      addMarker(data.lat, data.lng, data.name);
    }
  });
}

const BASEMAP_OPTIONS = [
  { id: 'roadmap', label: 'מפה' },
  { id: 'satellite', label: 'לווין' },
  { id: 'hybrid', label: 'היברידי' },
  { id: 'terrain', label: 'טופוגרפיה' },
];

function createBasemapControl(map, initialTypeId) {
  const controlDiv = document.createElement('div');
  controlDiv.className = 'basemap-control';
  controlDiv.setAttribute('role', 'group');
  controlDiv.setAttribute('aria-label', 'סוג מפה');

  const buttons = BASEMAP_OPTIONS.map((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = option.label;
    button.dataset.mapType = option.id;
    button.setAttribute('aria-pressed', option.id === initialTypeId ? 'true' : 'false');
    if (option.id === initialTypeId) button.classList.add('active');
    button.addEventListener('click', () => {
      map.setMapTypeId(option.id);
      buttons.forEach((btn) => {
        const active = btn.dataset.mapType === option.id;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    });
    controlDiv.appendChild(button);
    return button;
  });

  map.addListener('maptypeid_changed', () => {
    const current = String(map.getMapTypeId() || '').toLowerCase();
    buttons.forEach((btn) => {
      const active = btn.dataset.mapType === current;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  });

  return controlDiv;
}

function createDropPinControl(map) {
  const controlDiv = document.createElement('div');
  controlDiv.style.margin = '10px';
  controlDiv.style.cursor = 'pointer';

  const controlUI = document.createElement('div');
  controlUI.style.backgroundColor = '#fff';
  controlUI.style.border = '2px solid #fff';
  controlUI.style.borderRadius = '3px';
  controlUI.style.boxShadow = '0 2px 6px rgba(0,0,0,.3)';
  controlUI.style.textAlign = 'center';
  controlUI.style.padding = '8px';
  controlDiv.appendChild(controlUI);

  const controlText = document.createElement('div');
  controlText.style.color = 'rgb(25,25,25)';
  controlText.style.fontFamily = 'Roboto,Arial,sans-serif';
  controlText.style.fontSize = '16px';
  controlText.innerHTML = 'הוסף סימון';
  controlUI.appendChild(controlText);

  controlUI.addEventListener('click', () => {
    if (addPinListener) {
        disableAddPinMode(map, controlUI, controlText);
    } else {
        enableAddPinMode(map, controlUI, controlText);
    }
  });

  return controlDiv;
}

function enableAddPinMode(map, controlUI, controlText) {
  if (addPinListener) return;

  map.setOptions({ draggableCursor: 'crosshair' });
  controlUI.style.backgroundColor = '#e6e6e6';
  controlText.innerHTML = 'לחץ על המפה...';

  addPinListener = map.addListener('click', (e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    
    // Slight delay to ensure UI updates before prompt
    setTimeout(() => {
        const name = prompt('הכנס שם לסימון:', '');
        if (name) {
            const timestamp = Date.now();
            db.ref('locations').push({ name, lat, lng, timestamp })
              .then(() => alert('המיקום נשמר בהצלחה'))
              .catch(err => console.error(err));
        }
        disableAddPinMode(map, controlUI, controlText);
    }, 10);
  });
}

function disableAddPinMode(map, controlUI, controlText) {
  if (addPinListener) {
    google.maps.event.removeListener(addPinListener);
    addPinListener = null;
  }
  map.setOptions({ draggableCursor: null });
  controlUI.style.backgroundColor = '#fff';
  controlText.innerHTML = 'הוסף סימון';
}

function initMap() {
  const { lat, lng, zoom, mapTypeId } = parseMapParams();

  map = new google.maps.Map(document.getElementById('map'), {
    center: { lat, lng },
    zoom,
    mapTypeId,
    // Custom Hebrew basemap bar below — default Google control hides Hybrid/Terrain.
    mapTypeControl: false,
  });

  const basemapControlDiv = createBasemapControl(map, mapTypeId);
  map.controls[google.maps.ControlPosition.TOP_LEFT].push(basemapControlDiv);

  const dropPinControlDiv = createDropPinControl(map);
  map.controls[google.maps.ControlPosition.TOP_CENTER].push(dropPinControlDiv);

  db.ref('locations').on('value', showLocations);
}

window.initMap = initMap;

document.addEventListener('DOMContentLoaded', () => {
  if (typeof google !== 'undefined' && google.maps) {
    initMap();
  } else {
    // Google Maps API will call window.initMap
  }
});
