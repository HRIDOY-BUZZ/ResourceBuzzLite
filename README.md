# ResourceBuzz Lite

<p align="center">
  A lightweight GNOME Shell extension that displays CPU usage, RAM usage, and
  the hottest available CPU temperature directly in the top panel.
</p>

<p align="center">
  <a href="https://github.com/HRIDOY-BUZZ/ResourceBuzzLite">
    <img alt="GNOME Shell 45-50" src="https://img.shields.io/badge/GNOME%20Shell-45--50-4A86CF">
  </a>
  <a href="LICENSE">
    <img alt="GPL-2.0-or-later" src="https://img.shields.io/badge/License-GPL--2.0--or--later-blue">
  </a>
</p>

## Preview

![ResourceBuzz Lite Screenshot](https://raw.githubusercontent.com/HRIDOY-BUZZ/ResourceBuzzLite/refs/heads/master/screenshots/1.png)

![ResourceBuzz Lite preferences Screenshot](https://raw.githubusercontent.com/HRIDOY-BUZZ/ResourceBuzzLite/refs/heads/master/screenshots/2.png)

## Features

- Displays current CPU and RAM usage in the GNOME top panel.
- Shows the hottest valid CPU-related temperature sensor when supported by the
  system.
- Supports Celsius and Fahrenheit temperature units.
- Optional decimal values and usage-based colors.
- Individually show or hide CPU, RAM, and CPU temperature.
- Configurable refresh interval from 1 to 60 seconds.
- Places the indicator on the left, center, or right side of the panel.
- Left-click can open:
  - Resources
  - GNOME System Monitor
  - Mission Center
  - Any installed application using its desktop app ID
  - Nothing, when left-click is disabled
- Optional right-click shortcut for opening the extension preferences.

## Compatibility

ResourceBuzz Lite currently declares support for:

- GNOME Shell 45
- GNOME Shell 46
- GNOME Shell 47
- GNOME Shell 48
- GNOME Shell 49
- GNOME Shell 50

CPU and RAM monitoring use Linux `/proc` interfaces. CPU temperature monitoring
uses Linux `hwmon` sensors and currently recognizes common CPU drivers including
`coretemp`, `k10temp`, `zenpower`, and `cpu_thermal`.

Some systems do not expose a supported CPU temperature sensor. On those
systems, the temperature value displays `N/A` while CPU and RAM monitoring
continue normally.

## Installation

### GNOME Extensions Website

Once published, install ResourceBuzz Lite from its page on
[ResourceBuzz Lite](https://extensions.gnome.org/extension/10344/resourcebuzz-lite/).

### Install a Release ZIP

Install a downloaded release package:

```bash
gnome-extensions install --force ResourceBuzzLite@hridoybuzz.dev.shell-extension.zip
```

Log out and back in to ensure GNOME Shell loads the newly installed extension,
especially when using Wayland. Then enable it:

```bash
gnome-extensions enable ResourceBuzzLite@hridoybuzz.dev
```

You can also enable it using the
[GNOME Extensions](https://apps.gnome.org/Extensions/) application.

### Install from Source

Requirements:

- GNOME Shell 45 or newer
- `gnome-extensions`
- `glib-compile-schemas` (usually part of glib2 development packages)

Clone and build the extension package:

```bash
git clone https://github.com/HRIDOY-BUZZ/ResourceBuzzLite.git
cd ResourceBuzzLite
gnome-extensions pack --force \
  --schema=schemas/org.gnome.shell.extensions.resourcebuzz-lite.gschema.xml \
  --extra-source=prefs.ui \
  --extra-source=icons \
  --extra-source=LICENSE \
  .
```

Install the generated package:

```bash
gnome-extensions install --force ResourceBuzzLite@hridoybuzz.dev.shell-extension.zip
```

Log out and back in, then enable ResourceBuzz Lite using the Extensions
application or the command shown above.

## Configuration

Open preferences from the Extensions application, right-click the panel
indicator when that action is enabled, or run:

```bash
gnome-extensions prefs ResourceBuzzLite@hridoybuzz.dev
```

### Display Settings

| Setting | Description | Default |
| --- | --- | --- |
| Refresh Interval | Time between resource updates, from 1 to 60 seconds | 2 seconds |
| Panel Position | Places the indicator on the left, center, or right | Right |
| Show Decimals | Displays values with one decimal place | Enabled |
| Show Usage Colors | Colors values based on current utilization | Disabled |

### Resource Settings

| Setting | Description | Default |
| --- | --- | --- |
| CPU Usage | Shows current CPU utilization | Enabled |
| RAM Usage | Shows current memory utilization | Enabled |
| CPU Temperature | Shows the hottest supported CPU sensor | Enabled |
| Temperature Unit | Selects Celsius or Fahrenheit | Celsius |

### Mouse Actions

| Setting | Description | Default |
| --- | --- | --- |
| Left-click App | Selects the app launched by left-click | Resources |
| Custom App ID | Desktop application ID used by the custom option | Empty |
| Right-click Opens Preferences | Opens extension settings on right-click | Enabled |

To find an installed desktop app ID, inspect the application files in:

```text
/usr/share/applications/
~/.local/share/applications/
/var/lib/snapd/desktop/applications/
```

Example app IDs include `org.gnome.SystemMonitor.desktop` and
`net.nokyan.Resources.desktop`.

## Development

The runtime extension is implemented in `extension.js`. Preferences are defined
by `prefs.js` and `prefs.ui`, while settings are stored in the GSettings schema
under `schemas/`.

Run the validation checks:

- Validate GSettings schema:
  ```bash
  glib-compile-schemas --strict --dry-run schemas
  ```
- Check JavaScript syntax:
  ```bash
  node --check extension.js
  node --check prefs.js
  ```
- Check git diff for trailing whitespaces:
  ```bash
  git diff --check
  ```

Build the submission package:

```bash
gnome-extensions pack --force \
  --schema=schemas/org.gnome.shell.extensions.resourcebuzz-lite.gschema.xml \
  --extra-source=prefs.ui \
  --extra-source=icons \
  --extra-source=LICENSE \
  .
```

Verify the generated package:

```bash
unzip -t ResourceBuzzLite@hridoybuzz.dev.shell-extension.zip
```

### Monitor Runtime Logs

Follow ResourceBuzz Lite messages from GNOME Shell:

```bash
journalctl --user -f -o cat /usr/bin/gnome-shell \
  | grep --line-buffered -F 'ResourceBuzz Lite:'
```

## Troubleshooting

### Changes Do Not Appear

GNOME Shell may continue running an older loaded extension version after files
are replaced. Log out and back in to fully reload it, particularly on Wayland.

### Preferences Reports a Missing GSettings Key

Recompile the installed schema:

```bash
glib-compile-schemas \
  ~/.local/share/gnome-shell/extensions/ResourceBuzzLite@hridoybuzz.dev/schemas
```

Then close and reopen the preferences window.

### CPU Temperature Shows `N/A`

The system may not expose a supported CPU sensor through Linux `hwmon`. Confirm
available drivers with:

```bash
for sensor in /sys/class/hwmon/hwmon*/name; do
  printf '%s: ' "$sensor"
  cat "$sensor"
done
```

CPU and RAM monitoring do not depend on temperature sensor availability.

### A Left-click App Does Not Open

Confirm that the selected desktop app ID exists. For custom apps, enter the
desktop ID rather than a shell command or executable path.

## Contributing

Bug reports and focused pull requests are welcome. Before submitting changes:

1. Validate GSettings schema (`glib-compile-schemas --strict --dry-run schemas`) and JavaScript syntax (`node --check extension.js && node --check prefs.js`).
2. Build the extension package using `gnome-extensions pack`.
3. Verify the generated package with `unzip -t`.
4. Test enable, disable, preferences, panel updates, and mouse actions in a
   live GNOME Shell session.

Report issues through the
[GitHub issue tracker](https://github.com/HRIDOY-BUZZ/ResourceBuzzLite/issues).

## License

ResourceBuzz Lite is distributed under the
[GNU General Public License v2.0 or later](LICENSE).
