# MMM-AlphaESS - MagicMirror² Module

This module for [MagicMirror²](https://magicmirror.builders/) displays key real-time and daily data from your AlphaESS energy storage system. It presents the information in a clean, modern box view.

---

## Features
* Displays current battery **State of Charge (SOC)** with a colored, percentage-based charge bar.
* Shows current **PV generation** and **household consumption**.
* Presents total **daily PV production** and total **daily consumption**.
* A two-part bar for daily consumption visualizes the proportion of **self-consumption (green)** and **grid import (orange)**.
* **Multilingual support** (English and German).
* **Customizable colors** and **update intervals**.

---

## Installation
1.  Navigate into your MagicMirror's `modules` directory.
    ```bash
    cd ~/Magic-Mirror/modules
    ```
2.  Clone this repository.
    ```bash
    git clone [https://github.com/El-Chloro/MMM-AlphaESS.git](https://github.com/El-Chloro/MMM-AlphaESS.git)
    ```
3.  Change into the new directory.
    ```bash
    cd MMM-AlphaESS
    ```
4.  Install the dependencies.
    ```bash
    npm install
    ```

---

## Configuration
Add the module to your MagicMirror's `config/config.js` file. Here's an example configuration block:

```javascript
{
    module: "MMM-AlphaESS",
    position: "top_left", // or any other desired position
    config: {
        appId: "Your_AlphaESS_App_ID",       // Required
        appSecret: "Your_AlphaESS_App_Secret", // Required
        sysSn: "Your_AlphaESS_Serial_Number",    // Required
        
        // Optional: Intervals in milliseconds
        updateIntervalRealtime: 60 * 1000,       // every 60 seconds
        updateIntervalSummary: 10 * 60 * 1000,  // every 10 minutes

        // Optional: Visual adjustments
        useIcons: true,
        kwDecimalPlaces: 2,
        kwhDecimalPlaces: 1,

        // Optional: Color thresholds for the battery
        socThresholdLow: 30,
        socThresholdHigh: 75,
        socThresholdLowColor: "#FF5722",
        socThresholdMediumColor: "#fdd835",
        socThresholdHighColor: "#8BC34A",
    }
},
```


### Configuration Options

| Option                  | Description                                                                                       | Default          | Required |
| ----------------------- | -------------------------------------------------------------------------------------------------- | --------------------- | :----------: |
| `appId`                 | Your Developer ID (AppID) from the AlphaESS Open API Portal. Portal.                                        | `""`                  |      Yes      |
| `appSecret`             | Your App Secret from the AlphaESS Open API Portal. Portal.                                                   | `""`                  |      Yes      |
| `sysSn`                 | The Serial Number (SN) of your AlphaESS system.                                                      | `""`                  |      Yes      |
| `updateIntervalRealtime`|Interval for fetching real-time data (power, SOC) in milliseconds.                      | `60000` (60s)         |     No     |
| `updateIntervalSummary` | IInterval for fetching daily summary data (energy, consumption) in milliseconds.             | `600000` (10min)      |     No     |
| `useIcons`              | Displays FontAwesome icons in the boxes (`true`) or hides them (`false`).                | `true`                |     No     |
| `kwDecimalPlaces`       | Number of decimal places for power values in kW.                             | `2`                   |     No     |
| `kwhDecimalPlaces`      | Number of decimal places for energy values in kWh.                                | `1`                   |     No     |
| `socThresholdLow`       | SOC percentage below which the battery bar is displayed as "low" (red).                      | `30`                  |     No     |
| `socThresholdHigh`      | SOC percentage above which the battery bar is displayed as "high" (green).                          | `75`                  |     No     |
| `socThresholdLowColor`  |Hex color code for the low SOC range.                                                       | `"#FF5722"`           |     No     |
| `socThresholdMediumColor` | Hex color code for the medium SOC range.                                                    | `"#fdd835"`           |     No     |
| `socThresholdHighColor` | Hex color code for the high SOC range.	                                            | `"#8BC34A"`           |     No     |

## Author
Based on the work of **El-Chloro**. Further developed and adapted.

## License
MIT License