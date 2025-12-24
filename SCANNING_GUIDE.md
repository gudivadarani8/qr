# QR Scanning Guide — Common Failures & Fixes

This short guide explains common reasons a QR fails to scan on mobile (especially Chrome/Android) and what we did in the code to fix them.

1) Small QR or low resolution
- Problem: Phone cameras cannot reliably decode QR codes that are too small or have fine modules.
- Fix: We generate a larger QR (256×256 by default) and show a direct link; the teacher can enlarge it or share the URL.
- How it helps: Larger codes produce larger modules which are easier to resolve at camera focal distance.

2) Poor contrast or noisy background
- Problem: Light-colored QR on a dark background or noisy print reduces decoding reliability.
- Fix: Use a high-contrast (dark on light) QR and avoid placing it on patterned backgrounds.
- How it helps: Clear edges and strong contrast make binarization and decoding robust.

3) HTTPS / Absolute URLs
- Problem: Some mobile QR openers prefer or require an absolute HTTPS URL; relative links may not work across devices.
- Fix: We attempt to build an absolute HTTPS URL (or allow a custom public URL) when generating the QR.
- How it helps: Scanners and browser handlers will open the link reliably across devices and browsers.

4) Camera permissions blocked
- Problem: If the browser denies camera access, scanning can't start.
- Fix: The teacher-page checks permissions and shows actionable guidance if permission is denied (site settings -> allow camera).
- How it helps: Users get clear steps to resolve permission issues, instead of a cryptic error.

5) Lighting, focus, motion blur
- Problem: Low light and movement cause blurry frames and failed decodes.
- Fix: We adapt scanner QR box size to the viewport and recommend steady cameras and good light.
- How it helps: Larger box + steady camera + light increases successful frame captures.

6) Duplicate scans / accidental re-scans
- Problem: Repeated scanning can open multiple tabs or duplicated actions.
- Fix: The scanner on the teacher page ignores duplicate scans within a short cooldown (3s); server rules prevent duplicate attendance docs.
- How it helps: Prevents accidental repeats and enforces single attendance marking.

7) Expiry & server-side validation
- Problem: Relying only on the client can lead to races or deliberate bypasses.
- Fix: We save expiry as both `expiryTimeMs` (number) and `expiryAt` (Firestore Timestamp) and implement Firestore security rules that block writes after expiry and disallow overwrites.
- How it helps: Even if a client is manipulated, the backend prevents invalid writes.

If a QR still doesn't scan: take a stable photo and use an image scanner (we support scanning an uploaded image via the teacher UI), or share the direct link shown under the QR.
