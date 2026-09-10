import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyD5l7NOkDlE9bnG81cRB0bGwhBc44JDabw",
  authDomain: "egg-store-68ee4.firebaseapp.com",
  projectId: "egg-store-68ee4",
  storageBucket: "egg-store-68ee4.firebasestorage.app",
  messagingSenderId: "140927588957",
  appId: "1:140927588957:web:66c40b2aab6152d4db8bb4"
};
const auth = getAuth(initializeApp(firebaseConfig));
const form = document.getElementById("loginForm");
const message = document.getElementById("loginMessage");
const forgotBtn = document.getElementById("forgotBtn");
function show(text, ok=false) { message.textContent = text; message.style.color = ok ? "green" : "crimson"; }
form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
    window.location.replace("index.html");
  } catch (error) {
    console.error(error);
    show("البريد الإلكتروني أو كلمة المرور غير صحيحة، أو لم يتم تفعيل تسجيل الدخول.");
  }
});
forgotBtn?.addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();
  if (!email) { show("اكتب البريد الإلكتروني أولًا."); return; }
  try { await sendPasswordResetEmail(auth, email); show("تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك.", true); }
  catch (error) { console.error(error); show("تعذر إرسال رسالة إعادة التعيين."); }
});
