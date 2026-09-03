// login.js — login driver (Firebase Auth email/password + cek role & status di Firestore)
//
// TIDAK ADA collection "drivers" terpisah. Sesuai skema yang sudah ada,
// akun driver disimpan di collection "users/{uid}" yang sama dengan customer,
// dibedakan lewat field `role`. Login hanya boleh lanjut kalau:
//   - dokumen users/{uid} ada
//   - field role === "driver"
//   - field status === true   (field baru, dipakai admin utk approve/nonaktifkan akun driver)

const firebaseConfig = {
  apiKey: "AIzaSyBE5g9DrxN-ZAumkFQDSW2KknhYyuUXKUA",
  authDomain: "klien-5c5cb.firebaseapp.com",
  projectId: "klien-5c5cb",
  storageBucket: "klien-5c5cb.firebasestorage.app",
  messagingSenderId: "1047587810737",
  appId: "1:1047587810737:web:a40f87b3b293b6747c6190",
};

const form = document.getElementById("login-form");
const emailInput = document.getElementById("login-email");
const passwordInput = document.getElementById("login-password");
const errorEl = document.getElementById("login-error");
const submitBtn = document.getElementById("login-submit");
const submitText = document.getElementById("login-submit-text");
const spinnerEl = document.getElementById("login-spinner");
const toggleBtn = document.getElementById("login-toggle-password");

toggleBtn.addEventListener("click", () => {
  const isPassword = passwordInput.type === "password";
  passwordInput.type = isPassword ? "text" : "password";
  toggleBtn.innerHTML = isPassword
    ? '<i class="fa-solid fa-eye-slash"></i>'
    : '<i class="fa-solid fa-eye"></i>';
});

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}
function hideError() {
  errorEl.hidden = true;
}
function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  spinnerEl.hidden = !isLoading;
  submitText.textContent = isLoading ? "Memproses..." : "Masuk";
}

function mapAuthError(code) {
  switch (code) {
    case "auth/invalid-email":
      return "Format email tidak valid.";
    case "auth/user-not-found":
    case "auth/invalid-credential":
      return "Email atau password salah.";
    case "auth/wrong-password":
      return "Email atau password salah.";
    case "auth/too-many-requests":
      return "Terlalu banyak percobaan. Coba lagi beberapa saat lagi.";
    case "auth/network-request-failed":
      return "Gagal terhubung ke server. Cek koneksi internet.";
    default:
      return "Gagal masuk. Coba lagi ya.";
  }
}

async function main() {
  let initializeApp, getAuth, signInWithEmailAndPassword, signOut;
  let getFirestore, doc, getDoc;

  try {
    const appModule = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    const authModule = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
    const firestoreModule = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");

    initializeApp = appModule.initializeApp;
    getAuth = authModule.getAuth;
    signInWithEmailAndPassword = authModule.signInWithEmailAndPassword;
    signOut = authModule.signOut;
    getFirestore = firestoreModule.getFirestore;
    doc = firestoreModule.doc;
    getDoc = firestoreModule.getDoc;
  } catch (err) {
    console.error(err);
    showError("Gagal memuat Firebase. Cek koneksi internet lalu refresh halaman.");
    return;
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showError("Email dan password wajib diisi.");
      return;
    }

    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const uid = cred.user.uid;

      const userSnap = await getDoc(doc(db, "users", uid));
      const userData = userSnap.exists() ? userSnap.data() : null;

      if (!userData || userData.role !== "driver" || userData.status !== true) {
        await signOut(auth);
        showError(
          !userData || userData.role !== "driver"
            ? "Akun ini bukan akun driver."
            : "Akun kamu belum aktif. Hubungi admin SuruhBeli untuk aktivasi."
        );
        setLoading(false);
        return;
      }

      // Login berhasil & akun aktif — arahkan ke halaman utama driver.
      // TODO: ganti ke halaman dashboard driver setelah SPA-nya dibuat.
      window.location.href = "index.html";
    } catch (err) {
      console.error(err);
      showError(mapAuthError(err.code));
      setLoading(false);
    }
  });
}

main();
