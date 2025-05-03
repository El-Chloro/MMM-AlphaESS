// MagicMirror/modules/MMM-AlphaESS/MMM-AlphaESS.js
/* global Module, Log */

Module.register("MMM-AlphaESS", {
	// Defaults erweitert um alle Optionen
	defaults: {
		appId: "", // Muss in config.js gesetzt werden
		appSecret: "", // Muss in config.js gesetzt werden
		sysSn: "", // Muss in config.js gesetzt werden
		// Intervalle
		updateIntervalRealtime: 60 * 1000,       // Echtzeitdaten (SOC, W) alle 60 Sekunden
		updateIntervalSummary: 10 * 60 * 1000,   // Tagesdaten (kWh) alle 10 Minuten
		initialLoadDelay: 2000,                 // Startverzögerung
		// Darstellung
		useIcons: true,
		kwDecimalPlaces: 2,     // Dezimalstellen für kW
		kwhDecimalPlaces: 1,    // Dezimalstellen für kWh
		// SOC Farben
		socThresholdLow: 30,
		socThresholdHigh: 75,
		socThresholdMediumColor: "#fdd835", // Gelb (mittlerer SOC)
		socThresholdLowColor: "#FF5722",    // Rot-Orange (niedriger SOC)
		socThresholdHighColor: "#8BC34A",   // Grün (hoher SOC)
		// Tagesverbrauch Farben
		loadColorHighConsumption: "#FFEB3B", // Gelb (Verbrauch > Produktion)
		loadColorNormalConsumption: "#8BC34A", // Grün (Verbrauch <= Produktion)
	},

	// Modulinterne Speicher
	realtimeData: null,
	summaryData: null,
	loading: true,
	apiError: null,

	// Startfunktion des Moduls
	start: function() {
		Log.info(`[${this.name}] Module instance started.`);
		this.realtimeData = null;
		this.summaryData = null;
		this.loading = true;
		this.apiError = null;

		// Sendet die Konfiguration nach einer kurzen Verzögerung an den Node Helper
		setTimeout(() => {
			Log.info(`[${this.name}] Sending CONFIG to node_helper after ${this.config.initialLoadDelay}ms delay.`);
			this.sendSocketNotification("CONFIG", this.config);
		}, this.config.initialLoadDelay);
	},

	// Empfängt Nachrichten vom Node Helper
	socketNotificationReceived: function(notification, payload) {
		Log.info(`[${this.name}] Socket Notification Received: '${notification}'`);
		// Log.log(`[${this.name}] Payload received:`, JSON.stringify(payload, null, 2)); // Detailliertes Payload-Logging (optional)

		if (notification === "DATA_RESULT") {
			// Verarbeitet das kombinierte Datenpaket
			if (payload && (payload.realtime || payload.summary)) {
				Log.log(`[${this.name}] Processing DATA_RESULT...`);
				this.loading = false;
				this.apiError = null; // Fehler löschen bei erfolgreichem Datenempfang
				// Speichert Echtzeit- und Summen-Daten (überschreibt nur, wenn neue Daten vorhanden)
				this.realtimeData = payload.realtime !== undefined ? payload.realtime : this.realtimeData;
				this.summaryData = payload.summary !== undefined ? payload.summary : this.summaryData;
				Log.log(`[${this.name}] Data updated (Realtime: ${!!this.realtimeData}, Summary: ${!!this.summaryData}). Calling updateDom().`);
				this.updateDom(300); // Aktualisiert die Anzeige mit leichter Verzögerung
			} else {
				Log.warn(`[${this.name}] Received DATA_RESULT with invalid or empty payload.`);
			}
		} else if (notification === "API_ERROR") {
			// Verarbeitet Fehlermeldungen
			Log.error(`[${this.name}] Processing API_ERROR: ${payload.message}`);
			this.loading = false; // Stoppt die Ladeanzeige
			this.apiError = payload.message || "Unbekannter API Fehler";
			Log.log(`[${this.name}] API Error stored. Calling updateDom().`);
			this.updateDom(300); // Aktualisiert die Anzeige, um den Fehler darzustellen
		}
	},

	// Lädt die benötigten Stylesheets
	getStyles: function() {
		return ["MMM-AlphaESS.css", "font-awesome.css"]; // Font Awesome für Icons
	},

	// Generiert einen Hinweis basierend auf der Fehlermeldung
	getApiErrorHint: function(errorMessage) {
		if (!errorMessage) { return ""; }
		const lowerCaseError = errorMessage.toLowerCase();
		let hint = "";
		// Hier werden bekannte Fehlermuster geprüft und Hinweise generiert
		if (lowerCaseError.includes("6007") || lowerCaseError.includes("sign verification error")) { hint = "Hinweis: Signatur ungültig. Überprüfe `appSecret` und `appId` in der config.js."; }
		else if (lowerCaseError.includes("6006") || lowerCaseError.includes("timestamp error")) { hint = "Hinweis: Zeitstempel ungültig. Überprüfe die Systemzeit des MagicMirror."; }
		else if (lowerCaseError.includes("6005") || lowerCaseError.includes("appid is not bound")) { hint = "Hinweis: `appId` ist nicht mit der `sysSn` verknüpft. Prüfe die Einstellungen im AlphaESS Portal."; }
		else if (lowerCaseError.includes("6002") || lowerCaseError.includes("sn is not bound")) { hint = "Hinweis: `sysSn` ist nicht mit deinem Account verknüpft oder falsch. Prüfe die `sysSn` in der config.js und im AlphaESS Portal."; }
		else if (lowerCaseError.includes("6001") || lowerCaseError.includes("parameter error")) { hint = "Hinweis: Problem mit Anfrageparametern (evtl. `sysSn`-Format falsch?)."; }
		else if (lowerCaseError.includes("6010") || lowerCaseError.includes("sign is empty")) { hint = "Hinweis: Signatur fehlt. Interner Fehler im Modul?"; }
		else if (lowerCaseError.includes("fetch") || lowerCaseError.includes("network") || lowerCaseError.includes("dns") || lowerCaseError.includes("timeout")) { hint = "Hinweis: Netzwerkfehler/Timeout. Prüfe die Internetverbindung und Firewall des MagicMirror. Erhöhe ggf. `updateInterval`."; }
		else if (lowerCaseError.includes("401") || lowerCaseError.includes("unauthorized")) { hint = "Hinweis: Authentifizierung fehlgeschlagen (oft Code 6007 oder 6005)."; }
		else if (lowerCaseError.includes("403") || lowerCaseError.includes("forbidden")) { hint = "Hinweis: Zugriff verboten (Berechtigungsproblem?)."; }
		else if (lowerCaseError.includes("429") || lowerCaseError.includes("too many requests")) { hint = "Hinweis: Zu viele Anfragen an die API gesendet (Rate Limit). Versuche das `updateInterval` zu erhöhen."; }
		else if (lowerCaseError.includes("node helper error")) { hint = "Hinweis: Internes Problem im Modul-Backend. Prüfe die Logs auf 'ERROR'."; }
		return hint;
	},

	// Gibt die Farbe für den SOC-Wert zurück
	getSocColor: function(soc) {
		if (soc === null || soc === undefined) { return ''; } // Keine Farbe ohne Wert
		const socNum = Number(soc);
		if (socNum <= this.config.socThresholdLow) {
			return this.config.socThresholdLowColor; // Rot
		} else if (socNum >= this.config.socThresholdHigh) {
			return this.config.socThresholdHighColor; // Grün
		} else {
			return this.config.socThresholdMediumColor; // Gelb (Standard)
		}
	},

	// Erzeugt das HTML für die Anzeige des Moduls
	getDom: function() {
		Log.log(`[${this.name}] getDom() CALLED.`);
		const wrapper = document.createElement("div");
		wrapper.className = "alphaess-wrapper";

		// 1. Prüfung der Konfiguration
		if (!this.config.appId || !this.config.appSecret || !this.config.sysSn) {
			wrapper.innerHTML = "Bitte konfiguriere `appId`, `appSecret` und `sysSn` für " + this.name + ".";
			wrapper.className = "dimmed light small alert"; // Fehlermeldung anzeigen
			return wrapper;
		}

		// 2. Prüfung des Ladezustands
		if (this.loading && !this.apiError && !this.realtimeData && !this.summaryData) {
			Log.log(`[${this.name}] getDom: Displaying LOADING...`);
			wrapper.innerHTML = this.translate("LOADING"); // Zeigt "Lädt..." an
			wrapper.className = "dimmed light small";
			return wrapper;
		}

		// 3. Prüfung auf API-Fehler
		if (this.apiError) {
			Log.log(`[${this.name}] getDom: Displaying API Error: ${this.apiError}`);
			const hint = this.getApiErrorHint(this.apiError); // Holt den passenden Hinweis
			wrapper.innerHTML = `Fehler beim Abrufen:<br><span class="error-message">${this.apiError}</span>`;
			if (hint) {
				wrapper.innerHTML += `<br><span class="error-hint">${hint}</span>`; // Fügt Hinweis hinzu
			}
			wrapper.className = "dimmed light small error"; // Fehlerformatierung
			return wrapper;
		}

		// 4. Datenanzeige, wenn Daten vorhanden sind
		const rtData = this.realtimeData;
		const smData = this.summaryData;
		Log.log(`[${this.name}] getDom: Rendering data. Realtime: ${!!rtData}, Summary: ${!!smData}`);

		// Fallback, falls noch keine Daten empfangen wurden (sollte nach Ladephase nicht passieren, außer bei Startproblemen)
		if (!rtData && !smData) {
			wrapper.innerHTML = "Warte auf Daten...";
			wrapper.className = "dimmed light small";
			Log.log(`[${this.name}] getDom: No error, not loading, but data is missing!`);
			return wrapper;
		}

		// Formatierungsparameter
		const kwDP = this.config.kwDecimalPlaces;
		const kwhDP = this.config.kwhDecimalPlaces;
		const socDP = 1; // Dezimalstellen für SOC (%)

		// Erstellt die Tabelle zur Anzeige
		const table = document.createElement("table");
		table.className = "alphaess-table"; // CSS-Klasse für Styling (ohne 'small')

		// Hilfsfunktion zum Hinzufügen einer Tabellenzeile
		const addRow = (iconClass, label, value, unit, options = {}) => {
			const { valueColor = '', precision = 1, baseValue = null } = options;
			const displayValue = value;
			const checkValue = (baseValue !== null) ? baseValue : displayValue;

			// Zeile nur hinzufügen, wenn ein Wert vorhanden ist
			if (checkValue === null || checkValue === undefined) {
				// Log.log(`[${this.name}] Skipping row for ${label} due to missing value.`);
				return;
			}

			const row = table.insertRow();
			const iconCell = row.insertCell();
			const labelCell = row.insertCell();
			const valueCell = row.insertCell();
			iconCell.className = "icon-cell";
			labelCell.className = "label-cell";
			valueCell.className = "value-cell";

			// Icon hinzufügen (wenn aktiviert)
			if (this.config.useIcons && iconClass) {
				iconCell.innerHTML = `<i class="fas ${iconClass}"></i>`;
			}
			// Label hinzufügen
			labelCell.innerHTML = `<span class="label-text">${label}</span>`;
			// Wert formatieren und hinzufügen
			const formattedValue = (typeof displayValue === 'number') ? displayValue.toFixed(precision) : displayValue;
			valueCell.innerHTML = `<span class="value-text">${formattedValue} ${unit}</span>`;
			// Farbe für den Wert setzen (wenn angegeben)
			if (valueColor) {
				valueCell.style.color = valueColor;
			}
		};

		Log.log(`[${this.name}] getDom: Rendering table rows...`);

		// --- Akku Ladung (SOC) mit Farbe ---
		// Optional Chaining '?' nutzen, falls rtData noch nicht vollständig geladen ist
		const currentSOC = rtData?.soc;
		const socColor = this.getSocColor(currentSOC);
		addRow("fa-battery-full", "Akku:", currentSOC, "%", { valueColor: socColor, precision: socDP, baseValue: currentSOC });

		// --- PV Erzeugung (Echtzeit kW) ---
		const currentPV = rtData?.ppv;
		const currentPV_kW = (currentPV === null || currentPV === undefined) ? null : currentPV / 1000;
		addRow("fa-solar-panel", "PV Aktuell:", currentPV_kW, "kW", { precision: kwDP });

		// --- Hausverbrauch (Echtzeit kW) ---
		const currentLoad = rtData?.pload;
		const currentLoad_kW = (currentLoad === null || currentLoad === undefined) ? null : currentLoad / 1000;
		addRow("fa-home", "Verbrauch Aktuell:", currentLoad_kW, "kW", { precision: kwDP });

		// --- Tagesproduktion (kWh) ---
		// Optional Chaining '?' nutzen, falls smData noch nicht vollständig geladen ist
		const todayProd = smData?.epvtoday;
		addRow("fa-chart-bar", "Tagesproduktion:", todayProd, "kWh", { precision: kwhDP });

		// --- Tagesverbrauch (kWh) mit Farbe ---
		const todayLoad = smData?.eload;
		let loadColor = ''; // Standardfarbe (aus CSS)
		// Prüft, ob beide Werte für den Vergleich vorhanden sind
		if (todayLoad !== null && todayLoad !== undefined && todayProd !== null && todayProd !== undefined) {
			if (Number(todayLoad) > Number(todayProd)) {
				loadColor = this.config.loadColorHighConsumption; // Gelb
			} else {
				loadColor = this.config.loadColorNormalConsumption; // Grün
			}
		}
		addRow("fa-plug", "Tagesverbrauch:", todayLoad, "kWh", { valueColor: loadColor, precision: kwhDP });

		// Wrapper das fertige HTML-Element übergeben
		wrapper.appendChild(table);
		Log.log(`[${this.name}] getDom: Table rendered and returning wrapper.`);
		return wrapper;
	},
});

// Loggt, wenn die JS-Datei vom Browser geparsed wurde
Log.info("<<<<< MMM-AlphaESS.js: FILE PARSED >>>>>");