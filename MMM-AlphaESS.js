// MagicMirror/modules/MMM-AlphaESS/MMM-AlphaESS.js
/* global Module, Log */

Module.register("MMM-AlphaESS", {
	// Defaults bleiben unverändert
	defaults: {
		appId: "",
		appSecret: "",
		sysSn: "",
		updateIntervalRealtime: 60 * 1000,
		updateIntervalSummary: 10 * 60 * 1000,
		initialLoadDelay: 2000,
		useIcons: true,
		kwDecimalPlaces: 2,
		kwhDecimalPlaces: 1,
		socThresholdLow: 30,
		socThresholdHigh: 75,
		socThresholdMediumColor: "#fdd835",
		socThresholdLowColor: "#FF5722",
		socThresholdHighColor: "#8BC34A",
		loadColorHighConsumption: "#FFEB3B",
		loadColorNormalConsumption: "#8BC34A",
	},

	// Modulinterne Speicher (unverändert)
	realtimeData: null,
	summaryData: null,
	loading: true,
	apiError: null,

	// start, socketNotificationReceived, getStyles und getApiErrorHint bleiben unverändert
	start: function() {
		Log.info(`[${this.name}] Module instance started.`);
		this.realtimeData = null;
		this.summaryData = null;
		this.loading = true;
		this.apiError = null;

		setTimeout(() => {
			Log.info(`[${this.name}] Sending CONFIG to node_helper after ${this.config.initialLoadDelay}ms delay.`);
			this.sendSocketNotification("CONFIG", this.config);
		}, this.config.initialLoadDelay);
	},

	socketNotificationReceived: function(notification, payload) {
		Log.info(`[${this.name}] Socket Notification Received: '${notification}'`);
		if (notification === "DATA_RESULT") {
			if (payload && (payload.realtime || payload.summary)) {
				this.loading = false;
				this.apiError = null;
				this.realtimeData = payload.realtime !== undefined ? payload.realtime : this.realtimeData;
				this.summaryData = payload.summary !== undefined ? payload.summary : this.summaryData;
				this.updateDom(300);
			}
		} else if (notification === "API_ERROR") {
			Log.error(`[${this.name}] Processing API_ERROR: ${payload.message}`);
			this.loading = false;
			this.apiError = payload.message || "Unbekannter API Fehler";
			this.updateDom(300);
		}
	},

	getStyles: function() {
		return ["MMM-AlphaESS.css", "font-awesome.css"];
	},

	getApiErrorHint: function(errorMessage) {
		if (!errorMessage) { return ""; }
		const lowerCaseError = errorMessage.toLowerCase();
		let hint = "";
		if (lowerCaseError.includes("6007")) { hint = "Hinweis: Signatur ungültig. Überprüfe `appSecret` und `appId` in der config.js."; }
		else if (lowerCaseError.includes("6006")) { hint = "Hinweis: Zeitstempel ungültig. Überprüfe die Systemzeit des MagicMirror."; }
		else if (lowerCaseError.includes("6005")) { hint = "Hinweis: `appId` ist nicht mit der `sysSn` verknüpft."; }
		else if (lowerCaseError.includes("6002")) { hint = "Hinweis: `sysSn` ist nicht mit deinem Account verknüpft oder falsch."; }
		else if (lowerCaseError.includes("429")) { hint = "Hinweis: Zu viele Anfragen an die API (Rate Limit). Erhöhe das `updateInterval`."; }
		else if (lowerCaseError.includes("fetch") || lowerCaseError.includes("network")) { hint = "Hinweis: Netzwerkfehler/Timeout. Prüfe die Internetverbindung."; }
		return hint;
	},

	// getSocColor bleibt unverändert
	getSocColor: function(soc) {
		if (soc === null || soc === undefined) { return ''; }
		const socNum = Number(soc);
		if (socNum <= this.config.socThresholdLow) {
			return this.config.socThresholdLowColor;
		} else if (socNum >= this.config.socThresholdHigh) {
			return this.config.socThresholdHighColor;
		} else {
			return this.config.socThresholdMediumColor;
		}
	},

	// getDom wird komplett überarbeitet
	getDom: function() {
		Log.log(`[${this.name}] getDom() CALLED.`);
		const wrapper = document.createElement("div");
		wrapper.className = "alphaess-wrapper";

		// 1. Prüfung der Konfiguration (unverändert)
		if (!this.config.appId || !this.config.appSecret || !this.config.sysSn) {
			wrapper.innerHTML = "Bitte konfiguriere `appId`, `appSecret` und `sysSn` für " + this.name + ".";
			wrapper.className = "dimmed light small alert";
			return wrapper;
		}

		// 2. Prüfung des Ladezustands (unverändert)
		if (this.loading && !this.apiError && !this.realtimeData && !this.summaryData) {
			wrapper.innerHTML = this.translate("LOADING");
			wrapper.className = "dimmed light small";
			return wrapper;
		}

		// 3. Prüfung auf API-Fehler (unverändert)
		if (this.apiError) {
			const hint = this.getApiErrorHint(this.apiError);
			wrapper.innerHTML = `Fehler beim Abrufen:<br><span class="error-message">${this.apiError}</span>`;
			if (hint) {
				wrapper.innerHTML += `<br><span class="error-hint">${hint}</span>`;
			}
			wrapper.className = "dimmed light small error";
			return wrapper;
		}

		// 4. Datenanzeige, wenn Daten vorhanden sind
		const rtData = this.realtimeData;
		const smData = this.summaryData;

		if (!rtData && !smData) {
			wrapper.innerHTML = "Warte auf Daten...";
			wrapper.className = "dimmed light small";
			return wrapper;
		}

		const boxContainer = document.createElement("div");
		boxContainer.className = "box-container";

		// Hilfsfunktion zum Erstellen einer Daten-Box
		const createDataBox = (iconClass, label, value, unit, options = {}) => {
			const { color = '', precision = 1, baseValue = null } = options;
			const displayValue = value;
			const checkValue = (baseValue !== null) ? baseValue : displayValue;

			// Box nur erstellen, wenn ein Wert vorhanden ist
			if (checkValue === null || checkValue === undefined) {
				return;
			}

			const box = document.createElement("div");
			box.className = "data-box";

			// Farbe für den Rand setzen
			if (color) {
				box.style.borderColor = color;
			}
			
			const formattedValue = (typeof displayValue === 'number') ? displayValue.toFixed(precision) : displayValue;

			let iconHtml = '';
			if (this.config.useIcons && iconClass) {
				iconHtml = `<div class="box-icon"><i class="fas ${iconClass}"></i></div>`;
			}

			box.innerHTML = `
				${iconHtml}
				<div class="box-value">${formattedValue} ${unit}</div>
				<div class="box-label">${label}</div>
			`;

			boxContainer.appendChild(box);
		};

		Log.log(`[${this.name}] getDom: Rendering data boxes...`);

		// --- Akku Ladung (SOC) ---
		const currentSOC = rtData?.soc;
		const socColor = this.getSocColor(currentSOC);
		createDataBox("fa-battery-full", "Akku", currentSOC, "%", { color: socColor, precision: 1, baseValue: currentSOC });

		// --- PV Erzeugung (Echtzeit kW) ---
		const currentPV_kW = rtData?.ppv / 1000;
		createDataBox("fa-solar-panel", "PV Aktuell", currentPV_kW, "kW", { precision: this.config.kwDecimalPlaces });

		// --- Hausverbrauch (Echtzeit kW) ---
		const currentLoad_kW = rtData?.pload / 1000;
		createDataBox("fa-home", "Verbrauch", currentLoad_kW, "kW", { precision: this.config.kwDecimalPlaces });

		// --- Tagesproduktion (kWh) ---
		const todayProd = smData?.epvtoday;
		createDataBox("fa-chart-bar", "Tages-PV", todayProd, "kWh", { precision: this.config.kwhDecimalPlaces });

		// --- Tagesverbrauch (kWh) ---
		const todayLoad = smData?.eload;
		let loadColor = '';
		if (todayLoad !== null && todayLoad !== undefined && todayProd !== null && todayProd !== undefined) {
			loadColor = Number(todayLoad) > Number(todayProd) ? this.config.loadColorHighConsumption : this.config.loadColorNormalConsumption;
		}
		createDataBox("fa-plug", "Tagesverbrauch", todayLoad, "kWh", { color: loadColor, precision: this.config.kwhDecimalPlaces });
		
		wrapper.appendChild(boxContainer);
		Log.log(`[${this.name}] getDom: Boxes rendered and returning wrapper.`);
		return wrapper;
	},
});

Log.info("<<<<< MMM-AlphaESS.js: FILE PARSED >>>>>");