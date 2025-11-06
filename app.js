// V4: Haupt-App-Logik (Statistik-Analyse)

// V2: Globaler "State"
let currentLogData = null;

/**
 * V4: Haupt-Analysefunktion (ersetzt V3 'displayAnalysis')
 * Analysiert das 'devices'-Array und zeigt Statistiken in einer Tabelle an.
 *
 * @param {Array<object>} devicesArray - Das 'devices'-Array aus dem JSON (currentLogData.devices)
 * @param {HTMLElement} resultsContainer - Das DOM-Element, in das geschrieben wird.
 */
function analyzeAndDisplay(devicesArray, resultsContainer) {
    // V3-FIX (angepasst an V4):
    // Wir prüfen jetzt, ob wir das 'devices'-Array (logData.devices) erhalten haben.
    if (!Array.isArray(devicesArray)) {
        // Dieser Fall sollte durch die Prüfung in 'onload' bereits abgefangen werden,
        // aber doppelte Sicherheit (defensive Programmierung) ist gut.
        console.error("Analyse-Fehler: Es wurde kein 'devices'-Array übergeben.", devicesArray);
        resultsContainer.innerHTML = `
            <p class="error-message">
                <strong>Analyse-Fehler:</strong><br>
                Die Datenstruktur ist ungültig. Konnte 'devices'-Array nicht finden.
            </p>`;
        return;
    }
    
    if (devicesArray.length === 0) {
        resultsContainer.innerHTML = `<p>Logdatei enthält 0 Geräte. Nichts zu analysieren.</p>`;
        return;
    }

    // ARCHITEKTUR-HINWEIS (V4):
    // Wir iterieren nicht mehr über Scan-Events, sondern über Geräte.
    // Jedes Gerät enthält bereits sein eigenes 'rssiHistory'-Array.
    // Wir sammeln die Statistiken, die wir in V4 anzeigen wollen.
    const stats = [];
    
    for (const device of devicesArray) {
        // Defensivprogrammierung: Überspringe ungültige Geräteeinträge
        if (!device || !device.id || !Array.isArray(device.rssiHistory)) {
            console.warn("Ungültiger Geräteeintrag im Log übersprungen:", device);
            continue;
        }

        const rssiEvents = device.rssiHistory;
        const count = rssiEvents.length;

        let rssiSum = 0;
        let maxRssi = -Infinity; // Startwert für 'Maximum finden'

        if (count > 0) {
            for (const event of rssiEvents) {
                // V4-FIX: Stellen sicher, dass 'r' (rssi) eine Zahl ist
                if (typeof event.r === 'number') {
                    rssiSum += event.r;
                    if (event.r > maxRssi) {
                        maxRssi = event.r;
                    }
                }
            }
        } else {
            maxRssi = null; // Kein Max-Wert, wenn keine Events da sind
        }

        // V4: Durchschnitts-RSSI berechnen (und durch 0-Teilung verhindern)
        const avgRssi = (count > 0) ? (rssiSum / count).toFixed(2) : null;

        // V4: Statistik-Objekt für dieses Gerät sammeln
        stats.push({
            id: device.id,
            name: device.name || "[Unbenannt]",
            count: count,
            avgRssi: avgRssi,
            maxRssi: maxRssi
        });
    }

    // V4: Sortieren der Ergebnisse
    // ARCHITEKTUR-HINWEIS (Regel 1):
    // Wir sortieren die Tabelle. Ein guter Standard ist, nach der
    // maximalen Signalstärke (maxRssi) absteigend zu sortieren.
    // Geräte, die dem Scanner am nächsten kamen (höchster RSSI),
    // sind für die Kartierung am wichtigsten.
    stats.sort((a, b) => {
        // V4-FIX: Umgang mit 'null' Werten (Geräte ohne Scans)
        const rssiA = a.maxRssi ?? -Infinity;
        const rssiB = b.maxRssi ?? -Infinity;
        return rssiB - rssiA; // Absteigend (von -50 (nah) zu -90 (fern))
    });


    // V4: HTML-Tabelle generieren
    let htmlOutput = `
        <p>Analyse von <strong>${devicesArray.length}</strong> Geräten abgeschlossen.</p>
        <table class="stats-table">
            <thead>
                <tr>
                    <th>Device ID (Anonym)</th>
                    <th>Bekannter Name</th>
                    <th>Scan-Events (Anzahl)</th>
                    <th>Avg. RSSI (dBm)</th>
                    <th>Max RSSI (Nächster Wert)</th>
                </tr>
            </thead>
            <tbody>
    `;

    for (const device of stats) {
        htmlOutput += `
            <tr>
                <td>${device.id}</td>
                <td>${escapeHTML(device.name)}</td> <!-- V4-FIX: Namen escapen (Regel 2) -->
                <td>${device.count}</td>
                <td>${device.avgRssi ?? 'N/A'}</td>
                <td>${device.maxRssi ?? 'N/A'}</td>
            </tr>
        `;
    }

    htmlOutput += `
            </tbody>
        </table>
    `;

    resultsContainer.innerHTML = htmlOutput;
}

/**
 * V4-HINZUGEFÜGT (Regel 2: Proaktives Mitdenken):
 * Wir müssen Gerätenamen "escapen", bevor wir sie als HTML einfügen.
 * Wenn ein Beacon einen Namen wie "<script>alert('XSS')</script>" sendet,
 * würde das sonst unseren Analysator kompromittieren (XSS-Angriff).
 *
 * @param {string} str - Der potenziell unsichere String.
 * @returns {string} - Der HTML-gesicherte String.
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
    
    // V3: DOM-Elemente cachen
    const fileInput = document.getElementById('jsonUpload');
    const outputElement = document.getElementById('output');
    const resultsElement = document.getElementById('analysis-results');

    if (!fileInput || !outputElement || !resultsElement) {
        console.error("Kritischer Fehler: UI-Elemente wurden nicht im DOM gefunden.");
        if(outputElement) outputElement.textContent = "UI-Initialisierungsfehler.";
        return;
    }

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
                // V2: Parsen (blockierend)
                currentLogData = JSON.parse(fileContent);

                // V4-FIX (Bugfix):
                // Wir prüfen die neue, korrekte Struktur (Objekt mit 'devices'-Array)
                if (typeof currentLogData === 'object' && currentLogData !== null && Array.isArray(currentLogData.devices)) {
                    
                    outputElement.textContent = `Datei: ${file.name}\nStatus: Erfolgreich geparst.\nStruktur: Objekt mit ${currentLogData.devices.length} Geräten gefunden.\nStarte Analyse...`;

                    // V4: Rufe die Analysefunktion mit dem 'devices'-Array auf
                    analyzeAndDisplay(currentLogData.devices, resultsElement);

                    outputElement.textContent += "\nAnalyse abgeschlossen.";

                } else {
                    // V4-FIX: Die Datei ist gültiges JSON, aber nicht, was wir erwarten.
                    throw new Error("Die JSON-Datei hat nicht die erwartete Struktur. Ein 'devices'-Array (logData.devices) wurde nicht gefunden.");
                }

            } catch (error) {
                // V2/V3: Fehlerbehandlung (ungültiges JSON oder V4-Strukturfehler)
                console.error('Fehler beim Parsen oder Validieren der Struktur:', error);
                const errorMsg = `Fehler: ${error.message}`;
                
                outputElement.textContent = errorMsg;
                resultsElement.innerHTML = `<p class="error-message"><strong>Lade-Fehler:</strong><br>${escapeHTML(errorMsg)}</p>`;
                
                currentLogData = null;
            }
        };

        reader.onerror = (e) => {
            // V1: Fehlerbehandlung (Lesefehler)
            console.error('Fehler beim Lesen der Datei:', e);
            const errorMsg = `Fehler: Die Datei konnte nicht gelesen werden.\n\nDetails: ${e.message}`;
            
            outputElement.textContent = errorMsg;
            resultsElement.innerHTML = `<p class="error-message"><strong>Lade-Fehler:</strong><br>${escapeHTML(errorMsg)}</p>`;
            
            currentLogData = null;
        };

        reader.readAsText(file);
    });
}); 
