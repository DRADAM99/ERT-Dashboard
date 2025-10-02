"use client";

import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase"; // make sure this line also exists


export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(""); // Clear any previous errors
  
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      console.log("✅ SIGNED IN:", user.email, "UID:", user.uid);
  
      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);
  
      if (docSnap.exists()) {
        console.log("✅ USER DOCUMENT:", docSnap.data());
        router.push("/"); // or "/dashboard" — depending on your setup
      } else {
        console.warn("❌ No user document found for this UID.");
        setError("משתמש לא נמצא במערכת");
      }
    } catch (error) {
      console.error("🔥 Login error:", error.code, error.message);
      
      // Set user-friendly error messages based on Firebase error codes
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-email' || error.code === 'auth/invalid-credential') {
        setError("אימייל או סיסמה שגויים");
      } else if (error.code === 'auth/too-many-requests') {
        setError("יותר מדי ניסיונות התחברות. נסה שוב מאוחר יותר");
      } else if (error.code === 'auth/user-disabled') {
        setError("חשבון זה הושבת");
      } else {
        setError("אירעה שגיאה בהתחברות. נסה שוב");
      }
    }
  };
  
  const handleForgotPassword = async () => {
    if (!email) {
      alert("נא להזין אימייל קודם");
      return;
    }
  
    try {
      await sendPasswordResetEmail(auth, email);
      alert("קישור לאיפוס סיסמה נשלח לאימייל");
    } catch (error) {
      console.error("שגיאה בשליחת מייל לאיפוס:", error.message);
      alert("אירעה שגיאה. ודא שהאימייל תקין");
    }
  };
  
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <Image
        src="/logo.png"
        alt="Logo"
        width={320}
        height={160}
        className="mb-4"
      />
      <form onSubmit={handleLogin} className="bg-white p-6 rounded shadow-md w-full max-w-sm space-y-4">
        <h1 className="text-xl font-bold text-center">התחברות למערכת</h1>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <input
          type="email"
          placeholder="כתובת אימייל"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border p-2 rounded text-right"
        />
        <input
          type="password"
          placeholder="סיסמה"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border p-2 rounded text-right"
        />
        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
        >
          התחבר
        </button>
        <button
  type="button"
  onClick={handleForgotPassword}
  className="text-sm text-blue-600 text-right block hover:underline"
>
  שכחת סיסמה?
</button>

      </form>
    </div>
  );
}
