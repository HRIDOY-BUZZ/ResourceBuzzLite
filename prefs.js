/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import Adw from "gi://Adw";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

const REFRESH_TIME = "refreshtime";
const EXTENSION_POSITION = "extensionposition";
const DECIMALS_STATUS = "decimalsstatus";
const ICONS_STATUS = "iconsstatus";
const SHOW_COLORS_STATUS = "showcolorsstatus";
const CPU_STATUS = "cpustatus";
const RAM_STATUS = "ramstatus";
const THERMAL_CPU_TEMPERATURE_STATUS = "thermalcputemperaturestatus";
const THERMAL_TEMPERATURE_UNIT = "thermaltemperatureunit";

export default class ResourceMonitorPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const builder = new Gtk.Builder();
        builder.add_from_file(this.path + "/prefs.ui");

        const settings = this.getSettings();

        const settingsPage = builder.get_object("settings_page");
        const aboutPage = builder.get_object("about_page");

        window.add(settingsPage);
        window.add(aboutPage);

        // Bind settings
        settings.bind(REFRESH_TIME, builder.get_object("refreshtime_spin"), "value", Gio.SettingsBindFlags.DEFAULT);
        settings.bind(EXTENSION_POSITION, builder.get_object("position_combo"), "selected", Gio.SettingsBindFlags.DEFAULT);
        settings.bind(DECIMALS_STATUS, builder.get_object("decimals_switch"), "active", Gio.SettingsBindFlags.DEFAULT);
        settings.bind(ICONS_STATUS, builder.get_object("icons_switch"), "active", Gio.SettingsBindFlags.DEFAULT);
        settings.bind(SHOW_COLORS_STATUS, builder.get_object("showcolors_switch"), "active", Gio.SettingsBindFlags.DEFAULT);
        settings.bind(CPU_STATUS, builder.get_object("cpu_switch"), "active", Gio.SettingsBindFlags.DEFAULT);
        settings.bind(RAM_STATUS, builder.get_object("ram_switch"), "active", Gio.SettingsBindFlags.DEFAULT);
        settings.bind(THERMAL_CPU_TEMPERATURE_STATUS, builder.get_object("thermal_switch"), "active", Gio.SettingsBindFlags.DEFAULT);
        settings.bind(THERMAL_TEMPERATURE_UNIT, builder.get_object("thermal_unit_combo"), "selected", Gio.SettingsBindFlags.DEFAULT);
    }
}
