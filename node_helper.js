// MagicMirror/modules/MMM-AlphaESS/node_helper.js
/* global require, module, console, setTimeout, clearTimeout */
const NodeHelper = require("node_helper");
let fetch; // Will be imported dynamically
const crypto = require("crypto");

console.log("<<<<< MMM-AlphaESS node_helper.js: LOADING FILE >>>>>");

module.exports = NodeHelper.create({
	start: async function() {
		console.log("<<<<< MMM-AlphaESS node_helper: start() function CALLED >>>>>");
		this.config = null;
		this.realtimeData = null; // Storage for real-time data
		this.summaryData = null;  // Storage for daily summary data
		this.fetchRealtimeTimer = null;
		this.fetchSummaryTimer = null; // Timer for summary data
		this.fetchRealtimeInProgress = false;
		this.fetchSummaryInProgress = false; // Flag for summary data
		this.lastApiError = null;

		console.log("[MMM-AlphaESS node_helper] Attempting to dynamically import node-fetch...");
		try {
			// Checks if fetch has already been imported (possible on restarts)
			if (!fetch) {
				 fetch = (await import('node-fetch')).default;
				 console.log("[MMM-AlphaESS node_helper] SUCCESS: node-fetch imported dynamically.");
			} else {
				 console.log("[MMM-AlphaESS node_helper] INFO: node-fetch was already imported.");
			}
		} catch (err) {
			console.error("<<<<< MMM-AlphaESS node_helper: CRITICAL ERROR importing node-fetch! >>>>>", err);
			// Stores the error to send it as soon as the connection to the frontend is established
			this.lastApiError = "Node Helper Error: node-fetch could not be loaded. Check logs.";
		}
		console.log("[MMM-AlphaESS node_helper] start() function finished.");
	},

	stop: function() {
		console.log("<<<<< MMM-AlphaESS node_helper: stop() function CALLED >>>>>");
		clearTimeout(this.fetchRealtimeTimer);
		clearTimeout(this.fetchSummaryTimer); // Stop the summary timer as well
		this.fetchRealtimeInProgress = false;
		this.fetchSummaryInProgress = false;
	},

	// Processes messages from the frontend (MMM-AlphaESS.js)
	socketNotificationReceived: function(notification, payload) {
		console.log(`<<<<< MMM-AlphaESS node_helper: socketNotificationReceived CALLED - Notification: ${notification} >>>>>`);
		// console.log("[MMM-AlphaESS node_helper] Payload received:", JSON.stringify(payload, null, 2)); // Optional: Log payload

		if (notification === "CONFIG" && payload) {
			console.log("[MMM-AlphaESS node_helper] CONFIG notification received. Processing...");
			this.config = payload;
			// Sets intervals from configuration or default values
			this.config.updateIntervalRealtime = Math.max(this.config.updateIntervalRealtime || 60 * 1000, 30000); // Min 30s
			this.config.updateIntervalSummary = Math.max(this.config.updateIntervalSummary || 10 * 60 * 1000, 60000); // Min 60s

			// Checks if 'fetch' was imported successfully
			if (!fetch) {
				 console.error("[MMM-AlphaESS node_helper] ERROR: fetch not available when processing CONFIG.");
				 this.sendErrorToFrontend("Node Helper Error: fetch not available.");
				 return; // Aborts if fetch is missing
			}

			console.log(`[MMM-AlphaESS node_helper] Config processed. Realtime Interval: ${this.config.updateIntervalRealtime}, Summary Interval: ${this.config.updateIntervalSummary}`);
			// Starts the fetch schedules for both data types
			this.scheduleRealtimeUpdate();
			this.scheduleSummaryUpdate(); // Also starts the summary fetch
		} else {
			 console.log(`[MMM-AlphaESS node_helper] Notification '${notification}' ignored or payload missing.`);
		}
	},

	// Sends the collected data to the frontend
	sendDataToFrontend: function() {
		// Only sends if at least one data set is present
		if (this.realtimeData || this.summaryData) {
			console.log("[MMM-AlphaESS node_helper] Preparing to send DATA_RESULT to frontend.");
			// Always sends both parts, even if one is null
			this.sendSocketNotification("DATA_RESULT", {
				realtime: this.realtimeData,
				summary: this.summaryData
			});
			 console.log("[MMM-AlphaESS node_helper] DATA_RESULT sent.");
			 // Clears the last error if data was sent successfully
			 if(this.realtimeData && this.summaryData) { this.lastApiError = null; }

		} else if (this.lastApiError) {
			 // Sends the last error if no data is available
			 this.sendErrorToFrontend(this.lastApiError);
		} else {
			 console.log("[MMM-AlphaESS node_helper] No data and no error to send.");
		}
	},

	 // Sends an error message to the frontend
	 sendErrorToFrontend: function(errorMessage) {
		// Prevents sending the exact same error repeatedly
		if (this.lastApiError !== errorMessage) {
			 console.error("[MMM-AlphaESS node_helper] Storing and preparing to send API_ERROR:", errorMessage);
			 this.lastApiError = errorMessage; // Stores the current error
			 this.sendSocketNotification("API_ERROR", { message: errorMessage });
			 console.log("[MMM-AlphaESS node_helper] API_ERROR notification sent.");
		} else {
			console.log("[MMM-AlphaESS node_helper] Skipping send API_ERROR (same as last).");
		}
	 },

	// Schedules the next fetch for real-time data
	scheduleRealtimeUpdate: function() {
		console.log("[MMM-AlphaESS node_helper] scheduleRealtimeUpdate CALLED.");
		clearTimeout(this.fetchRealtimeTimer); // Clears old timer
		this.fetchRealtimeTimer = null;
		if (this.fetchRealtimeInProgress) { console.log("[MMM-AlphaESS node_helper] Realtime fetch already in progress, skipping."); return; } // Prevents overlap
		console.log("[MMM-AlphaESS node_helper] Calling fetchRealtimeData.");
		this.fetchRealtimeData(); // Executes fetch immediately
		// Sets a new timer for the next fetch
		this.fetchRealtimeTimer = setTimeout(() => { this.scheduleRealtimeUpdate(); }, this.config.updateIntervalRealtime);
	},

	// Schedules the next fetch for summary data
	 scheduleSummaryUpdate: function() {
		console.log("[MMM-AlphaESS node_helper] scheduleSummaryUpdate CALLED.");
		clearTimeout(this.fetchSummaryTimer); // Clears old timer
		this.fetchSummaryTimer = null;
		if (this.fetchSummaryInProgress) { console.log("[MMM-AlphaESS node_helper] Summary fetch already in progress, skipping."); return; } // Prevents overlap
		console.log("[MMM-AlphaESS node_helper] Calling fetchSummaryData.");
		this.fetchSummaryData(); // Executes fetch immediately
		console.log("[MMM-AlphaESS node_helper] Scheduling next summary update in " + this.config.updateIntervalSummary + "ms");
		// Sets a new timer for the next fetch
		this.fetchSummaryTimer = setTimeout(() => { this.scheduleSummaryUpdate(); }, this.config.updateIntervalSummary);
	},

	// Generic function to fetch data from the API
	fetchApi: async function(endpointUrl, queryParams = {}) {
		 // Checks for complete configuration and availability of fetch
		 if (!this.config || !this.config.appId || !this.config.appSecret || !this.config.sysSn) { throw new Error("Configuration incomplete (fetchApi)."); }
		 if (!fetch) { throw new Error("fetch is not available (fetchApi)."); }

		 // Prepare authentication data
		 const appId = this.config.appId;
		 const appSecret = this.config.appSecret;
		 const sysSn = this.config.sysSn;
		 const timeStamp = Math.floor(Date.now() / 1000);
		 const stringToSign = `${appId}${appSecret}${timeStamp}`;
		 const sign = crypto.createHash('sha512').update(stringToSign).digest('hex'); // SHA512 signature

		 // Assemble URL and headers
		 queryParams.sysSn = queryParams.sysSn || sysSn; // Adds sysSn if not present
		 const queryString = new URLSearchParams(queryParams).toString();
		 const fullUrl = `${endpointUrl}?${queryString}`;
		 const headers = { 'appId': appId, 'timeStamp': timeStamp.toString(), 'sign': sign };

		 // Perform API call
		 console.log(`[MMM-AlphaESS node_helper] Fetching API: ${endpointUrl.split('/').pop()} for SN: ${sysSn}`);
		 const response = await fetch(fullUrl, { method: 'GET', headers: headers, timeout: 20000 }); // 20 second timeout
		 console.log(`[MMM-AlphaESS node_helper] API Response Status (${endpointUrl.split('/').pop()}): ${response.status} ${response.statusText}`);

		 // Handle the response
		 if (!response.ok) { // Checks for HTTP errors (e.g., 4xx, 5xx)
			 const errorBody = await response.text();
			 console.error(`[MMM-AlphaESS node_helper] API request failed (${endpointUrl.split('/').pop()}) Status ${response.status}. Body: ${errorBody}`);
			 throw new Error(`API Error (${response.status}, ${endpointUrl.split('/').pop()}): ${errorBody || response.statusText}`);
		 }

		 const data = await response.json(); // Parse response as JSON

		 // Checks for application-specific errors in the JSON (code != 200)
		 if (data.code !== 200) {
			 console.error(`[MMM-AlphaESS node_helper] API returned error code ${data.code}: ${data.msg} (${endpointUrl.split('/').pop()})`);
			 throw new Error(`API reports error (${data.code}, ${endpointUrl.split('/').pop()}): ${data.msg}`);
		 }

		 console.log(`[MMM-AlphaESS node_helper] API call successful (${endpointUrl.split('/').pop()})`);
		 return data.data; // Returns the 'data' part of the API response
	},

	// Fetches the real-time data
	fetchRealtimeData: async function() {
		console.log("[MMM-AlphaESS node_helper] fetchRealtimeData CALLED.");
		if (this.fetchRealtimeInProgress) { return; } // Prevents parallel execution
		console.log("[MMM-AlphaESS node_helper] fetchRealtimeData: Setting fetchInProgress = true.");
		this.fetchRealtimeInProgress = true;
		try {
			console.log("[MMM-AlphaESS node_helper] fetchRealtimeData: Calling fetchApi for getLastPowerData...");
			const data = await this.fetchApi('https://openapi.alphaess.com/api/getLastPowerData'); // Calls generic function
			console.log("[MMM-AlphaESS node_helper] fetchRealtimeData: API call successful. Storing data.");
			this.realtimeData = data; // Stores the data
			this.sendDataToFrontend(); // Sends update to the frontend
		} catch (error) {
			console.error("[MMM-AlphaESS node_helper] fetchRealtimeData: ERROR during fetch:", error.message);
			this.sendErrorToFrontend(error.message); // Sends error to the frontend
		} finally {
			// Is always executed, resets the flag
			console.log("[MMM-AlphaESS node_helper] fetchRealtimeData: FINALLY block. Setting fetchInProgress = false.");
			this.fetchRealtimeInProgress = false;
		}
	},

	// Fetches the summary data
	fetchSummaryData: async function() {
		console.log("[MMM-AlphaESS node_helper] fetchSummaryData CALLED.");
		if (this.fetchSummaryInProgress) { return; } // Prevents parallel execution
		console.log("[MMM-AlphaESS node_helper] fetchSummaryData: Setting fetchInProgress = true.");
		this.fetchSummaryInProgress = true;
		try {
			console.log("[MMM-AlphaESS node_helper] fetchSummaryData: Calling fetchApi for getSumDataForCustomer...");
			const data = await this.fetchApi('https://openapi.alphaess.com/api/getSumDataForCustomer'); // Calls generic function
			console.log("[MMM-AlphaESS node_helper] fetchSummaryData: API call successful. Storing data.");
			this.summaryData = data; // Stores the data
			this.sendDataToFrontend(); // Sends update to the frontend
		} catch (error) {
			console.error("[MMM-AlphaESS node_helper] fetchSummaryData: ERROR during fetch:", error.message);
			this.sendErrorToFrontend(error.message); // Sends error to the frontend
		} finally {
			// Is always executed, resets the flag
			console.log("[MMM-AlphaESS node_helper] fetchSummaryData: FINALLY block. Setting fetchInProgress = false.");
			this.fetchSummaryInProgress = false;
		}
	},
});

// Logs when the Node Helper file has been parsed successfully
console.log("<<<<< MMM-AlphaESS node_helper.js: FILE PARSED >>>>>");