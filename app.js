/**
 * BeaconBay Analysator - Haupt-App-Logik
 * Version: V12 (Stabilitäts-Update)
 *
 * Features:
 * - V1: Datei-Upload (FileReader)
 * - V2: JSON-Parsing (try...catch)
 * - V3: Einzigartige ID-Analyse (Set)
 * - V4: Statistik-Analyse (Count, Avg/Max RSSI)
 * - V5: Refactoring zu Card-Layout (Mobile-Fix), Mapping-UI
 * - V6: localStorage-Implementierung (Speichern/Laden/Löschen), Mapping-Highlighting
 * - V7: Aufklappbare Details (Adverts & Sparkline-Graph)
 * - V9: Globaler "Intelligenter Filter"-Zeitstrahl-Graph
 * - V10: Export-Funktion (JSON & SVG)
 * - V11: Karten-Korrelations-Upload
 * - V12a: Export der 'uniqueAdvertisements' in JSON (Dein Wunsch)
 * - V12b: Paginierung (Seitennummerierung) für die Gerätekarten (Stabilitäts-Fix)
 */

// V12b: Globale Paginierungs-Konstanten
const CARDS_PER_PAGE = 50;
let currentPage = 1;

// V5/V9: Globaler State
let currentLogData = null; // Speichert die gesamte geparste JSON-Datei
let currentStats = []; // Speichert die Statistiken für ALLE Geräte
let currentMapping = {}; // Cache für das geladene Mapping

// V10: Globale States für Export
let currentGraphSVG = null;
let currentGraphData = null;
let activeDownloadLinks = []; // Zum Verwalten von Blob-URLs

// V5: localStorage-Key
const MAPPING_STORAGE_KEY = 'beaconbay-mapping';

// V9: Farbpalette für den globalen Graphen
const V9_GRAPH_COLORS = [
    'var(--color-1)', 'var(--color-2)', 'var(--color-3)', 
    'var(--color-4)', 'var(--color-5)', 'var(--color-6)',
    'var(--color-7)', 'var(--color-8)', 'var(--color-9)', 'var(--color-10)',
    '#F08080', '#98FB98', '#ADD8E6', '#E6E6FA', '#FFDAB9', '#E0FFFF',
    '#FAFAD2', '#D3D3D3', '#FFB6C1', '#DDA0DD' // Mehr Fallback-Farben
];

// --- V5/V6 Mapping-Funktionen ---

/**
 * V5/V6: Lädt das ID->Name Mapping aus dem localStorage.
 * @returns {object} Das Mapping-Objekt.
 */
function loadMapping() {
    try {
        const mappingJson = localStorage.getItem(MAPPING_STORAGE_KEY);
        if (mappingJson) {
            currentMapping = JSON.parse(mappingJson);
            return currentMapping;
        }
    } catch (error) {
        console.error("Fehler beim Parsen des Mappings aus localStorage:", error);
        localStorage.removeItem(MAPPING_STORAGE_KEY);
    }
    currentMapping = {};
    return {};
}

/**
 * V12-WRAPPER: Wird vom "Speichern"-Button aufgerufen.
 * Aktualisiert das Mapping und rendert die aktuelle Seite neu.
 */
function saveMappingWrapper(ui) {
    const newMapping = {};
    const inputs = ui.resultsElement.querySelectorAll('.mapping-input');
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
        // V12-Änderung: Lade Mapping in den globalen Cache
        currentMapping = newMapping; 
        
        const logMsg = `[${new Date().toLocaleTimeString()}] Mapping erfolgreich gespeichert. ${savedCount} Einträge gesichert.`;
        logToOutput(ui.outputElement, logMsg);

        // V12-Änderung: Nur die aktuelle Seite neu rendern, nicht alles
        if (currentLogData && currentLogData.devices) {
             const totalPages = Math.ceil(currentStats.length / CARDS_PER_PAGE);
             renderCurrentPage(currentPage, totalPages, ui);
        }
    } catch (error) {
        const logMsg = `[FEHLER] Mapping konnte nicht gespeichert werden: ${error.message}`;
        logToOutput(ui.outputElement, logMsg, true);
    }
}

/**
 * V12-WRAPPER: Wird vom "Löschen"-Button aufgerufen.
 * Leert das Mapping und rendert alles neu (startet bei Seite 1).
 */
function clearMappingWrapper(ui) {
    try {
        localStorage.removeItem(MAPPING_STORAGE_KEY);
        currentMapping = {}; // V12: Globalen Cache leeren
        
        const logMsg = `[${new Date().toLocaleTimeString()}] Mapping gelöscht.`;
        logToOutput(ui.outputElement, logMsg);

        // UI zurücksetzen
        if (currentLogData && currentLogData.devices) {
            // V12-Änderung: Analyse neu starten (beginnt bei Seite 1)
            analyzeAndDisplay(currentLogData, ui);
        } else {
            ui.resultsElement.innerHTML = '<p>Mapping gelöscht. Lade eine Datei.</p>';
            ui.headerElement.innerHTML = '';
        }
        
        // V9/V11 UI zurücksetzen
        ui.v9ControlsElement.innerHTML = `
            <label for="v9-top-n-select">Anzahl der Top-Geräte:</label>
            <input type="number" id="v9-top-n-select" value="6" min="2" max="20" disabled />
        `;
        ui.v9GraphContainer.innerHTML = '';
        ui.v11MapContainer.innerHTML = '';
        ui.v9ExportContainer.classList.remove('visible');
    }
    catch (error) {
        const logMsg = `[FEHLER] Mapping konnte nicht gelöscht werden: ${error.message}`;
        logToOutput(ui.outputElement, logMsg, true);
    }
}

// --- V7: Detail-Funktionen (Sparkline & Adverts) ---

/**
 * V7: Formatiert die Advertisement-Daten für die Detailansicht.
 * @param {Array} adverts - Das 'uniqueAdvertisements'-Array eines Geräts.
 * @returns {string} HTML-String.
 */
function formatAdvertisements(adverts) {
    if (!adverts || adverts.length === 0) {
        return '<pre class="advert-list">Keine Advertisement-Daten verfügbar.</pre>';
    }
    try {
        // V7-ARCHITEKTUR: JSON.stringify formatiert das Array schön.
        const formatted = JSON.stringify(adverts, null, 2);
        // V7-FIX: escapeHTML verhindert XSS, falls Daten bösartig sind.
        return `<pre class="advert-list">${escapeHTML(formatted)}</pre>`;
    } catch (e) {
        return `<pre class="advert-list error-message">Fehler beim Formatieren der Adverts.</pre>`;
    }
}

/**
 * V7: Generiert einen reinen SVG-Sparkline-Graphen für den RSSI-Verlauf.
 * @param {Array} rssiHistory - Das 'rssiHistory'-Array eines Geräts.
 * @returns {string} HTML-String (SVG).
 */
function generateSparkline(rssiHistory) {
    if (!rssiHistory || rssiHistory.length < 2) {
        return `<p>Nicht genügend Daten für RSSI-Graph (min. 2 Punkte benötigt).</p>`;
    }

    // V7-ARCHITEKTUR: Definiere Dimensionen. Padding ist für Text/Achsen.
    const width = 300, height = 100, padding = 20;
    const viewWidth = width + padding * 2;
    const viewHeight = height + padding * 2;

    // V7: Finde Min/Max-Werte für die Skalierung
    let minRssi = -40, maxRssi = -100, minTime = Infinity, maxTime = -Infinity;
    
    const dataPoints = rssiHistory.map(event => {
        const time = new Date(event.t).getTime();
        const rssi = event.r;
        if (time < minTime) minTime = time;
        if (time > maxTime) maxTime = time;
        if (rssi > minRssi) minRssi = rssi;
        if (rssi < maxRssi) maxRssi = rssi;
        return { time, rssi };
    });

    // V7-FIX: Sorge für Puffer, damit Linien nicht am Rand kleben
    minRssi = Math.min(-35, minRssi + 5); 
    maxRssi = Math.max(-105, maxRssi - 5);

    // V7: Skalierungsfunktionen (mappen Datenpunkte auf SVG-Koordinaten)
    const timeRange = (maxTime - minTime) || 1; // Verhindere Division durch 0
    const rssiRange = (maxRssi - minRssi) || 1; // Y-Achse ist invertiert (0 oben)

    const scaleX = (time) => padding + ((time - minTime) / timeRange) * width;
    const scaleY = (rssi) => padding + ((maxRssi - rssi) / rssiRange) * height;

    // V7: Baue den SVG <path> String (z.B. "M 0 0 L 10 10 ...")
    let pathData = "M" + scaleX(dataPoints[0].time) + " " + scaleY(dataPoints[0].rssi);
    for (let i = 1; i < dataPoints.length; i++) {
        pathData += ` L${scaleX(dataPoints[i].time)} ${scaleY(dataPoints[i].rssi)}`;
    }

    const startTime = new Date(minTime).toLocaleTimeString();
    const endTime = new Date(maxTime).toLocaleTimeString();

    // V7: Gebe das vollständige SVG als String zurück
    return `
        <svg class="rssi-sparkline" viewBox="0 0 ${viewWidth} ${viewHeight}" preserveAspectRatio="xMidYMid meet">
            <!-- Y-Achsen-Beschriftung (Min/Max RSSI) -->
            <text class="spark-text" x="5" y="${padding + 5}" alignment-baseline="hanging">${minRssi} dBm</text>
            <text class="spark-text" x="5" y="${padding + height}" alignment-baseline="baseline">${maxRssi} dBm</text>
            <!-- Y-Achse (Linie) -->
            <line class="spark-axis" x1="${padding}" y1="${padding}" x2="${padding}" y2="${padding + height}" />
            
            <!-- X-Achsen-Beschriftung (Start/Endzeit) -->
            <text class="spark-text" x="${padding}" y="${viewHeight - 5}" text-anchor="start">${startTime}</text>
            <text class="spark-text" x="${padding + width}" y="${viewHeight - 5}" text-anchor="end">${endTime}</text>
            <!-- X-Achse (Linie) -->
            <line class="spark-axis" x1="${padding}" y1="${padding + height}" x2="${padding + width}" y2="${padding + height}" />
            
            <!-- Daten-Pfad (die Linie) -->
            <path class="spark-line" d="${pathData}" />
        </svg>
    `;
}

// --- V9/V10/V12: Globale Graph-Funktionen ---

/**
 * V9: Generiert den globalen Zeitstrahl-Graphen.
 * V9.3-FIX: Korrigiert 'minTime'/'maxRssi' zu globalen Variablen.
 * @param {Array} devicesToGraph - Array von Objekten {id, name, color, history}
 * @param {object} globalScanInfo - Das 'scanInfo'-Objekt aus dem Log.
 * @returns {string} HTML-String (SVG).
 */
function generateTimelineGraph(devicesToGraph, globalScanInfo) {
    if (!devicesToGraph || devicesToGraph.length === 0) {
        return `<p class="error-message">Keine Geräte zum Zeichnen ausgewählt.</p>`;
    }

    // V9-ARCHITEKTUR: Größerer Graph als die Sparkline
    const width = 800, height = 400, padding = 50, legendWidth = 200;
    const viewWidth = width + padding * 2 + legendWidth;
    const viewHeight = height + padding * 2;

    // V9: Finde globale Min/Max-Werte ALLER ausgewählten Geräte
    let globalMinRssi = -40, globalMaxRssi = -100;
    // V9-ARCHITEKTUR: X-Achse ist die *gesamte* Scan-Dauer, nicht nur die Events
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

    // V9.3-FIX: Diese Skalierer MÜSSEN die globalen Variablen verwenden.
    const scaleX = (time) => padding + ((time - globalMinTime) / timeRange) * width;
    const scaleY = (rssi) => padding + ((globalMaxRssi - rssi) / rssiRange) * height;

    let paths = '';
    let legend = '<g class="timeline-legend">';

    devicesToGraph.forEach((device, index) => {
        const { name, color, history } = device;
        if (history.length < 2) return; // Kann keine Linie zeichnen

        // V9-FIX: Sortiere die History nach Zeit, nur zur Sicherheit
        const sortedHistory = history.map(e => ({ time: new Date(e.t).getTime(), rssi: e.r }))
                                     .sort((a, b) => a.time - b.time);

        let pathData = "M" + scaleX(sortedHistory[0].time) + " " + scaleY(sortedHistory[0].rssi);
        for (let i = 1; i < sortedHistory.length; i++) {
            pathData += ` L${scaleX(sortedHistory[i].time)} ${scaleY(sortedHistory[i].rssi)}`;
        }
        
        // V9: Füge den Pfad mit der zugewiesenen Farbe hinzu
        paths += `<path d="${pathData}" stroke="${color}" class="timeline-line" />`;
        
        // V9: Füge die Legende hinzu
        const shortName = (name.length > 20) ? name.substring(0, 18) + '...' : name;
        const legendY = padding + index * 20;
        legend += `<rect x="${width + padding + 15}" y="${legendY}" width="15" height="10" fill="${color}" />`;
        legend += `<text x="${width + padding + 35}" y="${legendY + 9}" class="timeline-text">${escapeHTML(shortName)}</text>`;
    });
    legend += '</g>';
    
    // V9: Zeit- und RSSI-Achsen
    const startTime = new Date(globalMinTime).toLocaleTimeString();
    const endTime = new Date(globalMaxTime).toLocaleTimeString();

    let axes = `
        <!-- Y-Achse (RSSI) -->
        <text class="timeline-text" x="${padding - 10}" y="${padding + 5}" text-anchor="end">${globalMinRssi} dBm</text>
        <text class="timeline-text" x="${padding - 10}" y="${padding + height}" text-anchor="end">${globalMaxRssi} dBm</text>
        <line class="timeline-axis solid" x1="${padding}" y1="${padding}" x2="${padding}" y2="${padding + height}" />
        <!-- Y-Hilfslinien -->
        <line class="timeline-axis" x1="${padding}" y1="${scaleY(-70)}" x2="${padding + width}" y2="${scaleY(-70)}" />
        <text class="timeline-text" x="${padding - 10}" y="${scaleY(-70) + 3}" text-anchor="end">-70</text>
        <line class="timeline-axis" x1="${padding}" y1="${scaleY(-85)}" x2="${padding + width}" y2="${scaleY(-85)}" />
        <text class="timeline-text" x="${padding - 10}" y="${scaleY(-85) + 3}" text-anchor="end">-85</text>
        
        <!-- X-Achse (Zeit) -->
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

/**
 * V10: Generiert die Download-Buttons für JSON und SVG.
 * @param {HTMLElement} exportContainer - Das <div>, in das die Links kommen.
 * @param {string} svgContent - Der rohe SVG-String aus 'generateTimelineGraph'.
 * @param {object} graphData - Das Datenobjekt {devicesToGraph, globalScanInfo}.
 */
function createDownloadLinks(exportContainer, svgContent, graphData) {
    // V10: Alte Download-Links (falls vorhanden) löschen (Regel 2)
    for (const link of activeDownloadLinks) {
        URL.revokeObjectURL(link.href); // Speicher freigeben
    }
    activeDownloadLinks = [];
    exportContainer.innerHTML = ''; // Container leeren

    // 1. JSON-Daten (für Korrelation) vorbereiten
    const jsonString = JSON.stringify(graphData, null, 2);
    const jsonBlob = new Blob([jsonString], { type: 'application/json' });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    
    const jsonLink = document.createElement('a');
    jsonLink.href = jsonUrl;
    jsonLink.download = 'graph_analysis_data.json';
    jsonLink.className = 'export-button json';
    jsonLink.textContent = 'Graph-Daten (.json) herunterladen';
    exportContainer.appendChild(jsonLink);
    activeDownloadLinks.push(jsonLink); // Zum Speicher-Management hinzufügen

    // 2. SVG-Bild (für Visualisierung) vorbereiten
    
    // V10-FIX (Regel 2): Wir müssen die CSS-Variablen in das SVG einbetten,
    // sonst ist die exportierte Datei schwarz!
    const cssVariables = `
        :root {
            --color-1: #f7768e; --color-2: #9ece6a; --color-3: #7aa2f7;
            --color-4: #bb9af7; --color-5: #ff9e64; --color-6: #7dcfff;
            --color-7: #e0af68; --color-8: #c0caf5; --color-9: #f7cbf7;
            --color-10: #a9b1d6;
            --svg-text: #a9b1d6;
            --border-color: #414868;
            --fg-color: #a9b1d6;
        }
        .timeline-line { fill: none; stroke-width: 2; opacity: 0.8; }
        .timeline-text { font-family: -apple-system, sans-serif; font-size: 10px; fill: var(--svg-text); }
        .timeline-axis { stroke: var(--border-color); stroke-width: 1; stroke-dasharray: 2 2; }
        .timeline-axis.solid { stroke-dasharray: none; stroke: var(--fg-color); }
    `;
    
    // Wir bauen das vollständige SVG-Dokument
    const fullSvgString = `
        <svg xmlns="http://www.w3.org/2000/svg" ${svgContent.substring(svgContent.indexOf('viewBox='))}>
            <style>
                ${cssVariables}
            </style>
            ${svgContent.substring(svgContent.indexOf('>') + 1)}
        </svg>
    `;

    const svgBlob = new Blob([fullSvgString], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    const svgLink = document.createElement('a');
    svgLink.href = svgUrl;
    svgLink.download = 'timeline_graph.svg';
    svgLink.className = 'export-button';
    svgLink.textContent = 'Graph-Bild (.svg) herunterladen';
    exportContainer.appendChild(svgLink);
    activeDownloadLinks.push(svgLink);
    
    // 3. Container anzeigen
    exportContainer.classList.add('visible');
}

// --- V12: Analyse- und UI-Funktionen (mit Paginierung) ---

/**
 * V12: Analysiert die Daten, speichert sie global und startet das Rendering von Seite 1.
 * @param {object} logData - Das gesamte geparste Log-Objekt (früher devicesArray).
 * @param {object} ui - Objekt mit allen relevanten DOM-Elementen.
 */
function analyzeAndDisplay(logData, ui) {
    const devicesArray = logData.devices;
    
    // V12b: Paginierung zurücksetzen
    currentPage = 1;
    currentStats = []; 
    
    if (!Array.isArray(devicesArray) || devicesArray.length === 0) {
        ui.resultsElement.innerHTML = '<p>Logdatei enthält 0 Geräte.</p>';
        ui.headerElement.innerHTML = '';
        ui.v9ControlsElement.innerHTML = `<label>Top-Geräte:</label><input type="number" value="6" disabled />`;
        return;
    }
    
    // V12-Änderung: Lade Mapping *einmal*
    loadMapping(); 
    
    const stats = [];
    
    // V9.2-FIX: 'avgRssi' außerhalb des if-Blocks deklarieren.
    let avgRssi = null; 
    
    for (const device of devicesArray) {
        if (!device || !device.id || !Array.isArray(device.rssiHistory)) continue;
        
        const rssiEvents = device.rssiHistory;
        const count = rssiEvents.length;
        let rssiSum = 0, maxRssi = -Infinity;
        avgRssi = null; // Zurücksetzen für jeden Loop
        
        if (count > 0) {
            for (const event of rssiEvents) {
                if (typeof event.r === 'number') {
                    rssiSum += event.r;
                    if (event.r > maxRssi) maxRssi = event.r;
                }
            }
            avgRssi = (rssiSum / count).toFixed(2);
        } else {
            maxRssi = null; // Keine Events, kein Max-RSSI
        }
        
        stats.push({
            id: device.id,
            name: device.name || "[Unbenannt]",
            count,
            avgRssi,
            maxRssi
        });
    }

    // V6: Sortiere nach "Redseeligkeit" (Anzahl der Events)
    stats.sort((a, b) => b.count - a.count);
    
    // V12: Speichere *alle* Statistiken global
    currentStats = stats; 
    
    // V7/V12: Header aktualisieren
    ui.headerElement.innerHTML = `<p>Analyse von <strong>${devicesArray.length}</strong> Geräten. (Sortiert nach "Redseeligkeit". Klicken für Details.)</p>`;

    // V9: V9-Graph-Steuerung aktivieren
    ui.v9ControlsElement.innerHTML = `
        <label for="v9-top-n-select">Anzahl der Top-Geräte:</label>
        <input type="number" id="v9-top-n-select" value="6" min="2" max="20" />
    `;

    // V12b: Paginierung initialisieren und Seite 1 rendern
    const totalPages = Math.ceil(currentStats.length / CARDS_PER_PAGE);
    
    // V12b: Rufe die neuen Render-Funktionen auf
    renderCurrentPage(1, totalPages, ui);
    renderPaginationControls(1, totalPages, ui);
}

/**
 * V12 NEU: Rendert nur die Gerätekarten für die angegebene Seite.
 * @param {number} pageNumber - Die Seite, die gerendert werden soll.
 * @param {number} totalPages - Gesamtanzahl der Seiten.
 * @param {object} ui - Objekt mit allen relevanten DOM-Elementen.
 */
function renderCurrentPage(pageNumber, totalPages, ui) {
    currentPage = pageNumber;
    ui.resultsElement.innerHTML = ''; // Vorherige Seite löschen

    // V12b: Berechne, welche Geräte angezeigt werden sollen
    const start = (pageNumber - 1) * CARDS_PER_PAGE;
    const end = start + CARDS_PER_PAGE;
    const devicesToRender = currentStats.slice(start, end);

    let htmlOutput = "";
    
    // V7: Finde heraus, welche Karte (falls vorhanden) aktiv/offen war
    const activeCard = document.querySelector('.device-card.details-active');
    const activeCardId = activeCard ? activeCard.dataset.deviceId : null;

    // V12b: Rendere *nur* die 50 Karten für diese Seite
    for (const device of devicesToRender) {
        const mappedName = currentMapping[device.id] || '';
        const displayName = mappedName ? mappedName : device.name;
        const isMappedClass = mappedName ? 'is-mapped' : '';
        
        // V7: Logik, um Details offen zu halten, wenn Seite neu gerendert wird
        const isActive = (device.id === activeCardId);
        const activeClass = isActive ? 'active' : '';
        const cardActiveClass = isActive ? 'details-active' : '';

        // V7: HTML-Struktur (unverändert)
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
    
    ui.resultsElement.innerHTML = htmlOutput;
    
    // V12b: Springe zum Anfang der Ergebnisse (UX-Verbesserung)
    // (Verhindert, dass man am Ende der Seite landet, wenn man unten klickt)
    ui.headerElement.scrollIntoView({ behavior: 'smooth' });
}

/**
 * V12 NEU: Generiert die Paginierungs-Buttons.
 * @param {number} currentPage - Aktuelle Seite.
 * @param {number} totalPages - Gesamtanzahl der Seiten.
 * @param {object} ui - Objekt mit allen relevanten DOM-Elementen.
 */
function renderPaginationControls(currentPage, totalPages, ui) {
    if (totalPages <= 1) {
        ui.paginationControls.innerHTML = '';
        ui.paginationControlsBottom.innerHTML = '';
        return;
    }

    let html = '';
    const maxButtons = 7; // Maximale Anzahl an Zahlen-Buttons
    
    // V12b: Zusammenfassung
    html += `<span class="pagination-summary">Seite ${currentPage} von ${totalPages} (Geräte ${((currentPage-1)*CARDS_PER_PAGE)+1} - ${Math.min(currentPage*CARDS_PER_PAGE, currentStats.length)})</span>`;
    
    // V12b: "Erste Seite" und "Zurück" Buttons
    html += `<button class="page-btn" data-page="1" ${currentPage === 1 ? 'disabled' : ''}>&laquo; Erste</button>`;
    html += `<button class="page-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>&lsaquo; Zurück</button>`;

    // V12b: Logik für die Zahlen-Buttons mit Ellipsis (...)
    let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);

    if (endPage - startPage + 1 < maxButtons) {
        startPage = Math.max(1, endPage - maxButtons + 1);
    }
    
    if (startPage > 1) {
        html += `<span class="page-btn disabled">...</span>`;
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="page-btn ${i === currentPage ? 'current' : ''}" data-page="${i}">${i}</button>`;
    }

    if (endPage < totalPages) {
        html += `<span class="page-btn disabled">...</span>`;
    }

    // V12b: "Vor" und "Letzte Seite" Buttons
    html += `<button class="page-btn" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>Vor &rsaquo;</button>`;
    html += `<button class="page-btn" data-page="${totalPages}" ${currentPage === totalPages ? 'disabled' : ''}>Letzte &raquo;</button>`;

    // V12b: Setze die Buttons an beide Stellen (oben und unten)
    ui.paginationControls.innerHTML = html;
    ui.paginationControlsBottom.innerHTML = html;
}

/**
 * V12 NEU: Event-Handler für Klicks auf die Paginierungs-Leisten.
 * Nutzt Event Delegation.
 * @param {Event} e - Das Klick-Event.
 * @param {object} ui - Objekt mit allen relevanten DOM-Elementen.
 */
function handlePaginationClick(e, ui) {
    const button = e.target.closest('.page-btn');
    if (!button || button.disabled || button.classList.contains('current')) {
        return;
    }

    const page = parseInt(button.dataset.page, 10);
    if (isNaN(page)) return;

    const totalPages = Math.ceil(currentStats.length / CARDS_PER_PAGE);
    
    // V12b: Neue Seite rendern und Paginierung aktualisieren
    renderCurrentPage(page, totalPages, ui);
    renderPaginationControls(page, totalPages, ui);
}


/**
 * V7: Lädt die Details (Adverts, Graph) für eine Karte "Lazy" (bei Bedarf).
 * @param {string} deviceId - Die ID der angeklickten Karte.
 * @returns {string} HTML-Inhalt für den Detailbereich.
 */
function loadCardDetails(deviceId) {
    if (!currentLogData || !currentLogData.devices) {
        return '<p class="error-message">Fehler: Log-Daten nicht gefunden.</p>';
    }
    
    // V7-ARCHITEKTUR: Finde das Gerät in den *vollen* Daten, nicht in den Stats
    const device = currentLogData.devices.find(d => d.id === deviceId);
    
    if (!device) {
        return `<p class="error-message">Fehler: Gerät mit ID ${deviceId} nicht gefunden.</p>`;
    }

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
 * V4/V6: Hilfsfunktion zum Escapen von HTML.
 * @param {string} str - Der zu escapende String.
 * @returns {string} Sicherer HTML-String.
 */
function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, m => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    })[m]);
}

/**
 * V3: Hilfsfunktion zum Loggen in das <pre>-Element.
 * @param {HTMLElement} outputElement - Das <pre>-Element.
 * @param {string} message - Die Nachricht.
 * @param {boolean} [isError=false] - Ob die Nachricht als Fehler formatiert werden soll.
 */
function logToOutput(outputElement, message, isError = false) {
    if (isError) {
        outputElement.innerHTML += `\n<span class="error-message">${message}</span>`;
    } else {
        outputElement.textContent += `\n${message}`;
    }
    // V3: Automatisch nach unten scrollen
    outputElement.scrollTop = outputElement.scrollHeight;
}


// --- V1-V12: Haupt-Event-Listener ---

document.addEventListener('DOMContentLoaded', () => {
    
    // V12: Sammle *alle* UI-Elemente an einem Ort für einfaches Management
    const ui = {
        fileInput: document.getElementById('jsonUpload'),
        outputElement: document.getElementById('output'),
        resultsElement: document.getElementById('analysis-results'),
        headerElement: document.getElementById('analysis-header'),
        saveButton: document.getElementById('saveMappingBtn'),
        clearButton: document.getElementById('clearMappingBtn'),
        
        v9Container: document.getElementById('v9-container'),
        v9ControlsElement: document.getElementById('v9-controls-simple'), 
        v9GenerateBtn: document.getElementById('v9-generateBtn'),
        v9GraphContainer: document.getElementById('v9-graph-container'),
        v9ExportContainer: document.getElementById('v9-export-controls'), // V10
        
        mapUploadInput: document.getElementById('mapUpload'), // V11
        v11MapContainer: document.getElementById('v11-map-container'), // V11

        paginationControls: document.getElementById('pagination-controls'), // V12
        paginationControlsBottom: document.getElementById('pagination-controls-bottom') // V12
    };

    // V12: Robuster Check, ob alle Elemente da sind
    const allElementsExist = Object.values(ui).every(el => el !== null);
    if (!allElementsExist) {
        console.error("Kritischer Fehler: Ein oder mehrere UI-Elemente wurden nicht im DOM gefunden.", ui);
        if(ui.outputElement) ui.outputElement.textContent = "UI-Initialisierungsfehler (V12). Überprüfe die HTML-IDs.";
        return;
    }
    
    // V12: Initialisiere UI-Zustände
    ui.v9ControlsElement.innerHTML = `
        <label for="v9-top-n-select">Anzahl der Top-Geräte:</label>
        <input type="number" id="v9-top-n-select" value="6" min="2" max="20" disabled />
    `;
    ui.paginationControls.innerHTML = '';
    ui.paginationControlsBottom.innerHTML = '';

    
    // --- V12: Event Listener ---
    
    // V1: Datei-Upload (JSON-Log)
    ui.fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) {
            logToOutput(ui.outputElement, 'Dateiauswahl abgebrochen.');
            ui.resultsElement.innerHTML = '<p>Bitte lade eine Logdatei...</p>';
            ui.headerElement.innerHTML = '';
            ui.v9GraphContainer.innerHTML = '';
            ui.v11MapContainer.innerHTML = '';
            ui.v9ExportContainer.classList.remove('visible');
            ui.v9ControlsElement.innerHTML = `<label>Top-Geräte:</label><input type="number" value="6" disabled />`;
            ui.paginationControls.innerHTML = '';
            ui.paginationControlsBottom.innerHTML = '';
            currentLogData = null;
            currentStats = [];
            return;
        }

        // V12: UI beim Laden zurücksetzen
        ui.outputElement.textContent = `Lese und parse Datei: ${file.name} ...`;
        ui.resultsElement.innerHTML = `<p>Lese Datei ${file.name}...</p>`;
        ui.headerElement.innerHTML = '';
        ui.v9GraphContainer.innerHTML = '';
        ui.v11MapContainer.innerHTML = '';
        ui.v9ExportContainer.classList.remove('visible');
        ui.paginationControls.innerHTML = '';
        ui.paginationControlsBottom.innerHTML = '';
        currentStats = [];

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                // V2: Parsen mit Fehlerbehandlung
                currentLogData = JSON.parse(e.target.result);
                
                // V4/V9-Validierung: Prüfe, ob die erwartete Struktur vorhanden ist
                if (typeof currentLogData === 'object' && currentLogData !== null && Array.isArray(currentLogData.devices) && currentLogData.scanInfo) {
                    logToOutput(ui.outputElement, `Datei: ${file.name}\nStatus: Erfolgreich geparst.\nStruktur: Objekt mit ${currentLogData.devices.length} Geräten gefunden.\nStarte Analyse...`);
                    
                    // V12: Starte die Analyse (die Paginierung auslöst)
                    analyzeAndDisplay(currentLogData, ui);

                    logToOutput(ui.outputElement, "Analyse abgeschlossen. Mapping geladen. V9/V12-Tools bereit.");
                } else {
                    throw new Error("Die JSON-Datei hat nicht die erwartete Struktur. Ein 'devices'-Array und/oder 'scanInfo' wurde nicht gefunden.");
                }
            } catch (error) {
                // V2: Fehlerbehandlung
                console.error('Fehler beim Parsen oder Validieren:', error);
                const errorMsg = `Fehler: ${error.message}`;
                logToOutput(ui.outputElement, errorMsg, true);
                ui.resultsElement.innerHTML = `<p class="error-message"><strong>Lade-Fehler:</strong><br>${escapeHTML(errorMsg)}</p>`;
                ui.headerElement.innerHTML = '';
                ui.v9ControlsElement.innerHTML = `<p class="error-message"><i>Laden fehlgeschlagen.</i></p>`;
                currentLogData = null;
                currentStats = [];
            }
        };
        reader.onerror = (e) => {
            console.error('Fehler beim Lesen der Datei:', e);
            const errorMsg = `Fehler: Die Datei konnte nicht gelesen werden. Details: ${e.message}`;
            logToOutput(ui.outputElement, errorMsg, true);
            ui.resultsElement.innerHTML = `<p class="error-message"><strong>Lade-Fehler:</strong><br>${escapeHTML(errorMsg)}</p>`;
            ui.headerElement.innerHTML = '';
            ui.v9ControlsElement.innerHTML = `<p class="error-message"><i>Laden fehlgeschlagen.</i></p>`;
            currentLogData = null;
            currentStats = [];
        };
        reader.readAsText(file);
    });

    // V11: Datei-Upload (Karten-Bild)
    ui.mapUploadInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            // V11-ARCHITEKTUR: Lese als DataURL (Base64), um es in <img> 'src' zu verwenden
            ui.v11MapContainer.innerHTML = `<img src="${e.target.result}" alt="Hochgeladene Karte" />`;
        };
        reader.onerror = (e) => {
            ui.v11MapContainer.innerHTML = `<p class="error-message">Fehler beim Laden des Bildes.</p>`;
        };
        reader.readAsDataURL(file);
    });

    // V6: Mapping-Buttons
    ui.saveButton.addEventListener('click', () => saveMappingWrapper(ui));
    ui.clearButton.addEventListener('click', () => clearMappingWrapper(ui));
    
    // V9/V10/V12: Graph-Generator-Button
    ui.v9GenerateBtn.addEventListener('click', () => {
        if (!currentLogData || !currentLogData.scanInfo || currentStats.length === 0) {
            ui.v9GraphContainer.innerHTML = '<p class="error-message">Bitte zuerst eine Log-Datei laden.</p>';
            ui.v9ExportContainer.classList.remove('visible');
            return;
        }
        
        // V9.1-FIX: Das Input-Feld existiert erst nach dem Laden, hole es jetzt.
        const v9TopNSelect = document.getElementById('v9-top-n-select');
        if (!v9TopNSelect) {
            ui.v9GraphContainer.innerHTML = '<p class="error-message">Fehler: Konnte Top-N-Auswahlfeld nicht finden.</p>';
            ui.v9ExportContainer.classList.remove('visible');
            return;
        }
        
        const topN = parseInt(v9TopNSelect.value, 10) || 6;
        if (topN < 2) {
            ui.v9GraphContainer.innerHTML = `<p class="error-message">Bitte mindestens 2 Geräte auswählen.</p>`;
            ui.v9ExportContainer.classList.remove('visible');
            return;
        }

        logToOutput(ui.outputElement, `[V9] Generiere globalen Graphen für die Top ${topN} Geräte...`);
        ui.v9GraphContainer.innerHTML = '<p>Generiere Graph...</p>';
        
        // V9: Hole die Top N aus den *globalen, sortierten* Statistiken
        const topNDevicesStats = currentStats.slice(0, topN);
        const devicesToGraph = [];

        // V9: Finde die vollen Daten für die Top N
        topNDevicesStats.forEach((deviceStats, index) => {
            const fullDeviceData = currentLogData.devices.find(d => d.id === deviceStats.id);
            const mappedName = currentMapping[deviceStats.id];
            const displayName = mappedName || deviceStats.name || deviceStats.id;
            
            if (fullDeviceData) {
                devicesToGraph.push({
                    id: deviceStats.id,
                    name: displayName,
                    color: V9_GRAPH_COLORS[index % V9_GRAPH_COLORS.length],
                    history: fullDeviceData.rssiHistory,
                    // V12a: Füge Advertisement-Daten für den Export hinzu
                    advertisements: fullDeviceData.uniqueAdvertisements
                });
            }
        });

        // V9: Graph generieren
        const svg = generateTimelineGraph(devicesToGraph, currentLogData.scanInfo);
        ui.v9GraphContainer.innerHTML = svg;
        
        // V10: Export-Daten und Links generieren
        const graphDataForExport = {
            scanInfo: currentLogData.scanInfo,
            // V12a: 'devicesToGraph' enthält jetzt 'advertisements'
            devices: devicesToGraph 
        };
        
        // V10: Speichere für die Download-Handler
        currentGraphSVG = svg;
        currentGraphData = graphDataForExport;

        // V10: Erstelle und zeige die Download-Buttons an
        createDownloadLinks(ui.v9ExportContainer, currentGraphSVG, currentGraphData);
        
        logToOutput(ui.outputElement, "Graph generiert. Export-Links sind bereit.");
    });
    
    // V7: Event-Delegation für Klicks auf die Karten-Details
    ui.resultsElement.addEventListener('click', (e) => {
        // V7-ARCHITEKTUR: Finde das klickbare Elternelement
        const clickableArea = e.target.closest('.card-clickable-area');
        
        // V7-FIX: Wenn der Klick *nicht* im klickbaren Bereich war (z.B. im Mapping-Input), ignoriere ihn.
        if (!clickableArea) return; 
        
        const card = clickableArea.closest('.device-card');
        if (!card) return;
        
        const deviceId = card.dataset.deviceId;
        const detailsPane = card.querySelector('.card-details');
        
        if (!deviceId || !detailsPane) return;

        // V7-ARCHITEKTUR: "Lazy Loading" der Details. Lade nur beim *ersten* Klick.
        if (detailsPane.dataset.isLoaded !== 'true') {
            logToOutput(ui.outputElement, `[V7] Lade Details für ...${deviceId.substring(deviceId.length - 6)}`);
            detailsPane.innerHTML = loadCardDetails(deviceId);
            detailsPane.dataset.isLoaded = 'true';
        }
        
        // V7: Toggle-Logik
        detailsPane.classList.toggle('active');
        card.classList.toggle('details-active');
        clickableArea.setAttribute('aria-expanded', detailsPane.classList.contains('active'));
    });

    // V12b: Event-Delegation für Paginierungs-Klicks
    ui.paginationControls.addEventListener('click', (e) => handlePaginationClick(e, ui));
    ui.paginationControlsBottom.addEventListener('click', (e) => handlePaginationClick(e, ui));

}); // Ende DOMContentLoaded 
