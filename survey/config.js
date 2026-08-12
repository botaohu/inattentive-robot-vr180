// Firebase project configuration for the survey backend.
//
// To enable real Google (Gmail) sign-in + cloud storage of responses:
//   1. console.firebase.google.com → Add project (no Analytics needed)
//   2. Build → Authentication → Sign-in method → enable "Google"
//   3. Build → Firestore Database → Create (production mode), then add rule:
//        match /responses/{doc} { allow create: if request.auth != null;
//                                 allow read, update, delete: if false; }
//   4. Project settings → Your apps → Web app → copy the config object below
//   5. Authentication → Settings → Authorized domains → add your
//      <user>.github.io domain
//
// Until then the survey runs in local demo mode (responses stay in this
// browser's localStorage and sign-in is simulated).
export const firebaseConfig = null;
// Example:
// export const firebaseConfig = {
//   apiKey: "…", authDomain: "….firebaseapp.com", projectId: "…",
//   storageBucket: "….appspot.com", messagingSenderId: "…", appId: "…",
// };
