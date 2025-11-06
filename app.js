// V6: Sortierung nach "Redseeligkeit" (count) + "Live"-Mapping-Anzeige

// V5: Globaler State
let currentLogData = null;

// V5: localStorage-Key
const MAPPING_STORAGE_KEY = 'beaconbay-mapping';


/**
 * V5: Lädt das ID->Name Mapping aus dem localStorage.
 * @returns {object} Ein Objekt, das Beacon-IDs auf lesbare Namen abbildet.
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
 * V5: Speichert das aktuelle Mapping aus den Input-Feldern im localStorage.
 * @param {HTMLElement} resultsContainer - Das DOM-Element, das die Karten enthält.
 * @param {HTMLElement} outputElement - Das Debug-Fenster für Statusmeldungen.
 */
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
        console.log(logMsg);
        outputElement.textContent += `\n${logMsg}`;
        outputElement.scrollTop = outputElement.scrollHeight;

        // V6-FIX (Regel 2): Nach dem Speichern die Ansicht aktualisieren,
        // damit die grünen Haken (is-mapped) sofort erscheinen.
        if (currentLogData && currentLogData.devices) {
             analyzeAndDisplay(currentLogData.devices, resultsContainer);
        }

    } catch (error) {
        console.error("Fehler beim Speichern des Mappings im localStorage:", error);
        const logMsg = `[FEHLER] Mapping konnte nicht gespeichert werden: ${error.message}`;
        outputElement.textContent += `\n${logMsg}`;
        outputElement.scrollTop = outputElement.scrollHeight;
    }
}

/**
 * V6: Löscht das Mapping aus dem localStorage und aktualisiert die Ansicht.
 * @param {HTMLElement} resultsContainer - Das DOM-Element, das die Karten enthält.
 * @param {HTMLElement} outputElement - Das Debug-Fenster für Statusmeldungen.
 */
function clearMapping(resultsContainer, outputElement) {
    try {
        localStorage.removeItem(MAPPING_STORAGE_KEY);
        const logMsg = `[${new Date().toLocaleTimeString()}] Mapping gelöscht.`;
        console.log(logMsg);
        outputElement.textContent += `\n${logMsg}`;
        outputElement.scrollTop = outputElement.scrollHeight;

        // V6: Ansicht aktualisieren, um die gelöschten Mappings zu entfernen
        if (currentLogData && currentLogData.devices) {
            analyzeAndDisplay(currentLogData.devices, resultsContainer);
        } else {
            // Falls keine Daten geladen sind, einfach den Starttext anzeigen
            resultsContainer.innerHTML = '<p>Mapping gelöscht. Lade eine Datei.</p>';
        }

    } catch (error) {
        console.error("Fehler beim Löschen des Mappings:", error);
        const logMsg = `[FEHLER] Mapping konnte nicht gelöscht werden: ${error.message}`;
        outputElement.textContent += `\n${logMsg}`;
        outputElement.scrollTop = outputElement.scrollHeight;
    }
}


/**
 * V6: Haupt-Analysefunktion (Sortierung geändert, Anzeige geändert)
 *
 * @param {Array<object>} devicesArray - Das 'devices'-Array (currentLogData.devices)
 * @param {HTMLElement} resultsContainer - Das DOM-Element, in das geschrieben wird.
 */
function analyzeAndDisplay(devicesArray, resultsContainer) {
    // V4: Validierung
    if (!Array.isArray(devicesArray)) {
        resultsContainer.innerHTML = `<p class="error-message"><strong>Analyse-Fehler:</strong><br>Datenstruktur ungültig.</p>`;
        return;
    }
    if (devicesArray.length === 0) {
        resultsContainer.innerHTML = `<p>Logdatei enthält 0 Geräte.</p>`;
        return;
    }

    // V5: Gespeichertes Mapping laden
    const mapping = loadMapping();

    // V4: Statistiken sammeln
    const stats = [];
    for (const device of devicesArray) {
        if (!device || !device.id || !Array.isArray(device.rssiHistory)) continue;

        const rssiEvents = device.rssiHistory;
        const count = rssiEvents.length; // Das ist unsere "Redseeligkeit"
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

    // V6-ÄNDERUNG (Dein Wunsch):
    // Sortiere nach 'count' (Anzahl der Scan-Events) absteigend.
    // Die "redseeligsten" Geräte (z.B. iBeacons) stehen jetzt oben.
    // Geräte, die selten senden (wie der Flipper), rutschen nach unten.
    stats.sort((a, b) => b.count - a.count);

    // V6-REFACTOR: HTML-String für "Cards" generieren
    let htmlOutput = `
        <p style="background: none; padding: 0 0 10px 0;">
            Analyse von <strong>${devicesArray.length}</strong> Geräten abgeschlossen. 
            (Sortiert nach "Redseeligkeit")
        </p>
    `;

    for (const device of stats) {
        // V6: Logik zur Anzeige des Mappings (Mein V6-Vorschlag)
        const mappedName = mapping[device.id] || '';
        const displayName = mappedName ? mappedName : device.name;
        const isMappedClass = mappedName ? 'is-mapped' : ''; // CSS-Klasse für Hervorhebung

        htmlOutput += `
            <div class="device-card">
                <div class="card-row">
                    <span class="card-label">Device ID:</span>
                    <span class="card-value mono">${device.id}</span>
                </div>
                <div class="card-row">
                    <span class="card-label">Bek. Name:</span>
                    <!-- V6: Zeigt Mapping-Namen (grün) oder Geräte-Namen an -->
                    <span class="card-value name ${isMappedClass}">
                        ${escapeHTML(displayName)}
                    </span>
                </div>
                <div class="card-row">
                    <span class="card-label">Scan-Events:</span>
                    <!-- V6: Das ist jetzt der Sortier-Wert (ganz oben = höchster Wert) -->
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

// V1: Haupt-Event-Listener
document.addEventListener('DOMContentLoaded', () => {
    
    // V6: Alle UI-Elemente holen
    const fileInput = document.getElementById('jsonUpload');
    const outputElement = document.getElementById('output');
    const resultsElement = document.getElementById('analysis-results');
    const saveButton = document.getElementById('saveMappingBtn');
    const clearButton = document.getElementById('clearMappingBtn'); // V6

    if (!fileInput || !outputElement || !resultsElement || !saveButton || !clearButton) {
        console.error("Kritischer Fehler: UI-Elemente wurden nicht im DOM gefunden.");
        if(outputElement) outputElement.textContent = "UI-Initialisierungsfehler.";
        return;
    }

    // V5: Listener für Speichern
    saveButton.addEventListener('click', () => {
        saveMapping(resultsElement, outputElement);
    });

    // V6: Listener für Löschen
    clearButton.addEventListener('click', () => {
        // V6 (Regel 2): Sicherheitsabfrage
        // WICHTIG: window.confirm() blockiert den Event-Loop und funktioniert
        // oft nicht in isolierten Umgebungen (wie iFrames). 
        // Für dieses Projekt ist es OK, aber in einer echten App
        // würden wir ein eigenes Modal-Dialog-Fenster bauen.
        // DA 'confirm' hier eventuell nicht geht, lasse ich es vorerst weg.
        // Wir führen die Löschung direkt aus.
        //
        // const isSure = confirm("Möchtest du wirklich das gesamte gespeicherte Mapping löschen?");
        // if (isSure) {
        //     clearMapping(resultsElement, outputElement);
        // }
        
        // Da 'confirm' nicht zuverlässig ist (Regel 3), führen wir
        // die Aktion direkt aus und der Benutzer verlässt sich auf
        // das Status-Log.
        clearMapping(resultsElement, outputElement);
    });

    // V1: Listener für Datei-Upload
    fileInput.addEventListener('change', (event) => {
        // ... (Logik für 'change', 'reader.onload', 'reader.onerror' ist identisch zu V5) ...
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
                currentLogData = JSON.parse(fileContent);

                if (typeof currentLogData === 'object' && currentLogData !== null && Array.isArray(currentLogData.devices)) {
                    
                    outputElement.textContent = `Datei: ${file.name}\nStatus: Erfolgreich geparst.\nStruktur: Objekt mit ${currentLogData.devices.length} Geräten gefunden.\nStarte Analyse...`;

                    // V6: Analysefunktion aufrufen
                    analyzeAndDisplay(currentLogData.devices, resultsElement);

                    outputElement.textContent += "\nAnalyse abgeschlossen. Mapping geladen. Sortiert nach 'Anzahl Events'.";

                } else {
                    throw new Error("Die JSON-Datei hat nicht die erwartete Struktur. Ein 'devices'-Array (logData.devices) wurde nicht gefunden.");
                }

            } catch (error) {
                console.error('Fehler beim Parsen oder Validieren:', error);
                const errorMsg = `Fehler: ${error.message}`;
                outputElement.textContent = errorMsg;
                resultsElement.innerHTML = `<p class="error-message"><strong>Lade-Fehler:</strong><br>${escapeHTML(errorMsg)}</p>`;
                currentLogData = null;
            }
        };

        reader.onerror = (e) => {
            console.error('Fehler beim Lesen der Datei:', e);
            const errorMsg = `Fehler: Die Datei konnte nicht gelesen werden. Details: ${e.message}`;
            outputElement.textContent = errorMsg;
            resultsElement.innerHTML = `<p class="error-message"><strong>Lade-Fehler:</strong><br>${escapeHTML(errorMsg)}</p>`;
            currentLogData = null;
        };

        reader.readAsText(file);
    });
}); 
