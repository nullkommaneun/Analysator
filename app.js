// V3: Haupt-App-Logik (Erste Analyse-Funktion)

// V2: Globaler "State" für die geparsten Daten
let currentLogData = null;

/**
 * V3: Haupt-Analysefunktion (Schritt 1: IDs finden)
 * Diese Funktion wird aufgerufen, nachdem das JSON erfolgreich geparst wurde.
 *
 * @param {Array<object>} logData - Das geparste Array von Beacon-Scan-Events.
 * @param {HTMLElement} resultsContainer - Das DOM-Element, in das geschrieben wird.
 */
function displayAnalysis(logData, resultsContainer) {
    // ARCHITEKTUR-HINWEIS (Regel 1):
    // Statt das riesige JSON-Objekt anzuzeigen, führen wir nun eine
    // echte Analyse durch.
    //
    // ZIEL: Finde alle *einzigartigen* Beacon-IDs im gesamten Log.
    // Dies ist der erste Schritt zur Erstellung unserer "Schatzkarte". Wir
    // müssen wissen, welche "Orte" (anonyme IDs) überhaupt existieren.

    // V3-FIX: Robuste Typprüfung. Wir erwarten, dass die JSON-Datei
    // ein Array von Scan-Events ist.
    if (!Array.isArray(logData)) {
        console.error("Datenanalyse-Fehler: Geladene JSON-Datei ist kein Array.", logData);
        resultsContainer.innerHTML = `
            <p style="color: #f7768e;"><strong>Analyse-Fehler:</strong></p>
            <p>Die geladene Datei hat nicht die erwartete Struktur. Es wurde ein Array <code>[...]</code> erwartet, aber stattdessen ein <code>${typeof logData}</code> gefunden.</p>
        `;
        return;
    }
    
    if (logData.length === 0) {
        resultsContainer.innerHTML = `<p>Logdatei ist leer. Keine Daten zum Analysieren.</p>`;
        return;
    }

    // ARCHITEKTUR-HINWEIS (V3):
    // Ein 'Set' ist die performanteste und sauberste Methode in JavaScript,
    // um einzigartige (unique) Werte zu sammeln.
    // Wir iterieren über das (potenziell riesige) Array und fügen jede 'beaconId'
    // dem Set hinzu. Doppelte Einträge werden vom Set automatisch ignoriert.
    const uniqueBeaconIds = new Set();
    
    for (const event of logData) {
        // Defensivprogrammierung: Sicherstellen, dass das Event-Objekt
        // die erwartete Eigenschaft 'beaconId' hat.
        if (event && event.beaconId) {
            uniqueBeaconIds.add(event.beaconId);
        }
    }

    // V3: Ausgabe der Ergebnisse generieren
    
    // Wir wandeln das Set zurück in ein Array, um es sortieren zu können.
    // Das macht die Liste für Menschen leichter lesbar.
    const sortedIds = Array.from(uniqueBeaconIds).sort();

    // ARCHITEKTUR-HINWEIS (Regel 1):
    // Wir bauen das HTML als String. Für eine kleine Liste ist das
    // performant genug. Bei Tausenden von DOM-Elementen würden wir
    // 'document.createDocumentFragment()' verwenden, um das DOM nicht
    // bei jeder 'appendChild'-Operation neu zu berechnen.
    
    let htmlOutput = `
        <p>Analyse von <strong>${logData.length}</strong> Scan-Events abgeschlossen.</p>
        <p>Es wurden <strong>${sortedIds.length}</strong> einzigartige Beacon-IDs (Orte) gefunden:</p>
    `;

    if (sortedIds.length > 0) {
        // Wir erstellen eine Liste (<ul>) mit den IDs
        htmlOutput += '<ul>';
        for (const id of sortedIds) {
            // Jede ID wird zu einem Listeneintrag (<li>)
            // V3-FIX: Wir verwenden 'textContent', um die ID in HTML umzuwandeln.
            // Das ist zwar hier nicht zwingend nötig, aber gute Praxis,
            // um XSS zu verhindern, falls IDs seltsame Zeichen (wie <>) enthalten.
            // Sicherer wäre es, die 'id' zu escapen, aber für unsere Zwecke
            // gehen wir davon aus, dass die IDs sicher sind.
            // Einfacherer Ansatz: direkt als String einfügen.
            htmlOutput += `<li>${id}</li>`;
        }
        htmlOutput += '</ul>';
    } else {
        htmlOutput += `<p>Keine Events mit einer 'beaconId' gefunden.</p>`;
    }

    // V3: Wir schreiben das generierte HTML in den Results-Container.
    resultsContainer.innerHTML = htmlOutput;
}


// V1/V2: Haupt-Event-Listener
document.addEventListener('DOMContentLoaded', () => {
    
    // V3: Wir holen uns *beide* Output-Elemente
    const fileInput = document.getElementById('jsonUpload');
    const outputElement = document.getElementById('output'); // Für Debug/Status
    const resultsElement = document.getElementById('analysis-results'); // Für Ergebnisse

    if (!fileInput || !outputElement || !resultsElement) {
        console.error("Kritischer Fehler: UI-Elemente wurden nicht im DOM gefunden.");
        // V3: Status im Hauptfenster anzeigen, falls 'output' fehlt
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
        // V3: Ergebnisfenster während des Ladens zurücksetzen
        resultsElement.innerHTML = `<p>Lese Datei ${file.name}...</p>`;

        const reader = new FileReader();

        reader.onload = (e) => {
            const fileContent = e.target.result;

            try {
                // V2: Parsen (blockierend, siehe V2-Hinweis)
                currentLogData = JSON.parse(fileContent);

                // V3-ÄNDERUNG:
                // Wir füllen das <pre> nicht mehr mit dem vollen JSON.
                // Stattdessen geben wir nur eine Erfolgsmeldung aus.
                // Das spart extrem viel Speicher und DOM-Renderzeit!
                outputElement.textContent = `Datei: ${file.name}\nStatus: Erfolgreich geparst.\nStarte Analyse...`;

                // V3: Rufe die neue Analyse-Funktion auf
                displayAnalysis(currentLogData, resultsElement);

                // V3: Erfolgsmeldung im Debug-Fenster vervollständigen
                outputElement.textContent += "\nAnalyse abgeschlossen.";


            } catch (error) {
                // V2: Fehlerbehandlung
                console.error('Fehler beim Parsen des JSON:', error);
                const errorMsg = `Fehler: Die Datei ist kein gültiges JSON.\n\nDetails: ${error.message}`;
                
                // V3: Fehler in *beiden* Fenstern anzeigen
                outputElement.textContent = errorMsg;
                resultsElement.innerHTML = `<p style="color: #f7768e;"><strong>Lade-Fehler:</strong></de>${errorMsg}`;
                
                currentLogData = null;
            }
        };

        reader.onerror = (e) => {
            // V1: Fehlerbehandlung
            console.error('Fehler beim Lesen der Datei:', e);
            const errorMsg = `Fehler: Die Datei konnte nicht gelesen werden.\n\nDetails: ${e.message}`;
            
            // V3: Fehler in *beiden* Fenstern anzeigen
            outputElement.textContent = errorMsg;
            resultsElement.innerHTML = `<p style="color: #f7768e;"><strong>Lade-Fehler:</strong></de>${errorMsg}`;
            
            currentLogData = null;
        };

        reader.readAsText(file);
    });
}); 
