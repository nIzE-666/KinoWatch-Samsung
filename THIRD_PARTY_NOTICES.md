# Licenses

This Samsung port is based on darkpal/KPuppy (MIT), snapshot
fbdc556ef0f14b5ec952a08a9c2cdb1db99d2c0d, and its original twttr/KPuppy
contributors. Their copyright notices and MIT license are retained in LICENSE.

ctepeo/KinoPub (GPL-3.0), snapshot f629179ec2e599613383a3a3962eec0859582ea4,
was inspected as a historical reference. No code or assets from that repository
are incorporated into this MIT application. The new Samsung adapter follows
Samsung's public API documentation.

Runtime dependencies: Preact (MIT), hls.js (Apache-2.0, browser fallback only),
@sentry/browser (MIT, inherited diagnostic calls, no configured transport).
Sentry runtime packages @sentry/core and @sentry-internal/browser-utils,
feedback, replay and replay-canvas carry their included MIT licenses.
Dependency licenses are included by scripts/package-tizen.ps1 in the widget.
The Vite build includes dependency notices and the full
[Apache License 2.0](licenses/APACHE-2.0.txt) used by hls.js.
