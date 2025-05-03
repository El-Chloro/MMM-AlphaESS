// MagicMirror/modules/MMM-AlphaESS/node_helper.js
/* global require, module, console, setTimeout, clearTimeout */
const NodeHelper = require("node_helper");
let fetch; // Wird dynamisch importiert
const crypto = require("crypto");

console.log("<<<<< MMM-AlphaESS node_helper.js: LOADING FILE >>>>>");

module.exports = NodeHelper.create({
	start: async function() {
		console.log("<<<<< MMM-AlphaESS node_helper: start() function CALLED >>>>>");
		this.config = null;
		this.realtimeData = null; // Speicher für Echtzeitdaten
		this.summaryData = null;  // Speicher für Tages-Summen
		this.fetchRealtimeTimer = null;
		this.fetchSummaryTimer = null; // Timer für Summen
		this.fetchRealtimeInProgress = false;
		this.fetchSummaryInProgress = false; // Flag für Summen
		this.lastApiError = null;

		console.log("[MMM-AlphaESS node_helper] Attempting to dynamically import node-fetch...");
		try {
			// Prüft, ob fetch schon importiert wurde (bei Neustarts möglich)
			if (!fetch) {
				 fetch = (await import('node-fetch')).default;
				 console.log("[MMM-AlphaESS node_helper] SUCCESS: node-fetch imported dynamically.");
			} else {
				 console.log("[MMM-AlphaESS node_helper] INFO: node-fetch was already imported.");
			}
		} catch (err) {
			console.error("<<<<< MMM-AlphaESS node_helper: CRITICAL ERROR importing node-fetch! >>>>>", err);
			// Speichert den Fehler, um ihn zu senden, sobald die Verbindung zum Frontend steht
			this.lastApiError = "Node Helper Error: node-fetch konnte nicht geladen werden. Prüfe Logs.";
		}
		console.log("[MMM-AlphaESS node_helper] start() function finished.");
	},

	stop: function() {
		console.log("<<<<< MMM-AlphaESS node_helper: stop() function CALLED >>>>>");
		clearTimeout(this.fetchRealtimeTimer);
		clearTimeout(this.fetchSummaryTimer); // Auch Summary Timer stoppen
		this.fetchRealtimeInProgress = false;
		this.fetchSummaryInProgress = false;
	},

	// Verarbeitet Nachrichten vom Frontend (MMM-AlphaESS.js)
	socketNotificationReceived: function(notification, payload) {
		console.log(`<<<<< MMM-AlphaESS node_helper: socketNotificationReceived CALLED - Notification: ${notification} >>>>>`);
		// console.log("[MMM-AlphaESS node_helper] Payload received:", JSON.stringify(payload, null, 2)); // Optional: Payload loggen

		if (notification === "CONFIG" && payload) {
			console.log("[MMM-AlphaESS node_helper] CONFIG notification received. Processing...");
			this.config = payload;
			// Setzt Intervalle aus der Konfiguration oder Standardwerte
			this.config.updateIntervalRealtime = Math.max(this.config.updateIntervalRealtime || 60 * 1000, 30000); // Min 30s
			this.config.updateIntervalSummary = Math.max(this.config.updateIntervalSummary || 10 * 60 * 1000, 60000); // Min 60s

			// Prüft, ob 'fetch' erfolgreich importiert wurde
			if (!fetch) {
				 console.error("[MMM-AlphaESS node_helper] ERROR: fetch not available when processing CONFIG.");
				 this.sendErrorToFrontend("Node Helper Error: fetch nicht verfügbar.");
				 return; // Bricht ab, wenn fetch fehlt
			}

			console.log(`[MMM-AlphaESS node_helper] Config processed. Realtime Interval: ${this.config.updateIntervalRealtime}, Summary Interval: ${this.config.updateIntervalSummary}`);
			// Startet die Abruf-Zeitpläne für beide Datentypen
			this.scheduleRealtimeUpdate();
			this.scheduleSummaryUpdate(); // Startet auch den Summary-Abruf
		} else {
			 console.log(`[MMM-AlphaESS node_helper] Notification '${notification}' ignored or payload missing.`);
		}
	},

	// Sendet die gesammelten Daten an das Frontend
	sendDataToFrontend: function() {
		// Sendet nur, wenn mindestens ein Datensatz vorhanden ist
		if (this.realtimeData || this.summaryData) {
			console.log("[MMM-AlphaESS node_helper] Preparing to send DATA_RESULT to frontend.");
			// Sendet immer beide Teile, auch wenn einer null ist
			this.sendSocketNotification("DATA_RESULT", {
				realtime: this.realtimeData,
				summary: this.summaryData
			});
			 console.log("[MMM-AlphaESS node_helper] DATA_RESULT sent.");
			 // Löscht den letzten Fehler, wenn Daten erfolgreich gesendet wurden
			 if(this.realtimeData && this.summaryData) { this.lastApiError = null; }

		} else if (this.lastApiError) {
			 // Sendet den letzten Fehler, wenn keine Daten vorhanden sind
			 this.sendErrorToFrontend(this.lastApiError);
		} else {
			 console.log("[MMM-AlphaESS node_helper] No data and no error to send.");
		}
	},

	 // Sendet eine Fehlermeldung ans Frontend
	 sendErrorToFrontend: function(errorMessage) {
		// Verhindert das wiederholte Senden des exakt gleichen Fehlers
		if (this.lastApiError !== errorMessage) {
			 console.error("[MMM-AlphaESS node_helper] Storing and preparing to send API_ERROR:", errorMessage);
			 this.lastApiError = errorMessage; // Speichert den aktuellen Fehler
			 this.sendSocketNotification("API_ERROR", { message: errorMessage });
			 console.log("[MMM-AlphaESS node_helper] API_ERROR notification sent.");
		} else {
			console.log("[MMM-AlphaESS node_helper] Skipping send API_ERROR (same as last).");
		}
	 },

	// Plant den nächsten Abruf für Echtzeitdaten
	scheduleRealtimeUpdate: function() {
		console.log("[MMM-AlphaESS node_helper] scheduleRealtimeUpdate CALLED.");
		clearTimeout(this.fetchRealtimeTimer); // Löscht alten Timer
		this.fetchRealtimeTimer = null;
		if (this.fetchRealtimeInProgress) { console.log("[MMM-AlphaESS node_helper] Realtime fetch already in progress, skipping."); return; } // Verhindert Überlappung
		console.log("[MMM-AlphaESS node_helper] Calling fetchRealtimeData.");
		this.fetchRealtimeData(); // Führt Abruf sofort aus
		// Setzt neuen Timer für den nächsten Abruf
		this.fetchRealtimeTimer = setTimeout(() => { this.scheduleRealtimeUpdate(); }, this.config.updateIntervalRealtime);
	},

	// Plant den nächsten Abruf für Summen-Daten
	 scheduleSummaryUpdate: function() {
		console.log("[MMM-AlphaESS node_helper] scheduleSummaryUpdate CALLED.");
		clearTimeout(this.fetchSummaryTimer); // Löscht alten Timer
		this.fetchSummaryTimer = null;
		if (this.fetchSummaryInProgress) { console.log("[MMM-AlphaESS node_helper] Summary fetch already in progress, skipping."); return; } // Verhindert Überlappung
		console.log("[MMM-AlphaESS node_helper] Calling fetchSummaryData.");
		this.fetchSummaryData(); // Führt Abruf sofort aus
		console.log("[MMM-AlphaESS node_helper] Scheduling next summary update in " + this.config.updateIntervalSummary + "ms");
		// Setzt neuen Timer für den nächsten Abruf
		this.fetchSummaryTimer = setTimeout(() => { this.scheduleSummaryUpdate(); }, this.config.updateIntervalSummary);
	},

	// Generische Funktion zum Abrufen von Daten von der API
	fetchApi: async function(endpointUrl, queryParams = {}) {
		 // Prüft auf vollständige Konfiguration und Verfügbarkeit von fetch
		 if (!this.config || !this.config.appId || !this.config.appSecret || !this.config.sysSn) { throw new Error("Konfiguration unvollständig (fetchApi)."); }
		 if (!fetch) { throw new Error("fetch ist nicht verfügbar (fetchApi)."); }

		 // Authentifizierungsdaten vorbereiten
		 const appId = this.config.appId;
		 const appSecret = this.config.appSecret;
		 const sysSn = this.config.sysSn;
		 const timeStamp = Math.floor(Date.now() / 1000);
		 const stringToSign = `${appId}${appSecret}${timeStamp}`;
		 const sign = crypto.createHash('sha512').update(stringToSign).digest('hex'); // SHA512 Signatur

		 // URL und Header zusammenbauen
		 queryParams.sysSn = queryParams.sysSn || sysSn; // Fügt sysSn hinzu, falls nicht vorhanden
		 const queryString = new URLSearchParams(queryParams).toString();
		 const fullUrl = `${endpointUrl}?${queryString}`;
		 const headers = { 'appId': appId, 'timeStamp': timeStamp.toString(), 'sign': sign };

		 // API-Aufruf durchführen
		 console.log(`[MMM-AlphaESS node_helper] Fetching API: ${endpointUrl.split('/').pop()} for SN: ${sysSn}`);
		 const response = await fetch(fullUrl, { method: 'GET', headers: headers, timeout: 20000 }); // 20 Sekunden Timeout
		 console.log(`[MMM-AlphaESS node_helper] API Response Status (${endpointUrl.split('/').pop()}): ${response.status} ${response.statusText}`);

		 // Fehlerbehandlung für die Antwort
		 if (!response.ok) { // Prüft auf HTTP-Fehler (z.B. 4xx, 5xx)
			 const errorBody = await response.text();
			 console.error(`[MMM-AlphaESS node_helper] API request failed (${endpointUrl.split('/').pop()}) Status ${response.status}. Body: ${errorBody}`);
			 throw new Error(`API Fehler (${response.status}, ${endpointUrl.split('/').pop()}): ${errorBody || response.statusText}`);
		 }

		 const data = await response.json(); // Antwort als JSON parsen

		 // Prüft auf anwendungsspezifische Fehler im JSON (Code != 200)
		 if (data.code !== 200) {
			 console.error(`[MMM-AlphaESS node_helper] API returned error code ${data.code}: ${data.msg} (${endpointUrl.split('/').pop()})`);
			 throw new Error(`API meldet Fehler (${data.code}, ${endpointUrl.split('/').pop()}): ${data.msg}`);
		 }

		 console.log(`[MMM-AlphaESS node_helper] API call successful (${endpointUrl.split('/').pop()})`);
		 return data.data; // Gibt den 'data'-Teil der API-Antwort zurück
	},

	// Ruft die Echtzeitdaten ab
	fetchRealtimeData: async function() {
		console.log("[MMM-AlphaESS node_helper] fetchRealtimeData CALLED.");
		if (this.fetchRealtimeInProgress) { return; } // Verhindert parallele Ausführung
		console.log("[MMM-AlphaESS node_helper] fetchRealtimeData: Setting fetchInProgress = true.");
		this.fetchRealtimeInProgress = true;
		try {
			console.log("[MMM-AlphaESS node_helper] fetchRealtimeData: Calling fetchApi for getLastPowerData...");
			const data = await this.fetchApi('https://openapi.alphaess.com/api/getLastPowerData'); // Ruft generische Funktion
			console.log("[MMM-AlphaESS node_helper] fetchRealtimeData: API call successful. Storing data.");
			this.realtimeData = data; // Speichert die Daten
			this.sendDataToFrontend(); // Sendet Update ans Frontend
		} catch (error) {
			console.error("[MMM-AlphaESS node_helper] fetchRealtimeData: ERROR during fetch:", error.message);
			this.sendErrorToFrontend(error.message); // Sendet Fehler ans Frontend
		} finally {
			// Wird immer ausgeführt, setzt Flag zurück
			console.log("[MMM-AlphaESS node_helper] fetchRealtimeData: FINALLY block. Setting fetchInProgress = false.");
			this.fetchRealtimeInProgress = false;
		}
	},

	// Ruft die Summen-Daten ab
	fetchSummaryData: async function() {
		console.log("[MMM-AlphaESS node_helper] fetchSummaryData CALLED.");
		if (this.fetchSummaryInProgress) { return; } // Verhindert parallele Ausführung
		console.log("[MMM-AlphaESS node_helper] fetchSummaryData: Setting fetchInProgress = true.");
		this.fetchSummaryInProgress = true;
		try {
			console.log("[MMM-AlphaESS node_helper] fetchSummaryData: Calling fetchApi for getSumDataForCustomer...");
			const data = await this.fetchApi('https://openapi.alphaess.com/api/getSumDataForCustomer'); // Ruft generische Funktion
			console.log("[MMM-AlphaESS node_helper] fetchSummaryData: API call successful. Storing data.");
			this.summaryData = data; // Speichert die Daten
			this.sendDataToFrontend(); // Sendet Update ans Frontend
		} catch (error) {
			console.error("[MMM-AlphaESS node_helper] fetchSummaryData: ERROR during fetch:", error.message);
			this.sendErrorToFrontend(error.message); // Sendet Fehler ans Frontend
		} finally {
			// Wird immer ausgeführt, setzt Flag zurück
			console.log("[MMM-AlphaESS node_helper] fetchSummaryData: FINALLY block. Setting fetchInProgress = false.");
			this.fetchSummaryInProgress = false;
		}
	},
});

// Loggt, wenn die Node Helper Datei erfolgreich geparsed wurde
console.log("<<<<< MMM-AlphaESS node_helper.js: FILE PARSED >>>>>");