// MagicMirror/modules/MMM-AlphaESS/MMM-AlphaESS.js
Module.register("MMM-AlphaESS", {
    // Defaults (unverändert)
    defaults: {
        appId: "", appSecret: "", sysSn: "",
        updateIntervalRealtime: 60 * 1000,       // Echtzeitdaten alle 60 Sekunden
        updateIntervalSummary: 10 * 60 * 1000,   // Tagesdaten alle 10 Minuten
        initialLoadDelay: 2000,
        useIcons: true,
        kwDecimalPlaces: 2, kwhDecimalPlaces: 1,
        socThresholdLow: 30, socThresholdHigh: 75,
        socThresholdMediumColor: "#fdd835", // Gelb
        socThresholdLowColor: "#FF5722",    // Rot-Orange
        socThresholdHighColor: "#8BC34A",   // Grün
    },

    // Data Store
    realtimeData: null,
    summaryData: null,
    loading: true,
    apiError: null,

    start: function() {
        Log.info(`[${this.name}] Module instance started.`);
        this.realtimeData = null; this.summaryData = null;
        this.loading = true; this.apiError = null;
        setTimeout(() => {
            Log.info(`[${this.name}] Sending CONFIG to node_helper after ${this.config.initialLoadDelay}ms delay.`);
            this.sendSocketNotification("CONFIG", this.config);
        }, this.config.initialLoadDelay);
    },

    socketNotificationReceived: function(notification, payload) {
        Log.info(`[${this.name}] Socket Notification Received: '${notification}'`);
        // Log.log(`[${this.name}] Payload received:`, JSON.stringify(payload, null, 2));

        if (notification === "DATA_RESULT") {
             // Erwartet jetzt { realtime: ..., summary: ... }
             if (payload && (payload.realtime || payload.summary)) {
                Log.log(`[${this.name}] Processing DATA_RESULT...`);
                this.loading = false;
                this.apiError = null; // Fehler löschen bei erfolgreichem Datenempfang
                // Speichere beide Teile, überschreibe nur, wenn nicht null empfangen wurde
                this.realtimeData = payload.realtime !== undefined ? payload.realtime : this.realtimeData;
                this.summaryData = payload.summary !== undefined ? payload.summary : this.summaryData;
                Log.log(`[${this.name}] Data updated (Realtime: ${!!this.realtimeData}, Summary: ${!!this.summaryData}). Calling updateDom().`);
                this.updateDom(300);
             } else {
                 // Empfangenes Payload war leer oder ungültig, warte auf nächstes Update
                 Log.warn(`[${this.name}] Received DATA_RESULT with invalid or empty payload.`);
             }
        } else if (notification === "API_ERROR") {
            Log.error(`[${this.name}] Processing API_ERROR: ${payload.message}`);
            this.loading = false; // Ladeanzeige stoppen
            this.apiError = payload.message || "Unbekannter API Fehler";
             // Bestehende Daten nicht löschen, nur Fehler anzeigen
            Log.log(`[${this.name}] API Error stored. Calling updateDom().`);
            this.updateDom(300);
        }
    },

    // getStyles, getApiErrorHint, getSocColor (unverändert)
    getStyles: function() { /*...*/ return ["MMM-AlphaESS.css", "font-awesome.css"]; },
    getApiErrorHint: function(errorMessage) { /*...*/ if (!errorMessage) return ""; const lowerCaseError = errorMessage.toLowerCase(); let hint = ""; if (lowerCaseError.includes("6007") || lowerCaseError.includes("sign verification error")) { hint = "Hinweis: Signatur ungültig. Überprüfe `appSecret` und `appId` in der config.js."; } else if (lowerCaseError.includes("6006") || lowerCaseError.includes("timestamp error")) { hint = "Hinweis: Zeitstempel ungültig. Überprüfe die Systemzeit des MagicMirror."; } else if (lowerCaseError.includes("6005") || lowerCaseError.includes("appid is not bound")) { hint = "Hinweis: `appId` ist nicht mit der `sysSn` verknüpft. Prüfe die Einstellungen im AlphaESS Portal."; } else if (lowerCaseError.includes("6002") || lowerCaseError.includes("sn is not bound")) { hint = "Hinweis: `sysSn` ist nicht mit deinem Account verknüpft oder falsch. Prüfe die `sysSn` in der config.js und im AlphaESS Portal."; } else if (lowerCaseError.includes("6001") || lowerCaseError.includes("parameter error")) { hint = "Hinweis: Problem mit Anfrageparametern (evtl. `sysSn`-Format falsch?)."; } else if (lowerCaseError.includes("6010") || lowerCaseError.includes("sign is empty")) { hint = "Hinweis: Signatur fehlt. Interner Fehler im Modul?"; } else if (lowerCaseError.includes("fetch") || lowerCaseError.includes("network") || lowerCaseError.includes("dns") || lowerCaseError.includes("timeout")) { hint = "Hinweis: Netzwerkfehler/Timeout. Prüfe die Internetverbindung und Firewall des MagicMirror. Erhöhe ggf. `updateInterval`."; } else if (lowerCaseError.includes("401") || lowerCaseError.includes("unauthorized")) { hint = "Hinweis: Authentifizierung fehlgeschlagen (oft Code 6007 oder 6005)."; } else if (lowerCaseError.includes("403") || lowerCaseError.includes("forbidden")) { hint = "Hinweis: Zugriff verboten (Berechtigungsproblem?)."; } else if (lowerCaseError.includes("429") || lowerCaseError.includes("too many requests")) { hint = "Hinweis: Zu viele Anfragen an die API gesendet (Rate Limit). Versuche das `updateInterval` zu erhöhen."; } else if (lowerCaseError.includes("node helper error")) { hint = "Hinweis: Internes Problem im Modul-Backend. Prüfe die Logs auf 'ERROR'."; } return hint;},
    getSocColor: function(soc) { /*...*/ if (soc === null || soc === undefined) return ''; const socNum = Number(soc); if (socNum <= this.config.socThresholdLow) { return this.config.socThresholdLowColor; } else if (socNum >= this.config.socThresholdHigh) { return this.config.socThresholdHighColor; } else { return this.config.socThresholdMediumColor; } },


    // getDom (Zeigt jetzt wieder alle gewünschten Daten an)
    getDom: function() {
        Log.log(`[${this.name}] getDom() CALLED.`);
        const wrapper = document.createElement("div");
        wrapper.className = "alphaess-wrapper";

        // 1. Config Check
        if (!this.config.appId || !this.config.appSecret || !this.config.sysSn) { wrapper.innerHTML = "Bitte konfiguriere `appId`, `appSecret` und `sysSn` für " + this.name + "."; wrapper.className = "dimmed light small alert"; return wrapper; }

        // 2. Loading Check (Prüft, ob *irgendwelche* Daten oder Fehler vorhanden sind)
        if (this.loading && !this.apiError && !this.realtimeData && !this.summaryData) {
            Log.log(`[${this.name}] getDom: Still loading (initial state)...`);
            wrapper.innerHTML = this.translate("LOADING");
            wrapper.className = "dimmed light small";
            return wrapper;
        }

        // 3. API Error Check
        if (this.apiError) {
            Log.log(`[${this.name}] getDom: Displaying API Error: ${this.apiError}`);
            const hint = this.getApiErrorHint(this.apiError);
            wrapper.innerHTML = `Fehler beim Abrufen:<br><span class="error-message">${this.apiError}</span>`;
            if (hint) { wrapper.innerHTML += `<br><span class="error-hint">${hint}</span>`; }
            wrapper.className = "dimmed light small error";
            return wrapper;
        }

        // 4. Display Data
        const rtData = this.realtimeData;
        const smData = this.summaryData;
        Log.log(`[${this.name}] getDom: Displaying data. Realtime data available: ${!!rtData}, Summary data available: ${!!smData}`);

        // Fallback, wenn noch keine Daten geladen wurden, aber kein Fehler vorliegt
        if (!rtData && !smData) {
            wrapper.innerHTML = "Warte auf Daten...";
            wrapper.className = "dimmed light small";
             Log.log(`[${this.name}] getDom: No error, not loading, but both rtData and smData are missing!`);
            return wrapper;
        }

        const kwDP = this.config.kwDecimalPlaces;
        const kwhDP = this.config.kwhDecimalPlaces;
        const dp = 1; // Für SOC %

        const table = document.createElement("table");
        table.className = "small alphaess-table";

        // Helper addRow (unverändert)
        const addRow = (iconClass, label, value, unit, { valueColor = '', precision = 1, baseValue = null } = {}) => { const displayValue = value; const checkValue = (baseValue !== null) ? baseValue : displayValue; if (checkValue === null || checkValue === undefined) { /* Log.log(`[${this.name}] Skipping row for ${label} due to missing value.`);*/ return; } const row = table.insertRow(); const iconCell = row.insertCell(); const labelCell = row.insertCell(); const valueCell = row.insertCell(); iconCell.className = "icon-cell"; labelCell.className = "label-cell"; valueCell.className = "value-cell"; if (this.config.useIcons && iconClass) { iconCell.innerHTML = `<i class="fas ${iconClass}"></i>`; } labelCell.innerHTML = `<span class="label-text">${label}</span>`; const formattedValue = (typeof displayValue === 'number') ? displayValue.toFixed(precision) : displayValue; valueCell.innerHTML = `<span class="value-text">${formattedValue} ${unit}</span>`; if (valueColor) { valueCell.style.color = valueColor; } };

        Log.log(`[${this.name}] getDom: Rendering table rows...`);
        // --- Akku Ladung (SOC) mit COLOR ---
        // Verwende optional chaining '?' für den Fall, dass rtData noch null ist
        const currentSOC = rtData?.soc;
        const socColor = this.getSocColor(currentSOC);
        addRow("fa-battery-full", "Akku:", currentSOC, "%", { valueColor: socColor, precision: dp, baseValue: currentSOC });

        // --- PV Erzeugung (Realtime kW) ---
        const currentPV = rtData?.ppv;
        const currentPV_kW = (currentPV === null || currentPV === undefined) ? null : currentPV / 1000;
        addRow("fa-solar-panel", "PV Aktuell:", currentPV_kW, "kW", { precision: kwDP });

        // --- Hausverbrauch (Realtime kW) ---
        const currentLoad = rtData?.pload;
        const currentLoad_kW = (currentLoad === null || currentLoad === undefined) ? null : currentLoad / 1000;
        addRow("fa-home", "Verbrauch Aktuell:", currentLoad_kW, "kW", { precision: kwDP });

        // --- Tagesproduktion (kWh) ---
        // Verwende optional chaining '?' für den Fall, dass smData noch null ist
        const todayProd = smData?.epvtoday;
        addRow("fa-chart-bar", "Tagesproduktion:", todayProd, "kWh", { precision: kwhDP });

        // --- Tagesverbrauch (kWh) ---
        const todayLoad = smData?.eload;
        addRow("fa-plug", "Tagesverbrauch:", todayLoad, "kWh", { precision: kwhDP });


        wrapper.appendChild(table);
        Log.log(`[${this.name}] getDom: Table rendered and returning wrapper.`);
        return wrapper;
    },
});
// !!!!! Loggen am Ende der Datei !!!!!
Log.info("<<<<< MMM-AlphaESS.js: FILE PARSED (v2) >>>>>");