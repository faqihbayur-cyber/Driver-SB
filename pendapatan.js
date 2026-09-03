// pendapatan.js — riwayat order selesai/batal & akumulasi pendapatan, khusus milik driver ini

function formatRupiah(n) {
  return "Rp" + Number(n || 0).toLocaleString("id-ID");
}
function formatTanggal(timestamp) {
  if (!timestamp || !timestamp.toDate) return "-";
  return timestamp.toDate().toLocaleDateString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

const STATUS_META = {
  selesai: { label: "Selesai", color: "#2F7A4F", bg: "#E4F3EA" },
  batal: { label: "Dibatalkan", color: "#C13B3B", bg: "#FBE7E7" },
};

let unsubscribe = null;

export function mount(section, { user, db }) {
  section.innerHTML = `
    <div class="drv-riwayat-wrap">
      <div class="drv-riwayat-header">
        <h1>Pendapatan</h1>
        <p>Riwayat order selesai & akumulasi pendapatanmu</p>
      </div>
      <div id="drv-riwayat-summary" class="drv-riwayat-summary"></div>
      <div id="drv-riwayat-list"><p class="drv-loading">Memuat riwayat...</p></div>
    </div>
  `;

  const listEl = section.querySelector("#drv-riwayat-list");
  const summaryEl = section.querySelector("#drv-riwayat-summary");

  import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js").then(
    ({ collection, query, where, onSnapshot }) => {
      const q = query(
        collection(db, "orders"),
        where("driverUid", "==", user.uid),
        where("status", "in", ["selesai", "batal"])
      );

      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const orders = snapshot.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.claimedAt?.toMillis?.() || 0) - (a.claimedAt?.toMillis?.() || 0));

          const totalSelesai = orders.filter((o) => o.status === "selesai");
          const totalEarning = totalSelesai.reduce((sum, o) => sum + Number(o.fee || 0), 0);

          summaryEl.innerHTML = `
            <div class="drv-summary-box">
              <span class="drv-summary-label">Order Selesai</span>
              <p class="drv-summary-value">${totalSelesai.length}</p>
            </div>
            <div class="drv-summary-box">
              <span class="drv-summary-label">Total Pendapatan</span>
              <p class="drv-summary-value">${formatRupiah(totalEarning)}</p>
            </div>
          `;

          if (orders.length === 0) {
            listEl.innerHTML = `
              <div class="drv-empty-block">
                <div class="drv-empty-icon"><i class="fa-solid fa-inbox"></i></div>
                <p>Belum ada riwayat order.</p>
              </div>
            `;
            return;
          }

          listEl.innerHTML = orders
            .map((o) => {
              const meta = STATUS_META[o.status] || STATUS_META.selesai;
              const orderIdDisplay = (o.id || "").slice(0, 8).toUpperCase();
              return `
                <div class="drv-riwayat-card">
                  <div class="drv-riwayat-top">
                    <span class="drv-order-id">#${orderIdDisplay}</span>
                    <span class="drv-badge" style="color:${meta.color};background:${meta.bg}">${meta.label}</span>
                  </div>
                  <p class="drv-items">Belikan: ${escapeHtml(o.items || "-")}</p>
                  <div class="drv-riwayat-bottom">
                    <span class="drv-time"><i class="fa-regular fa-clock"></i> ${formatTanggal(o.claimedAt)}</span>
                    <span class="drv-fee">${formatRupiah(o.fee)}</span>
                  </div>
                </div>
              `;
            })
            .join("");
        },
        (err) => {
          console.error(err);
          listEl.innerHTML = `<p class="drv-error">Gagal memuat riwayat. Coba refresh halaman.</p>`;
        }
      );
    }
  );
}

export function unmount(section) {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  section.innerHTML = "";
}