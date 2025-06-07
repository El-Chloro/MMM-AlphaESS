// MagicMirror/modules/MMM-AlphaESS/MMM-AlphaESS.js
/* global Module, Log */

Module.register("MMM-AlphaESS", {
	// Default settings
	defaults: {
		appId: "", // Must be set in config.js
		appSecret: "", // Must be set in config.js
		sysSn: "", // Must be set in config.js
		// Intervals
		updateIntervalRealtime: 60 * 1000,      // Real-time data (SOC, W) every 60 seconds
		updateIntervalSummary: 10 * 60 * 1000,  // Daily data (kWh) every 10 minutes
		initialLoadDelay: 2000,                // Initial load delay
		// Display
		useIcons: true,
		kwDecimalPlaces: 2,     // Decimal places for kW
		kwhDecimalPlaces: 1,    // Decimal places for kWh
		// SOC Colors
		socThresholdLow: 30,
		socThresholdHigh: 75,
		socThresholdMediumColor: "#fdd835", // Yellow (medium SOC)
		socThresholdLowColor: "#FF5722",    // Red-Orange (low SOC)
		socThresholdHighColor: "#8BC34A",   // Green (high SOC)
	},

	// Module-internal storage
	realtimeData: null,
	summaryData: null,
	loading: true,
	apiError: null,

	// Start function of the module
	start: function() {
		Log.info(`[${this.name}] Module instance started.`);
		this.realtimeData = null;
		this.summaryData = null;
		this.loading = true;
		this.apiError = null;

		// Sends the configuration to the node helper after a short delay
		setTimeout(() => {
			Log.info(`[${this.name}] Sending CONFIG to node_helper after ${this.config.initialLoadDelay}ms delay.`);
			this.sendSocketNotification("CONFIG", this.config);
		}, this.config.initialLoadDelay);
	},

	// Receives messages from the node helper
	socketNotificationReceived: function(notification, payload) {
		Log.info(`[${this.name}] Socket Notification Received: '${notification}'`);
		
		if (notification === "DATA_RESULT") {
			// Processes the combined data packet
			if (payload && (payload.realtime || payload.summary)) {
				this.loading = false;
				this.apiError = null; // Clear error on successful data reception
				// Stores real-time and summary data (only overwrites if new data is present)
				this.realtimeData = payload.realtime !== undefined ? payload.realtime : this.realtimeData;
				this.summaryData = payload.summary !== undefined ? payload.summary : this.summaryData;
				this.updateDom(300); // Updates the display with a slight delay
			}
		} else if (notification === "API_ERROR") {
			// Processes error messages
			Log.error(`[${this.name}] Processing API_ERROR: ${payload.message}`);
			this.loading = false; // Stops the loading indicator
			this.apiError = payload.message || "Unknown API Error";
			this.updateDom(300); // Updates the display to show the error
		}
	},

	// Loads the required stylesheets
	getStyles: function() {
		return ["MMM-AlphaESS.css", "font-awesome.css"]; // Font Awesome for icons
	},

	// Add the translations folder
	getTranslations: function() {
		return {
			en: "translations/en.json",
			de: "translations/de.json"
		};
	},
	
	// Generates a hint based on the error message
	getApiErrorHint: function(errorMessage) {
		if (!errorMessage) { return ""; }
		const lowerCaseError = errorMessage.toLowerCase();
		let hint = "";
		// Known error patterns are checked here and hints are generated
		if (lowerCaseError.includes("6007")) { hint = "Hint: Invalid signature. Check `appSecret` and `appId`."; }
		else if (lowerCaseError.includes("6006")) { hint = "Hint: Invalid timestamp. Check the system time of your MagicMirror."; }
		else if (lowerCaseError.includes("6005")) { hint = "Hint: `appId` is not linked to `sysSn`."; }
		else if (lowerCaseError.includes("6002")) { hint = "Hint: `sysSn` is incorrect or not linked to your account."; }
		else if (lowerCaseError.includes("429")) { hint = "Hint: Too many API requests. Increase `updateInterval`."; }
		else if (lowerCaseError.includes("fetch") || lowerCaseError.includes("network")) { hint = "Hint: Network error/timeout. Check your internet connection."; }
		return hint;
	},

	// Returns the color for the SOC value
	getSocColor: function(soc) {
		if (soc === null || soc === undefined) { return ''; } // No color without a value
		const socNum = Number(soc);
		if (socNum <= this.config.socThresholdLow) {
			return this.config.socThresholdLowColor; // Red
		} else if (socNum >= this.config.socThresholdHigh) {
			return this.config.socThresholdHighColor; // Green
		} else {
			return this.config.socThresholdMediumColor; // Yellow (default)
		}
	},
	
	// Creates the HTML for the module's display
	getDom: function() {
		const wrapper = document.createElement("div");
		wrapper.className = "alphaess-wrapper";

		// 1. Check configuration (using translated strings)
		if (!this.config.appId || !this.config.appSecret || !this.config.sysSn) {
			wrapper.innerHTML = this.translate("ERROR_CONFIG");
			wrapper.className = "dimmed light small alert";
			return wrapper;
		}
		// 2. Check loading state
		if (this.loading && !this.apiError && !this.realtimeData) {
			wrapper.innerHTML = this.translate("LOADING");
			wrapper.className = "dimmed light small";
			return wrapper;
		}
		// 3. Check for API errors
		if (this.apiError) {
			const hint = this.getApiErrorHint(this.apiError);
			wrapper.innerHTML = `${this.translate("ERROR_FETCH")}<br><span class="error-message">${this.apiError}</span>`;
			if (hint) {
				wrapper.innerHTML += `<br><span class="error-hint">${hint}</span>`;
			}
			wrapper.className = "dimmed light small error";
			return wrapper;
		}

		const rtData = this.realtimeData;
		const smData = this.summaryData;

		// Fallback in case no data has been received yet
		if (!rtData || !smData) {
			wrapper.innerHTML = this.translate("WAITING_FOR_DATA");
			wrapper.className = "dimmed light small";
			return wrapper;
		}

		const boxContainer = document.createElement("div");
		boxContainer.className = "box-container";

		// Helper function for the four small boxes
		const createDataBox = (iconClass, label, value, unit, options = {}) => {
			const { precision = 1, baseValue = null } = options;
			if ((baseValue !== null ? baseValue : value) === null || value === undefined) return;
			const box = document.createElement("div");
			box.className = "data-box";
			const formattedValue = (typeof value === 'number') ? value.toFixed(precision) : value;
			let iconHtml = this.config.useIcons ? `<div class="box-icon"><i class="fas ${iconClass}"></i></div>` : '';
			box.innerHTML = `${iconHtml}<div class="box-value">${formattedValue} ${unit}</div><div class="box-label">${label}</div>`;
			boxContainer.appendChild(box);
		};
		
		// Specialized function for the daily load box with a two-part bar
		const createLoadBox = (iconClass, label, value, unit, options = {}) => {
			const { precision = 1, eLoad = 0, eInput = 0 } = options;
			if (value === null || value === undefined) return;
			const box = document.createElement("div");
			box.className = "data-box";
			const formattedValue = (typeof value === 'number') ? value.toFixed(precision) : value;
			let iconHtml = this.config.useIcons ? `<div class="box-icon"><i class="fas ${iconClass}"></i></div>` : '';
			let barHtml = '';
			// Calculate the shares for the bar
			if (eLoad > 0) {
				const selfUsage = Math.max(0, eLoad - eInput);
				const selfPercent = (selfUsage / eLoad) * 100;
				const gridPercent = (eInput / eLoad) * 100;
				// Logging for debugging and extensions
				Log.log(`[${this.name}] Load Mix: Self=${selfPercent.toFixed(1)}%, Grid=${gridPercent.toFixed(1)}%`);
				barHtml = `<div class="bar-container"><div class="bar-segment green" style="width: ${selfPercent}%;"></div><div class="bar-segment orange" style="width: ${gridPercent}%;"></div></div>`;
			}
			box.innerHTML = `${iconHtml}<div class="box-value">${formattedValue} ${unit}</div><div class="box-label">${label}</div>${barHtml}`;
			boxContainer.appendChild(box);
		};

		// Helper function for the battery box
		const createBatteryBox = (iconClass, label, value, unit, options = {}) => {
			const { color = '#444', precision = 1 } = options;
			if (value === null || value === undefined) return;
			const box = document.createElement("div");
			box.className = "data-box full-width";
			const formattedValue = (typeof value === 'number') ? value.toFixed(precision) : value;
			let iconHtml = this.config.useIcons ? `<div class="box-icon"><i class="fas ${iconClass}"></i></div>` : '';
			// HTML with the growing progress bar
			box.innerHTML = `${iconHtml}<div class="box-value">${formattedValue} ${unit}</div><div class="box-label">${label}</div><div class="bar-container"><div class="bar-fill" style="width: ${value}%; background-color: ${color};"></div></div>`;
			boxContainer.appendChild(box);
		};

		// Calculate all values
		const currentLoad_kW = rtData?.pload / 1000;
		const currentPV_kW = rtData?.ppv / 1000;
		const todayLoad = smData?.eload;
		const todayGridInput = smData?.einput;
		const todayProd = smData?.epvtoday;
		const currentSOC = rtData?.soc;
		const socColor = this.getSocColor(currentSOC);
		
		// Create boxes in the desired order using translated labels
		createDataBox("fa-home", this.translate("LOAD"), currentLoad_kW, "kW", { precision: this.config.kwDecimalPlaces, baseValue: rtData?.pload });
		createDataBox("fa-solar-panel", this.translate("PV_NOW"), currentPV_kW, "kW", { precision: this.config.kwDecimalPlaces, baseValue: rtData?.ppv });
		createLoadBox("fa-plug", this.translate("LOAD_DAY"), todayLoad, "kWh", { precision: this.config.kwhDecimalPlaces, eLoad: todayLoad, eInput: todayGridInput });
		createDataBox("fa-chart-bar", this.translate("PV_DAY"), todayProd, "kWh", { precision: this.config.kwhDecimalPlaces, baseValue: smData?.epvtoday });
		createBatteryBox("fa-battery-full", this.translate("BATTERY"), currentSOC, "%", { color: socColor, precision: 1 });
		
		wrapper.appendChild(boxContainer);
		return wrapper;
	},
});