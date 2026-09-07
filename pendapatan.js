// pendapatan.js — riwayat order selesai/batal & akumulasi pendapatan, khusus milik driver ini
// Semua class CSS pakai prefix "drv-pdp-" (lihat pendapatan.css) — TIDAK pakai class dari riwayat.css lagi.

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

const PERIOD_OPTIONS = [
  { key: "hari-ini", label: "Hari Ini" },
  { key: "minggu-lalu", label: "Minggu Lalu" },
  { key: "bulan-lalu", label: "Bulan Lalu" },
  { key: "3-bulan", label: "3 Bulan Terakhir" },
  { key: "custom", label: "Custom" },
];

function getPeriodRange(period, customStart, customEnd) {
  const now = new Date();
  if (period === "hari-ini") {
    return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate()), end: now };
  }
  if (period === "minggu-lalu") {
    return { start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), end: now };
  }
  if (period === "bulan-lalu") {
    return { start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), end: now };
  }
  if (period === "3-bulan") {
    return { start: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000), end: now };
  }
  if (period === "custom") {
    return {
      start: customStart ? new Date(customStart + "T00:00:00") : null,
      end: customEnd ? new Date(customEnd + "T23:59:59") : null,
    };
  }
  return { start: null, end: null };
}

let allOrders = [];
let currentPeriod = "hari-ini";
let customStartDate = null;
let customEndDate = null;
let unsubscribe = null;

export function mount(section, { user, db }) {
  section.innerHTML = `
    <div class="drv-pdp-wrap">
      <div class="drv-pdp-header">
        <h1>Pendapatan</h1>
        <p>Riwayat order selesai &amp; akumulasi pendapatanmu</p>
      </div>

      <div class="drv-pdp-filter-chips" id="pdp-filter-chips">
        ${PERIOD_OPTIONS.map(
          (p) => `<button class="drv-pdp-filter-chip ${p.key === currentPeriod ? "drv-pdp-filter-chip-active" : ""}" data-period="${p.key}">${p.label}</button>`
        ).join("")}
      </div>
      <div class="drv-pdp-filter-custom" id="pdp-filter-custom" hidden>
        <input type="date" id="pdp-filter-start" />
        <span>s/d</span>
        <input type="date" id="pdp-filter-end" />
        <button type="button" id="pdp-filter-apply" class="drv-pdp-filter-apply-btn">Terapkan</button>
      </div>

      <div id="pdp-summary" class="drv-pdp-summary"></div>
      <div id="pdp-list" class="drv-pdp-list"><p class="drv-pdp-loading">Memuat riwayat...</p></div>
    </div>
  `;

  const listEl = section.querySelector("#pdp-list");
  const summaryEl = section.querySelector("#pdp-summary");
  const chipsEl = section.querySelector("#pdp-filter-chips");
  const customBoxEl = section.querySelector("#pdp-filter-custom");
  const startInputEl = section.querySelector("#pdp-filter-start");
  const endInputEl = section.querySelector("#pdp-filter-end");

  function renderSummary(totalSelesai, totalBatal, totalEarning, driverShare, kasShare) {
    summaryEl.innerHTML = `
      <div class="drv-pdp-hero">
        <span class="drv-pdp-hero-label">Pendapatan Kamu (60%)</span>
        <p class="drv-pdp-hero-value">${formatRupiah(driverShare)}</p>
        <div class="drv-pdp-hero-sub">
          <span><i class="fa-solid fa-receipt"></i> Total Order ${formatRupiah(totalEarning)}</span>
          <span><i class="fa-solid fa-wallet"></i> Kas/Setoran ${formatRupiah(kasShare)}</span>
        </div>
      </div>

      <div class="drv-pdp-stat-row">
        <div class="drv-pdp-stat-box drv-pdp-stat-selesai">
          <i class="fa-solid fa-circle-check"></i>
          <div>
            <p class="drv-pdp-stat-value">${totalSelesai}</p>
            <span class="drv-pdp-stat-label">Selesai</span>
          </div>
        </div>
        <div class="drv-pdp-stat-box drv-pdp-stat-batal">
          <i class="fa-solid fa-circle-xmark"></i>
          <div>
            <p class="drv-pdp-stat-value">${totalBatal}</p>
            <span class="drv-pdp-stat-label">Dibatalkan</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderList(filtered) {
    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="drv-pdp-empty">
          <div class="drv-pdp-empty-icon"><i class="fa-solid fa-inbox"></i></div>
          <p>Belum ada riwayat order di periode ini.</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = filtered
      .map((o) => {
        const meta = STATUS_META[o.status] || STATUS_META.selesai;
        const orderIdDisplay = (o.id || "").slice(0, 8).toUpperCase();
        return `
          <div class="drv-pdp-card">
            <div class="drv-pdp-card-top">
              <span class="drv-pdp-order-id">#${orderIdDisplay}</span>
              <span class="drv-pdp-badge" style="color:${meta.color};background:${meta.bg}">${meta.label}</span>
            </div>
            <p class="drv-pdp-items">Belikan: ${escapeHtml(o.items || "-")}</p>
            <div class="drv-pdp-card-bottom">
              <span class="drv-pdp-time"><i class="fa-regular fa-clock"></i> ${formatTanggal(o.claimedAt)}</span>
              <span class="drv-pdp-fee">${formatRupiah(o.fee)}</span>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderPendapatan() {
    const { start, end } = getPeriodRange(currentPeriod, customStartDate, customEndDate);

    const filtered = allOrders.filter((o) => {
      const ms = o.claimedAt?.toMillis?.();
      if (!ms) return false;
      if (start && ms < start.getTime()) return false;
      if (end && ms > end.getTime()) return false;
      return true;
    });

    const totalSelesai = filtered.filter((o) => o.status === "selesai");
    const totalBatal = filtered.filter((o) => o.status === "batal");
    const totalEarning = totalSelesai.reduce((sum, o) => sum + Number(o.fee || 0), 0);
    const driverShare = totalEarning * 0.6;
    const kasShare = totalEarning * 0.4;

    renderSummary(totalSelesai.length, totalBatal.length, totalEarning, driverShare, kasShare);
    renderList(filtered);
  }

  chipsEl.querySelectorAll(".drv-pdp-filter-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentPeriod = btn.dataset.period;
      chipsEl.querySelectorAll(".drv-pdp-filter-chip").forEach((b) => b.classList.remove("drv-pdp-filter-chip-active"));
      btn.classList.add("drv-pdp-filter-chip-active");
      customBoxEl.hidden = currentPeriod !== "custom";
      if (currentPeriod !== "custom") renderPendapatan();
    });
  });

  section.querySelector("#pdp-filter-apply").addEventListener("click", () => {
    customStartDate = startInputEl.value || null;
    customEndDate = endInputEl.value || null;
    renderPendapatan();
  });

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
          allOrders = snapshot.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.claimedAt?.toMillis?.() || 0) - (a.claimedAt?.toMillis?.() || 0));
          renderPendapatan();
        },
        (err) => {
          console.error(err);
          listEl.innerHTML = `<p class="drv-pdp-error">Gagal memuat riwayat. Coba refresh halaman.</p>`;
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
  allOrders = [];
  currentPeriod = "hari-ini";
  customStartDate = null;
  customEndDate = null;
  section.innerHTML = "";
}
