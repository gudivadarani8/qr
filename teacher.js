let qrTimer = null;
let html5QrCode = null; // scanner instance
let lastScanned = { text: null, at: 0 };

// Ensure UI is ready and wire up elements
document.addEventListener('DOMContentLoaded', () => {
  const genBtn = document.querySelector('button[onclick="generateQR()"]');
  if (genBtn) genBtn.disabled = false;
  const statusEl = document.getElementById('qr-status');
  if (statusEl) statusEl.innerText = 'Ready — click Generate QR';
  // Load existing subject assignments (used to display who owns each subject)
  loadAssignedSubjects().catch(err => console.warn('Failed to load subject assignments', err));

  // Wire stop-scan UI if present
  const stopBtn = document.getElementById('stop-scan-btn');
  if (stopBtn) stopBtn.style.display = 'none';
});

// Start camera-based QR scanning with better permission handling and guidance
async function startScan() {
  const qrReaderEl = document.getElementById('qr-reader');
  const stopBtn = document.getElementById('stop-scan-btn');
  const scanResultEl = document.getElementById('scan-result');
  const statusEl = document.getElementById('qr-status');

  if (!qrReaderEl) return alert('QR reader container missing');

  qrReaderEl.style.display = 'block';
  if (stopBtn) stopBtn.style.display = 'inline-block';
  if (statusEl) statusEl.innerText = 'Scanning — point your camera at the QR...';
  if (scanResultEl) scanResultEl.innerText = '';

  // create scanner instance lazily
  if (!html5QrCode) {
    try {
      html5QrCode = new Html5Qrcode('qr-reader');
    } catch (e) {
      console.error('Failed to initialize scanner', e);
      alert('Failed to start scanner: ' + e);
      qrReaderEl.style.display = 'none';
      if (stopBtn) stopBtn.style.display = 'none';
      return;
    }
  }

  // Permission pre-check (provides better UX messages on permission denial)
  if (navigator.permissions && navigator.permissions.query) {
    try {
      const p = await navigator.permissions.query({ name: 'camera' });
      if (p.state === 'denied') {
        alert('Camera access is blocked. In Chrome go to site settings and allow Camera permission.');
        if (statusEl) statusEl.innerText = 'Camera permission denied';
        return;
      }
    } catch (e) {
      // Some browsers don't support permissions.query for camera; ignore
    }
  }

  // Determine a good qrbox size depending on viewport — helps capture on mobile
  const vw = Math.min(window.innerWidth, window.innerHeight);
  const boxSize = Math.max(150, Math.min(400, Math.floor(vw * 0.55)));
  const config = { fps: 10, qrbox: { width: boxSize, height: boxSize } };

  // Start camera. Use facingMode: 'environment' as a safe default.
  try {
    const cameras = await Html5Qrcode.getCameras();
    const cameraId = (cameras && cameras.length) ? cameras[0].id : null;
    const constraints = cameraId ? { deviceId: { exact: cameraId } } : { facingMode: { ideal: 'environment' } };

    html5QrCode.start(constraints, config,
      qrCodeMessage => {
        // Deduplicate immediate repeats to avoid accidental duplicate opens
        const now = Date.now();
        if (lastScanned.text === qrCodeMessage && (now - lastScanned.at) < 3000) {
          console.log('Duplicate scan ignored');
          return;
        }
        lastScanned = { text: qrCodeMessage, at: now };
        handleScanResult(qrCodeMessage);
      },
      errorMessage => {
        // non-fatal scan error; ignore frequently occurring decode errors
        console.warn('Scan error', errorMessage);
      }
    );
  } catch (err) {
    // Provide more actionable messages for common failures
    console.error('Scanner start failed', err);
    if (err && err.name === 'NotAllowedError') {
      alert('Camera permission denied. Please allow camera access and try again.');
    } else if (err && err.message && err.message.toLowerCase().includes('permission')) {
      alert('Camera permission error: ' + err.message);
    } else {
      alert('Unable to start camera: ' + (err.message || err));
    }
    qrReaderEl.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'none';
    if (statusEl) statusEl.innerText = 'Ready — click Generate QR';
  }
}

function stopScan() {
  const qrReaderEl = document.getElementById('qr-reader');
  const stopBtn = document.getElementById('stop-scan-btn');
  const statusEl = document.getElementById('qr-status');
  if (!html5QrCode) {
    if (qrReaderEl) qrReaderEl.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'none';
    if (statusEl) statusEl.innerText = 'Ready — click Generate QR';
    return;
  }

  html5QrCode.stop().then(() => {
    // stop camera and remove preview
    html5QrCode.clear();
    html5QrCode = null;
    if (qrReaderEl) qrReaderEl.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'none';
    if (statusEl) statusEl.innerText = 'Ready — click Generate QR';
  }).catch(err => {
    console.error('Failed to stop scanner', err);
  });
}

// Normalize subject into a stable document id
function normalizeSubject(subject) {
  return (subject || '').toString().trim().replace(/\s+/g, '_').toUpperCase();
}

// Load assignments from `subjects` collection and annotate the subject <select>
async function loadAssignedSubjects() {
  try {
    const snapshot = await db.collection('subjects').get();
    const assignments = {};
    snapshot.forEach(doc => { assignments[doc.id] = doc.data().teacher; });
    const select = document.getElementById('subject');
    if (!select) return;
    for (let i = 0; i < select.options.length; i++) {
      const opt = select.options[i];
      const val = opt.value;
      if (!val) continue;
      const id = normalizeSubject(val);
      if (assignments[id]) {
        opt.text = `${val} — assigned to ${assignments[id]}`;
        opt.dataset.assigned = assignments[id];
      } else {
        opt.dataset.assigned = '';
      }
    }
  } catch (e) {
    console.warn('loadAssignedSubjects failed', e);
  }
} 

async function handleScanResult(text) {
  // stop scanning immediately for cleaner UX
  try { stopScan(); } catch (e) { console.warn(e); }

  const scanResultEl = document.getElementById('scan-result');
  if (scanResultEl) scanResultEl.innerText = 'Scanned: ' + text;

  // If scanned text looks like the student URL, validate session ownership before opening
  try {
    const parsed = new URL(text, location.href);
    const sessionId = parsed.searchParams.get('session');
    if (parsed.pathname.endsWith('student.html') || sessionId) {
      // Require teacher name to be filled so we can verify ownership
      const currentTeacher = (document.getElementById('teacher') && document.getElementById('teacher').value || '').trim();
      if (!currentTeacher) {
        alert('Enter your teacher name in the "Teacher" box before scanning a QR to verify ownership.');
        return;
      }

      if (sessionId) {
        try {
          const doc = await db.collection('sessions').doc(sessionId).get();
          if (!doc.exists) {
            alert('Session not found in database.');
            return;
          }
          const data = doc.data();
          // If session has subjectId or teacher stored, ensure it matches current teacher
          if (data.teacher && data.teacher !== currentTeacher) {
            alert(`Unauthorized: this session belongs to ${data.teacher}. Only the assigned faculty can open it.`);
            return;
          }
        } catch (e) {
          console.error('Failed to validate session ownership', e);
          alert('Failed to validate session ownership — see console for details');
          return;
        }
      }

      // Ensure link is absolute (many mobile scanners require https absolute URLs)
      window.open(parsed.href, '_blank');
      return;
    }
  } catch (e) {
    // Not a URL — show the scanned text to the user
  }

  // Otherwise copy to clipboard for convenience
  if (navigator.clipboard) navigator.clipboard.writeText(text).catch(()=>{});
} 

async function generateQR() {
  const teacher = (document.getElementById("teacher").value || '').trim();
  const className = (document.getElementById("class").value || '').trim();
  const subject = (document.getElementById("subject").value || '').trim();

  if (!teacher || !className || !subject) {
    alert("Please fill all fields");
    return;
  }

  const subjectId = normalizeSubject(subject);

  try {
    const subjRef = db.collection('subjects').doc(subjectId);
    const subjDoc = await subjRef.get();
    if (subjDoc.exists) {
      const assigned = subjDoc.data().teacher;
      if (assigned !== teacher) {
        alert(`Subject "${subject}" is assigned to ${assigned}. Only that faculty can generate or open QR for this subject.`);
        return;
      }
    } else {
      // First assignment — create a permanent subject -> teacher mapping
      await subjRef.set({ teacher, subject, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    }
  } catch (e) {
    console.warn('Failed to verify/create subject assignment', e);
    alert('Failed to verify subject assignment — see console');
    return;
  }

  // 🔹 Create session
  const sessionId = "session_" + Date.now();
  const now = Date.now();

  // ⏱️ SET QR EXPIRY TIME (5 MINUTES)
  const EXPIRY_TIME_MS = 5 * 60 * 1000;
  const expiryMs = now + EXPIRY_TIME_MS;

  // 🔹 Student page URL — prefer a publicly accessible HTTPS URL so phone scanners can open it reliably
  let studentURL;
  try {
    const useHosted = (typeof firebaseConfig !== 'undefined' && firebaseConfig.authDomain);
    const originIsHttp = location.protocol === 'http:' || location.protocol === 'https:';
    const originIsLocal = originIsHttp && (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname.startsWith('192.') || location.hostname.startsWith('10.'));

    // If user opted-in to provide a custom public URL, use it after validation
    const customEnabled = document.getElementById('enable-custom-url') && document.getElementById('enable-custom-url').checked;
    if (customEnabled) {
      const customVal = (document.getElementById('custom-base-url') && document.getElementById('custom-base-url').value || '').trim();
      if (customVal) {
        // basic validation: must start with http:// or https:// and prefer https
        if (!/^https?:\/\//i.test(customVal)) {
          alert('Custom URL must start with http:// or https://');
          return;
        }
        studentURL = `${customVal.replace(/\/$/, '')}/student.html?session=${sessionId}`;
      } else {
        alert('Custom URL is enabled but empty. Please enter a public URL or disable the option.');
        return;
      }
    } else if (originIsHttp && !originIsLocal) {
      // accessible origin — build absolute URL from current origin
      const base = location.origin + location.pathname.replace(/\/[^\/]*$/, '/');
      studentURL = `${base}student.html?session=${sessionId}`;
    } else if (useHosted) {
      // fallback to Firebase hosting domain (requires site to be deployed there)
      studentURL = `https://${firebaseConfig.authDomain.replace(/\/$/, '')}/student.html?session=${sessionId}`;
    } else {
      // last resort — relative URL (may not be reachable by other devices)
      studentURL = `student.html?session=${sessionId}`;
      console.warn('Using relative student URL; scanning may not work from other devices because the URL is not publicly accessible. Consider enabling a public URL or deploying to Firebase Hosting (HTTPS).');
    }
  } catch (e) {
    studentURL = `student.html?session=${sessionId}`;
  }
  console.log('Generated studentURL for QR:', studentURL);

  // 🟢 Generate QR (make it sizeable for better scanning)
  const qrcodeEl = document.getElementById("qrcode");
  if (qrcodeEl) qrcodeEl.innerHTML = "";
  try {
    // Larger QR yields more reliable scanning across devices
    const qr = new QRCode(qrcodeEl, {
      text: studentURL,
      width: 256,
      height: 256
    });
  } catch (e) {
    console.error('QR generation failed', e);
    const statusEl = document.getElementById("qr-status");
    if (statusEl) statusEl.innerText = 'Error generating QR — open console for details';
    return;
  }

  // show direct link too (useful for manual open / testing)
  const genUrlEl = document.getElementById("generated-url");
  if (genUrlEl) genUrlEl.innerHTML = `Direct link: <a href="${studentURL}" target="_blank" rel="noopener">${studentURL}</a>`;

  // show action area (upload image for local testing)
  const actions = document.getElementById('qr-actions');
  if (actions) actions.style.display = 'block';
  const uploadIn = document.getElementById('qr-upload');
  const actionMsg = document.getElementById('qr-action-msg');
  if (uploadIn) uploadIn.onchange = (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    if (!window.Html5Qrcode || !window.Html5Qrcode.scanFileV2) {
      if (actionMsg) actionMsg.innerText = 'Image scan not available (missing library)';
      return;
    }
    if (actionMsg) actionMsg.innerText = 'Scanning uploaded image...';
    Html5Qrcode.scanFileV2(file, true).then(decodedText => {
      if (actionMsg) actionMsg.innerText = 'Scanned: ' + decodedText;
      handleScanResult(decodedText);
    }).catch(err => {
      console.error('Image scan failed', err);
      if (actionMsg) actionMsg.innerText = 'Image scan failed — check console';
    });
  }

  const statusEl = document.getElementById("qr-status");
  const countdownEl = document.getElementById('qr-countdown');
  if (statusEl) statusEl.innerText = 'QR generated — scan with phone';

  // 🧹 Clear old timer
  if (qrTimer) clearInterval(qrTimer);

  // initialize visual countdown/progress
  function formatTime(ms) {
    const sec = Math.ceil(ms / 1000);
    const min = Math.floor(sec / 60);
    const rem = sec % 60;
    return `${min}:${rem.toString().padStart(2, "0")}`;
  }

  const totalDuration = EXPIRY_TIME_MS;
  if (countdownEl) countdownEl.innerText = `Expires in ${formatTime(totalDuration)}`;
  const fillInit = document.getElementById("qr-progress-fill");
  if (fillInit) { fillInit.style.width = '100%'; fillInit.style.background = '#4caf50'; }

  // 🔁 Start countdown
  qrTimer = setInterval(() => {
    const timeLeft = expiryMs - Date.now();

    if (timeLeft <= 0) {
      clearInterval(qrTimer);

      // ❌ Remove QR
      document.getElementById("qrcode").innerHTML = "";
      if (statusEl) statusEl.innerText = "QR expired ⌛ Attendance closed";
      const genUrlEl = document.getElementById("generated-url");
      if (genUrlEl) genUrlEl.innerText = "";

      // reset progress
      const fill = document.getElementById("qr-progress-fill");
      if (fill) { fill.style.width = '0%'; fill.style.background = '#f44336'; }

      // 🔐 Mark session expired in Firebase using server timestamp
      db.collection("sessions").doc(sessionId).update({
        expired: true,
        expiredAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(err => console.warn('Failed to mark session expired in DB', err));

      if (countdownEl) countdownEl.innerText = 'Expired';

      return;
    }

    // ⏳ Update countdown (preserve URL display)
    if (countdownEl) countdownEl.innerText = `Expires in ${formatTime(timeLeft)}`;

    // update visual progress (if present)
    const fill = document.getElementById("qr-progress-fill");
    if (fill) {
      const percent = Math.max(0, Math.min(100, (timeLeft / totalDuration) * 100));
      fill.style.width = percent + '%';
      fill.style.background = percent < 30 ? '#f44336' : '#4caf50';
    }
  }, 1000);

  // 💾 Save session to Firebase with both numeric ms and Timestamp so rules and clients can validate
  db.collection("sessions").doc(sessionId).set({
    teacher,
    class: className,
    subject,
    subjectId,
    createdAt: firebase.firestore.Timestamp.fromMillis(now),
    expiryTimeMs: expiryMs,
    expiryAt: firebase.firestore.Timestamp.fromMillis(expiryMs),
    expired: false
  });
} 

/*
  NOTES ABOUT COMMON SCAN FAILURES (and how this code helps):

  - Size: Small QR images can be missed by phone cameras. We generate a 256x256 QR
    and expose a progress + direct link so teachers can enlarge or share the URL.

  - Contrast: Low contrast or noisy backgrounds cause decoding errors. Use a
    dark-on-light QR (default from qrcodejs) and print on a plain background.

  - HTTPS / Absolute URLs: Many mobile QR openers prefer absolute HTTPS links.
    We prefer absolute origin URLs or allow a custom public URL to be supplied.

  - Camera permissions: If the browser blocks camera access, we show a clear
    message and suggest the site settings change. We also use a permission
    pre-check to provide better guidance rather than a generic failure.

  - Lighting & Focus: Our QR box size adapts to viewport to maximize reliability.
*/
