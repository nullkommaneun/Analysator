// V9: Globaler Graph mit "intelligentem Filter" (Top "N" redseeligste Geräte)

// V5: Globaler State
let currentLogData = null;
// V9: Globaler State für die sortierte Statistik-Liste (Regel 2)
let currentStats = []; 

// V5: localStorage-Key
const MAPPING_STORAGE_KEY = 'beaconbay-mapping';

// V8: Farbpalette (erweitert auf 10)
const V9_GRAPH_COLORS = [
    'var(--color-1)', 'var(--color-2)', 'var(--color-3)', 
    'var(--color-4)', 'var(--color-5)', 'var(--color-6)',
    'var(--color-7)', 'var(--color-8)', 'var(--color-9)', 'var(--color-10)'
];


// --- V5/V6 Mapping-Funktionen (angepasst für V9) ---

function loadMapping() {
    try {
        const mappingJson = localStorage.getItem(MAPPING_STORAGE_KEY);
        if (mappingJson) return JSON.parse(mappingJson);
    } catch (error) {
        console.error("Fehler beim Parsen des Mappings aus localStorage:", error);
        localStorage.removeItem(MAPPING_STORAGE_KEY);
    }
    return {};
}

/**
 * V9: saveMapping aktualisiert nur noch die Karten, nicht mehr die V8/V9-Controls.
 */
function saveMapping(resultsContainer, outputElement, headerElement) {
    const newMapping = {};
    const inputs = resultsContainer.querySelectorAll('.mapping-input');
    let savedCount = 0;
    
    for (const input of inputs) {
        const beaconId = input.dataset.beaconId;
        const mappedName = input.value.trim();
        if (beaconId && mappedName) {
            newMapping[beaconId] = mappedName;
            savedCount++;
        }
    }

    try {
        localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(newMapping));
        const logMsg = `[${new Date().toLocaleTimeString()}] Mapping erfolgreich gespeichert. ${savedCount} Einträge gesichert.`;
        outputElement.textContent += `\n${logMsg}`;
        outputElement.scrollTop = outputElement.scrollHeight;

        // V9-FIX: Aktualisiere nur die Karten-Ansicht (für die grünen Haken)
        // und die V9-Controls (falls Namen sich geändert haben).
        if (currentLogData && currentLogData.devices) {
             // WICHTIG: Wir müssen die 'activeCardId' finden, damit die
             // Details nach dem Speichern offen bleiben (Regel 2).
             const activeCard = resultsContainer.querySelector('.device-card.details-active');
             const activeId = activeCard ? activeCard.dataset.deviceId : null;
             
             // Führe analyzeAndDisplay neu aus
             analyzeAndDisplay(currentLogData.devices, resultsContainer, headerElement, document.getElementById('v9-graph-container'), activeId);
        }
    } catch (error) {
        const logMsg = `[FEHLER] Mapping konnte nicht gespeichert werden: ${error.message}`;
        outputElement.textContent += `\n${logMsg}`;
    }
}

/**
 * V9: clearMapping aktualisiert Karten und V9-Bereich.
 */
function clearMapping(resultsContainer, outputElement, headerElement, v9ControlsElement, v9GraphContainer) {
    try {
        localStorage.removeItem(MAPPING_STORAGE_KEY);
        const logMsg = `[${new Date().toLocaleTimeString()}] Mapping gelöscht.`;
        outputElement.textContent += `\n${logMsg}`;

        if (currentLogData && currentLogData.devices) {
            // V9-FIX: Ansicht aktualisieren
            analyzeAndDisplay(currentLogData.devices, resultsContainer, headerElement, v9ControlsElement, null);
        } else {
            resultsContainer.innerHTML = '<p>Mapping gelöscht. Lade eine Datei.</p>';
            headerElement.innerHTML = '';
        }
        // V9: Auch V9-Bereich zurücksetzen
        v9ControlsElement.innerHTML = '<p><i>Lade eine Datei, um Geräte zu mappen.</i></p>';
        v9GraphContainer.innerHTML = '';

    } catch (error) {
        const logMsg = `[FEHLER] Mapping konnte nicht gelöscht werden: ${error.message}`;
        outputElement.textContent += `\n${logMsg}`;
    }
}

// --- V7: Detail-Funktionen (Sparkline & Adverts) ---
// (Unverändert von V7)
function formatAdvertisements(adverts) {
    if (!adverts || adverts.length === 0) {
        return '<pre class="advert-list">Keine Advertisement-Daten verfügbar.</pre>';
    }
    try {
        const formatted = JSON.stringify(adverts, null, 2);
        return `<pre class="advert-list">${escapeHTML(formatted)}</pre>`;
    } catch (e) {
        return `<pre class="advert-list error-message">Fehler beim Formatieren der Adverts.</pre>`;
    }
}

function generateSparkline(rssiHistory) {
    if (!rssiHistory || rssiHistory.length < 2) {
        return `<p>Nicht genügend Daten für RSSI-Graph (min. 2 Punkte benötigt).</p>`;
    }
    const width = 300, height = 100, padding = 20;
    const viewWidth = width + padding * 2, viewHeight = height + padding * 2;
    let minRssi = -40, maxRssi = -100, minTime = Infinity, maxTime = -Infinity;
    const dataPoints = rssiHistory.map(event => {
        const time = new Date(event.t).getTime(); const rssi = event.r;
        if (time < minTime) minTime = time; if (time > maxTime) maxTime = time;
        if (rssi > minRssi) minRssi = rssi; if (rssi < maxRssi) maxRssi = rssi;
        return { time, rssi };
    });
    minRssi = Math.min(-35, minRssi + 5); 
    maxRssi = Math.max(-105, maxRssi - 5);
    const timeRange = (maxTime - minTime) || 1; 
    const rssiRange = (maxRssi - minRssi) || 1;
    const scaleX = (time) => padding + ((time - minTime) / timeRange) * width;
    const scaleY = (rssi) => padding + ((maxRssi - rssi) / rssiRange) * height;
    let pathData = "M" + scaleX(dataPoints[0].time) + " " + scaleY(dataPoints[0].rssi);
    for (let i = 1; i < dataPoints.length; i++) {
        pathData += ` L${scaleX(dataPoints[i].time)} ${scaleY(dataPoints[i].rssi)}`;
    }
    const startTime = new Date(minTime).toLocaleTimeString();
    const endTime = new Date(maxTime).toLocaleTimeString();
    return `
        <svg class="rssi-sparkline" viewBox="0 0 ${viewWidth} ${viewHeight}" preserveAspectRatio="xMidYMid meet">
            <text class="spark-text" x="5" y="${padding + 5}" alignment-baseline="hanging">${minRssi} dBm</text>
            <text class="spark-text" x="5" y="${padding + height}" alignment-baseline="baseline">${maxRssi} dBm</text>
            <line class="spark-axis" x1="${padding}" y1="${padding}" x2="${padding}" y2="${padding + height}" />
            <text class="spark-text" x="${padding}" y="${viewHeight - 5}" text-anchor="start">${startTime}</text>
            <text class="spark-text" x="${padding + width}" y="${viewHeight - 5}" text-anchor="end">${endTime}</text>
            <line class="spark-axis" x1="${padding}" y1="${padding + height}" x2="${padding + width}" y2="${padding + height}" />
            <path class="spark-line" d="${pathData}" />
        </svg>
    `;
}

// --- V8/V9: Globale Graph-Funktion ---
/**
 * V9: Generiert den globalen Zeitstrahl-Graphen (logisch fast identisch zu V8)
 */
function generateTimelineGraph(devicesToGraph, globalScanInfo) {
    if (!devicesToGraph || devicesToGraph.length === 0) {
        return `<p class="error-message">Keine Geräte zum Zeichnen ausgewählt.</p>`;
    }

    const width = 800, height = 400, padding = 50, legendWidth = 200;
    const viewWidth = width + padding * 2 + legendWidth;
    const viewHeight = height + padding * 2;

    let globalMinRssi = -40, globalMaxRssi = -100;
    const globalMinTime = new Date(globalScanInfo.scanStarted).getTime();
    const globalMaxTime = new Date(globalScanInfo.scanEnded).getTime();
    
    for (const device of devicesToGraph) {
        for (const event of device.history) {
            const rssi = event.r;
            if (rssi > globalMinRssi) globalMinRssi = rssi;
            if (rssi < globalMaxRssi) globalMaxRssi = rssi;
        }
    }
    
    globalMinRssi = Math.min(-30, globalMinRssi + 10);
    globalMaxRssi = Math.max(-110, globalMaxRssi - 10);

    const timeRange = (globalMaxTime - globalMinTime) || 1;
    const rssiRange = (globalMaxRssi - globalMinRssi) || 1;

    const scaleX = (time) => padding + ((time - globalMinTime) / timeRange) * width;
    const scaleY = (rssi) => padding + ((globalMaxRssi - rssi) / rssiRange) * height;

    let paths = '';
    let legend = '<g class="timeline-legend">';
    
    devicesToGraph.forEach((device, index) => {
        const { name, color, history } = device;
        if (history.length < 2) return; 

        const sortedHistory = history.map(e => ({ time: new Date(e.t).getTime(), rssi: e.r }))
                                     .sort((a, b) => a.time - b.time);

        let pathData = "M" + scaleX(sortedHistory[0].time) + " " + scaleY(sortedHistory[0].rssi);
        for (let i = 1; i < sortedHistory.length; i++) {
            pathData += ` L${scaleX(sortedHistory[i].time)} ${scaleY(sortedHistory[i].rssi)}`;
        }

        paths += `<path d="${pathData}" stroke="${color}" class="timeline-line" />`;
        
        // Legende (V9-FIX: Kurzer Name, damit es passt)
        const shortName = (name.length > 20) ? name.substring(0, 18) + '...' : name;
        const legendY = padding + index * 20;
        legend += `<rect x="${width + padding + 15}" y="${legendY}" width="15" height="10" fill="${color}" />`;
        legend += `<text x="${width + padding + 35}" y="${legendY + 9}" class="timeline-text">${escapeHTML(shortName)}</text>`;
    });
    legend += '</g>';

    const startTime = new Date(globalMinTime).toLocaleTimeString();
    const endTime = new Date(globalMaxTime).toLocaleTimeString();
    let axes = `
        <text class="timeline-text" x="${padding - 10}" y="${padding + 5}" text-anchor="end">${globalMinRssi} dBm</text>
        <text class="timeline-text" x="${padding - 10}" y="${padding + height}" text-anchor="end">${globalMaxRssi} dBm</text>
        <line class="timeline-axis solid" x1="${padding}" y1="${padding}" x2="${padding}" y2="${padding + height}" />
        <line class="timeline-axis" x1="${padding}" y1="${scaleY(-70)}" x2="${padding + width}" y2="${scaleY(-70)}" />
        <text class="timeline-text" x="${padding - 10}" y="${scaleY(-70) + 3}" text-anchor="end">-70</text>
        <line class="timeline-axis" x1="${padding}" y1="${scaleY(-85)}" x2="${padding + width}" y2="${scaleY(-85)}" />
        <text class="timeline-text" x="${padding - 10}" y="${scaleY(-85) + 3}" text-anchor="end">-85</text>
        <text class="timeline-text" x="${padding}" y="${viewHeight - 15}" text-anchor="start">${startTime}</text>
        <text class="timeline-text" x="${padding + width}" y="${viewHeight - 15}" text-anchor="end">${endTime}</text>
        <line class="timeline-axis solid" x1="${padding}" y1="${padding + height}" x2="${padding + width}" y2="${padding + height}" />
    `;

    return `
        <svg class="timeline-graph" viewBox="0 0 ${viewWidth} ${viewHeight}" preserveAspectRatio="xMidYMid meet">
            ${axes}
            ${paths}
            ${legend}
        </svg>
    `;
}


// --- V7/V9: Detail- und Analysefunktionen ---

/**
 * V9: Haupt-Analysefunktion (V8-Controls-Parameter entfernt)
 */
function analyzeAndDisplay(devicesArray, resultsContainer, headerElement, v9ControlsElement, activeCardId = null) {
    // V9-ARCHITEKTUR-HINWEIS:
    // Wir leeren 'currentStats' und befüllen es neu.
    // 'currentStats' wird vom V9-Graph-Button verwendet (Regel 1).
    currentStats = []; 
    
    if (!Array.isArray(devicesArray) || devicesArray.length === 0) {
        resultsContainer.innerHTML = '<p>Logdatei enthält 0 Geräte.</p>';
        headerElement.innerHTML = '';
        v9ControlsElement.innerHTML = '<p><i>Lade eine Datei...</i></p>';
        return;
    }

    const mapping = loadMapping();
    const stats = [];

    for (const device of devicesArray) {
        if (!device || !device.id || !Array.isArray(device.rssiHistory)) continue;
        const rssiEvents = device.rssiHistory;
        const count = rssiEvents.length;
        let rssiSum = 0, maxRssi = -Infinity;
        if (count > 0) {
            for (const event of rssiEvents) {
                if (typeof event.r === 'number') {
                    rssiSum += event.r;
                    if (event.r > maxRssi) maxRssi = event.r;
                }
            }
        } else { maxRssi = null; }
        const avgRssi = (count > 0) ? (rssiSum / count).toFixed(2) : null;
        stats.push({ id: device.id, name: device.name || "[Unbenannt]", count, avgRssi, maxRssi });
    }

    // V6: Sortieren nach "Redseeligkeit"
    stats.sort((a, b) => b.count - a.count);
    
    // V9: Globale Statistik-Liste für V9-Graphen füllen
    currentStats = stats; 

    // V7: Header-Text
    headerElement.innerHTML = `<p>Analyse von <strong>${devicesArray.length}</strong> Geräten. (Sortiert nach "Redseeligkeit". Klicken für Details.)</p>`;
    
    let htmlOutput = "";

    for (const device of stats) {
        // V7: Logik für Karten-Rendering (unverändert)
        const mappedName = mapping[device.id] || '';
        const displayName = mappedName ? mappedName : device.name;
        const isMappedClass = mappedName ? 'is-mapped' : '';
        const isActive = (device.id === activeCardId);
        const activeClass = isActive ? 'active' : '';
        const cardActiveClass = isActive ? 'details-active' : '';
        htmlOutput += `
            <div class="device-card ${cardActiveClass}" data-device-id="${device.id}">
                <div class="card-clickable-area" role="button" tabindex="0" aria-expanded="${isActive}">
                    <div class="card-row">
                        <span class="card-label">Device ID:</span>
                        <span class="card-value mono">${device.id}</span>
                    </div>
                    <div class="card-row">
                        <span class="card-label">Bek. Name:</span>
                        <span class="card-value name ${isMappedClass}">${escapeHTML(displayName)}</span>
                    </div>
                    <div class="card-row">
                        <span class="card-label">Scan-Events:</span>
                        <span class="card-value mono">${device.count}</span>
                    </div>
                    <div class="card-row">
                        <span class="card-label">Avg. RSSI:</span>
                        <span class="card-value mono">${device.avgRssi ?? 'N/A'} dBm</span>
                    </div>
                    <div class="card-row">
                        <span class="card-label">Max. RSSI:</span>
                        <span class="card-value mono rssi-max">${device.maxRssi ?? 'N/A'} dBm</span>
                    </div>
                </div>
                <div class="card-row mapping-row">
                    <label for="map-${device.id}" class="card-label">Mapping (Ort):</label>
                    <input type="text" id="map-${device.id}" class="mapping-input"
                           data-beacon-id="${device.id}" value="${escapeHTML(mappedName)}"
                           placeholder="z.B. FTS Ladestation 1">
                </div>
                <div class="card-details ${activeClass}" id="details-${device.id}" data-is-loaded="${isActive}">
                    ${isActive ? loadCardDetails(device.id) : '<!-- Details werden bei Klick geladen -->'}
                </div>
            </div>
        `;
    }
    resultsContainer.innerHTML = htmlOutput;
    
    // V9: V8-Controls (populateV8Controls) wird nicht mehr benötigt.
    // Der Button liest 'currentStats' direkt.
}

/**
 * V7: Lädt den Inhalt für eine Detail-Karte (Adverts + Graph).
 */
function loadCardDetails(deviceId) {
    if (!currentLogData || !currentLogData.devices) return '<p class="error-message">Fehler: Log-Daten nicht gefunden.</p>';
    const device = currentLogData.devices.find(d => d.id === deviceId);
    if (!device) return `<p class="error-message">Fehler: Gerät mit ID ${deviceId} nicht gefunden.</p>`;
    const advertsHtml = formatAdvertisements(device.uniqueAdvertisements);
    const graphHtml = generateSparkline(device.rssiHistory);
    return `
        <h4>1. Unique Advertisements</h4>
        ${advertsHtml}
        <h4>2. RSSI-Verlauf (Signal über Zeit)</h4>
        ${graphHtml}
    `;
}

/**
 * V4/V6: HTML-Escaping-Funktion
 */
function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[m]);
}

// --- V1-V9: Haupt-Event-Listener ---
document.addEventListener('DOMContentLoaded', () => {
    
    // V9: Alle UI-Elemente holen
    const fileInput = document.getElementById('jsonUpload');
    const outputElement = document.getElementById('output');
    const resultsElement = document.getElementById('analysis-results');
    const headerElement = document.getElementById('analysis-header');
    const saveButton = document.getElementById('saveMappingBtn');
    const clearButton = document.getElementById('clearMappingBtn');
    
    // V9-Elemente (ersetzen V8)
    const v9ControlsElement = document.getElementById('v9-controls-simple');
    const v9GenerateBtn = document.getElementById('v9-generateBtn');
    const v9GraphContainer = document.getElementById('v9-graph-container');
    const v9TopNSelect = document.getElementById('v9-top-n-select');

    if (!fileInput || !outputElement || !resultsElement || !saveButton || !clearButton || !headerElement || !v9ControlsElement || !v9GenerateBtn || !v9GraphContainer || !v9TopNSelect) {
        console.error("Kritischer Fehler: UI-Elemente wurden nicht im DOM gefunden.");
        if(outputElement) outputElement.textContent = "UI-Initialisierungsfehler (V9).";
        return;
    }

    // V5/V9: Listener für Speichern
    saveButton.addEventListener('click', () => {
        saveMapping(resultsElement, outputElement, headerElement);
    });

    // V6/V9: Listener für Löschen
    clearButton.addEventListener('click', () => {
        clearMapping(resultsElement, outputElement, headerElement, v9ControlsElement, v9GraphContainer);
    });
    
    // V9: Listener für globalen Graph-Button
    v9GenerateBtn.addEventListener('click', () => {
        if (!currentLogData || !currentLogData.scanInfo || currentStats.length === 0) {
            v9GraphContainer.innerHTML = '<p class="error-message">Bitte zuerst eine Log-Datei laden (und analysieren).</p>';
            return;
        }
        
        const topN = parseInt(v9TopNSelect.value, 10) || 6;
        if (topN < 2) {
            v9GraphContainer.innerHTML = '<p class="error-message">Bitte mindestens 2 Geräte auswählen.</p>';
            return;
        }

        outputElement.textContent += `\n[V9] Generiere globalen Graphen für die Top ${topN} Geräte...`;
        v9GraphContainer.innerHTML = '<p>Generiere Graph...</p>';
        
        // V9: Nimm die Top N aus der globalen 'currentStats'-Liste
        const topNDevicesStats = currentStats.slice(0, topN);
        const mapping = loadMapping();
        const devicesToGraph = [];

        topNDevicesStats.forEach((deviceStats, index) => {
            const fullDeviceData = currentLogData.devices.find(d => d.id === deviceStats.id);
            const mappedName = mapping[deviceStats.id];
            // V9: Nutze Mapping-Name, sonst Geräte-Name, sonst ID
            const displayName = mappedName || deviceStats.name || deviceStats.id;
            
            if (fullDeviceData) {
                devicesToGraph.push({
                    id: deviceStats.id,
                    name: displayName,
                    color: V9_GRAPH_COLORS[index % V9_GRAPH_COLORS.length],
                    history: fullDeviceData.rssiHistory
                });
            }
        });

        // V8/V9: Aufruf der Graph-Funktion
        const svg = generateTimelineGraph(devicesToGraph, currentLogData.scanInfo);
        v9GraphContainer.innerHTML = svg;
        outputElement.textContent += ` Fertig.`;
        outputElement.scrollTop = outputElement.scrollHeight;
    });
    
    // V7: Event-Delegation für Klicks auf die Karten
    resultsElement.addEventListener('click', (e) => {
        const clickableArea = e.target.closest('.card-clickable-area');
        if (!clickableArea) return; 
        const card = clickableArea.closest('.device-card');
        if (!card) return;
        const deviceId = card.dataset.deviceId;
        const detailsPane = card.querySelector('.card-details');
        if (!deviceId || !detailsPane) return;

        if (detailsPane.dataset.isLoaded !== 'true') {
            outputElement.textContent += `\n[V7] Lade Details für ...${deviceId.substring(deviceId.length - 6)}`;
            detailsPane.innerHTML = loadCardDetails(deviceId);
            detailsPane.dataset.isLoaded = 'true';
            outputElement.scrollTop = outputElement.scrollHeight;
        }
        
        detailsPane.classList.toggle('active');
        card.classList.toggle('details-active');
        clickableArea.setAttribute('aria-expanded', detailsPane.classList.contains('active'));
    });

    // V1: Listener für Datei-Upload (angepasst für V9)
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) {
            outputElement.textContent = 'Dateiauswahl abgebrochen.';
            resultsElement.innerHTML = '<p>Bitte lade eine Logdatei...</p>';
            headerElement.innerHTML = '';
            v9GraphContainer.innerHTML = '';
            currentLogData = null;
            currentStats = []; // V9
            return;
        }

        outputElement.textContent = `Lese und parse Datei: ${file.name} ...`;
        resultsElement.innerHTML = `<p>Lese Datei ${file.name}...</p>`;
        headerElement.innerHTML = '';
        v9GraphContainer.innerHTML = '';
        currentStats = []; // V9

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                currentLogData = JSON.parse(e.target.result);
                if (typeof currentLogData === 'object' && currentLogData !== null && Array.isArray(currentLogData.devices) && currentLogData.scanInfo) {
                    outputElement.textContent = `Datei: ${file.name}\nStatus: Erfolgreich geparst.\nStruktur: Objekt mit ${currentLogData.devices.length} Geräten gefunden.\nStarte Analyse...`;
                    
                    // V9: Analysefunktion aufrufen
                    analyzeAndDisplay(currentLogData.devices, resultsElement, headerElement, v9ControlsElement, null);

                    outputElement.textContent += "\nAnalyse abgeschlossen. Mapping geladen. V9-Tools bereit.";
                    outputElement.scrollTop = outputElement.scrollHeight;
                } else {
                    throw new Error("Die JSON-Datei hat nicht die erwartete Struktur. Ein 'devices'-Array und/oder 'scanInfo' wurde nicht gefunden.");
                }
            } catch (error) {
                console.error('Fehler beim Parsen oder Validieren:', error);
                const errorMsg = `Fehler: ${error.message}`;
                outputElement.textContent = errorMsg;
                resultsElement.innerHTML = `<p class="error-message"><strong>Lade-Fehler:</strong><br>${escapeHTML(errorMsg)}</p>`;
                headerElement.innerHTML = '';
                v9GraphContainer.innerHTML = '';
                currentLogData = null;
                currentStats = [];
            }
        };
        reader.onerror = (e) => { 
            // V9: Error Handling
            console.error('Fehler beim Lesen der Datei:', e);
            const errorMsg = `Fehler: Die Datei konnte nicht gelesen werden. Details: ${e.message}`;
            outputElement.textContent = errorMsg;
            resultsElement.innerHTML = `<p class="error-message"><strong>Lade-Fehler:</strong><br>${escapeHTML(errorMsg)}</p>`;
            headerElement.innerHTML = '';
            v9GraphContainer.innerHTML = '';
            currentLogData = null;
            currentStats = [];
        };
        reader.readAsText(file);
    });
});
