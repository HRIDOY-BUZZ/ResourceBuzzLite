UUID := ResourceBuzzLite@hridoybuzz.dev
SCHEMA := schemas/org.gnome.shell.extensions.resourcebuzz-lite.gschema.xml

.PHONY: check pack

check:
	glib-compile-schemas --strict --dry-run schemas
	node --check extension.js
	node --check prefs.js
	git diff --check

pack: check
	gnome-extensions pack --force \
		--schema=$(SCHEMA) \
		--extra-source=prefs.ui \
		--extra-source=icons \
		--extra-source=LICENSE \
		--extra-source=COPYING \
		.
	@echo "Created $(UUID).shell-extension.zip"
