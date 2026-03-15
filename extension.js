/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */
/*
 * ResourceBuzz Lite
 */

import GObject from "gi://GObject";
import St from "gi://St";
import Gio from "gi://Gio";
import Clutter from "gi://Clutter";
import GLib from "gi://GLib";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as Util from "resource:///org/gnome/shell/misc/util.js";
import {
  Extension,
  gettext as _,
} from "resource:///org/gnome/shell/extensions/extension.js";

// Settings keys
const REFRESH_TIME = "refreshtime";
const EXTENSION_POSITION = "extensionposition";
const DECIMALS_STATUS = "decimalsstatus";
const LEFT_CLICK_STATUS = "leftclickstatus";
const RIGHT_CLICK_STATUS = "rightclickstatus";
const ICONS_STATUS = "iconsstatus";
const SHOW_COLORS_STATUS = "showcolorsstatus";
const CPU_STATUS = "cpustatus";
const RAM_STATUS = "ramstatus";
const THERMAL_CPU_TEMPERATURE_STATUS = "thermalcputemperaturestatus";
const THERMAL_TEMPERATURE_UNIT = "thermaltemperatureunit";

const ResourceMonitor = GObject.registerClass(
  class ResourceMonitor extends PanelMenu.Button {
    _init({ settings, openPreferences, path, metadata }) {
      super._init(0.0, metadata.name, false);

      this._settings = settings;
      this._openPreferences = openPreferences;
      this._path = path;
      this._metadata = metadata;

      this._handlerIds = [];
      this._cpuTotOld = 0;
      this._cpuIdleOld = 0;
      this._thermalPaths = [];

      this._createGui();
      this._loadSettings();
      this._connectSignals();
      this._detectThermalSensors();

      this.connect("button-press-event", this._onClicked.bind(this));

      this._mainTimer = GLib.timeout_add_seconds(
        GLib.PRIORITY_DEFAULT,
        this._refreshTime,
        () => {
            this._refresh();
            return GLib.SOURCE_CONTINUE;
        }
      );
      this._refresh();
    }

    _createGui() {
      this._box = new St.BoxLayout({ style_class: "panel-status-indicators-box" });

      // CPU Container
      this._cpuBox = new St.BoxLayout();
      this._cpuIcon = new St.Icon({
        gicon: Gio.icon_new_for_string(this._path + "/icons/cpu-symbolic.svg"),
        style_class: "system-status-icon",
      });
      this._cpuLabel = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
      this._thermalLabel = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
      
      // RAM Container
      this._ramBox = new St.BoxLayout();
      this._ramIcon = new St.Icon({
        gicon: Gio.icon_new_for_string(this._path + "/icons/ram-symbolic.svg"),
        style_class: "system-status-icon",
      });
      this._ramLabel = new St.Label({ y_align: Clutter.ActorAlign.CENTER });

      this.add_child(this._box);
    }

    _loadSettings() {
      this._refreshTime = this._settings.get_int(REFRESH_TIME);
      this._decimalsStatus = this._settings.get_boolean(DECIMALS_STATUS);
      this._leftClickStatus = this._settings.get_string(LEFT_CLICK_STATUS);
      this._rightClickStatus = this._settings.get_boolean(RIGHT_CLICK_STATUS);
      this._iconsStatus = this._settings.get_boolean(ICONS_STATUS);
      this._showColorsStatus = this._settings.get_boolean(SHOW_COLORS_STATUS);
      this._cpuStatus = this._settings.get_boolean(CPU_STATUS);
      this._ramStatus = this._settings.get_boolean(RAM_STATUS);
      this._thermalStatus = this._settings.get_boolean(THERMAL_CPU_TEMPERATURE_STATUS);
      this._thermalUnit = this._settings.get_int(THERMAL_TEMPERATURE_UNIT); // 0: C, 1: F

      this._updateGuiVisibility();
    }

    _updateGuiVisibility() {
      this._box.remove_all_children();
      this._cpuBox.remove_all_children();
      this._ramBox.remove_all_children();

      if (this._cpuStatus) {
        if (this._iconsStatus) this._cpuBox.add_child(this._cpuIcon);
        this._cpuBox.add_child(this._cpuLabel);
        if (this._thermalStatus) this._cpuBox.add_child(this._thermalLabel);
        this._box.add_child(this._cpuBox);
      }

      if (this._ramStatus) {
        if (this._iconsStatus) this._ramBox.add_child(this._ramIcon);
        this._ramBox.add_child(this._ramLabel);
        this._box.add_child(this._ramBox);
      }
    }

    _connectSignals() {
      const keys = [
        REFRESH_TIME, DECIMALS_STATUS, LEFT_CLICK_STATUS,
        RIGHT_CLICK_STATUS, ICONS_STATUS, SHOW_COLORS_STATUS,
        CPU_STATUS, RAM_STATUS, THERMAL_CPU_TEMPERATURE_STATUS,
        THERMAL_TEMPERATURE_UNIT
      ];

      keys.forEach(key => {
        this._handlerIds.push(this._settings.connect(`changed::${key}`, () => {
          this._loadSettings();
          if (key === REFRESH_TIME) {
            if (this._mainTimer) GLib.source_remove(this._mainTimer);
            this._mainTimer = GLib.timeout_add_seconds(
              GLib.PRIORITY_DEFAULT,
              this._refreshTime,
              () => {
                  this._refresh();
                  return GLib.SOURCE_CONTINUE;
              }
            );
          }
          this._refresh();
        }));
      });
    }

    async _loadFile(path) {
        return new Promise((resolve, reject) => {
            let file = Gio.File.new_for_path(path);
            file.load_contents_async(null, (file, res) => {
                try {
                    let [ok, contents] = file.load_contents_finish(res);
                    if (ok) {
                        resolve(new TextDecoder().decode(contents));
                    } else {
                        reject(new Error(`Failed to load ${path}`));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
    }

    async _detectThermalSensors() {
      try {
        const proc = Gio.Subprocess.new(
          ["bash", "-c", 'for i in /sys/class/hwmon/hwmon*/temp*_input; do NAME="$(<$(dirname $i)/name)"; if [[ "$NAME" == "coretemp" ]] || [[ "$NAME" == "k10temp" ]] || [[ "$NAME" == "zenpower" ]] || [[ "$NAME" == "cpu_thermal" ]]; then echo "$i"; fi done'],
          Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
        );
        proc.communicate_utf8_async(null, null, (proc, res) => {
            try {
                let [ok, stdout] = proc.communicate_utf8_finish(res);
                if (ok && stdout) {
                    this._thermalPaths = stdout.trim().split("\n");
                }
            } catch (e) {}
        });
      } catch (e) {
        console.error("ResourceBuzz Lite: Failed to detect thermal sensors", e);
      }
    }

    _getColorForValue(value, isTemp = false) {
      if (isTemp) {
        if (value <= 25) return "#57e389";
        if (value <= 45) return "#f8e45c";
        if (value <= 60) return "#ffa348";
        if (value <= 85) return "#ed333b";
        if (value <= 100) return "#a51d2d";
        return "#000000";
      } else {
        if (value <= 25) return "#57e389";
        if (value <= 50) return "#f8e45c";
        if (value <= 70) return "#ffa348";
        if (value <= 90) return "#ed333b";
        return "#a51d2d";
      }
    }

    _onClicked(actor, event) {
      if (event.get_button() === 1) { // Left click
        if (this._leftClickStatus) {
          Util.spawnCommandLine(this._leftClickStatus);
        }
      } else if (event.get_button() === 3) { // Right click
        if (this._rightClickStatus) {
          this._openPreferences();
        }
      }
    }

    _refresh() {
      if (this._cpuStatus) this._refreshCpu();
      if (this._ramStatus) this._refreshRam();
      if (this._thermalStatus) this._refreshThermal();
    }

    async _refreshCpu() {
      try {
        const content = await this._loadFile("/proc/stat");
        const line = content.split("\n")[0];
        const entry = line.trim().split(/\s+/);
        const user = parseInt(entry[1], 10);
        const nice = parseInt(entry[2], 10);
        const system = parseInt(entry[3], 10);
        const idleVal = parseInt(entry[4], 10);
        const total = user + nice + system + idleVal;

        const deltaTotal = total - this._cpuTotOld;
        const deltaIdle = idleVal - this._cpuIdleOld;
        const usage = deltaTotal ? (100 * (deltaTotal - deltaIdle)) / deltaTotal : 0;

        this._cpuTotOld = total;
        this._cpuIdleOld = idleVal;

        this._cpuLabel.text = `${usage.toFixed(this._decimalsStatus ? 1 : 0)}%`;
        if (this._showColorsStatus) {
          const color = this._getColorForValue(usage);
          this._cpuLabel.set_style(`color: ${color};`);
          this._cpuIcon.set_style(`color: ${color};`);
        } else {
          this._cpuLabel.set_style("");
          this._cpuIcon.set_style("");
        }
      } catch (e) {
        console.error(`ResourceBuzz Lite: CPU Error: ${e.message}`);
      }
    }

    async _refreshRam() {
      try {
        const content = await this._loadFile("/proc/meminfo");
        const lines = content.split("\n");
        let total = 0, available = 0;
        for (const line of lines) {
          if (line.startsWith("MemTotal:")) total = parseInt(line.match(/\d+/)[0], 10);
          if (line.startsWith("MemAvailable:")) available = parseInt(line.match(/\d+/)[0], 10);
          if (total && available) break;
        }
        const usage = total ? (100 * (total - available)) / total : 0;
        this._ramLabel.text = `${usage.toFixed(this._decimalsStatus ? 1 : 0)}%`;
        if (this._showColorsStatus) {
          const color = this._getColorForValue(usage);
          this._ramLabel.set_style(`color: ${color};`);
          this._ramIcon.set_style(`color: ${color};`);
        } else {
          this._ramLabel.set_style("");
          this._ramIcon.set_style("");
        }
      } catch (e) {
        console.error(`ResourceBuzz Lite: RAM Error: ${e.message}`);
      }
    }

    async _refreshThermal() {
      if (this._thermalPaths.length === 0) {
        this._thermalLabel.text = "[N/A]";
        return;
      }

      let totalTemp = 0;
      let count = 0;

      for (const path of this._thermalPaths) {
        try {
          const content = await this._loadFile(path);
          const temp = parseInt(content.trim(), 10) / 1000;
          if (!isNaN(temp)) {
            totalTemp += temp;
            count++;
          }
        } catch (e) {}
      }

      if (count > 0) {
        const avgC = totalTemp / count;
        const prec = this._decimalsStatus ? 1 : 0;

        if (this._thermalUnit === 1) { // Fahrenheit
          const avgF = (avgC * 9 / 5) + 32;
          this._thermalLabel.text = `[${avgF.toFixed(prec)}°F]`;
        } else { // Celsius
          this._thermalLabel.text = `[${avgC.toFixed(prec)}°C]`;
        }

        if (this._showColorsStatus) {
          this._thermalLabel.set_style(`color: ${this._getColorForValue(avgC, true)};`);
        } else {
          this._thermalLabel.set_style("");
        }
      }
    }

    destroy() {
      if (this._mainTimer) GLib.source_remove(this._mainTimer);
      this._handlerIds.forEach(id => this._settings.disconnect(id));
      super.destroy();
    }
  }
);

export default class ResourceMonitorExtension extends Extension {
  enable() {
    this._settings = this.getSettings();
    this._indicator = null;

    this._updatePosition();
    this._posId = this._settings.connect(`changed::${EXTENSION_POSITION}`, () => this._updatePosition());
  }

  _updatePosition() {
    if (this._indicator) {
        this._indicator.destroy();
        this._indicator = null;
    }
    
    this._indicator = new ResourceMonitor({
      settings: this._settings,
      openPreferences: () => this.openPreferences(),
      path: this.path,
      metadata: this.metadata,
    });

    const posIdx = this._settings.get_int(EXTENSION_POSITION);
    const positions = ["left", "center", "right"];
    const pos = positions[posIdx] || "right";
    Main.panel.addToStatusArea(this.uuid, this._indicator, 0, pos);
  }

  disable() {
    this._settings.disconnect(this._posId);
    if (this._indicator) {
        this._indicator.destroy();
        this._indicator = null;
    }
    this._settings = null;
  }
}
