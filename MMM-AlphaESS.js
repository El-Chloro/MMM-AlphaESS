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

	// Modulinterne Speicher, start, socketNotificationReceived, etc. bleiben unverändert
	realtimeData: null,
	summaryData: null,
	loading: true,
	apiError: null,

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
		if (lowerCaseError.includes("6007")) { hint = "Hinweis: Signatur ungültig. Überprüfe `appSecret` und `appId`."; }
		else if (lowerCaseError.includes("6006")) { hint = "Hinweis: Zeitstempel ungültig. Prüfe die Systemzeit."; }
		else if (lowerCaseError.includes("6005")) { hint = "Hinweis: `appId` ist nicht mit `sysSn` verknüpft."; }
		else if (lowerCaseError.includes("6002")) { hint = "Hinweis: `sysSn` ist falsch oder nicht verknüpft."; }
		else if (lowerCaseError.includes("429")) { hint = "Hinweis: Zu viele API-Anfragen. Erhöhe `updateInterval`."; }
		else if (lowerCaseError.includes("fetch") || lowerCaseError.includes("network")) { hint = "Hinweis: Netzwerkfehler/Timeout. Prüfe die Internetverbindung."; }
		return hint;
	},

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
		const wrapper = document.createElement("div");
		wrapper.className = "alphaess-wrapper";

		// Prüfungen für Config, Laden und Fehler (unverändert)
		if (!this.config.appId || !this.config.appSecret || !this.config.sysSn) {
			wrapper.innerHTML = "Bitte konfiguriere `appId`, `appSecret` und `sysSn`.";
			wrapper.className = "dimmed light small alert";
			return wrapper;
		}
		if (this.loading && !this.apiError && !this.realtimeData) {
			wrapper.innerHTML = this.translate("LOADING");
			wrapper.className = "dimmed light small";
			return wrapper;
		}
		if (this.apiError) {
			const hint = this.getApiErrorHint(this.apiError);
			wrapper.innerHTML = `Fehler beim Abrufen:<br><span class="error-message">${this.apiError}</span>`;
			if (hint) {
				wrapper.innerHTML += `<br><span class="error-hint">${hint}</span>`;
			}
			wrapper.className = "dimmed light small error";
			return wrapper;
		}

		// Datenanzeige
		const rtData = this.realtimeData;
		const smData = this.summaryData;

		if (!rtData || !smData) {
			wrapper.innerHTML = "Warte auf Daten...";
			wrapper.className = "dimmed light small";
			return wrapper;
		}

		const boxContainer = document.createElement("div");
		boxContainer.className = "box-container";

		// Hilfsfunktion für die vier kleinen Boxen
		const createDataBox = (iconClass, label, value, unit, options = {}) => {
			const { precision = 1, baseValue = null } = options;
			if ((baseValue !== null ? baseValue : value) === null || value === undefined) return;

			const box = document.createElement("div");
			box.className = "data-box";
			const formattedValue = (typeof value === 'number') ? value.toFixed(precision) : value;
			let iconHtml = this.config.useIcons ? `<div class="box-icon"><i class="fas ${iconClass}"></i></div>` : '';

			box.innerHTML = `
				${iconHtml}
				<div class="box-value">${formattedValue} ${unit}</div>
				<div class="box-label">${label}</div>
			`;
			boxContainer.appendChild(box);
		};

		// NEU: Eigene Hilfsfunktion für die Akku-Box
		const createBatteryBox = (iconClass, label, value, unit, options = {}) => {
			const { color = '#444', precision = 1 } = options;
			if (value === null || value === undefined) return;
			
			const box = document.createElement("div");
			box.className = "data-box full-width"; // Nutzt die neue CSS-Klasse
			const formattedValue = (typeof value === 'number') ? value.toFixed(precision) : value;
			let iconHtml = this.config.useIcons ? `<div class="box-icon"><i class="fas ${iconClass}"></i></div>` : '';

			// HTML mit dem neuen Ladebalken
			box.innerHTML = `
				${iconHtml}
				<div class="box-value">${formattedValue} ${unit}</div>
				<div class="box-label">${label}</div>
				<div class="bar-container">
					<div class="bar-fill" style="width: ${value}%; background-color: ${color};"></div>
				</div>
			`;
			boxContainer.appendChild(box);
		};

		// Alle Werte berechnen
		const currentLoad_kW = rtData?.pload / 1000;
		const currentPV_kW = rtData?.ppv / 1000;
		const todayLoad = smData?.eload;
		const todayProd = smData?.epvtoday;
		const currentSOC = rtData?.soc;
		const socColor = this.getSocColor(currentSOC);
		
		// Boxen in der gewünschten Reihenfolge erstellen
		
		// Oben Links: Verbrauch
		createDataBox("fa-home", "Verbrauch", currentLoad_kW, "kW", { precision: this.config.kwDecimalPlaces, baseValue: rtData?.pload });
		
		// Oben Rechts: PV Aktuell
		createDataBox("fa-solar-panel", "PV Aktuell", currentPV_kW, "kW", { precision: this.config.kwDecimalPlaces, baseValue: rtData?.ppv });

		// Mitte Links: Tagesverbrauch
		createDataBox("fa-plug", "Tagesverbrauch", todayLoad, "kWh", { precision: this.config.kwhDecimalPlaces, baseValue: smData?.eload });

		// Mitte Rechts: Tages-PV
		createDataBox("fa-chart-bar", "Tages-PV", todayProd, "kWh", { precision: this.config.kwhDecimalPlaces, baseValue: smData?.epvtoday });

		// Unten (breit): Akku
		createBatteryBox("fa-battery-full", "Akku", currentSOC, "%", { color: socColor, precision: 1 });
		
		wrapper.appendChild(boxContainer);
		return wrapper;
	},
});