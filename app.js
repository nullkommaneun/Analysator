// V2: Haupt-App-Logik (mit JSON-Parsing)

/**
 * ARCHITEKTUR-HINWEIS (V2):
 * Wir deklarieren eine Variable im Modul-Scope, um die geparsten
 * Daten zu speichern. Dies ist unser "State" (Zustand).
 * Spätere Analysefunktionen können auf diese Variable zugreifen.
 */
let currentLogData = null;

/**
 * ARCHITEKTUR-HINWEIS (Regel 1):
 * Wir warten auf 'DOMContentLoaded', um sicherzustellen, dass das DOM vollständig
 * geladen ist, bevor wir versuchen, auf Elemente zuzugreifen.
 */
document.addEventListener('DOMContentLoaded', () => {
    
    // V1-FIX: DOM-Elemente cachen
    const fileInput = document.getElementById('jsonUpload');
    const outputElement = document.getElementById('output');

    if (!fileInput || !outputElement) {
        // Defensivprogrammierung
        console.error("Kritischer Fehler: UI-Elemente (jsonUpload oder output) wurden nicht im DOM gefunden.");
        return;
    }

    /**
     * V1: Event-Listener für das 'change'-Ereignis am Dateieingabefeld.
     */
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];

        if (!file) {
            outputElement.textContent = 'Dateiauswahl abgebrochen.';
            currentLogData = null; // Zustand zurücksetzen
            return;
        }

        // V2: Status-Update angepasst
        outputElement.textContent = `Lese und parse Datei: ${file.name} ...`;

        const reader = new FileReader();

        /**
         * V2: Der 'onload'-Handler ist jetzt für das Parsen verantwortlich.
         */
        reader.onload = (e) => {
            const fileContent = e.target.result;

            /**
             * V2: JSON-Parsing.
             * ARCHITEKTUR-HINWEIS (Regel 1 & 2):
             * Wir *müssen* JSON.parse() in einen try...catch-Block einschließen.
             * Wenn der Benutzer eine Datei hochlädt, die kein gültiges JSON ist
             * (z.B. eine .txt oder .jpg Datei), würde die App sonst abstürzen.
             */
            try {
                /**
                 * PROAKTIVER HINWEIS (Regel 2: Performance):
                 * JSON.parse() ist eine synchrone, blockierende Operation.
                 * Bei einer 200MB-Logdatei *wird* dies die UI (den Browser-Tab) 
                 * für einige Sekunden einfrieren.
                 * Für V2 akzeptieren wir das, für V3/V4 müssen wir über Web Worker
                 * (parallele Threads im Browser) nachdenken, um das zu umgehen.
                 */
                currentLogData = JSON.parse(fileContent);

                // V2-Anforderung: Log in der Konsole (jetzt als Objekt).
                console.log('Datei erfolgreich geparst (Objekt):', currentLogData);

                // V2-Anforderung: Formatiertes JSON im <pre>-Element anzeigen.
                // JSON.stringify(value, replacer, space)
                // 'null' bedeutet, alle Eigenschaften werden verwendet.
                // '2' bedeutet, 2 Leerzeichen für die Einrückung (Pretty Print).
                // Dies bestätigt, dass wir gültige Daten verarbeitet haben.
                const formattedJson = JSON.stringify(currentLogData, null, 2);

                outputElement.textContent = formattedJson;

                // TODO (Nächster Schritt): Analysefunktion auf 'currentLogData' aufrufen.
                // analyzeData(currentLogData);

            } catch (error) {
                // V2: Fehlerbehandlung, falls das JSON ungültig ist.
                console.error('Fehler beim Parsen des JSON:', error);
                outputElement.textContent = `Fehler: Die Datei ist kein gültiges JSON.\n\nDetails: ${error.message}`;
                currentLogData = null; // Zustand zurücksetzen
            }
        };

        /**
         * V1: Fehlerbehandlung beim Lesen der Datei.
         */
        reader.onerror = (e) => {
            console.error('Fehler beim Lesen der Datei:', e);
            outputElement.textContent = `Fehler: Die Datei konnte nicht gelesen werden.\n\nDetails: ${e.message}`;
            currentLogData = null; // Zustand zurücksetzen
        };

        // V1: Startet den Lesevorgang.
        reader.readAsText(file);
    });
});

/**
 * V2: Platzhalter für zukünftige Analysefunktionen.
 * In V3 werden wir hier die Logik implementieren.
 *
 * function analyzeData(data) {
 * console.log('Analysiere Daten...', data);
 * }
 */
