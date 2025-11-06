// V7: Klickbare Karten mit "Lazy-Loaded" Details (Adverts & SVG-Graph)

// V5: Globaler State
let currentLogData = null;

// V5: localStorage-Key
const MAPPING_STORAGE_KEY = 'beaconbay-mapping';


// --- V5/V6 Mapping-Funktionen (unverändert) ---

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

function saveMapping(resultsContainer, outputElement) {
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

        if (currentLogData && currentLogData.devices) {
             analyzeAndDisplay(currentLogData.devices, resultsContainer, null); // V7: null für activeCardId
        }
    } catch (error) {
        const logMsg = `[FEHLER] Mapping konnte nicht gespeichert werden: ${error.message}`;
        outputElement.textContent += `\n${logMsg}`;
    }
}

function clearMapping(resultsContainer, outputElement, headerElement) { // V7: Nimmt headerElement
    try {
        localStorage.removeItem(MAPPING_STORAGE_KEY);
        const logMsg = `[${new Date().toLocaleTimeString()}] Mapping gelöscht.`;
        outputElement.textContent += `\n${logMsg}`;

        if (currentLogData && currentLogData.devices) {
            analyzeAndDisplay(currentLogData.devices, resultsContainer, null); // V7: null für activeCardId
        } else {
            resultsContainer.innerHTML = '<p>Mapping gelöscht. Lade eine Datei.</p>';
            headerElement.innerHTML = '';
        }
    } catch (error) {
        const logMsg = `[FEHLER] Mapping konnte nicht gelöscht werden: ${error.message}`;
        outputElement.textContent += `\n${logMsg}`;
    }
}

// --- V7: Neue Funktionen für Details & SVG-Graph ---

/**
 * V7: Formatiert das 'uniqueAdvertisements'-Array als lesbaren HTML-String.
 * @param {Array<object>} adverts - Das 'uniqueAdvertisements'-Array eines Geräts.
 * @returns {string} - Ein formatierter HTML-String (in <pre>-Tags).
 */
function formatAdvertisements(adverts) {
    if (!adverts || adverts.length === 0) {
        return '<pre class="advert-list">Keine Advertisement-Daten verfügbar.</pre>';
    }

    // ARCHITEKTUR-HINWEIS (Regel 1):
    // Wir nutzen JSON.stringify zur sauberen Formatierung der Objekte,
    // um alle Details (type, companyId, payload etc.) anzuzeigen.
    try {
        const formatted = JSON.stringify(adverts, null, 2);
        return `<pre class="advert-list">${escapeHTML(formatted)}</pre>`;
    } catch (e) {
        return `<pre class="advert-list error-message">Fehler beim Formatieren der Adverts.</pre>`;
    }
}

/**
 * V7: Generiert einen SVG-Sparkline-Graphen für den RSSI-Verlauf.
 * Dies ist die Grundlage für V8 (deine Triangulations-Idee).
 *
 * @param {Array<object>} rssiHistory - Array von {t: string, r: number}
 * @returns {string} - Ein vollständiger <svg>-String.
 */
function generateSparkline(rssiHistory) {
    if (!rssiHistory || rssiHistory.length < 2) {
        return `<p>Nicht genügend Daten für RSSI-Graph (min. 2 Punkte benötigt).</p>`;
    }

    // 1. SVG-Dimensionen und Ränder
    const width = 300;
    const height = 100;
    const padding = 20; // Platz für Achsen-Beschriftung
    const viewWidth = width + padding * 2;
    const viewHeight = height + padding * 2;

    // 2. Daten parsen und Skalen-Grenzen finden
    let minRssi = -40; // RSSI ist selten besser als -40
    let maxRssi = -100; // RSSI ist selten schlechter als -100
    let minTime = Infinity;
    let maxTime = -Infinity;
    
    const dataPoints = rssiHistory.map(event => {
        const time = new Date(event.t).getTime();
        const rssi = event.r;
        
        if (time < minTime) minTime = time;
        if (time > maxTime) maxTime = time;
        if (rssi > minRssi) minRssi = rssi; // Stärkeres Signal (z.B. -30)
        if (rssi < maxRssi) maxRssi = rssi; // Schwächeres Signal (z.B. -110)
        
        return { time, rssi };
    });
    
    // Kleinen Puffer für RSSI-Achse, damit Linie nicht am Rand klebt
    minRssi += 5; 
    maxRssi -= 5;
    
    const timeRange = maxTime - minTime;
    const rssiRange = maxRssi - minRssi; // z.B. (-105 - (-35)) = -70

    // 3. Skalierungs-Funktionen (Mapping von Daten zu Pixeln)
    // ARCHITEKTUR-HINWEIS:
    // Y-Achse ist invertiert: Höherer RSSI (z.B. -40) = kleinerer Y-Wert (oben)
    const scaleX = (time) => padding + ((time - minTime) / timeRange) * width;
    const scaleY = (rssi) => padding + ((maxRssi - rssi) / rssiRange) * height;

    // 4. SVG <path> String (d="...") generieren
    let pathData = "M" + scaleX(dataPoints[0].time) + " " + scaleY(dataPoints[0].rssi);
    for (let i = 1; i < dataPoints.length; i++) {
        pathData += ` L${scaleX(dataPoints[i].time)} ${scaleY(dataPoints[i].rssi)}`;
    }

    // 5. Zeit-Labels formatieren (Start- und Endzeit)
    const startTime = new Date(minTime).toLocaleTimeString();
    const endTime = new Date(maxTime).toLocaleTimeString();

    // 6. SVG-String zusammenbauen
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

            <!-- Der Graph -->
            <path class="spark-line" d="${pathData}" />
        </svg>
    `;
}


/**
 * V7: Haupt-Analysefunktion (erweitert, um Detail-Pane zu rendern)
 *
 * @param {Array<object>} devicesArray - Das 'devices'-Array (currentLogData.devices)
 * @param {HTMLElement} resultsContainer - Das DOM-Element, in das geschrieben wird.
 * @param {string | null} activeCardId - (V7) Die ID der Karte, die aufgeklappt bleiben soll (z.B. nach Neuladen).
 */
function analyzeAndDisplay(devicesArray, resultsContainer, headerElement, activeCardId = null) {
    if (!Array.isArray(devicesArray)) {
        resultsContainer.innerHTML = `<p class="error-message"><strong>Analyse-Fehler:</strong><br>Datenstruktur ungültig.</p>`;
        return;
    }
    if (devicesArray.length === 0) {
        resultsContainer.innerHTML = `<p>Logdatei enthält 0 Geräte.</p>`;
        return;
    }

    const mapping = loadMapping();
    const stats = [];

    for (const device of devicesArray) {
        if (!device || !device.id || !Array.isArray(device.rssiHistory)) continue;
        const rssiEvents = device.rssiHistory;
        const count = rssiEvents.length;
        let rssiSum = 0;
        let maxRssi = -Infinity;
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

    // V7: Header-Text setzen
    headerElement.innerHTML = `
        <p>
            Analyse von <strong>${devicesArray.length}</strong> Geräten abgeschlossen. 
            (Sortiert nach "Redseeligkeit". Klicken für Details.)
        </p>
    `;
    
    let htmlOutput = ""; // V7: Container leeren

    for (const device of stats) {
        const mappedName = mapping[device.id] || '';
        const displayName = mappedName ? mappedName : device.name;
        const isMappedClass = mappedName ? 'is-mapped' : '';
        
        // V7: Prüfen, ob diese Karte aktiv (aufgeklappt) sein soll
        const isActive = (device.id === activeCardId);
        const activeClass = isActive ? 'active' : '';
        const cardActiveClass = isActive ? 'details-active' : '';

        htmlOutput += `
            <div class="device-card ${cardActiveClass}" data-device-id="${device.id}">
                <!-- V7: Klickbarer Bereich, der die Details umschaltet -->
                <div class="card-clickable-area" role="button" tabindex="0" aria-expanded="${isActive}">
                    <div class="card-row">
                        <span class="card-label">Device ID:</span>
                        <span class="card-value mono">${device.id}</span>
                    </div>
                    <div class="card-row">
                        <span class="card-label">Bek. Name:</span>
                        <span class="card-value name ${isMappedClass}">
                            ${escapeHTML(displayName)}
                        </span>
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
                </div> <!-- Ende card-clickable-area -->

                <!-- V5: Mapping-Input-Zeile (nicht klickbar) -->
                <div class="card-row mapping-row">
                    <label for="map-${device.id}" class="card-label">Mapping (Ort):</label>
                    <input 
                        type="text" 
                        id="map-${device.id}" 
                        class="mapping-input"
                        data-beacon-id="${device.id}" 
                        value="${escapeHTML(mappedName)}"
                        placeholder="z.B. FTS Ladestation 1">
                </div>
                
                <!-- V7: Detail-Bereich (Lazy-Loaded) -->
                <div class="card-details ${activeClass}" id="details-${device.id}" data-is-loaded="${isActive}">
                    ${isActive ? loadCardDetails(device.id) : '<!-- Details werden bei Klick geladen -->'}
                </div>
            </div>
        `;
    }
    resultsContainer.innerHTML = htmlOutput;
}

/**
 * V7: Lädt den Inhalt für eine Detail-Karte (Adverts + Graph).
 * @param {string} deviceId - Die ID des Geräts, dessen Details geladen werden sollen.
 * @returns {string} - Der HTML-Inhalt für das Detail-Pane.
 */
function loadCardDetails(deviceId) {
    if (!currentLogData || !currentLogData.devices) return '<p class="error-message">Fehler: Log-Daten nicht gefunden.</p>';

    // Finde das volle Geräte-Objekt (mit rssiHistory und uniqueAdvertisements)
    const device = currentLogData.devices.find(d => d.id === deviceId);

    if (!device) return `<p class="error-message">Fehler: Gerät mit ID ${deviceId} nicht gefunden.</p>`;

    // Generiere die beiden Haupt-Inhaltsteile
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
 * V4: HTML-Escaping-Funktion (unverändert)
 */
function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[m]);
}

// --- V1/V2/V5/V6: Haupt-Event-Listener ---
document.addEventListener('DOMContentLoaded', () => {
    
    // V7: Alle UI-Elemente holen
    const fileInput = document.getElementById('jsonUpload');
    const outputElement = document.getElementById('output');
    const resultsElement = document.getElementById('analysis-results');
    const headerElement = document.getElementById('analysis-header'); // V7
    const saveButton = document.getElementById('saveMappingBtn');
    const clearButton = document.getElementById('clearMappingBtn');

    if (!fileInput || !outputElement || !resultsElement || !saveButton || !clearButton || !headerElement) {
        console.error("Kritischer Fehler: UI-Elemente wurden nicht im DOM gefunden.");
        return;
    }

    // V5: Listener für Speichern
    saveButton.addEventListener('click', () => {
        saveMapping(resultsElement, outputElement);
    });

    // V6: Listener für Löschen
    clearButton.addEventListener('click', () => {
        clearMapping(resultsElement, outputElement, headerElement);
    });
    
    // V7: Event-Delegation für Klicks auf die Karten
    resultsElement.addEventListener('click', (e) => {
        // Finde den klickbaren Bereich, der geklickt wurde
        const clickableArea = e.target.closest('.card-clickable-area');
        
        // Stopp, wenn der Klick *nicht* im klickbaren Bereich war
        // (z.B. auf das Mapping-Inputfeld oder den Rand)
        if (!clickableArea) return; 
        
        // Finde die übergeordnete Karte und die Detail-Elemente
        const card = clickableArea.closest('.device-card');
        if (!card) return;
        
        const deviceId = card.dataset.deviceId;
        const detailsPane = card.querySelector('.card-details');
        
        if (!deviceId || !detailsPane) return;

        // "Lazy Loading": Lade Details nur, wenn sie noch nicht geladen wurden
        if (detailsPane.dataset.isLoaded !== 'true') {
            outputElement.textContent += `\n[Info] Lade Details für ${deviceId}...`;
            detailsPane.innerHTML = loadCardDetails(deviceId);
            detailsPane.dataset.isLoaded = 'true';
            outputElement.textContent += ` Fertig.`;
            outputElement.scrollTop = outputElement.scrollHeight;
        }
        
        // V7: Toggle die 'active'-Klassen für die Sichtbarkeit
        detailsPane.classList.toggle('active');
        card.classList.toggle('details-active');
        clickableArea.setAttribute('aria-expanded', detailsPane.classList.contains('active'));
    });

    // V1: Listener für Datei-Upload
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) {
            outputElement.textContent = 'Dateiauswahl abgebrochen.';
            resultsElement.innerHTML = '<p>Bitte lade eine Logdatei, um die Analyse zu starten.</p>';
            headerElement.innerHTML = '';
            currentLogData = null;
            return;
        }

        outputElement.textContent = `Lese und parse Datei: ${file.name} ...`;
        resultsElement.innerHTML = `<p>Lese Datei ${file.name}...</p>`;
        headerElement.innerHTML = '';

        const reader = new FileReader();

        reader.onload = (e) => {
            const fileContent = e.target.result;
            try {
                currentLogData = JSON.parse(fileContent);
                if (typeof currentLogData === 'object' && currentLogData !== null && Array.isArray(currentLogData.devices)) {
                    outputElement.textContent = `Datei: ${file.name}\nStatus: Erfolgreich geparst.\nStruktur: Objekt mit ${currentLogData.devices.length} Geräten gefunden.\nStarte Analyse...`;
                    
                    // V7: Analysefunktion aufrufen
                    analyzeAndDisplay(currentLogData.devices, resultsElement, headerElement, null);

                    outputElement.textContent += "\nAnalyse abgeschlossen. Mapping geladen. Sortiert nach 'Anzahl Events'.";
                    outputElement.scrollTop = outputElement.scrollHeight;
                } else {
                    throw new Error("Die JSON-Datei hat nicht die erwartete Struktur. Ein 'devices'-Array (logData.devices) wurde nicht gefunden.");
                }
            } catch (error) {
                console.error('Fehler beim Parsen oder Validieren:', error);
                const errorMsg = `Fehler: ${error.message}`;
                outputElement.textContent = errorMsg;
                resultsElement.innerHTML = `<p class="error-message"><strong>Lade-Fehler:</strong><br>${escapeHTML(errorMsg)}</p>`;
                headerElement.innerHTML = '';
                currentLogData = null;
            }
        };

        reader.onerror = (e) => {
            console.error('Fehler beim Lesen der Datei:', e);
            const errorMsg = `Fehler: Die Datei konnte nicht gelesen werden. Details: ${e.message}`;
            outputElement.textContent = errorMsg;
            resultsElement.innerHTML = `<p class="error-message"><strong>Lade-Fehler:</strong><br>${escapeHTML(errorMsg)}</p>`;
            headerElement.innerHTML = '';
            currentLogData = null;
        };

        reader.readAsText(file);
    });
}); 
