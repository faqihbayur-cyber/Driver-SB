// home.js — Beranda driver: order tersedia (bisa diambil) + order aktif milik driver ini

function formatRupiah(n) {
  return "Rp" + Number(n || 0).toLocaleString("id-ID");
}

function formatJam(timestamp) {
  if (!timestamp || !timestamp.toDate) return "-";
  return timestamp.toDate().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

let unsubAvailable = null;

export function mount(section, { user, db }) {
  section.innerHTML = `
    <div class="drv-home-wrap">
      <div class="drv-home-topbar">
        <div class="drv-brand">
          <img class="drv-brand-icon" src="logo.png" alt="" />
          <div class="drv-brand-text">
            <span class="drv-brand-name">SuruhBeli</span>
            <span class="drv-brand-sub">Driver</span>
          </div>
        </div>
        <button class="drv-bell-btn">
          <i class="fa-solid fa-bell"></i>
          <span class="drv-bell-dot"></span>
        </button>
      </div>

      <div class="drv-home-greet-block">
        <h1>Halo, ${escapeHtml(user.displayName || "Driver")}</h1>
        <p>Semangat cari order hari ini!</p>
      </div>

      <div class="drv-earning-card">
        <div class="drv-earning-info">
          <span class="drv-earning-label">Pendapatan Hari Ini</span>
          <span class="drv-earning-amount">Rp0</span>
          <span class="drv-earning-count">0 Order selesai</span>
        </div>
        <img class="drv-earning-char" src="karakter.png" alt="" />
      </div>

      <div class="drv-section">
        <div class="drv-section-title-row">
          <div class="drv-section-title">
            <i class="fa-solid fa-list-ul"></i>
            <span id="drv-available-title">Order Tersedia</span>
          </div>
        </div>
        <div id="drv-available-list"><p class="drv-loading">Memuat...</p></div>
      </div>
    </div>
  `;

  const availableListEl = section.querySelector("#drv-available-list");

  import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js").then(
    async ({ collection, query, where, orderBy, onSnapshot, doc, getDoc, runTransaction, updateDoc, serverTimestamp }) => {
      // Ambil profil driver sendiri (nama & foto) sekali di awal, dipakai tiap klaim order
      let driverProfile = {};
      try {
        const profileSnap = await getDoc(doc(db, "users", user.uid));
        if (profileSnap.exists()) driverProfile = profileSnap.data();
      } catch (err) {
        console.error("Gagal ambil profil driver:", err);
      }

      // ---------- Order tersedia (belum diambil driver manapun) ----------
      const qAvailable = query(
        collection(db, "orders"),
        where("status", "==", "menunggu")
      );

      unsubAvailable = onSnapshot(
        qAvailable,
        (snapshot) => {
          const orders = snapshot.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));

          const titleEl = document.getElementById("drv-available-title");
          if (titleEl) titleEl.textContent = `Order Tersedia (${orders.length})`;

          if (orders.length === 0) {
            availableListEl.innerHTML = `<p class="drv-empty">Belum ada order baru. Sabar ya, ditunggu aja 🙏</p>`;
            return;
          }

          availableListEl.innerHTML = orders.map((o) => renderAvailableCard(o)).join("");

          availableListEl.querySelectorAll(".drv-claim-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
              btn.disabled = true;
              btn.textContent = "Mengambil...";
              try {
                await runTransaction(db, async (tx) => {
                  const ref = doc(db, "orders", btn.dataset.id);
                  const snap = await tx.get(ref);
                  if (!snap.exists() || snap.data().status !== "menunggu") {
                    throw new Error("Order ini sudah diambil driver lain.");
                  }
                  tx.update(ref, {
                    status: "diproses",
                    driverUid: user.uid,
                    driverName: driverProfile.nama || user.displayName || "Driver",
                    driverFoto: driverProfile.foto || "",
                    claimedAt: serverTimestamp(),
                    diprosesAt: serverTimestamp(),
                  });
                });
                showClaimSuccessPopup();
              } catch (err) {
                console.error(err);
                window.showToast(err.message || "Gagal ambil order. Coba lagi.", "error");
                btn.disabled = false;
                btn.innerHTML = `<i class="fa-solid fa-bag-shopping"></i> Ambil Order`;
              }
            });
          });
        },
        (err) => {
          console.error(err);
          availableListEl.innerHTML = `<p class="drv-error">Gagal memuat order. Coba refresh halaman.</p>`;
        }
      );
    }
  );
}

function showClaimSuccessPopup() {
  const overlay = document.createElement("div");
  overlay.className = "drv-popup-overlay";
  overlay.innerHTML = `
    <div class="drv-popup-box">
      <div class="drv-popup-icon"><i class="fa-solid fa-check"></i></div>
      <h2>Order Berhasil Diambil!</h2>
      <p>Yuk langsung berangkat, cek detailnya di Order Aktif.</p>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => {
    overlay.remove();
    window.location.hash = "#/riwayat";
  }, 1600);
}

function renderAvailableCard(o) {
  const orderIdDisplay = (o.id || "").slice(0, 8).toUpperCase();
  return `
    <div class="drv-card">
      <div class="drv-card-top">
        <div class="drv-card-top-left">
          <div class="drv-card-icon"><i class="fa-solid fa-bag-shopping"></i></div>
          <span class="drv-order-id">#${orderIdDisplay}</span>
        </div>
      </div>
      ${o.place ? `<p class="drv-place">${escapeHtml(o.place)}</p>` : ""}
      ${o.blokGang ? `<p class="drv-blok"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(o.blokGang)}</p>` : ""}
      <p class="drv-items">Belikan: ${escapeHtml(o.items || "-")}</p>
      ${o.notes ? `<p class="drv-notes"><i class="fa-solid fa-note-sticky"></i> ${escapeHtml(o.notes)}</p>` : ""}
      <div class="drv-card-pills">
        ${o.budgetEstimate ? `<span class="drv-budget-pill">Est. Belanja ${formatRupiah(o.budgetEstimate)}</span>` : ""}
        ${o.eta ? `<span class="drv-eta-pill"><i class="fa-regular fa-clock"></i> ${escapeHtml(o.eta)}</span>` : ""}
      </div>
      <div class="drv-card-bottom">
        <span class="drv-fee-label">Estimasi Biaya Jasa</span>
        <span class="drv-fee">${formatRupiah(o.fee)}</span>
      </div>
      <button class="drv-claim-btn" data-id="${o.id}">
        <i class="fa-solid fa-bag-shopping"></i> Ambil Order
      </button>
    </div>
  `;
}

export function unmount(section) {
  if (unsubAvailable) { unsubAvailable(); unsubAvailable = null; }
  section.innerHTML = "";
}
