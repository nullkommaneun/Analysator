// V1: Haupt-App-Logik, ausgelagert aus der index.html

/**
 * ARCHITEKTUR-HINWEIS (Regel 1):
 * Wir verwenden 'DOMContentLoaded', um sicherzustellen, dass das Skript erst dann
 * ausgeführt wird, wenn das gesamte HTML-Dokument geladen und geparst wurde.
 * Das 'defer'-Attribut im <script>-Tag der HTML-Datei arbeitet gut damit zusammen.
 */
document.addEventListener('DOMContentLoaded', () => {
    
    // V1-FIX: Wir "cachen" die DOM-Elemente in Konstanten.
    const fileInput = document.getElementById('jsonUpload');
    const outputElement = document.getElementById('output');

    if (!fileInput || !outputElement) {
        // Wichtige Defensivprogrammierung: Sicherstellen, dass die Elemente existieren.
        console.error("Kritischer Fehler: UI-Elemente (jsonUpload oder output) wurden nicht im DOM gefunden.");
        return;
    }

    /**
     * V1: Event-Listener für das 'change'-Ereignis am Dateieingabefeld.
     */
    fileInput.addEventListener('change', (event) => {
        // 'event.target.files' ist eine FileList. Wir nehmen die erste Datei (Index 0).
        const file = event.target.files[0];

        if (!file) {
            // Fall: Benutzer bricht den Dialog ab.
            outputElement.textContent = 'Dateiauswahl abgebrochen.';
            return;
        }

        // Status für den Benutzer aktualisieren
        outputElement.textContent = `Lese Datei: ${file.name} ...`;

        /**
         * ARCHITEKTUR-HINWEIS (Regel 2: Proaktives Mitdenken):
         * Wir verwenden die asynchrone 'FileReader' API. Dies ist *entscheidend*,
         * um das Einfrieren der UI bei großen Logdateien zu verhindern.
         */
        const reader = new FileReader();

        /**
         * V1: 'onload' ist der Callback, der ausgeführt wird, wenn das Lesen
         * erfolgreich abgeschlossen wurde.
         */
        reader.onload = (e) => {
            // e.target.result enthält den Textinhalt der Datei.
            const fileContent = e.target.result;

            // V1-Anforderung: Log in der Konsole.
            console.log('JSON-Datei erfolgreich geladen (Rohdaten):', fileContent);

            // V1-Anforderung: Anzeige im <pre>-Element.
            outputElement.textContent = fileContent;
        };

        /**
         * V1-FIX: Fehlerbehandlung ist kein Luxus, sondern notwendig.
         */
        reader.onerror = (e) => {
            console.error('Fehler beim Lesen der Datei:', e);
            outputElement.textContent = `Fehler: Die Datei konnte nicht gelesen werden.\n\nDetails: ${e.message}`;
        };

        // V1: Startet den Lesevorgang.
        reader.readAsText(file);
    });
}); 
