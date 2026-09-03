// riwayat.js — order aktif (sudah diambil, belum selesai), khusus milik driver ini

function formatRupiah(n) {
  return "Rp" + Number(n || 0).toLocaleString("id-ID");
}
function formatJam(timestamp) {
  if (!timestamp || !timestamp.toDate) return null;
  return timestamp.toDate().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

let unsubActive = null;
let activeMaps = [];
let watchId = null;
let currentActiveOrderIds = [];
let lastPosWriteAt = 0;
const POS_WRITE_INTERVAL_MS = 5000;

export function mount(section, { user, db }) {
  section.innerHTML = `
    <div class="drv-riwayat-wrap">
      <div class="drv-riwayat-header">
        <h1>Order Aktif</h1>
        <p>Order yang sudah kamu ambil, belum selesai</p>
      </div>

      <div id="drv-riwayat-active"><p class="drv-loading">Memuat...</p></div>
    </div>
  `;

  const activeListEl = section.querySelector("#drv-riwayat-active");

  import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js").then(
    ({ collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp }) => {
      const qActive = query(
        collection(db, "orders"),
        where("driverUid", "==", user.uid),
        where("status", "in", ["diproses", "diantar"])
      );

      unsubActive = onSnapshot(
        qActive,
        (snapshot) => {
          const orders = snapshot.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.claimedAt?.toMillis?.() || 0) - (b.claimedAt?.toMillis?.() || 0));

          currentActiveOrderIds = orders.map((o) => o.id);
          if (orders.length > 0) {
            startWatchingPosition(db, doc, updateDoc, serverTimestamp);
          } else {
            stopWatchingPosition();
          }

          if (orders.length === 0) {
            activeListEl.innerHTML = `
              <div class="drv-empty-block">
                <div class="drv-empty-icon"><i class="fa-solid fa-bolt"></i></div>
                <p>Belum ada order aktif.</p>
              </div>
            `;
            return;
          }

          activeListEl.innerHTML = orders.map((o) => renderActiveCard(o)).join("");

          activeMaps.forEach((m) => { try { m.remove(); } catch (e) {} });
          activeMaps = [];
          orders.forEach((o) => {
            if (typeof o.lat !== "number" || typeof o.lng !== "number") return;
            const mapEl = document.getElementById(`drv-map-${o.id}`);
            if (!mapEl) return;
            if (!window.L) {
              mapEl.innerHTML = `<p class="drv-map-error">Peta gagal dimuat. Cek koneksi internet.</p>`;
              return;
            }
            const map = window.L.map(mapEl, { zoomControl: false, attributionControl: false }).setView([o.lat, o.lng], 15);
            window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
            window.L.marker([o.lat, o.lng]).addTo(map);
            activeMaps.push(map);
          });

          activeListEl.querySelectorAll(".drv-timeline-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
              const nextStatus = btn.dataset.next;
              btn.disabled = true;
              btn.textContent = "Memproses...";
              try {
                await updateDoc(doc(db, "orders", btn.dataset.id), {
                  status: nextStatus,
                  [`${nextStatus}At`]: serverTimestamp(),
                });
                window.showToast("Status order diperbarui!", "success");
              } catch (err) {
                console.error(err);
                window.showToast("Gagal update status. Coba lagi.", "error");
                btn.disabled = false;
              }
            });
          });

          activeListEl.querySelectorAll(".drv-timeline-cancel-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
              showCancelConfirm(async () => {
                btn.disabled = true;
                try {
                  await updateDoc(doc(db, "orders", btn.dataset.id), {
                    status: "batal",
                    batalAt: serverTimestamp(),
                  });
                  window.showToast("Order dibatalkan.", "success");
                } catch (err) {
                  console.error(err);
                  window.showToast("Gagal membatalkan order. Coba lagi.", "error");
                  btn.disabled = false;
                }
              });
            });
          });
        },
        (err) => {
          console.error(err);
          activeListEl.innerHTML = `<p class="drv-error">Gagal memuat order aktif.</p>`;
        }
      );
    }
  );
}

function showCancelConfirm(onConfirm) {
  const overlay = document.createElement("div");
  overlay.className = "drv-popup-overlay";
  overlay.innerHTML = `
    <div class="drv-popup-box">
      <div class="drv-popup-icon drv-popup-icon-danger"><i class="fa-solid fa-triangle-exclamation"></i></div>
      <h2>Batalkan Order?</h2>
      <p>Order ini akan ditandai batal dan hilang dari daftar order aktifmu.</p>
      <div class="drv-popup-actions">
        <button class="drv-popup-btn drv-popup-btn-secondary" id="drv-cancel-no">Tidak</button>
        <button class="drv-popup-btn drv-popup-btn-danger" id="drv-cancel-yes">Ya, Batalkan</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector("#drv-cancel-no").addEventListener("click", () => overlay.remove());
  overlay.querySelector("#drv-cancel-yes").addEventListener("click", () => {
    overlay.remove();
    onConfirm();
  });
}

function startWatchingPosition(db, doc, updateDoc, serverTimestamp) {
  if (watchId !== null || !navigator.geolocation) return;
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const now = Date.now();
      if (now - lastPosWriteAt < POS_WRITE_INTERVAL_MS) return;
      lastPosWriteAt = now;
      const { latitude, longitude } = pos.coords;
      currentActiveOrderIds.forEach((id) => {
        updateDoc(doc(db, "orders", id), {
          driverLat: latitude,
          driverLng: longitude,
          driverPosAt: serverTimestamp(),
        }).catch((err) => console.error("Gagal update posisi:", err));
      });
    },
    (err) => console.error("Gagal ambil lokasi driver:", err),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
  );
}

function stopWatchingPosition() {
  if (watchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

function buildSteps(o) {
  const status = o.status;
  return [
    { num: 1, title: "Diambil", desc: "Order sudah kamu ambil", state: "done", time: formatJam(o.claimedAt) },
    {
      num: 2,
      title: "Antar ke tempat belanja",
      desc: "Silakan beli barang pesanan",
      state: status === "diproses" ? "active" : "done",
      time: status !== "diproses" ? formatJam(o.diantarAt) : null,
      actionLabel: status === "diproses" ? "Sudah Belanja" : null,
      nextStatus: "diantar",
    },
    {
      num: 3,
      title: "Antar ke customer",
      desc: "Menuju lokasi customer",
      state: status === "diantar" ? "active" : "upcoming",
      time: null,
      actionLabel: status === "diantar" ? "Selesai Antar" : null,
      nextStatus: "selesai",
    },
    { num: 4, title: "Selesai", desc: "Customer terima pesanan", state: "upcoming", time: null },
  ];
}

function renderActiveCard(o) {
  const orderIdDisplay = (o.id || "").slice(0, 8).toUpperCase();
  const totalCustomer = Number(o.budgetEstimate || 0) + Number(o.fee || 0);
  const steps = buildSteps(o);
  const mapId = `drv-map-${o.id}`;
  const hasCoords = typeof o.lat === "number" && typeof o.lng === "number";
  const mapsUrl = hasCoords ? `https://www.google.com/maps/search/?api=1&query=${o.lat},${o.lng}` : "#";

  return `
    <div class="drv-detail-card">
      <div class="drv-detail-header">
        <div class="drv-detail-header-top">
          <span class="drv-detail-id">#${orderIdDisplay}</span>
          <span class="drv-detail-badge">Diambil</span>
        </div>
        <p class="drv-detail-items">Belikan: ${escapeHtml(o.items || "-")}</p>
        <div class="drv-detail-total-row">
          <span>Total dari Customer</span>
          <span class="drv-detail-total-amount">${formatRupiah(totalCustomer)}</span>
        </div>
        <p class="drv-detail-breakdown">Belanja ${formatRupiah(o.budgetEstimate)} • Fee Kamu ${formatRupiah(o.fee)}</p>
      </div>

      ${hasCoords ? `
        <div class="drv-detail-map-wrap">
          <div id="${mapId}" class="drv-detail-map"></div>
          <a class="drv-maps-link" href="${mapsUrl}" target="_blank" rel="noopener">
            <i class="fa-solid fa-map"></i> Lihat di Maps
          </a>
        </div>
      ` : ""}

      <div class="drv-timeline">
        ${steps.map((s) => `
          <div class="drv-timeline-step drv-timeline-${s.state}">
            <div class="drv-timeline-marker">${s.state === "done" ? '<i class="fa-solid fa-check"></i>' : s.num}</div>
            <div class="drv-timeline-body">
              <div class="drv-timeline-title-row">
                <span class="drv-timeline-title">${s.title}</span>
                ${s.time ? `<span class="drv-timeline-time">${s.time}</span>` : ""}
              </div>
              <p class="drv-timeline-desc">${s.desc}</p>
              ${s.actionLabel ? `
                <div class="drv-timeline-actions">
                  <button class="drv-timeline-btn" data-id="${o.id}" data-next="${s.nextStatus}">${s.actionLabel}</button>
                  <button class="drv-timeline-cancel-btn" data-id="${o.id}">Batalkan</button>
                </div>
              ` : ""}
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

export function unmount(section) {
  if (unsubActive) { unsubActive(); unsubActive = null; }
  stopWatchingPosition();
  activeMaps.forEach((m) => { try { m.remove(); } catch (e) {} });
  activeMaps = [];
  section.innerHTML = "";
}
