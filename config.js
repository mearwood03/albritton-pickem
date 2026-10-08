// Albritton's Pick Em's settings.
// Firebase web app settings (safe to publish; firestore.rules protects the data).
// Change the Venmo tag or entry fee here any time.
window.PICKEM_CONFIG = {
  firebase: {
    apiKey: "AIzaSyBNUPTwZKtUW6TUT0ep8m7XB9nE4N3pllo",
    authDomain: "albritton-pickem.firebaseapp.com",
    projectId: "albritton-pickem",
    storageBucket: "albritton-pickem.firebasestorage.app",
    messagingSenderId: "316703911553",
    appId: "1:316703911553:web:f481cc06e4354596fc6780"
  },
  venmo: "Blakealbritton6",
  // Shown next to the Venmo button. Leave "" to hide.
  entryFee: "$21 entry",
  // Commissioner login (can mark who paid and remove people). Must match firestore.rules.
  commissioner: "blakealbritton6@gmail.com"
};
