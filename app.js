// V8: Globale Zeitstrahl-Analyse (Triangulations-Graph)

// V5: Globaler State
let currentLogData = null;

// V5: localStorage-Key
const MAPPING_STORAGE_KEY = 'beaconbay-mapping';

// V8: Farbpalette für globalen Graphen
const V8_GRAPH_COLORS = [
    'var(--color-1)', 'var(--color-2)', 'var(--color-3)', 
    'var(--color-4)', 'var(--color-5)', 'var(--color-6)'
];


// --- V5/V6 Mapping-Funktionen ---

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

function saveMapping(resultsContainer, outputElement, headerElement, v8ControlsElement) {
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

        // V8-FIX: Nach dem Speichern 'analyzeAndDisplay' neu ausführen,
        // um die V8-Checkbox-Liste UND die grünen Haken zu aktualisieren.
        if (currentLogData && currentLogData.devices) {
             analyzeAndDisplay(currentLogData.devices, resultsContainer, headerElement, v8ControlsElement, null);
        }
    } catch (error) {
        const logMsg = `[FEHLER] Mapping konnte nicht gespeichert werden: ${error.message}`;
        outputElement.textContent += `\n${logMsg}`;
    }
}

function clearMapping(resultsContainer, outputElement, headerElement, v8ControlsElement) {
    try {
        localStorage.removeItem(MAPPING_STORAGE_KEY);
        const logMsg = `[${new Date().toLocaleTimeString()}] Mapping gelöscht.`;
        outputElement.textContent += `\n${logMsg}`;

        if (currentLogData && currentLogData.devices) {
            // V8-FIX: Ansicht aktualisieren (Karten + V8-Liste)
            analyzeAndDisplay(currentLogData.devices, resultsContainer, headerElement, v8ControlsElement, null);
        } else {
            resultsContainer.innerHTML = '<p>Mapping gelöscht. Lade eine Datei.</p>';
            headerElement.innerHTML = '';
            v8ControlsElement.innerHTML = '<p><i>Lade eine Datei, um Geräte zu mappen.</i></p>';
        }
    } catch (error) {
        const logMsg = `[FEHLER] Mapping konnte nicht gelöscht werden: ${error.message}`;
        outputElement.textContent += `\n${logMsg}`;
    }
}

// --- V7: Detail-Funktionen (Sparkline & Adverts) ---

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
    // V7-Logik (unverändert)
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
    minRssi += 5; maxRssi -= 5;
    const timeRange = maxTime - minTime; const rssiRange = maxRssi - minRssi;
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

// --- V8: Neue Funktionen für globalen Graphen ---

/**
 * V8: Füllt die Checkbox-Liste im V8-Container mit gemappten Geräten.
 * @param {Array<object>} mappedDevices - Array von {id, mappedName, ...}
 * @param {HTMLElement} v8ControlsElement - Der Container für die Checkboxen.
 */
function populateV8Controls(mappedDevices, v8ControlsElement) {
    if (!mappedDevices || mappedDevices.length === 0) {
        v8ControlsElement.innerHTML = '<p><i>Noch keine Geräte gemappt. Bitte im Analyse-Bereich Namen eintragen und speichern.</i></p>';
        return;
    }

    let html = '';
    mappedDevices.forEach((device, index) => {
        const color = V8_GRAPH_COLORS[index % V8_GRAPH_COLORS.length];
        html += `
            <label style="color: ${color};">
                <input type="checkbox" 
                       class="v8-device-toggle" 
                       value="${device.id}" 
                       data-color="${color}" 
                       data-name="${escapeHTML(device.mappedName)}"
                       checked>
                <span class="legend-color-box" style="background-color: ${color};"></span>
                ${escapeHTML(device.mappedName)} (ID: ...${device.id.substring(device.id.length - 6)})
            </label>
        `;
    });
    v8ControlsElement.innerHTML = html;
}

/**
 * V8: Generiert den globalen Zeitstrahl-Graphen (deine Triangulations-Idee).
 * @param {Array<object>} devicesToGraph - Array von {name, color, history: [...]}
 * @returns {string} - Ein vollständiger <svg>-String.
 */
function generateTimelineGraph(devicesToGraph, globalScanInfo) {
    if (!devicesToGraph || devicesToGraph.length === 0) {
        return `<p class="error-message">Keine Geräte zum Zeichnen ausgewählt.</p>`;
    }

    // 1. SVG-Dimensionen (größer als Sparkline)
    const width = 800;
    const height = 400;
    const padding = 50; // Mehr Platz für Achsen
    const legendWidth = 200; // Platz rechts für die Legende
    const viewWidth = width + padding * 2 + legendWidth;
    const viewHeight = height + padding * 2;

    // 2. Globale Grenzen finden
    let globalMinRssi = -40;
    let globalMaxRssi = -100;
    // V8-ARCHITEKTUR-HINWEIS: Wir verwenden die globalen Scan-Zeiten,
    // damit alle Graphen dieselbe X-Achse haben (Regel 1).
    const globalMinTime = new Date(globalScanInfo.scanStarted).getTime();
    const globalMaxTime = new Date(globalScanInfo.scanEnded).getTime();
    
    // Finde min/max RSSI über *alle* ausgewählten Geräte
    for (const device of devicesToGraph) {
        for (const event of device.history) {
            const rssi = event.r;
            if (rssi > globalMinRssi) globalMinRssi = rssi;
            if (rssi < globalMaxRssi) globalMaxRssi = rssi;
        }
    }
    
    // Puffer
    globalMinRssi = Math.min(-30, globalMinRssi + 10); // z.B. -30
    globalMaxRssi = Math.max(-110, globalMaxRssi - 10); // z.B. -110

    const timeRange = globalMaxTime - globalMinTime;
    const rssiRange = globalMaxRssi - globalMinRssi; // z.B. (-110 - (-30)) = -80

    // 3. Skalierungs-Funktionen
    const scaleX = (time) => padding + ((time - globalMinTime) / timeRange) * width;
    const scaleY = (rssi) => padding + ((globalMaxRssi - rssi) / rssiRange) * height;

    // 4. SVG <path>- und <g_legende>-Strings generieren
    let paths = '';
    let legend = '<g class="timeline-legend">';
    
    devicesToGraph.forEach((device, index) => {
        const { name, color, history } = device;
        if (history.length < 2) return; // Kann keine Linie zeichnen

        // Wichtig: Daten müssen für <path> nach Zeit sortiert sein (sollten sie sein)
        const sortedHistory = history.map(e => ({ time: new Date(e.t).getTime(), rssi: e.r }))
                                     .sort((a, b) => a.time - b.time);

        let pathData = "M" + scaleX(sortedHistory[0].time) + " " + scaleY(sortedHistory[0].rssi);
        for (let i = 1; i < sortedHistory.length; i++) {
            pathData += ` L${scaleX(sortedHistory[i].time)} ${scaleY(sortedHistory[i].rssi)}`;
        }

        paths += `<path d="${pathData}" stroke="${color}" class="timeline-line" />`;
        
        // Legende
        const legendY = padding + index * 20;
        legend += `<rect x="${width + padding + 15}" y="${legendY}" width="15" height="10" fill="${color}" />`;
        legend += `<text x="${width + padding + 35}" y="${legendY + 9}" class="timeline-text">${escapeHTML(name)}</text>`;
    });
    legend += '</g>';

    // 5. Achsen generieren
    const startTime = new Date(globalMinTime).toLocaleTimeString();
    const endTime = new Date(globalMaxTime).toLocaleTimeString();
    let axes = `
        <!-- Y-Achse (RSSI) -->
        <text class="timeline-text" x="${padding - 10}" y="${padding + 5}" text-anchor="end">${globalMinRssi} dBm</text>
        <text class="timeline-text" x="${padding - 10}" y="${padding + height}" text-anchor="end">${globalMaxRssi} dBm</text>
        <line class="timeline-axis solid" x1="${padding}" y1="${padding}" x2="${padding}" y2="${padding + height}" />
        
        <!-- Y-Achse Gitter (Hilfslinien) -->
        <line class="timeline-axis" x1="${padding}" y1="${scaleY(-70)}" x2="${padding + width}" y2="${scaleY(-70)}" />
        <text class="timeline-text" x="${padding - 10}" y="${scaleY(-70) + 3}" text-anchor="end">-70</text>
        <line class="timeline-axis" x1="${padding}" y1="${scaleY(-85)}" x2="${padding + width}" y2="${scaleY(-85)}" />
        <text class="timeline-text" x="${padding - 10}" y="${scaleY(-85) + 3}" text-anchor="end">-85</text>

        <!-- X-Achse (Zeit) -->
        <text class="timeline-text" x="${padding}" y="${viewHeight - 15}" text-anchor="start">${startTime}</text>
        <text class="timeline-text" x="${padding + width}" y="${viewHeight - 15}" text-anchor="end">${endTime}</text>
        <line class="timeline-axis solid" x1="${padding}" y1="${padding + height}" x2="${padding + width}" y2="${padding + height}" />
    `;

    // 6. SVG-String zusammenbauen
    return `
        <svg class="timeline-graph" viewBox="0 0 ${viewWidth} ${viewHeight}" preserveAspectRatio="xMidYMid meet">
            ${axes}
            ${paths}
            ${legend}
        </svg>
    `;
}


// --- V7: Detail- und Analysefunktionen (angepasst für V8) ---

/**
 * V8: Haupt-Analysefunktion (erweitert, um V8-Liste zu füllen)
 * @param {string | null} activeCardId - Die ID der Karte, die aufgeklappt bleiben soll.
 */
function analyzeAndDisplay(devicesArray, resultsContainer, headerElement, v8ControlsElement, activeCardId = null) {
    if (!Array.isArray(devicesArray)) { /* ... Validierung ... */ }
    if (devicesArray.length === 0) { /* ... Validierung ... */ }

    const mapping = loadMapping();
    const stats = [];
    const mappedDevicesForV8 = []; // V8

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
        
        const deviceStats = { id: device.id, name: device.name || "[Unbenannt]", count, avgRssi, maxRssi };
        stats.push(deviceStats);
        
        // V8: Finde gemappte Geräte für die V8-Liste
        const mappedName = mapping[device.id];
        if (mappedName) {
            mappedDevicesForV8.push({ ...deviceStats, mappedName });
        }
    }

    // V6: Sortieren nach "Redseeligkeit"
    stats.sort((a, b) => b.count - a.count);
    
    // V8: Sortiere V8-Liste auch (konsistent)
    mappedDevicesForV8.sort((a, b) => b.count - a.count);

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
    
    // V8: Fülle die V8-Checkbox-Liste
    populateV8Controls(mappedDevicesForV8, v8ControlsElement);
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

// --- V1/V2/V5/V6/V7: Haupt-Event-Listener ---
document.addEventListener('DOMContentLoaded', () => {
    
    // V8: Alle UI-Elemente holen
    const fileInput = document.getElementById('jsonUpload');
    const outputElement = document.getElementById('output');
    const resultsElement = document.getElementById('analysis-results');
    const headerElement = document.getElementById('analysis-header');
    const saveButton = document.getElementById('saveMappingBtn');
    const clearButton = document.getElementById('clearMappingBtn');
    
    // V8-Elemente
    const v8Container = document.getElementById('v8-container');
    const v8ControlsElement = document.getElementById('v8-controls');
    const v8GenerateBtn = document.getElementById('v8-generateBtn');
    const v8GraphContainer = document.getElementById('v8-graph-container');

    if (!fileInput || !outputElement || !resultsElement || !saveButton || !clearButton || !headerElement || !v8Container || !v8ControlsElement || !v8GenerateBtn || !v8GraphContainer) {
        console.error("Kritischer Fehler: UI-Elemente wurden nicht im DOM gefunden.");
        if(outputElement) outputElement.textContent = "UI-Initialisierungsfehler (V8).";
        return;
    }

    // V5: Listener für Speichern (angepasst für V8)
    saveButton.addEventListener('click', () => {
        saveMapping(resultsElement, outputElement, headerElement, v8ControlsElement);
    });

    // V6: Listener für Löschen (angepasst für V8)
    clearButton.addEventListener('click', () => {
        clearMapping(resultsElement, outputElement, headerElement, v8ControlsElement);
    });
    
    // V8: Listener für globalen Graph-Button
    v8GenerateBtn.addEventListener('click', () => {
        if (!currentLogData || !currentLogData.scanInfo) {
            v8GraphContainer.innerHTML = '<p class="error-message">Bitte zuerst eine Log-Datei laden.</p>';
            return;
        }
        
        const checkedBoxes = v8ControlsElement.querySelectorAll('.v8-device-toggle:checked');
        if (checkedBoxes.length === 0) {
            v8GraphContainer.innerHTML = '<p class="error-message">Keine Geräte ausgewählt. Bitte mappen und auswählen.</p>';
            return;
        }

        outputElement.textContent += `\n[V8] Generiere globalen Graphen für ${checkedBoxes.length} Geräte...`;
        v8GraphContainer.innerHTML = '<p>Generiere Graph...</p>';

        const devicesToGraph = [];
        checkedBoxes.forEach(box => {
            const deviceId = box.value;
            const fullDeviceData = currentLogData.devices.find(d => d.id === deviceId);
            if (fullDeviceData) {
                devicesToGraph.push({
                    id: deviceId,
                    name: box.dataset.name,
                    color: box.dataset.color,
                    history: fullDeviceData.rssiHistory
                });
            }
        });

        // V8: Aufruf der neuen Graph-Funktion
        const svg = generateTimelineGraph(devicesToGraph, currentLogData.scanInfo);
        v8GraphContainer.innerHTML = svg;
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

    // V1: Listener für Datei-Upload (angepasst für V8)
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) {
            outputElement.textContent = 'Dateiauswahl abgebrochen.';
            resultsElement.innerHTML = '<p>Bitte lade eine Logdatei...</p>';
            headerElement.innerHTML = '';
            v8ControlsElement.innerHTML = '<p><i>Lade eine Datei...</i></p>';
            v8GraphContainer.innerHTML = '';
            currentLogData = null;
            return;
        }

        outputElement.textContent = `Lese und parse Datei: ${file.name} ...`;
        resultsElement.innerHTML = `<p>Lese Datei ${file.name}...</p>`;
        headerElement.innerHTML = '';
        v8GraphContainer.innerHTML = ''; // V8: Alten Graphen löschen

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                currentLogData = JSON.parse(e.target.result);
                if (typeof currentLogData === 'object' && currentLogData !== null && Array.isArray(currentLogData.devices) && currentLogData.scanInfo) {
                    outputElement.textContent = `Datei: ${file.name}\nStatus: Erfolgreich geparst.\nStruktur: Objekt mit ${currentLogData.devices.length} Geräten gefunden.\nStarte Analyse...`;
                    
                    // V8: Analysefunktion aufrufen (mit V8-Controls)
                    analyzeAndDisplay(currentLogData.devices, resultsElement, headerElement, v8ControlsElement, null);

                    outputElement.textContent += "\nAnalyse abgeschlossen. Mapping geladen. V8-Tools bereit.";
                    outputElement.scrollTop = outputElement.scrollHeight;
                } else {
                    throw new Error("Die JSON-Datei hat nicht die erwartete Struktur. Ein 'devices'-Array und/oder 'scanInfo' wurde nicht gefunden.");
                }
            } catch (error) {
                // ... Fehlerbehandlung ...
                console.error('Fehler beim Parsen oder Validieren:', error);
                const errorMsg = `Fehler: ${error.message}`;
                outputElement.textContent = errorMsg;
                resultsElement.innerHTML = `<p class="error-message"><strong>Lade-Fehler:</strong><br>${escapeHTML(errorMsg)}</p>`;
                headerElement.innerHTML = '';
                v8ControlsElement.innerHTML = `<p class="error-message"><i>Laden fehlgeschlagen.</i></p>`;
                v8GraphContainer.innerHTML = '';
                currentLogData = null;
            }
        };
        reader.onerror = (e) => { /* ... Fehlerbehandlung ... */ };
        reader.readAsText(file);
    });
}); 
