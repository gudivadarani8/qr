function getClientId() {
  let id = localStorage.getItem('qrClientId');
  if (!id) {
    // Create a (semi-stable) client id stored in localStorage so we can
    // detect the same device marking multiple rolls.
    id = 'client_' + Date.now() + '_' + Math.random().toString(36).slice(2,10);
    localStorage.setItem('qrClientId', id);
  }
  return id;
}

function markAttendance() {
  const roll = document.getElementById("roll").value.trim();
  const name = document.getElementById("name").value.trim();

  if (!roll || !name) {
    document.getElementById("msg").innerText = "Fill all fields";
    return;
  }
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session");

  if (!sessionId) {
    document.getElementById("msg").innerText = "Invalid session";
    return;
  }

  const sessionRef = db.collection("sessions").doc(sessionId);

  // Check session existence and expiry before saving attendance. This is important
  // because clients can be manipulated; server-side Firestore rules also enforce
  // expiry checks and disallow overwrites.
  sessionRef.get().then(doc => {
    if (!doc.exists) {
      document.getElementById("msg").innerText = "Invalid session";
      return;
    }

    const sessionData = doc.data();
    // We now store expiry as `expiryTimeMs` (numeric ms) for reliable comparisons
    const expiryMs = sessionData.expiryTimeMs || (sessionData.expiryAt && sessionData.expiryAt.toMillis && sessionData.expiryAt.toMillis()) || 0;
    if (Date.now() > expiryMs || sessionData.expired) {
      document.getElementById("msg").innerText = "Session expired ⌛";
      return;
    }

    const clientId = getClientId();
    const deviceRef = sessionRef.collection("devices").doc(clientId);
    const attendanceRef = sessionRef.collection("attendance").doc(roll);

    // Use a transaction to atomically ensure: session not expired, device not used, attendance not present
    db.runTransaction(async (tx) => {
      const sDoc = await tx.get(sessionRef);
      if (!sDoc.exists) throw new Error('SessionNotFound');

      const sData = sDoc.data();
      const expiryMs = sData.expiryTimeMs || (sData.expiryAt && sData.expiryAt.toMillis && sData.expiryAt.toMillis()) || 0;
      if (Date.now() > expiryMs || sData.expired) throw new Error('SessionExpired');

      const devDoc = await tx.get(deviceRef);
      if (devDoc.exists) {
        // Device already used — prevent multiple attendances from same device
        const existingRoll = devDoc.data() && devDoc.data().roll ? devDoc.data().roll : 'unknown';
        throw new Error('DeviceAlreadyUsed:' + existingRoll);
      }

      const attDoc = await tx.get(attendanceRef);
      if (attDoc.exists) {
        throw new Error('AttendanceExists');
      }

      // Both checks passed — create attendance and device docs atomically
      tx.set(attendanceRef, {
        name: name,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        clientId: clientId
      });

      tx.set(deviceRef, {
        roll: roll,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });

    }).then(() => {
      document.getElementById("msg").innerText = "Attendance marked ✅";
      // Optionally hide the form to prevent re-submission
      const form = document.getElementById('attendanceForm');
      if (form) form.style.display = 'none';
    }).catch(err => {
      console.error('Transaction failed', err);
      const msg = document.getElementById("msg");
      if (!msg) return;
      if (err.message && err.message.startsWith('DeviceAlreadyUsed')) {
        const existingRoll = err.message.split(':')[1] || '';
        msg.innerText = 'This device already marked attendance for roll ' + existingRoll;
      } else if (err.message === 'AttendanceExists') {
        msg.innerText = 'Attendance already marked for this roll';
      } else if (err.message === 'SessionExpired') {
        msg.innerText = 'Session expired ⌛';
      } else if (err.message === 'SessionNotFound') {
        msg.innerText = 'Invalid session';
      } else {
        msg.innerText = 'Error saving attendance';
      }
    });

  })
  .catch(err => {
    console.error(err);
    document.getElementById("msg").innerText = "Error checking session";
  });
}

/*
  Notes (common failures & how we handle them):
  - Expiry validation is done both on the frontend and enforced in Firestore rules,
    so a malicious client cannot mark attendance after expiry.
  - Duplicate roll prevention: attendance doc id is roll; the rules disallow overwrites
    and our client checks existence to show a friendly message.
  - Same-device multiple rolls: we save a device doc per session (clientId in localStorage)
    and prevent different roll submissions from the same device.
*/
