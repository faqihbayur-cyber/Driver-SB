// index.js — router + Firebase (global untuk seluruh driver app)
let messagingSwRegistration = null;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("[sw] gagal daftar service worker:", err);
    });

    navigator.serviceWorker
      .register("./firebase-messaging-sw.js")
      .then((reg) => {
        messagingSwRegistration = reg;
      })
      .catch((err) => {
        console.warn("[fcm-sw] gagal daftar service worker notifikasi:", err);
      });
  });
}

const loadingEl = document.getElementById("app-loading");
const navEl = document.getElementById("bottom-nav");
const toastEl = document.getElementById("global-toast");

let toastTimeout = null;
window.showToast = function (message, type = "") {
  toastEl.textContent = message;
  toastEl.className = "global-toast" + (type ? " " + type : "");
  toastEl.hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toastEl.hidden = true;
  }, 2600);
};

function showFatalError(step, err) {
  console.error("SuruhBeli Driver gagal memuat pada tahap:", step, err);
  loadingEl.innerHTML = `
    <div style="max-width:300px;text-align:center;padding:20px;font-family:sans-serif;">
      <p style="color:#C13B3B;font-weight:700;font-size:15px;margin:0 0 8px;">Gagal memuat halaman</p>
      <p style="font-size:12px;color:#6B5541;margin:0 0 4px;">Tahap: ${step}</p>
      <p style="font-size:11px;color:#6B5541;word-break:break-word;">${escapeHtml(String((err && err.message) || err))}</p>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function syncDriverPublicProfile(db, user) {
  try {
    const { doc, getDoc, setDoc, serverTimestamp } = await import(
      "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
    );
    const profRef = doc(db, "public_profiles", user.uid);
    const snap = await getDoc(profRef);
    const existing = snap.exists() ? snap.data() : null;

    const patch = {};
    if (!existing || !existing.name) patch.name = user.displayName || "Driver";
    if ((!existing || !existing.photoURL) && user.photoURL) patch.photoURL = user.photoURL;
    if (!existing) patch.role = "driver";

    if (Object.keys(patch).length > 0) {
      patch.updatedAt = serverTimestamp();
      await setDoc(profRef, patch, { merge: true });
    }
  } catch (err) {
    console.warn("[public_profiles] gagal sync profil driver:", err);
  }
}

const FCM_VAPID_KEY = "BG5NmD3dHw39MiYejAlxHLHhdmgKW_4txGVw_NX53jjaGqgFZIMBoPjcHIMHUZgIi6dIiMlquY2lMbnEDd20YUU";

function showNotifPermissionPrompt() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "perm-modal-overlay";
    overlay.innerHTML = `
      <div class="perm-modal-card">
        <div class="perm-modal-icon"><i class="fa-solid fa-bell"></i></div>
        <h3>Aktifkan Notifikasi</h3>
        <p>Biar kamu langsung tau begitu ada order baru & pesan masuk, tanpa harus buka app terus-terusan.</p>
        <button type="button" class="btn-primary" id="perm-modal-allow">Aktifkan Notifikasi</button>
        <button type="button" class="perm-modal-cancel" id="perm-modal-cancel">Nanti Dulu</button>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector("#perm-modal-allow").addEventListener("click", () => {
      overlay.remove();
      resolve(true);
    });
    overlay.querySelector("#perm-modal-cancel").addEventListener("click", () => {
      overlay.remove();
      resolve(false);
    });
  });
}

async function setupPushNotifications(firebaseApp, db, uid) {
  try {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;

    // Udah pernah ditolak sebelumnya -> browser blokir permintaan ulang, gak perlu tanya lagi.
    if (Notification.permission === "denied") return;

    // Belum pernah ditanya sama sekali -> tampilin popup custom kita dulu.
    if (Notification.permission === "default") {
      const mauAktifin = await showNotifPermissionPrompt();
      if (!mauAktifin) return; // user klik "Nanti Dulu" -> native prompt gak pernah muncul
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("[fcm] izin notifikasi ditolak/diabaikan.");
      return;
    }

    const messagingModule = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js");
    const messaging = messagingModule.getMessaging(firebaseApp);

    const swReg =
      messagingSwRegistration ||
      (await navigator.serviceWorker.getRegistration("./firebase-messaging-sw.js"));

    const token = await messagingModule.getToken(messaging, {
      vapidKey: FCM_VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });

    if (token) {
      const { doc, updateDoc } = await import(
        "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
      );
      await updateDoc(doc(db, "users", uid), { fcmToken: token });
    }

    // Pesan masuk pas app LAGI DIBUKA (foreground) -> tampilin toast, bukan notif sistem.
    messagingModule.onMessage(messaging, (payload) => {
      const title = payload.notification?.title || "SuruhBeli Driver";
      const body = payload.notification?.body || "";
      if (typeof window.showToast === "function") {
        window.showToast(`${title} — ${body}`);
      }
    });
  } catch (err) {
    console.warn("[fcm] gagal setup push notification:", err);
  }
}

async function main() {
  let firebaseApp, firebaseAuth, firebaseDb;
  let getAuth, onAuthStateChanged, signOut, getFirestore, doc, getDoc;
  let homeView, riwayatView, profilView, pendapatanView, chatListView, chatRoomView;

  // Tahap 1: load SDK Firebase
  try {
    const appModule = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    const authModule = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
    const firestoreModule = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    getAuth = authModule.getAuth;
    onAuthStateChanged = authModule.onAuthStateChanged;
    signOut = authModule.signOut;
    getFirestore = firestoreModule.getFirestore;
    doc = firestoreModule.doc;
    getDoc = firestoreModule.getDoc;

    const firebaseConfig = {
      apiKey: "AIzaSyBE5g9DrxN-ZAumkFQDSW2KknhYyuUXKUA",
      authDomain: "klien-5c5cb.firebaseapp.com",
      projectId: "klien-5c5cb",
      storageBucket: "klien-5c5cb.firebasestorage.app",
      messagingSenderId: "1047587810737",
      appId: "1:1047587810737:web:a40f87b3b293b6747c6190",
    };
    firebaseApp = appModule.initializeApp(firebaseConfig);
    firebaseAuth = getAuth(firebaseApp);
    firebaseDb = getFirestore(firebaseApp);
  } catch (err) {
    showFatalError("memuat Firebase SDK (cek koneksi internet)", err);
    return;
  }

  // Tahap 2: load semua file view
  try {
    homeView = await import("./home.js");
    riwayatView = await import("./riwayat.js");
    profilView = await import("./profil.js");
    pendapatanView = await import("./pendapatan.js");
    chatListView = await import("./drv-chat-list.js");
    chatRoomView = await import("./drv-chat-room.js");
  } catch (err) {
    showFatalError("memuat file view (home.js/riwayat.js/profil.js/pendapatan.js/drv-chat-list.js/drv-chat-room.js — cek nama file & lokasinya harus sejajar dengan index.html)", err);
    return;
  }

  const VIEWS = {
    home: homeView,
    riwayat: riwayatView,
    pendapatan: pendapatanView,
    profil: profilView,
    "chat-list": chatListView,
    "chat-room": chatRoomView,
  };

  let currentUser = null;
  let currentDriverData = null;
  let currentView = null;
  let currentSection = null;

  function sectionFor(name) {
    return document.getElementById("view-" + name);
  }

  function switchView(name) {
    if (!VIEWS[name]) name = "home";
    const nextSection = sectionFor(name);
    if (!nextSection) return;

    if (currentView && currentView.unmount && currentSection) {
      currentView.unmount(currentSection);
    }

    document.querySelectorAll(".view-section").forEach((s) => s.classList.remove("active"));
    nextSection.classList.add("active");

    VIEWS[name].mount(nextSection, {
      user: currentUser,
      driverData: currentDriverData,
      auth: firebaseAuth,
      db: firebaseDb,
      signOut,
    });

    currentView = VIEWS[name];
    currentSection = nextSection;

    navEl.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.route === name);
    });

    window.scrollTo(0, 0);
  }

  function router() {
    const name = location.hash.replace(/^#\/?/, "") || "home";
    switchView(name);
  }

  window.addEventListener("hashchange", router);

  navEl.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.hash = "#/" + btn.dataset.route;
    });
  });

  // Tahap 3: auth guard — wajib login DAN role === "driver" DAN status === true
  try {
    onAuthStateChanged(firebaseAuth, async (user) => {
      try {
        if (!user) {
          window.location.href = "login.html";
          return;
        }

        const userSnap = await getDoc(doc(firebaseDb, "users", user.uid));
        const userData = userSnap.exists() ? userSnap.data() : null;

        if (!userData || userData.role !== "driver" || userData.status !== true) {
          await signOut(firebaseAuth);
          window.location.href = "login.html";
          return;
        }

        currentUser = user;
        currentDriverData = userData;
        navEl.hidden = false;
        loadingEl.hidden = true;

        syncDriverPublicProfile(firebaseDb, user);
        setupPushNotifications(firebaseApp, firebaseDb, user.uid);

        router();
      } catch (err) {
        showFatalError("menampilkan halaman setelah login", err);
      }
    });
  } catch (err) {
    showFatalError("memasang auth guard (onAuthStateChanged)", err);
  }

  setTimeout(() => {
    if (!loadingEl.hidden) {
      showFatalError("tidak diketahui (onAuthStateChanged tidak pernah merespons dalam 10 detik)", "Cek koneksi internet / domain sudah didaftarkan di Firebase Console.");
    }
  }, 10000);
}

main();
