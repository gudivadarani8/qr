QR Attendance
=============

Quick notes for testing and deployment

- Local testing (same device): Open `index.html` and `student.html` locally — scanning with the same device won't work because the QR will encode a `file://` or local origin not reachable by phones. Use a second device to scan.

- Expose to network using ngrok (recommended for quick testing):
  1. Install ngrok (https://ngrok.com/).
  2. Run a local static server (for example, `npx http-server` in the project dir).
  3. Run `ngrok http 8080` (replace 8080 with your server port).
  4. Copy the public ngrok URL (for example `https://<your-id>.ngrok.io`) and paste it into the app's **Advanced: use custom public URL** when generating QR (enable the checkbox first). The QR will then encode `https://<your-id>.ngrok.io/student.html?session=...` and student devices can open it.

- Deploy to Firebase Hosting (recommended for production):
  1. Install Firebase CLI: `npm install -g firebase-tools`.
  2. `firebase login` and `firebase init` (choose Hosting and point to this folder).
  3. `firebase deploy` — the site will be available at the Hosting URL (use that domain; the app will auto-fallback to Firebase Hosting domain if you are using the same Firebase `authDomain` in `firebase.js`).

Security note
- Use the custom public URL only when you trust the network/service. The app will accept the provided URL and encode it in the QR for students to open.

Testing checklist
- Ensure Firebase Auth Email/Password provider is enabled in the Firebase console so teachers can create accounts and sign in.
- Register a teacher and generate a QR. Scan from another device and submit attendance as a student.

Firestore rules
- To enforce expiry & prevent duplicate/overwrite attendance, deploy the included `firestore.rules` to your Firebase project:
  1. Install Firebase CLI (`npm i -g firebase-tools`) and login: `firebase login`.
  2. Run `firebase deploy --only firestore:rules` to publish the rules file.

Hosting / HTTPS
- For the most reliable experience make sure the student devices open an HTTPS absolute URL (Firebase Hosting or an HTTPS public URL). The app attempts to generate an absolute HTTPS URL but you can also set a custom public URL (see Advanced option).
