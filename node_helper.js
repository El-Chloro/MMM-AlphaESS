// MagicMirror/modules/MMM-AlphaESS/node_helper.js
const NodeHelper = require("node_helper");
let fetch; // Wird dynamisch importiert
const crypto = require("crypto");

// !!!!! Logging beim Laden !!!!!
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
            if (!fetch) {
                 fetch = (await import('node-fetch')).default;
                 console.log("[MMM-AlphaESS node_helper] SUCCESS: node-fetch imported dynamically.");
            } else {
                 console.log("[MMM-AlphaESS node_helper] INFO: node-fetch was already imported.");
            }
        } catch (err) {
            console.error("<<<<< MMM-AlphaESS node_helper: CRITICAL ERROR importing node-fetch! >>>>>", err);
            this.lastApiError = "Node Helper Error: node-fetch konnte nicht geladen werden. Prüfe Logs.";
        }
        console.log("[MMM-AlphaESS node_helper] start() function finished.");
    },

    stop: function() {
        console.log("<<<<< MMM-AlphaESS node_helper: stop() function CALLED >>>>>");
        clearTimeout(this.fetchRealtimeTimer);
        clearTimeout(this.fetchSummaryTimer); // Summary Timer auch löschen
        this.fetchRealtimeInProgress = false;
        this.fetchSummaryInProgress = false;
    },

    socketNotificationReceived: function(notification, payload) {
        console.log(`<<<<< MMM-AlphaESS node_helper: socketNotificationReceived CALLED - Notification: ${notification} >>>>>`);
        // console.log("[MMM-AlphaESS node_helper] Payload received:", JSON.stringify(payload, null, 2));

        if (notification === "CONFIG" && payload) {
            console.log("[MMM-AlphaESS node_helper] CONFIG notification received. Processing...");
            this.config = payload;
            // Intervalle aus Config oder Defaults nehmen
            this.config.updateIntervalRealtime = Math.max(this.config.updateIntervalRealtime || 60 * 1000, 30000);
            this.config.updateIntervalSummary = Math.max(this.config.updateIntervalSummary || 10 * 60 * 1000, 60000); // Summary Intervall

            if (!fetch) {
                 console.error("[MMM-AlphaESS node_helper] ERROR: fetch not available when processing CONFIG.");
                 this.sendErrorToFrontend("Node Helper Error: fetch nicht verfügbar.");
                 return;
            }

            console.log(`[MMM-AlphaESS node_helper] Config processed. Realtime Interval: ${this.config.updateIntervalRealtime}, Summary Interval: ${this.config.updateIntervalSummary}`);
            // Beide Update-Schleifen starten
            this.scheduleRealtimeUpdate();
            this.scheduleSummaryUpdate(); // !!!!! Summary wieder aktiviert !!!!!
        } else {
             console.log(`[MMM-AlphaESS node_helper] Notification '${notification}' ignored or payload missing.`);
        }
    },

    // --- Kombinierte Daten senden ---
    sendDataToFrontend: function() {
        // Nur senden, wenn überhaupt Daten vorhanden sind (verhindert leere Updates)
        if (this.realtimeData || this.summaryData) {
            console.log("[MMM-AlphaESS node_helper] Preparing to send DATA_RESULT to frontend.");
            // Sende immer beide Teile, auch wenn einer davon null ist
            this.sendSocketNotification("DATA_RESULT", {
                realtime: this.realtimeData,
                summary: this.summaryData
            });
             console.log("[MMM-AlphaESS node_helper] DATA_RESULT sent.");
             // Fehler zurücksetzen, da wir erfolgreich Daten (oder zumindest einen Teil) gesendet haben
             // this.lastApiError = null; // Optional: Fehler erst löschen, wenn *beide* erfolgreich waren? Vorerst bei Teilerfolg löschen.
             if(this.realtimeData && this.summaryData) this.lastApiError = null;

        } else if (this.lastApiError) {
             // Nur senden, wenn keine Daten vorhanden sind, aber ein Fehler existiert
             this.sendErrorToFrontend(this.lastApiError);
        } else {
             console.log("[MMM-AlphaESS node_helper] No data and no error to send.");
        }
    },

     // --- Fehler senden ---
     sendErrorToFrontend: function(errorMessage) {
        // Verhindert wiederholtes Senden des gleichen Fehlers
        if (this.lastApiError !== errorMessage) {
             console.error("[MMM-AlphaESS node_helper] Storing and preparing to send API_ERROR:", errorMessage);
             this.lastApiError = errorMessage;
             this.sendSocketNotification("API_ERROR", { message: errorMessage });
             console.log("[MMM-AlphaESS node_helper] API_ERROR notification sent.");
        } else {
            console.log("[MMM-AlphaESS node_helper] Skipping send API_ERROR (same as last).");
        }
     },

    // --- Realtime Data Schedule (unverändert) ---
    scheduleRealtimeUpdate: function() {
        console.log("[MMM-AlphaESS node_helper] scheduleRealtimeUpdate CALLED.");
        clearTimeout(this.fetchRealtimeTimer);
        this.fetchRealtimeTimer = null;
        if (this.fetchRealtimeInProgress) { console.log("[MMM-AlphaESS node_helper] Realtime fetch already in progress, skipping."); return; }
        console.log("[MMM-AlphaESS node_helper] Calling fetchRealtimeData.");
        this.fetchRealtimeData();
        this.fetchRealtimeTimer = setTimeout(() => { this.scheduleRealtimeUpdate(); }, this.config.updateIntervalRealtime);
    },

    // --- Summary Data Schedule (wieder aktiviert) ---
     scheduleSummaryUpdate: function() {
        console.log("[MMM-AlphaESS node_helper] scheduleSummaryUpdate CALLED.");
        clearTimeout(this.fetchSummaryTimer);
        this.fetchSummaryTimer = null;
        if (this.fetchSummaryInProgress) { console.log("[MMM-AlphaESS node_helper] Summary fetch already in progress, skipping."); return; }
        console.log("[MMM-AlphaESS node_helper] Calling fetchSummaryData.");
        this.fetchSummaryData(); // Sofort abrufen
        console.log("[MMM-AlphaESS node_helper] Scheduling next summary update in " + this.config.updateIntervalSummary + "ms");
        this.fetchSummaryTimer = setTimeout(() => { this.scheduleSummaryUpdate(); }, this.config.updateIntervalSummary);
    },

    // --- Generic API Fetch Function (unverändert) ---
    fetchApi: async function(endpointUrl, queryParams = {}) {
         // ... (Code aus der vorherigen Antwort) ...
         if (!this.config || !this.config.appId || !this.config.appSecret || !this.config.sysSn) { throw new Error("Konfiguration unvollständig (fetchApi)."); }
         if (!fetch) { throw new Error("fetch ist nicht verfügbar (fetchApi)."); }
         const appId = this.config.appId; const appSecret = this.config.appSecret; const sysSn = this.config.sysSn; const timeStamp = Math.floor(Date.now() / 1000); const stringToSign = `${appId}${appSecret}${timeStamp}`; const sign = crypto.createHash('sha512').update(stringToSign).digest('hex');
         queryParams.sysSn = queryParams.sysSn || sysSn; const queryString = new URLSearchParams(queryParams).toString(); const fullUrl = `${endpointUrl}?${queryString}`;
         const headers = { 'appId': appId, 'timeStamp': timeStamp.toString(), 'sign': sign };
         console.log(`[MMM-AlphaESS node_helper] Fetching API: ${endpointUrl.split('/').pop()} for SN: ${sysSn}`); // Log nur Endpunkt-Name
         const response = await fetch(fullUrl, { method: 'GET', headers: headers, timeout: 20000 });
         console.log(`[MMM-AlphaESS node_helper] API Response Status (${endpointUrl.split('/').pop()}): ${response.status} ${response.statusText}`);
         if (!response.ok) { const errorBody = await response.text(); console.error(`[MMM-AlphaESS node_helper] API request failed (${endpointUrl.split('/').pop()}) Status ${response.status}. Body: ${errorBody}`); throw new Error(`API Fehler (${response.status}, ${endpointUrl.split('/').pop()}): ${errorBody || response.statusText}`); }
         const data = await response.json();
         if (data.code !== 200) { console.error(`[MMM-AlphaESS node_helper] API returned error code ${data.code}: ${data.msg} (${endpointUrl.split('/').pop()})`); throw new Error(`API meldet Fehler (${data.code}, ${endpointUrl.split('/').pop()}): ${data.msg}`); }
         console.log(`[MMM-AlphaESS node_helper] API call successful (${endpointUrl.split('/').pop()})`);
         return data.data;
    },

    // --- Fetch Realtime Data Logic (unverändert, ruft sendDataToFrontend) ---
    fetchRealtimeData: async function() {
        console.log("[MMM-AlphaESS node_helper] fetchRealtimeData CALLED.");
        if (this.fetchRealtimeInProgress) return;
        console.log("[MMM-AlphaESS node_helper] fetchRealtimeData: Setting fetchInProgress = true.");
        this.fetchRealtimeInProgress = true;
        try {
            console.log("[MMM-AlphaESS node_helper] fetchRealtimeData: Calling fetchApi for getLastPowerData...");
            const data = await this.fetchApi('https://openapi.alphaess.com/api/getLastPowerData');
            console.log("[MMM-AlphaESS node_helper] fetchRealtimeData: API call successful. Storing data.");
            this.realtimeData = data;
            this.sendDataToFrontend(); // Send combined data
        } catch (error) {
            console.error("[MMM-AlphaESS node_helper] fetchRealtimeData: ERROR during fetch:", error.message);
            this.sendErrorToFrontend(error.message);
        } finally {
            console.log("[MMM-AlphaESS node_helper] fetchRealtimeData: FINALLY block. Setting fetchInProgress = false.");
            this.fetchRealtimeInProgress = false;
        }
    },

    // --- Fetch Summary Data Logic (wieder aktiviert) ---
     fetchSummaryData: async function() {
        console.log("[MMM-AlphaESS node_helper] fetchSummaryData CALLED.");
        if (this.fetchSummaryInProgress) return;
        console.log("[MMM-AlphaESS node_helper] fetchSummaryData: Setting fetchInProgress = true.");
        this.fetchSummaryInProgress = true;
        try {
            console.log("[MMM-AlphaESS node_helper] fetchSummaryData: Calling fetchApi for getSumDataForCustomer...");
            // Endpoint korrigiert und sysSn wird automatisch von fetchApi hinzugefügt
            const data = await this.fetchApi('https://openapi.alphaess.com/api/getSumDataForCustomer');
            console.log("[MMM-AlphaESS node_helper] fetchSummaryData: API call successful. Storing data.");
            this.summaryData = data; // Speichere Summary-Daten
            this.sendDataToFrontend(); // Sende kombinierte Daten
        } catch (error) {
            console.error("[MMM-AlphaESS node_helper] fetchSummaryData: ERROR during fetch:", error.message);
            this.sendErrorToFrontend(error.message);
        } finally {
            console.log("[MMM-AlphaESS node_helper] fetchSummaryData: FINALLY block. Setting fetchInProgress = false.");
            this.fetchSummaryInProgress = false;
        }
    },
});

// !!!!! Loggen am Ende der Datei !!!!!
console.log("<<<<< MMM-AlphaESS node_helper.js: FILE PARSED (v2) >>>>>");