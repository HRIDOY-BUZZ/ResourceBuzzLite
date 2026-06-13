// SPDX-License-Identifier: GPL-2.0-or-later

import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const BINDINGS = [
    ['refreshtime', 'refreshtime_spin', 'value', Gio.SettingsBindFlags.DEFAULT],
    ['extensionposition', 'position_combo', 'selected', Gio.SettingsBindFlags.DEFAULT],
    ['decimalsstatus', 'decimals_switch', 'active', Gio.SettingsBindFlags.DEFAULT],
    ['showcolorsstatus', 'showcolors_switch', 'active', Gio.SettingsBindFlags.DEFAULT],
    ['cpustatus', 'cpu_switch', 'active', Gio.SettingsBindFlags.DEFAULT],
    ['ramstatus', 'ram_switch', 'active', Gio.SettingsBindFlags.DEFAULT],
    ['thermalcputemperaturestatus', 'thermal_switch', 'active', Gio.SettingsBindFlags.DEFAULT],
    ['thermaltemperatureunit', 'thermal_unit_combo', 'selected', Gio.SettingsBindFlags.DEFAULT],
    ['thermalcputemperaturestatus', 'thermal_unit_combo', 'sensitive', Gio.SettingsBindFlags.GET],
    ['leftclickapp', 'left_click_app_combo', 'selected', Gio.SettingsBindFlags.DEFAULT],
    ['rightclickstatus', 'right_click_switch', 'active', Gio.SettingsBindFlags.DEFAULT],
];

export default class ResourceMonitorPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const builder = Gtk.Builder.new_from_file(`${this.path}/prefs.ui`);
        const settings = this.getSettings();

        window.add(builder.get_object('settings_page'));
        window.add(builder.get_object('about_page'));

        for (const [key, objectId, property, flags] of BINDINGS)
            settings.bind(key, builder.get_object(objectId), property, flags);
    }
}
