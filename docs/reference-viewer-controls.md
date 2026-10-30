# Reference material resize and zoom

The Reference Material window supports dragging its title bar, resizing with the
bottom-right grip, and maximizing/restoring from its header. Window dimensions and
position stay within the viewport after a browser resize or orientation change.
The grip also supports arrow keys (16 pixels) and Shift+arrow keys (64 pixels).

PDF and image references have independent Zoom out / Zoom in controls from 50% to
300%, plus Fit width. Enlarged content scrolls inside the reference window. PDF
zoom scales the existing PDF surface without changing its signed URL or replacing
the iframe, preserving the current document. The browser's PDF reader continues
to handle the PDF itself; Open original remains available in a separate tab.
The embedded document requests a hidden native toolbar and thumbnail sidebar so
the available window area goes to the page; the portal supplies its own controls.
The parameters follow Chromium's [PDF open-parameter parser](https://chromium.googlesource.com/chromium/src/+/HEAD/chrome/browser/resources/pdf/open_pdf_params_parser.ts).

Each reference file starts at Fit width; switching files or closing/reopening the
window resets its zoom. Signed URL renewal does not reset zoom. Other exam tools,
answers, autosave, timers and attempt limits keep their existing behavior.

No database migration, Storage policy change or new production dependency is needed.

Validation: `test-runtime/verify-reference-viewer.mjs` bundles the actual React
components into an ignored local harness and exercises image/PDF zoom, scrolling,
pointer and keyboard resize, mobile touch resize, maximize/restore, viewport
changes and close/reopen. It uses only synthetic documents. Run after `npm run
build` with `PLAYWRIGHT_MODULE` and `BROWSER_EXECUTABLE` configured as needed.
