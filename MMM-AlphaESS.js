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

	// getDom wird angepasst
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
		
		// NEU: Spezialisierte Funktion für die Tagesverbrauch-Box
		const createLoadBox = (iconClass, label, value, unit, options = {}) => {
			const { precision = 1, eLoad = 0, eInput = 0 } = options;
			if (value === null || value === undefined) return;

			const box = document.createElement("div");
			box.className = "data-box";
			const formattedValue = (typeof value === 'number') ? value.toFixed(precision) : value;
			let iconHtml = this.config.useIcons ? `<div class="box-icon"><i class="fas ${iconClass}"></i></div>` : '';

			let barHtml = '';
			let selfPercent = 0;
			let gridPercent = 0;

			// Berechnung der Anteile für den Balken
			if (eLoad > 0) {
				const selfUsage = Math.max(0, eLoad - eInput);
				selfPercent = (selfUsage / eLoad) * 100;
				gridPercent = (eInput / eLoad) * 100;

				// Logging für Debugging und Erweiterungen
				Log.log(`[${this.name}] Load Mix Calculation: Total=${eLoad}, Grid=${eInput}, Self=${selfUsage.toFixed(2)} -> Self=${selfPercent.toFixed(1)}%, Grid=${gridPercent.toFixed(1)}%`);

				barHtml = `
					<div class="bar-container">
						<div class="bar-segment green" style="width: ${selfPercent}%;"></div>
						<div class="bar-segment orange" style="width: ${gridPercent}%;"></div>
					</div>
				`;
			}
			
			box.innerHTML = `
				${iconHtml}
				<div class="box-value">${formattedValue} ${unit}</div>
				<div class="box-label">${label}</div>
				${barHtml}
			`;
			boxContainer.appendChild(box);
		};

		// Funktion für die Akku-Box (unverändert)
		const createBatteryBox = (iconClass, label, value, unit, options = {}) => {
			const { color = '#444', precision = 1 } = options;
			if (value === null || value === undefined) return;
			
			const box = document.createElement("div");
			box.className = "data-box full-width";
			const formattedValue = (typeof value === 'number') ? value.toFixed(precision) : value;
			let iconHtml = this.config.useIcons ? `<div class="box-icon"><i class="fas ${iconClass}"></i></div>` : '';

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
		const todayGridInput = smData?.einput; // Benötigt für den neuen Balken
		const todayProd = smData?.epvtoday;
		const currentSOC = rtData?.soc;
		const socColor = this.getSocColor(currentSOC);
		
		// Boxen in der gewünschten Reihenfolge erstellen
		
		createDataBox("fa-home", "Verbrauch", currentLoad_kW, "kW", { precision: this.config.kwDecimalPlaces, baseValue: rtData?.pload });
		createDataBox("fa-solar-panel", "PV Aktuell", currentPV_kW, "kW", { precision: this.config.kwDecimalPlaces, baseValue: rtData?.ppv });

		// Tagesverbrauch-Box mit der neuen Funktion erstellen
		createLoadBox("fa-plug", "Tagesverbrauch", todayLoad, "kWh", {
			precision: this.config.kwhDecimalPlaces,
			eLoad: todayLoad,
			eInput: todayGridInput
		});

		createDataBox("fa-chart-bar", "Tages-PV", todayProd, "kWh", { precision: this.config.kwhDecimalPlaces, baseValue: smData?.epvtoday });
		createBatteryBox("fa-battery-full", "Akku", currentSOC, "%", { color: socColor, precision: 1 });
		
		wrapper.appendChild(boxContainer);
		return wrapper;
	},
});