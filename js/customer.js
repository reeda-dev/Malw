import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, addDoc } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD5l7NOkDlE9bnG81cRB0bGwhBc44JDabw",
  authDomain: "egg-store-68ee4.firebaseapp.com",
  projectId: "egg-store-68ee4",
  storageBucket: "egg-store-68ee4.firebasestorage.app",
  messagingSenderId: "140927588957",
  appId: "1:140927588957:web:66c40b2aab6152d4db8bb4"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const firestore = getFirestore(app);
const PUBLIC_REF = doc(firestore, "store_public", "config");
let prices = { large: 0, medium: 0, small: 0, red_large: 0, white_large: 0, bashayer: 0 };
let ready = false;

async function initCustomer() {
  try {
    await signInAnonymously(auth);
    const snap = await getDoc(PUBLIC_REF);
    if (!snap.exists()) throw new Error("public_config_missing");
    prices = { ...prices, ...snap.data() };
    ready = true;
    updatePricesUI();
    calcOnlineOrder();
  } catch (error) {
    console.error("Customer Firebase error:", error);
    const code = error?.code || error?.message || "unknown";

    let message = "تعذر الاتصال بالخدمة.\n\n";

    if (code === "auth/admin-restricted-operation" || code === "auth/operation-not-allowed") {
      message += "السبب: Anonymous Authentication مش مفعّل في Firebase.\n\n";
      message += "الحل:\n";
      message += "1. ادخل Firebase Console\n";
      message += "2. Authentication → Sign-in method\n";
      message += "3. فعّل Anonymous\n";
      message += "4. احفظ وجرب تاني";
    } else if (code === "public_config_missing") {
      message += "السبب: ملف الأسعار العامة مش موجود.\n\n";
      message += "الحل: سجّل دخول الأدمن وحدّث الأسعار مرة واحدة عشان ينشر الأسعار في store_public/config";
    } else if (code.includes("permission-denied") || code.includes("PERMISSION_DENIED")) {
      message += "السبب: مشكلة في Firestore Rules.\n\n";
      message += "تأكد إنك نشرت الـ Rules وإنها بتسمح بالقراءة من store_public/config";
    } else {
      message += "كود الخطأ: " + code + "\n\nتأكد من تفعيل Anonymous Authentication ونشر Firestore Rules واتصال الإنترنت.";
    }

    alert(message);
  }
}

function updatePricesUI() {
  const ids = {
    large: "priceLargeDisplay",
    medium: "priceMediumDisplay",
    small: "priceSmallDisplay",
    red_large: "priceRedLargeDisplay",
    white_large: "priceWhiteLargeDisplay",
    bashayer: "priceBashayerDisplay"
  };
  for (const [type, id] of Object.entries(ids)) {
    const el = document.getElementById(id);
    if (el) el.innerText = Number(prices[type] || 0);
  }
}

function calcOnlineOrder() {
  const type = document.getElementById("orderType")?.value || "large";
  const trays = Number(document.getElementById("orderTrays")?.value || 0);
  const totalEl = document.getElementById("orderTotalDisplay");
  if (totalEl) totalEl.innerText = (trays * Number(prices[type] || 0)) + " ج.م";
}

async function submitOnlineOrder(e) {
  e.preventDefault();
  if (!ready || !auth.currentUser) {
    alert("الخدمة لم تجهز بعد. حاول مرة أخرى بعد لحظات.");
    return;
  }
  const type = document.getElementById("orderType").value;
  const trays = Number(document.getElementById("orderTrays").value);
  const name = document.getElementById("orderName").value.trim();
  const phone = document.getElementById("orderPhone").value.trim();
  const address = document.getElementById("orderAddress").value.trim();
  if (!name || !phone || !address || !Number.isInteger(trays) || trays < 1) {
    alert("تأكد من إدخال بيانات الطلب بشكل صحيح."); return;
  }
  const typeNames = { large: "بيض كبير", medium: "بيض وسط", small: "بيض صغير", red_large: "بيض أحمر كبير", white_large: "بيض أبيض كبير", bashayer: "بيض بشاير صغير بلدي" };
  const unitPrice = Number(prices[type] || 0);
  if (unitPrice <= 0) { alert("السعر غير متاح حاليًا."); return; }
  const button = e.submitter;
  if (button) button.disabled = true;
  try {
    await addDoc(collection(firestore, "online_orders"), {
      name, phone, address, type, typeName: typeNames[type], trays,
      unitPrice, total: trays * unitPrice, status: "pending",
      timestamp: Date.now(), date: new Date().toLocaleDateString("ar-EG")
    });
    e.target.reset();
    calcOnlineOrder();
    alert("تم إرسال طلبك بنجاح! سنتواصل معك قريبًا لتأكيد التوصيل.");
  } catch (error) {
    console.error("Order error:", error);
    const code = error?.code || error?.message || "unknown";
    let msg = "تعذر إرسال الطلب.\n\n";
    if (code.includes("permission-denied") || code.includes("PERMISSION_DENIED")) {
      msg += "السبب: Firestore Rules مش بتسمح بإنشاء الطلبات.\nتأكد إن Anonymous مفعّل وإنك نشرت الـ Rules الصح.";
    } else {
      msg += "كود الخطأ: " + code + "\nحاول مرة أخرى.";
    }
    alert(msg);
  } finally { if (button) button.disabled = false; }
}

Object.assign(window, { calcOnlineOrder, submitOnlineOrder });
initCustomer();
