/*
 * BeaconBay Analysator JS
 * Version: V11 (Karten-Upload Korrelation)
 *
 * Logik:
 * 1. Lädt JSON (V1-V2).
 * 2. Parst JSON und validiert Struktur (V4).
 * 3. Berechnet Statistiken für alle Geräte (V4) und sortiert nach "Redseligkeit" (V6).
 * 4. Zeigt Geräte als responsive Karten an (V5).
 * 5. Lädt/Speichert/Löscht Mappings in localStorage (V5-V6).
 * 6. Zeigt gemappte Namen grün an (V6).
 * 7. Karten sind klickbar, um Details (Adverts, Mini-Graph) "lazy" zu laden (V7).
 * 8. "Intelligenter Filter" (V9) generiert globalen Zeitstrahl-Graphen für "Top N"-Geräte.
 * 9. Exportiert Graph-Daten als JSON und SVG (V10).
 * 10. Lädt ein Karten-Bild zur direkten Korrelation hoch (V11).
 */

// V5: Globaler State
let currentLogData = null;
// V9: Globaler State für die sortierte Statistik-Liste
let currentStats = []; 
// V10: Globale States für Export
let currentGraphSVG = null;
let currentGraphData = null;
// V10: Referenzen auf Download-Links, um sie wieder zu löschen
let activeDownloadLinks = [];

// V5: localStorage-Key
const MAPPING_STORAGE_KEY = 'beaconbay-mapping';

// V8/V9: Farbpalette für den globalen Graphen
const V9_GRAPH_COLORS = [
    'var(--color-1)', 'var(--color-2)', 'var(--color-3)', 
    'var(--color-4)', 'var(--color-5)', 'var(--color-6)',
    'var(--color-7)', 'var(--color-8)', 'var(--color-9)', 'var(--color-10)'
];


// --- V5/V6 Mapping-Funktionen (Unverändert von V9.3) ---

/**
 * V5: Lädt das ID->Name Mapping aus dem localStorage.
 * @returns {object} Das Mapping-Objekt.
 */
function loadMapping() {
    try {
        const mappingJson = localStorage.getItem(MAPPING_STORAGE_KEY);
        if (mappingJson) {
            return JSON.parse(mappingJson);
        }
    } catch (error) {
        console.error("Fehler beim Parsen des Mappings aus localStorage:", error);
        localStorage.removeItem(MAPPING_STORAGE_KEY);
    }
    return {};
}

/**
 * V5/V6: Speichert das aktuelle Mapping aus den Input-Feldern in den localStorage.
 * Ruft anschließend 'analyzeAndDisplay' neu auf, um die Ansicht zu aktualisieren.
 */
function saveMapping(resultsContainer, outputElement, headerElement) {
    const newMapping = {};
    const inputs = resultsContainer.querySelectorAll('.mapping-input');
    let savedCount = 0;
    
    // 1. Alle aktuellen Eingaben sammeln
    for (const input of inputs) {
        const beaconId = input.dataset.beaconId;
        const mappedName = input.value.trim();
        if (beaconId && mappedName) {
            newMapping[beaconId] = mappedName;
            savedCount++;
        }
    }

    // 2. Im localStorage speichern
    try {
        localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(newMapping));
        const logMsg = `[${new Date().toLocaleTimeString()}] Mapping erfolgreich gespeichert. ${savedCount} Einträge gesichert.`;
        outputElement.textContent += `\n${logMsg}`;
        outputElement.scrollTop = outputElement.scrollHeight;

        // 3. UI neu rendern, um gemappte Namen (grün) sofort anzuzeigen (V6)
        // V9.1 Fix: v9ControlsElement muss aus dem DOM geholt werden.
        const v9ControlsElement = document.getElementById('v9-controls-simple'); 
        if (currentLogData && currentLogData.devices && v9ControlsElement) {
             // V7: Merken, welche Karte offen war
             const activeCard = resultsContainer.querySelector('.device-card.details-active');
             const activeId = activeCard ? activeCard.dataset.deviceId : null;
             
             // Neu rendern
             analyzeAndDisplay(currentLogData.devices, resultsContainer, headerElement, v9ControlsElement, activeId);
        }
    } catch (error) {
        const logMsg = `[FEHLER] Mapping konnte nicht gespeichert werden: ${error.message}`;
        outputElement.textContent += `\n${logMsg}`;
    }
}

/**
 * V6: Löscht das Mapping aus dem localStorage und rendert die UI neu.
 */
function clearMapping(resultsContainer, outputElement, headerElement, v9ControlsElement, v9GraphContainer, v9ExportContainer, v11MapContainer) {
    try {
        localStorage.removeItem(MAPPING_STORAGE_KEY);
        const logMsg = `[${new Date().toLocaleTimeString()}] Mapping gelöscht.`;
        outputElement.textContent += `\n${logMsg}`;

        // 1. Karten-UI neu rendern (jetzt ohne grüne Namen)
        if (currentLogData && currentLogData.devices) {
            analyzeAndDisplay(currentLogData.devices, resultsContainer, headerElement, v9ControlsElement, null);
        } else {
            resultsContainer.innerHTML = '<p>Mapping gelöscht. Lade eine Datei.</p>';
            headerElement.innerHTML = '';
        }
        
        // 2. V9-UI zurücksetzen (V9.1 Fix: v9ControlsElement ist jetzt das Ziel)
        if (v9ControlsElement) {
            v9ControlsElement.innerHTML = `
                <label for="v9-top-n-select">Anzahl der Top-Geräte:</label>
                <input type="number" id="v9-top-n-select" value="6" min="2" max="20" disabled />
            `;
        }
        if (v9GraphContainer) v9GraphContainer.innerHTML = '';
        
        // 3. V10/V11-UI zurücksetzen
        if (v9ExportContainer) v9ExportContainer.classList.remove('visible');
        if (v11MapContainer) v11MapContainer.innerHTML = '<p class="v11-map-placeholder">Hier erscheint dein Grundriss oder Screenshot...</p>';

    } catch (error)
    {
        const logMsg = `[FEHLER] Mapping konnte nicht gelöscht werden: ${error.message}`;
        outputElement.textContent += `\n${logMsg}`;
    }
}


// --- V7: Detail-Funktionen (Sparkline & Adverts) ---

/**
 * V7: Formatiert die 'uniqueAdvertisements' als JSON-String.
 * @param {Array} adverts - Das uniqueAdvertisements-Array des Geräts.
 * @returns {string} Ein HTML-String mit einem <pre>-Block.
 */
function formatAdvertisements(adverts) {
    if (!adverts || adverts.length === 0) {
        return '<pre class="advert-list">Keine Advertisement-Daten verfügbar.</pre>';
    }
    try {
        // V7: JSON.stringify zur sauberen Formatierung der Objekte im Array
        const formatted = JSON.stringify(adverts, null, 2);
        return `<pre class="advert-list">${escapeHTML(formatted)}</pre>`;
    } catch (e) {
        return `<pre class="advert-list error-message">Fehler beim Formatieren der Adverts.</pre>`;
    }
}

/**
 * V7: Generiert einen reinen SVG-Sparkline-Graphen für den RSSI-Verlauf.
 * @param {Array} rssiHistory - Das rssiHistory-Array des Geräts.
 * @returns {string} Ein HTML-String, der das SVG enthält.
 */
function generateSparkline(rssiHistory) {
    if (!rssiHistory || rssiHistory.length < 2) {
        return `<p>Nicht genügend Daten für RSSI-Graph (min. 2 Punkte benötigt).</p>`;
    }

    // 1. Definitionen
    const width = 300, height = 100, padding = 20;
    const viewWidth = width + padding * 2;
    const viewHeight = height + padding * 2;

    // 2. Daten parsen und Grenzen finden
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

    // 3. Y-Achse "aufräumen" (damit Graphen vergleichbar bleiben)
    minRssi = Math.min(-35, minRssi + 5); // Puffer nach oben
    maxRssi = Math.max(-105, maxRssi - 5); // Puffer nach unten

    // 4. Skalierungsfunktionen (Zeit -> X, RSSI -> Y)
    const timeRange = (maxTime - minTime) || 1; // Division durch Null verhindern
    const rssiRange = (maxRssi - minRssi) || 1;
    
    // (0,0) ist links oben. Zeit (X) wächst nach rechts.
    const scaleX = (time) => padding + ((time - minTime) / timeRange) * width;
    // RSSI (Y) ist "invertiert": höheres RSSI (-40) ist oben, niedrigeres (-100) ist unten.
    const scaleY = (rssi) => padding + ((maxRssi - rssi) / rssiRange) * height;

    // 5. SVG-Pfad-Daten generieren (z.B. "M 0 0 L 10 50 L 20 30...")
    let pathData = "M" + scaleX(dataPoints[0].time) + " " + scaleY(dataPoints[0].rssi);
    for (let i = 1; i < dataPoints.length; i++) {
        pathData += ` L${scaleX(dataPoints[i].time)} ${scaleY(dataPoints[i].rssi)}`;
    }

    // 6. Achsenbeschriftungen
    const startTime = new Date(minTime).toLocaleTimeString();
    const endTime = new Date(maxTime).toLocaleTimeString();

    // 7. SVG-String zusammenbauen
    return `
        <svg class="rssi-sparkline" viewBox="0 0 ${viewWidth} ${viewHeight}" preserveAspectRatio="xMidYMid meet">
            <!-- Y-Achse (RSSI) -->
            <text class="spark-text" x="5" y="${padding + 5}" alignment-baseline="hanging">${minRssi} dBm</text>
            <text class="spark-text" x="5" y="${padding + height}" alignment-baseline="baseline">${maxRssi} dBm</text>
            <line class="spark-axis" x1="${padding}" y1="${padding}" x2="${padding}" y2="${padding + height}" />
            
            <!-- X-Achse (Zeit) -->
            <text class="spark-text" x="${padding}" y="${viewHeight - 5}" text-anchor="start">${startTime}</text>
            <text class="spark-text" x="${padding + width}" y="${viewHeight - 5}" text-anchor="end">${endTime}</text>
            <line class="spark-axis" x1="${padding}" y1="${padding + height}" x2="${padding + width}" y2="${padding + height}" />

            <!-- Daten-Linie -->
            <path class="spark-line" d="${pathData}" />
        </svg>
    `;
}

// --- V9.3: Globale Graph-Funktion ---

/**
 * V9.3: Generiert den globalen Zeitstrahl-Graphen für die "Top N" Geräte.
 * @param {Array} devicesToGraph - Array von Objekten {id, name, color, history}
 * @param {object} globalScanInfo - Das `scanInfo`-Objekt aus der JSON-Datei.
 * @returns {string} Ein HTML-String, der das SVG enthält.
 */
function generateTimelineGraph(devicesToGraph, globalScanInfo) {
    if (!devicesToGraph || devicesToGraph.length === 0) {
        return `<p class="error-message">Keine Geräte zum Zeichnen ausgewählt.</p>`;
    }

    // 1. Definitionen
    const width = 800, height = 400, padding = 50, legendWidth = 200;
    const viewWidth = width + padding * 2 + legendWidth;
    const viewHeight = height + padding * 2;

    // 2. Globale Grenzen finden
    let globalMinRssi = -40, globalMaxRssi = -100;
    // V9: Globale X-Achse wird durch die Scan-Info bestimmt
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
    
    // Y-Achse "aufräumen" (Puffer)
    globalMinRssi = Math.min(-30, globalMinRssi + 10);
    globalMaxRssi = Math.max(-110, globalMaxRssi - 10);

    // 3. Skalierungsfunktionen
    const timeRange = (globalMaxTime - globalMinTime) || 1;
    const rssiRange = (globalMaxRssi - globalMinRssi) || 1;

    // V9.3 BUGFIX: Verwende die 'global'-Variablen
    const scaleX = (time) => padding + ((time - globalMinTime) / timeRange) * width;
    const scaleY = (rssi) => padding + ((globalMaxRssi - rssi) / rssiRange) * height;

    // 4. Pfade und Legende generieren
    let paths = '';
    let legend = '<g class="timeline-legend">';
    
    devicesToGraph.forEach((device, index) => {
        const { name, color, history } = device;
        if (history.length < 2) return; // Kann keine Linie zeichnen

        // V9: Datenpunkte müssen sortiert sein, falls sie es nicht sind
        const sortedHistory = history.map(e => ({ time: new Date(e.t).getTime(), rssi: e.r }))
                                     .sort((a, b) => a.time - b.time);

        let pathData = "M" + scaleX(sortedHistory[0].time) + " " + scaleY(sortedHistory[0].rssi);
        for (let i = 1; i < sortedHistory.length; i++) {
            pathData += ` L${scaleX(sortedHistory[i].time)} ${scaleY(sortedHistory[i].rssi)}`;
        }
        
        // Füge den Pfad hinzu
        paths += `<path d="${pathData}" stroke="${color}" class="timeline-line" />`;

        // Füge die Legende hinzu
        const shortName = (name.length > 20) ? name.substring(0, 18) + '...' : name;
        const legendY = padding + index * 20;
        legend += `<rect x="${width + padding + 15}" y="${legendY}" width="15" height="10" fill="${color}" />`;
        legend += `<text x="${width + padding + 35}" y="${legendY + 9}" class="timeline-text">${escapeHTML(shortName)}</text>`;
    });
    legend += '</g>';

    // 5. Achsenbeschriftungen
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

    // 6. SVG-String zusammenbauen
    return `
        <svg class="timeline-graph" viewBox="0 0 ${viewWidth} ${viewHeight}" preserveAspectRatio="xMidYMid meet">
            ${axes}
            ${paths}
            ${legend}
        </svg>
    `;
}

// --- V10: Neue Export-Funktionen ---

/**
 * V10: Generiert die Download-Buttons für JSON und SVG.
 * @param {HTMLElement} exportContainer - Das <div>, in das die Links kommen.
 * @param {string} svgContent - Der rohe SVG-String aus 'generateTimelineGraph'.
 * @param {object} graphData - Das Datenobjekt {devicesToGraph, globalScanInfo}.
 */
function createDownloadLinks(exportContainer, svgContent, graphData) {
    // 0. Alte Download-Links (falls vorhanden) löschen (Regel 2)
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
    // Wir holen uns die berechneten Werte der Farbvariablen.
    const rootStyle = getComputedStyle(document.documentElement);
    const cssVariables = `
        .timeline-line { 
            fill: none; 
            stroke-width: 2; 
            opacity: 0.8; 
        }
        .timeline-text { 
            font-family: -apple-system, sans-serif; 
            font-size: 10px; 
            fill: ${rootStyle.getPropertyValue('--svg-text').trim()}; 
        }
        .timeline-axis { 
            stroke: ${rootStyle.getPropertyValue('--border-color').trim()}; 
            stroke-width: 1; 
            stroke-dasharray: 2 2; 
        }
        .timeline-axis.solid { 
            stroke-dasharray: none; 
            stroke: ${rootStyle.getPropertyValue('--fg-color').trim()}; 
        }
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


// --- V4-V9: Analyse- und UI-Rendering-Funktionen ---

/**
 * V4/V5/V6/V7/V9: Hauptanalysefunktion.
 * Verarbeitet die geparsten Daten, berechnet Statistiken,
 * sortiert nach 'count' und rendert die Geräte-Karten-Liste.
 * Füllt auch die V9-UI.
 * @param {Array} devicesArray - Das 'devices'-Array aus der JSON.
 * @param {HTMLElement} resultsContainer - Das <div> für die Karten.
 * @param {HTMLElement} headerElement - Das <div> für die Zusammenfassung.
 * @param {HTMLElement} v9ControlsElement - Das <div> für die V9-Steuerung.
 * @param {string | null} activeCardId - Die ID der Karte, die offen bleiben soll (V7).
 */
function analyzeAndDisplay(devicesArray, resultsContainer, headerElement, v9ControlsElement, activeCardId = null) {
    // V9: Globale Statistik-Liste zurücksetzen
    currentStats = []; 
    
    // V4: Prüfen, ob Daten gültig sind
    if (!Array.isArray(devicesArray) || devicesArray.length === 0) {
        resultsContainer.innerHTML = '<p>Logdatei enthält 0 Geräte.</p>';
        headerElement.innerHTML = '';
        v9ControlsElement.innerHTML = `<label>Top-Geräte:</label><input type="number" value="6" disabled />`;
        return;
    }

    // V5: Gespeichertes Mapping laden
    const mapping = loadMapping();
    
    const stats = [];
    
    // V4: Statistiken für JEDES Gerät berechnen
    for (const device of devicesArray) {
        if (!device || !device.id || !Array.isArray(device.rssiHistory)) continue;

        const rssiEvents = device.rssiHistory;
        const count = rssiEvents.length;
        
        let rssiSum = 0;
        let maxRssi = -Infinity;
        
        // V9.2 BUGFIX: avgRssi *außerhalb* des if-Blocks deklarieren
        let avgRssi = null; 

        if (count > 0) {
            for (const event of rssiEvents) {
                if (typeof event.r === 'number') {
                    rssiSum += event.r;
                    if (event.r > maxRssi) maxRssi = event.r;
                }
            }
            avgRssi = (rssiSum / count).toFixed(2);
        } else {
            maxRssi = null; // V9.2: Setze auf null, wenn count = 0
        }
        
        stats.push({
            id: device.id,
            name: device.name || "[Unbenannt]",
            count,
            avgRssi,
            maxRssi
        });
    }

    // V6: Sortieren nach "Redseeligkeit" (count, absteigend)
    stats.sort((a, b) => b.count - a.count);

    // V9: Globale Statistik-Liste für Graphen speichern
    currentStats = stats; 
    
    // V7: Header-Zusammenfassung rendern
    headerElement.innerHTML = `<p>Analyse von <strong>${devicesArray.length}</strong> Geräten. (Sortiert nach "Redseeligkeit". Klicken für Details.)</p>`;

    // V5: HTML für alle Karten generieren
    let htmlOutput = "";
    for (const device of stats) {
        
        // V6: Mapping-Namen holen
        const mappedName = mapping[device.id] || '';
        const displayName = mappedName ? mappedName : device.name;
        const isMappedClass = mappedName ? 'is-mapped' : '';
        
        // V7: Prüfen, ob diese Karte aktiv (aufgeklappt) bleiben soll
        const isActive = (device.id === activeCardId);
        const activeClass = isActive ? 'active' : '';
        const cardActiveClass = isActive ? 'details-active' : '';

        // V5/V6/V7: Karten-HTML
        htmlOutput += `
            <div class="device-card ${cardActiveClass}" data-device-id="${device.id}">
                <!-- V7: Klickbarer Bereich -->
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

                <!-- V5: Mapping-Zeile -->
                <div class="card-row mapping-row">
                    <label for="map-${device.id}" class="card-label">Mapping (Ort):</label>
                    <input type="text" id="map-${device.id}" class="mapping-input"
                           data-beacon-id="${device.id}" value="${escapeHTML(mappedName)}"
                           placeholder="z.B. FTS Ladestation 1">
                </div>

                <!-- V7: Detail-Bereich (Lazy-loaded) -->
                <div class="card-details ${activeClass}" id="details-${device.id}" data-is-loaded="${isActive}">
                    ${isActive ? loadCardDetails(device.id) : '<!-- Details werden bei Klick geladen -->'}
                </div>
            </div>
        `;
    }
    
    // V5: Karten-HTML in die Seite einfügen
    resultsContainer.innerHTML = htmlOutput;
    
    // V9: V9-UI (Top-N-Auswahl) aktivieren
    v9ControlsElement.innerHTML = `
        <label for="v9-top-n-select">Anzahl der Top-Geräte:</label>
        <input type="number" id="v9-top-n-select" value="6" min="2" max="20" />
    `;
}

/**
 * V7: "Lazy-Loads" den Inhalt für eine Detail-Karte (Adverts & Graph).
 * @param {string} deviceId - Die ID des Geräts.
 * @returns {string} Der HTML-Inhalt für den .card-details-Block.
 */
function loadCardDetails(deviceId) {
    if (!currentLogData || !currentLogData.devices) {
        return '<p class="error-message">Fehler: Log-Daten nicht gefunden.</p>';
    }
    
    // 1. Finde die vollen Gerätedaten
    const device = currentLogData.devices.find(d => d.id === deviceId);
    if (!device) {
        return `<p class="error-message">Fehler: Gerät mit ID ${deviceId} nicht gefunden.</p>`;
    }

    // 2. Generiere Advertisements-HTML
    const advertsHtml = formatAdvertisements(device.uniqueAdvertisements);
    
    // 3. Generiere Sparkline-Graph-HTML
    const graphHtml = generateSparkline(device.rssiHistory);

    // 4. Kombiniere und gib zurück
    return `
        <h4>1. Unique Advertisements</h4>
        ${advertsHtml}
        <h4>2. RSSI-Verlauf (Signal über Zeit)</h4>
        ${graphHtml}
    `;
}

/**
 * V4: Kleine Helferfunktion, um HTML-Injection durch Gerätenamen zu verhindern.
 * @param {string} str - Der zu bereinigende String.
 * @returns {string} Der bereinigte String.
 */
function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, function(m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m];
    });
}

// --- V1-V11: Haupt-Event-Listener ---
document.addEventListener('DOMContentLoaded', () => {
    
    // V11: Alle UI-Elemente holen
    const fileInput = document.getElementById('jsonUpload');
    const outputElement = document.getElementById('output');
    const resultsElement = document.getElementById('analysis-results');
    const headerElement = document.getElementById('analysis-header');
    const saveButton = document.getElementById('saveMappingBtn');
    const clearButton = document.getElementById('clearMappingBtn');
    
    // V9 Elemente
    const v9Container = document.getElementById('v9-container');
    const v9ControlsElement = document.getElementById('v9-controls-simple'); 
    const v9GenerateBtn = document.getElementById('v9-generateBtn');
    const v9GraphContainer = document.getElementById('v9-graph-container');
    
    // V10 Elemente
    const v9ExportContainer = document.getElementById('v9-export-controls');
    
    // V11 Elemente
    const mapUploadInput = document.getElementById('mapUpload');
    const v11MapContainer = document.getElementById('v11-map-container');


    // V9.1: Kritische UI-Element-Prüfung
    if (!fileInput || !outputElement || !resultsElement || !saveButton || !clearButton || !headerElement || !v9Container || !v9ControlsElement || !v9GenerateBtn || !v9GraphContainer || !v9ExportContainer || !mapUploadInput || !v11MapContainer) {
        console.error("Kritischer Fehler: UI-Elemente wurden nicht im DOM gefunden.");
        if(outputElement) outputElement.textContent = "UI-Initialisierungsfehler (V11). Ein HTML-Element fehlt.";
        return;
    }
    
    // V9: Initialisiere V9-UI als 'disabled'
    v9ControlsElement.innerHTML = `
        <label for="v9-top-n-select">Anzahl der Top-Geräte:</label>
        <input type="number" id="v9-top-n-select" value="6" min="2" max="20" disabled />
    `;

    // V5: Mapping-Speichern-Button
    saveButton.addEventListener('click', () => {
        saveMapping(resultsElement, outputElement, headerElement);
    });

    // V6: Mapping-Löschen-Button
    clearButton.addEventListener('click', () => {
        // V11: Übergibt alle UI-Container zum Zurücksetzen
        clearMapping(resultsElement, outputElement, headerElement, v9ControlsElement, v9GraphContainer, v9ExportContainer, v11MapContainer);
    });
    
    // V9: Graph-Generieren-Button
    v9GenerateBtn.addEventListener('click', () => {
        if (!currentLogData || !currentLogData.scanInfo || currentStats.length === 0) {
            v9GraphContainer.innerHTML = '<p class="error-message">Bitte zuerst eine Log-Datei laden.</p>';
            v9ExportContainer.classList.remove('visible'); // V10
            return;
        }
        
        // V9.1 Fix: Holt das Element, *nachdem* es von analyzeAndDisplay erstellt wurde
        const v9TopNSelect = document.getElementById('v9-top-n-select');
        if (!v9TopNSelect) {
            v9GraphContainer.innerHTML = '<p class="error-message">Fehler: Konnte Top-N-Auswahlfeld nicht finden.</p>';
            v9ExportContainer.classList.remove('visible'); // V10
            return;
        }
        
        const topN = parseInt(v9TopNSelect.value, 10) || 6;
        if (topN < 2) {
            v9GraphContainer.innerHTML = `<p class="error-message">Bitte mindestens 2 Geräte auswählen.</p>`;
            v9ExportContainer.classList.remove('visible'); // V10
            return;
        }

        outputElement.textContent += `\n[V9] Generiere globalen Graphen für die Top ${topN} Geräte...`;
        v9GraphContainer.innerHTML = '<p>Generiere Graph...</p>';
        
        // V9: Daten für den Graphen vorbereiten
        const topNDevicesStats = currentStats.slice(0, topN);
        const mapping = loadMapping();
        const devicesToGraph = [];

        topNDevicesStats.forEach((deviceStats, index) => {
            const fullDeviceData = currentLogData.devices.find(d => d.id === deviceStats.id);
            const mappedName = mapping[deviceStats.id];
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

        // V9: Graph generieren (V9.3 Bugfix ist hier enthalten)
        const svg = generateTimelineGraph(devicesToGraph, currentLogData.scanInfo);
        v9GraphContainer.innerHTML = svg;
        
        // V10: Export-Daten und Links generieren
        const graphDataForExport = {
            scanInfo: currentLogData.scanInfo,
            devices: devicesToGraph // Enthält 'name', 'color', 'id', 'history'
        };
        
        // Speichere für die Download-Handler
        currentGraphSVG = svg;
        currentGraphData = graphDataForExport;

        // Erstelle und zeige die Download-Buttons an
        createDownloadLinks(v9ExportContainer, currentGraphSVG, currentGraphData);
        
        outputElement.textContent += ` Fertig. Export-Links sind bereit.`;
        outputElement.scrollTop = outputElement.scrollHeight;
    });
    
    // V7: Event-Delegation für Klicks auf die Karten
    resultsElement.addEventListener('click', (e) => {
        // Nur auslösen, wenn auf den klickbaren Bereich geklickt wird
        const clickableArea = e.target.closest('.card-clickable-area');
        if (!clickableArea) return; // Klick war auf Mapping-Input, ignorieren
        
        const card = clickableArea.closest('.device-card');
        if (!card) return;

        const deviceId = card.dataset.deviceId;
        const detailsPane = card.querySelector('.card-details');
        
        if (!deviceId || !detailsPane) return;

        // V7: "Lazy Load"
        if (detailsPane.dataset.isLoaded !== 'true') {
            outputElement.textContent += `\n[V7] Lade Details für ...${deviceId.substring(deviceId.length - 6)}`;
            detailsPane.innerHTML = loadCardDetails(deviceId);
            detailsPane.dataset.isLoaded = 'true';
            outputElement.scrollTop = outputElement.scrollHeight;
        }
        
        // V7: Toggle-Logik
        detailsPane.classList.toggle('active');
        card.classList.toggle('details-active');
        clickableArea.setAttribute('aria-expanded', detailsPane.classList.contains('active'));
    });

    // V11: Event-Listener für Karten-Bild-Upload
    mapUploadInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) {
            v11MapContainer.innerHTML = '<p class="v11-map-placeholder">Karten-Upload abgebrochen.</p>';
            return;
        }

        // Prüfen, ob es ein Bild ist (Regel 2: Proaktives Mitdenken)
        if (!file.type.startsWith('image/')) {
            v11MapContainer.innerHTML = `<p class="error-message">Fehler: Datei ist kein Bild (${file.type}).</p>`;
            return;
        }
        
        outputElement.textContent += `\n[V11] Lade Karten-Bild: ${file.name} ...`;
        v11MapContainer.innerHTML = '<p>Lade Bild...</p>';

        const reader = new FileReader();
        
        // V11: Muss readAsDataURL verwenden, nicht readAsText
        reader.onload = (e) => {
            const img = document.createElement('img');
            img.src = e.target.result;
            img.alt = `Karten-Ansicht: ${file.name}`;
            v11MapContainer.innerHTML = ''; // Placeholder entfernen
            v11MapContainer.appendChild(img);
            outputElement.textContent += `\n[V11] Karte erfolgreich geladen.`;
            outputElement.scrollTop = outputElement.scrollHeight;
        };

        reader.onerror = (e) => {
            console.error('Fehler beim Lesen der Bilddatei:', e);
            const errorMsg = `Fehler: Die Bilddatei konnte nicht gelesen werden.`;
            outputElement.textContent += `\n[V11] ${errorMsg}`;
            v11MapContainer.innerHTML = `<p class="error-message">${errorMsg}</p>`;
        };

        reader.readAsDataURL(file);
    });

    // V1: Listener für JSON-Datei-Upload (angepasst für V11)
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        
        // V11: Beim Laden einer *neuen* JSON, alle alten Graphen/Karten löschen
        const resetUI = () => {
            resultsElement.innerHTML = '<p>Bitte lade eine Logdatei...</p>';
            headerElement.innerHTML = '';
            v9GraphContainer.innerHTML = '';
            v9ExportContainer.classList.remove('visible');
            v11MapContainer.innerHTML = '<p class="v11-map-placeholder">Hier erscheint dein Grundriss oder Screenshot...</p>';
            v9ControlsElement.innerHTML = `<label>Top-Geräte:</label><input type="number" value="6" disabled />`;
            currentLogData = null;
            currentStats = [];
            currentGraphSVG = null;
            currentGraphData = null;
        };
        
        if (!file) {
            outputElement.textContent = 'Dateiauswahl abgebrochen.';
            resetUI();
            return;
        }

        // Setze UI zurück, während neue Datei lädt
        resetUI();
        outputElement.textContent = `Lese und parse Datei: ${file.name} ...`;
        resultsElement.innerHTML = `<p>Lese Datei ${file.name}...</p>`;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                // V2: JSON parsen
                currentLogData = JSON.parse(e.target.result);

                // V4: Struktur validieren (jetzt mit scanInfo)
                if (typeof currentLogData === 'object' && currentLogData !== null && Array.isArray(currentLogData.devices) && currentLogData.scanInfo) {
                    
                    outputElement.textContent = `Datei: ${file.name}\nStatus: Erfolgreich geparst.\nStruktur: Objekt mit ${currentLogData.devices.length} Geräten und 'scanInfo' gefunden.\nStarte Analyse...`;
                    
                    // V9.1 Fix: Übergibt v9ControlsElement zum Befüllen
                    analyzeAndDisplay(currentLogData.devices, resultsElement, headerElement, v9ControlsElement, null);

                    outputElement.textContent += "\nAnalyse abgeschlossen. Mapping geladen. V9/V11-Tools bereit.";
                    outputElement.scrollTop = outputElement.scrollHeight;
                } else {
                    // V4: Bessere Fehlermeldung
                    throw new Error("Die JSON-Datei hat nicht die erwartete Struktur. Ein 'devices'-Array und/oder 'scanInfo' wurde nicht gefunden.");
                }

            } catch (error) {
                // V2/V4: Fehlerbehandlung
                console.error('Fehler beim Parsen oder Validieren:', error);
                const errorMsg = `Fehler: ${error.message}`;
                outputElement.textContent = errorMsg;
                resultsElement.innerHTML = `<p class="error-message"><strong>Lade-Fehler:</strong><br>${escapeHTML(errorMsg)}</p>`;
                resetUI(); // Setzt UI im Fehlerfall zurück
            }
        };

        // V1: FileReader-Fehlerbehandlung
        reader.onerror = (e) => { 
            console.error('Fehler beim Lesen der Datei:', e);
            const errorMsg = `Fehler: Die Datei konnte nicht gelesen werden.`;
            outputElement.textContent = errorMsg;
            resultsElement.innerHTML = `<p class="error-message"><strong>Lade-Fehler:</strong><br>${escapeHTML(errorMsg)}</p>`;
            resetUI();
        };

        // V1: Startet das Lesen
        reader.readAsText(file);
    });
});
