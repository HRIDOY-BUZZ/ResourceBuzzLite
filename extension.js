// SPDX-License-Identifier: GPL-2.0-or-later

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

const REFRESH_TIME = 'refreshtime';
const EXTENSION_POSITION = 'extensionposition';
const DECIMALS_STATUS = 'decimalsstatus';
const LEFT_CLICK_APP = 'leftclickapp';
const RIGHT_CLICK_STATUS = 'rightclickstatus';
const SHOW_COLORS_STATUS = 'showcolorsstatus';
const CPU_STATUS = 'cpustatus';
const RAM_STATUS = 'ramstatus';
const THERMAL_CPU_TEMPERATURE_STATUS = 'thermalcputemperaturestatus';
const THERMAL_TEMPERATURE_UNIT = 'thermaltemperatureunit';

const CPU_HWMON_DRIVERS = new Set([
    'coretemp',
    'cpu_thermal',
    'k10temp',
    'zenpower',
]);
const HWMON_PATH = '/sys/class/hwmon';
const POSITION_NAMES = ['left', 'center', 'right'];
const TEMPERATURE_RESCAN_SECONDS = 60;
const RESOURCE_APP_IDS = [
    'net.nokyan.Resources.desktop',
    'org.gnome.SystemMonitor.desktop',
    'io.missioncenter.MissionCenter.desktop',
];

function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
}

const ResourceMonitor = GObject.registerClass(
class ResourceMonitor extends PanelMenu.Button {
    _init({settings, openPreferences, path, name}) {
        super._init(0.0, name, true);

        this._settings = settings;
        this._openPreferences = openPreferences;
        this._path = path;
        this._handlerIds = [];
        this._cancellable = new Gio.Cancellable();
        this._mainTimer = null;
        this._refreshInProgress = false;
        this._destroyed = false;
        this._cpuTotalOld = null;
        this._cpuIdleOld = null;
        this._thermalSensors = [];
        this._lastThermalScan = 0;
        this._lastThermalError = null;

        this._createGui();
        this._createClickGestures();
        this._loadSettings();
        this._connectSignals();
        this._restartTimer();
        this._refresh();
    }

    _createGui() {
        this._box = new St.BoxLayout({
            style_class: 'panel-status-indicators-box',
        });

        this._cpuBox = new St.BoxLayout();
        this._cpuIcon = new St.Icon({
            gicon: Gio.icon_new_for_string(`${this._path}/icons/cpu-symbolic.svg`),
            style_class: 'system-status-icon',
        });
        this._cpuLabel = new St.Label({
            text: '…',
            accessible_name: 'CPU usage',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._thermalBox = new St.BoxLayout();
        this._thermalLabel = new St.Label({
            text: '(…)',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._ramBox = new St.BoxLayout();
        this._ramIcon = new St.Icon({
            gicon: Gio.icon_new_for_string(`${this._path}/icons/ram-symbolic.svg`),
            style_class: 'system-status-icon',
        });
        this._ramLabel = new St.Label({
            text: '…',
            accessible_name: 'RAM usage',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this.add_child(this._box);
    }

    _createClickGestures() {
        if (!Clutter.ClickGesture) {
            this.connect('button-press-event', (_actor, event) =>
                this._onButtonPress(event));
            return;
        }

        const leftClickGesture = new Clutter.ClickGesture({
            required_button: Clutter.BUTTON_PRIMARY,
            recognize_on_press: true,
        });
        leftClickGesture.connect('recognize', () => this._launchSelectedApp());
        this.add_action(leftClickGesture);

        const rightClickGesture = new Clutter.ClickGesture({
            required_button: Clutter.BUTTON_SECONDARY,
            recognize_on_press: true,
        });
        rightClickGesture.connect('recognize', () => {
            if (this._rightClickStatus)
                this._openPreferences();
        });
        this.add_action(rightClickGesture);
    }

    _onButtonPress(event) {
        if (event.get_button() === Clutter.BUTTON_PRIMARY) {
            this._launchSelectedApp();
            return Clutter.EVENT_STOP;
        }

        if (event.get_button() === Clutter.BUTTON_SECONDARY && this._rightClickStatus) {
            this._openPreferences();
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _loadSettings() {
        this._refreshTime = clamp(this._settings.get_int(REFRESH_TIME), 1, 60);
        this._decimalsStatus = this._settings.get_boolean(DECIMALS_STATUS);
        this._leftClickApp = clamp(this._settings.get_int(LEFT_CLICK_APP), 0, 2);
        this._rightClickStatus = this._settings.get_boolean(RIGHT_CLICK_STATUS);
        this._showColorsStatus = this._settings.get_boolean(SHOW_COLORS_STATUS);
        this._cpuStatus = this._settings.get_boolean(CPU_STATUS);
        this._ramStatus = this._settings.get_boolean(RAM_STATUS);
        this._thermalStatus = this._settings.get_boolean(THERMAL_CPU_TEMPERATURE_STATUS);
        this._thermalUnit = clamp(
            this._settings.get_int(THERMAL_TEMPERATURE_UNIT),
            0,
            1
        );

        this._updateGuiVisibility();
    }

    _updateGuiVisibility() {
        this._box.remove_all_children();
        this._cpuBox.remove_all_children();
        this._thermalBox.remove_all_children();
        this._ramBox.remove_all_children();

        if (this._cpuStatus) {
            this._cpuBox.add_child(this._cpuIcon);
            this._cpuBox.add_child(this._cpuLabel);
            this._box.add_child(this._cpuBox);
        }

        if (this._thermalStatus) {
            this._thermalBox.add_child(this._thermalLabel);
            this._box.add_child(this._thermalBox);
        }

        if (this._ramStatus) {
            this._ramBox.add_child(this._ramIcon);
            this._ramBox.add_child(this._ramLabel);
            this._box.add_child(this._ramBox);
        }
    }

    _connectSignals() {
        const keys = [
            REFRESH_TIME,
            DECIMALS_STATUS,
            LEFT_CLICK_APP,
            RIGHT_CLICK_STATUS,
            SHOW_COLORS_STATUS,
            CPU_STATUS,
            RAM_STATUS,
            THERMAL_CPU_TEMPERATURE_STATUS,
            THERMAL_TEMPERATURE_UNIT,
        ];

        for (const key of keys) {
            const id = this._settings.connect(`changed::${key}`, () => {
                this._loadSettings();
                if (key === REFRESH_TIME)
                    this._restartTimer();
                this._refresh();
            });
            this._handlerIds.push(id);
        }
    }

    _restartTimer() {
        if (this._mainTimer) {
            GLib.Source.remove(this._mainTimer);
            this._mainTimer = null;
        }

        this._mainTimer = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            this._refreshTime,
            () => {
                this._refresh();
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    async _loadFile(path) {
        const file = Gio.File.new_for_path(path);

        return new Promise((resolve, reject) => {
            file.load_contents_async(this._cancellable, (source, result) => {
                try {
                    const [ok, contents] = source.load_contents_finish(result);
                    if (!ok)
                        throw new Error(`Failed to load ${path}`);
                    resolve(new TextDecoder().decode(contents));
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    _enumerateNames(path) {
        const names = [];
        const directory = Gio.File.new_for_path(path);
        const enumerator = directory.enumerate_children(
            'standard::name',
            Gio.FileQueryInfoFlags.NONE,
            this._cancellable
        );

        try {
            let info;
            while ((info = enumerator.next_file(this._cancellable)) !== null)
                names.push(info.get_name());
        } finally {
            enumerator.close(this._cancellable);
        }

        return names;
    }

    async _detectThermalSensors() {
        const sensors = [];

        try {
            for (const hwmonName of this._enumerateNames(HWMON_PATH)) {
                const hwmonPath = `${HWMON_PATH}/${hwmonName}`;
                const driver = (await this._loadFile(`${hwmonPath}/name`)).trim();
                if (!CPU_HWMON_DRIVERS.has(driver))
                    continue;

                for (const fileName of this._enumerateNames(hwmonPath)) {
                    if (!/^temp\d+_input$/.test(fileName))
                        continue;

                    const inputPath = `${hwmonPath}/${fileName}`;
                    const labelPath = inputPath.replace(/_input$/, '_label');
                    let label = `${driver} ${fileName.replace('_input', '')}`;

                    try {
                        label = (await this._loadFile(labelPath)).trim() || label;
                    } catch (error) {
                        if (!this._isNotFoundError(error))
                            throw error;
                    }

                    sensors.push({
                        device: hwmonPath,
                        driver,
                        label,
                        path: inputPath,
                    });
                }
            }
        } catch (error) {
            if (!this._isCancelledError(error))
                this._logThermalError(`sensor discovery failed: ${error.message}`);
        }

        this._thermalSensors = sensors;
        this._lastThermalScan = GLib.get_monotonic_time() / GLib.USEC_PER_SEC;
    }

    _isNotFoundError(error) {
        return error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND) ?? false;
    }

    _isCancelledError(error) {
        return error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED) ?? false;
    }

    _logThermalError(message) {
        if (message === this._lastThermalError)
            return;

        this._lastThermalError = message;
        console.warn(`ResourceBuzz Lite: ${message}`);
    }

    _launchSelectedApp() {
        const appId = RESOURCE_APP_IDS[this._leftClickApp];
        const appInfo = Gio.AppInfo.get_all().find(info => info.get_id() === appId);
        if (!appInfo) {
            console.warn(`ResourceBuzz Lite: selected app is not installed: ${appId}`);
            return;
        }

        try {
            appInfo.launch([], null);
        } catch (error) {
            console.error(`ResourceBuzz Lite: failed to launch ${appId}: ${error.message}`);
        }
    }

    async _refresh() {
        if (this._refreshInProgress || this._destroyed)
            return;

        this._refreshInProgress = true;
        try {
            const updates = [];
            if (this._cpuStatus)
                updates.push(this._refreshCpu());
            if (this._ramStatus)
                updates.push(this._refreshRam());
            if (this._thermalStatus)
                updates.push(this._refreshThermal());
            await Promise.all(updates);
        } catch (error) {
            if (!this._isCancelledError(error))
                console.error(`ResourceBuzz Lite: refresh error: ${error.message}`);
        } finally {
            this._refreshInProgress = false;
        }
    }

    async _refreshCpu() {
        try {
            const content = await this._loadFile('/proc/stat');
            const values = content.split('\n', 1)[0]
                .trim()
                .split(/\s+/)
                .slice(1)
                .map(value => Number.parseInt(value, 10));

            if (values.length < 8 || values.some(Number.isNaN))
                throw new Error('Malformed /proc/stat CPU data');

            // guest and guest_nice are already included in user and nice.
            const total = values.slice(0, 8).reduce((sum, value) => sum + value, 0);
            const idle = values[3] + values[4];

            if (this._cpuTotalOld !== null) {
                const totalDelta = total - this._cpuTotalOld;
                const idleDelta = idle - this._cpuIdleOld;
                const usage = totalDelta > 0
                    ? 100 * (totalDelta - idleDelta) / totalDelta
                    : 0;
                this._setUsage(this._cpuLabel, this._cpuIcon, usage);
            }

            this._cpuTotalOld = total;
            this._cpuIdleOld = idle;
        } catch (error) {
            if (!this._isCancelledError(error)) {
                this._cpuLabel.text = 'N/A';
                console.error(`ResourceBuzz Lite: CPU error: ${error.message}`);
            }
        }
    }

    async _refreshRam() {
        try {
            const content = await this._loadFile('/proc/meminfo');
            const totalMatch = /^MemTotal:\s+(\d+)/m.exec(content);
            const availableMatch = /^MemAvailable:\s+(\d+)/m.exec(content);

            if (!totalMatch || !availableMatch)
                throw new Error('Malformed /proc/meminfo data');

            const total = Number.parseInt(totalMatch[1], 10);
            const available = Number.parseInt(availableMatch[1], 10);
            if (!Number.isFinite(total) || !Number.isFinite(available) || total <= 0)
                throw new Error('Invalid /proc/meminfo values');

            const usage = 100 * (total - available) / total;
            this._setUsage(this._ramLabel, this._ramIcon, usage);
        } catch (error) {
            if (!this._isCancelledError(error)) {
                this._ramLabel.text = 'N/A';
                console.error(`ResourceBuzz Lite: RAM error: ${error.message}`);
            }
        }
    }

    async _refreshThermal() {
        const now = GLib.get_monotonic_time() / GLib.USEC_PER_SEC;
        if (this._thermalSensors.length === 0 ||
            now - this._lastThermalScan >= TEMPERATURE_RESCAN_SECONDS)
            await this._detectThermalSensors();

        if (this._thermalSensors.length === 0) {
            this._setTemperatureUnavailable();
            return;
        }

        const readings = [];
        let failedReads = 0;
        for (const sensor of this._thermalSensors) {
            try {
                const content = await this._loadFile(sensor.path);
                const value = Number.parseInt(content.trim(), 10) / 1000;
                if (Number.isFinite(value) && value > -100 && value < 250)
                    readings.push({...sensor, value});
            } catch (error) {
                if (this._isCancelledError(error))
                    return;
                failedReads++;
            }
        }

        if (readings.length === 0) {
            this._thermalSensors = [];
            this._setTemperatureUnavailable();
            this._logThermalError('all CPU temperature sensor reads failed');
            return;
        }

        const selectedReadings = this._selectThermalReadings(readings);

        // A single panel value represents the hottest valid CPU-related sensor.
        const hottest = selectedReadings.reduce((current, reading) =>
            reading.value > current.value ? reading : current
        );
        const precision = this._decimalsStatus ? 1 : 0;
        const displayValue = this._thermalUnit === 1
            ? hottest.value * 9 / 5 + 32
            : hottest.value;
        const unit = this._thermalUnit === 1 ? 'F' : 'C';

        this._thermalLabel.text = `(${displayValue.toFixed(precision)}°${unit})`;
        this._thermalLabel.accessible_name =
            `Hottest CPU temperature: ${hottest.label}`;
        this._thermalLabel.set_style(this._showColorsStatus
            ? `color: ${this._getTemperatureColor(hottest.value)};`
            : null);
        if (failedReads > 0)
            this._logThermalError(`${failedReads} CPU temperature sensor reads failed`);
        else
            this._lastThermalError = null;
    }

    _selectThermalReadings(readings) {
        const physicalDies = new Set(
            readings
                .filter(reading =>
                    ['k10temp', 'zenpower'].includes(reading.driver) &&
                    /^Tdie$/i.test(reading.label)
                )
                .map(reading => reading.device)
        );

        return readings.filter(reading =>
            !(physicalDies.has(reading.device) && /^Tctl$/i.test(reading.label))
        );
    }

    _setUsage(label, icon, usage) {
        label.text = `${usage.toFixed(this._decimalsStatus ? 1 : 0)}%`;
        const style = this._showColorsStatus
            ? `color: ${this._getUsageColor(usage)};`
            : null;
        label.set_style(style);
        icon.set_style(style);
    }

    _setTemperatureUnavailable() {
        this._thermalLabel.text = '(N/A)';
        this._thermalLabel.set_style(null);
    }

    _getUsageColor(value) {
        if (value <= 25)
            return '#57e389';
        if (value <= 50)
            return '#f8e45c';
        if (value <= 70)
            return '#ffa348';
        if (value <= 90)
            return '#ed333b';
        return '#a51d2d';
    }

    _getTemperatureColor(value) {
        if (value <= 25)
            return '#57e389';
        if (value <= 45)
            return '#f8e45c';
        if (value <= 60)
            return '#ffa348';
        if (value <= 85)
            return '#ed333b';
        return '#a51d2d';
    }

    destroy() {
        this._destroyed = true;
        this._cancellable.cancel();

        if (this._mainTimer) {
            GLib.Source.remove(this._mainTimer);
            this._mainTimer = null;
        }

        for (const id of this._handlerIds)
            this._settings.disconnect(id);
        this._handlerIds = [];

        super.destroy();
    }
});

export default class ResourceMonitorExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._indicator = null;
        this._positionId = this._settings.connect(
            `changed::${EXTENSION_POSITION}`,
            () => this._updatePosition()
        );
        this._updatePosition();
    }

    _updatePosition() {
        this._indicator?.destroy();

        this._indicator = new ResourceMonitor({
            settings: this._settings,
            openPreferences: () => this.openPreferences(),
            path: this.path,
            name: this.metadata.name,
        });

        const positionIndex = clamp(
            this._settings.get_int(EXTENSION_POSITION),
            0,
            POSITION_NAMES.length - 1
        );
        Main.panel.addToStatusArea(
            this.uuid,
            this._indicator,
            0,
            POSITION_NAMES[positionIndex]
        );
    }

    disable() {
        if (this._positionId) {
            this._settings.disconnect(this._positionId);
            this._positionId = null;
        }

        this._indicator?.destroy();
        this._indicator = null;
        this._settings = null;
    }
}
