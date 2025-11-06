// V5: Haupt-App-Logik (Responsive "Card"-Layout & localStorage-Mapping)

// V2: Globaler "State"
let currentLogData = null;

/**
 * ARCHITEKTUR-HINWEIS (V5):
 * Wir definieren den localStorage-Key als Konstante,
 * um Tippfehler zu vermeiden (Regel 1).
 */
const MAPPING_STORAGE_KEY = 'beaconbay-mapping';


/**
 * V5: Lädt das ID->Name Mapping aus dem localStorage.
 * @returns {object} Ein Objekt, das Beacon-IDs auf lesbare Namen abbildet.
 */
function loadMapping() {
    try {
        const mappingJson = localStorage.getItem(MAPPING_STORAGE_KEY);
        if (mappingJson) {
            // Erfolgreich geladen
            return JSON.parse(mappingJson);
        }
    } catch (error) {
        // Fehlerbehandlung, falls das JSON im localStorage korrupt ist
        console.error("Fehler beim Parsen des Mappings aus localStorage:", error);
        localStorage.removeItem(MAPPING_STORAGE_KEY); // Korrupte Daten entfernen
    }
    // Standard-Rückgabewert (leeres Objekt)
    return {};
}

/**
 * V5: Speichert das aktuelle Mapping aus den Input-Feldern im localStorage.
 * @param {HTMLElement} resultsContainer - Das DOM-Element, das die Karten enthält.
 * @param {HTMLElement} outputElement - Das Debug-Fenster für Statusmeldungen.
 */
function saveMapping(resultsContainer, outputElement) {
    const newMapping = {};
    
    // Finde alle Input-Felder im Analyse-Ergebnisbereich
    const inputs = resultsContainer.querySelectorAll('.mapping-input');
    
    let savedCount = 0;
    
    // Iteriere über alle Input-Felder
    for (const input of inputs) {
        // V5-ARCHITEKTUR: Wir nutzen 'data-beacon-id', das wir beim
        // Rendern gesetzt haben, um die ID zu holen.
        const beaconId = input.dataset.beaconId;
        const mappedName = input.value.trim(); // Leerzeichen entfernen

        // Speichere nur, wenn ein Name eingegeben wurde
        if (beaconId && mappedName) {
            newMapping[beaconId] = mappedName;
            savedCount++;
        }
    }

    // Speichere das neue Mapping-Objekt als JSON-String
    try {
        localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(newMapping));
        
        // Erfolgsmeldung im Status-Log
        const logMsg = `[${new Date().toLocaleTimeString()}] Mapping erfolgreich gespeichert. ${savedCount} Einträge gesichert.`;
        console.log(logMsg);
        outputElement.textContent += `\n${logMsg}`;
        // Scrolle das Log nach unten
        outputElement.scrollTop = outputElement.scrollHeight;

    } catch (error) {
        // Fehlerbehandlung (z.B. wenn localStorage voll ist)
        console.error("Fehler beim Speichern des Mappings im localStorage:", error);
        const logMsg = `[FEHLER] Mapping konnte nicht gespeichert werden: ${error.message}`;
        outputElement.textContent += `\n${logMsg}`;
        outputElement.scrollTop = outputElement.scrollHeight;
    }
}


/**
 * V5: Haupt-Analysefunktion (ersetzt V4 'analyzeAndDisplay')
 * Analysiert das 'devices'-Array und zeigt die Daten als "Cards" an.
 *
 * @param {Array<object>} devicesArray - Das 'devices'-Array (currentLogData.devices)
 * @param {HTMLElement} resultsContainer - Das DOM-Element, in das geschrieben wird.
 */
function analyzeAndDisplay(devicesArray, resultsContainer) {
    // V4: Validierung
    if (!Array.isArray(devicesArray)) {
        console.error("Analyse-Fehler: Es wurde kein 'devices'-Array übergeben.", devicesArray);
        resultsContainer.innerHTML = `<p class="error-message"><strong>Analyse-Fehler:</strong><br>Datenstruktur ungültig.</p>`;
        return;
    }
    if (devicesArray.length === 0) {
        resultsContainer.innerHTML = `<p>Logdatei enthält 0 Geräte.</p>`;
        return;
    }

    // V5: Gespeichertes Mapping laden, *bevor* wir die Karten generieren
    const mapping = loadMapping();

    // V4: Statistiken sammeln (Logik unverändert)
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
        } else {
            maxRssi = null;
        }
        const avgRssi = (count > 0) ? (rssiSum / count).toFixed(2) : null;

        stats.push({
            id: device.id,
            name: device.name || "[Unbenannt]",
            count: count,
            avgRssi: avgRssi,
            maxRssi: maxRssi
        });
    }

    // V4: Sortieren nach bestem RSSI (unverändert)
    stats.sort((a, b) => (b.maxRssi ?? -Infinity) - (a.maxRssi ?? -Infinity));

    // V5-REFACTOR: HTML-String für "Cards" generieren (statt <table>)
    let htmlOutput = `
        <p style="background: none; padding: 0 0 10px 0;">
            Analyse von <strong>${devicesArray.length}</strong> Geräten abgeschlossen. 
            (Sortiert nach bestem Signal)
        </p>
    `;

    for (const device of stats) {
        // V5: Hole den gemappten Namen aus dem geladenen Mapping
        const mappedName = mapping[device.id] || '';

        htmlOutput += `
            <div class="device-card">
                <div class="card-row">
                    <span class="card-label">Device ID:</span>
                    <span class="card-value mono">${device.id}</span>
                </div>
                <div class="card-row">
                    <span class="card-label">Bek. Name:</span>
                    <span class="card-value name">${escapeHTML(device.name)}</span>
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
                <!-- V5: Mapping-Input-Zeile -->
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
            </div>
        `;
    }

    resultsContainer.innerHTML = htmlOutput;
}

/**
 * V4: HTML-Escaping-Funktion (unverändert)
 */
function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// V1/V2: Haupt-Event-Listener
document.addEventListener('DOMContentLoaded', () => {
    
    // V5: Alle UI-Elemente holen
    const fileInput = document.getElementById('jsonUpload');
    const outputElement = document.getElementById('output');
    const resultsElement = document.getElementById('analysis-results');
    const saveButton = document.getElementById('saveMappingBtn');

    if (!fileInput || !outputElement || !resultsElement || !saveButton) {
        console.error("Kritischer Fehler: UI-Elemente wurden nicht im DOM gefunden.");
        if(outputElement) outputElement.textContent = "UI-Initialisierungsfehler.";
        return;
    }

    // V5: Event-Listener für den Speicher-Button
    saveButton.addEventListener('click', () => {
        saveMapping(resultsElement, outputElement);
    });

    // V1: Event-Listener für Datei-Upload
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) {
            outputElement.textContent = 'Dateiauswahl abgebrochen.';
            resultsElement.innerHTML = '<p>Bitte lade eine Logdatei, um die Analyse zu starten.</p>';
            currentLogData = null;
            return;
        }

        outputElement.textContent = `Lese und parse Datei: ${file.name} ...`;
        resultsElement.innerHTML = `<p>Lese Datei ${file.name}...</p>`;

        const reader = new FileReader();

        reader.onload = (e) => {
            const fileContent = e.target.result;

            try {
                // V2: Parsen
                currentLogData = JSON.parse(fileContent);

                // V4: Struktur validieren
                if (typeof currentLogData === 'object' && currentLogData !== null && Array.isArray(currentLogData.devices)) {
                    
                    outputElement.textContent = `Datei: ${file.name}\nStatus: Erfolgreich geparst.\nStruktur: Objekt mit ${currentLogData.devices.length} Geräten gefunden.\nStarte Analyse...`;

                    // V5: Analysefunktion aufrufen
                    analyzeAndDisplay(currentLogData.devices, resultsElement);

                    outputElement.textContent += "\nAnalyse abgeschlossen. Mapping aus localStorage geladen.";

                } else {
                    throw new Error("Die JSON-Datei hat nicht die erwartete Struktur. Ein 'devices'-Array (logData.devices) wurde nicht gefunden.");
                }

            } catch (error) {
                // V4: Fehlerbehandlung
                console.error('Fehler beim Parsen oder Validieren:', error);
                const errorMsg = `Fehler: ${error.message}`;
                outputElement.textContent = errorMsg;
                resultsElement.innerHTML = `<p class="error-message"><strong>Lade-Fehler:</strong><br>${escapeHTML(errorMsg)}</p>`;
                currentLogData = null;
            }
        };

        reader.onerror = (e) => {
            // V1: Fehlerbehandlung
            console.error('Fehler beim Lesen der Datei:', e);
            const errorMsg = `Fehler: Die Datei konnte nicht gelesen werden. Details: ${e.message}`;
            outputElement.textContent = errorMsg;
            resultsElement.innerHTML = `<p class="error-message"><strong>Lade-Fehler:</strong><br>${escapeHTML(errorMsg)}</p>`;
            currentLogData = null;
        };

        reader.readAsText(file);
    });
}); 
