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

    // Check whether this device has already been used for another roll
    deviceRef.get().then(devDoc => {
      if (devDoc.exists && devDoc.data().roll !== roll) {
        document.getElementById("msg").innerText = "This device already marked attendance for roll " + devDoc.data().roll;
        return;
      }

      const attendanceRef = sessionRef.collection("attendance").doc(roll);

      // Prevent overwriting an existing attendance and show a clearer message
      attendanceRef.get().then(attDoc => {
        if (attDoc.exists) {
          document.getElementById("msg").innerText = "Attendance already marked for this roll";
          return;
        }

        // Use a batch so both attendance and device docs are written atomically.
        // Use serverTimestamp so records reflect server time and not the client's clock.
        const batch = db.batch();
        batch.set(attendanceRef, {
          name: name,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          clientId: clientId
        });

        batch.set(deviceRef, {
          roll: roll,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        batch.commit().then(() => {
          document.getElementById("msg").innerText = "Attendance marked ✅";
        }).catch(err => {
          console.error(err);
          document.getElementById("msg").innerText = "Error saving attendance";
        });

      }).catch(err => {
        console.error(err);
        document.getElementById("msg").innerText = "Error checking attendance";
      });

    }).catch(err => {
      console.error(err);
      document.getElementById("msg").innerText = "Error checking device";
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
