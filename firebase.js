// firebase.js

// TODO: Replace with your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAKH1s2v010fjNVHlnAyP4O9XDkld6FVA0",
  authDomain: "qr-based-attendence-6bb31.firebaseapp.com",
  projectId: "qr-based-attendence-6bb31",
  storageBucket: "qr-based-attendence-6bb31.firebasestorage.app",
  messagingSenderId: "707965908108",
  appId: "1:707965908108:web:a76815ac49b4969380f7a9"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Firestore DB
const db = firebase.firestore();

// Helper: export db and firebase for other modules
// (In this simple static app we use global vars; keep this file minimal.)
window.db = db;
window.firebase = firebase;
async function saveAttendance(sessionId, studentId, studentName) {
  try {
    const attRef = db.collection('sessions').doc(sessionId).collection('attendance').doc(studentId);
    const snap = await attRef.get();
    if (snap.exists) {
      document.getElementById("msg").innerText = "Attendance already recorded ❌";
      return;
    }
    await attRef.set({ name: studentName, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
    document.getElementById("msg").innerText = "Attendance submitted successfully ✅";
  } catch (e) {
    console.error('saveAttendance failed', e);
    document.getElementById("msg").innerText = "Error saving attendance";
  }
}

