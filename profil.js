// profil.js — profil driver + logout

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

const PLACEHOLDER_MENU = [
  { key: "data-pribadi", icon: "fa-user", label: "Data Pribadi" },
  { key: "kendaraan", icon: "fa-car", label: "Kendaraan Saya" },
  { key: "bank", icon: "fa-credit-card", label: "Bank / Rekening" },
  { key: "pengaturan", icon: "fa-gear", label: "Pengaturan" },
  { key: "bantuan", icon: "fa-circle-question", label: "Bantuan & FAQ" },
  { key: "tentang", icon: "fa-circle-info", label: "Tentang SuruhBeli" },
];

export function mount(section, { user, driverData, signOut, auth }) {
  const initial = (user.displayName || user.email || "D").trim().charAt(0).toUpperCase();
  const phone = user.phoneNumber || driverData?.phone || user.email || "";

  section.innerHTML = `
    <div class="drv-profil-wrap">
      <div class="drv-profil-header">
        <div class="drv-profil-avatar-wrap">
          <div class="drv-profil-avatar">${initial}</div>
          <button class="drv-profil-avatar-edit" id="drv-avatar-edit-btn">
            <i class="fa-solid fa-pen"></i>
          </button>
        </div>
        <h2>${escapeHtml(user.displayName || "Driver")}</h2>
        <p>${escapeHtml(phone)}</p>
        <span class="drv-profil-status">
          <i class="fa-solid fa-circle-check"></i> Terverifikasi
        </span>
      </div>

      <div class="drv-profil-menu">
        ${PLACEHOLDER_MENU.map(
          (m) => `
          <button class="drv-profil-item" data-menu="${m.key}">
            <i class="fa-solid ${m.icon}"></i>
            <span>${m.label}</span>
            <i class="fa-solid fa-chevron-right drv-profil-chevron"></i>
          </button>
        `
        ).join("")}
      </div>

      <div class="drv-profil-menu">
        <button class="drv-profil-item drv-profil-item-danger" id="drv-logout-btn">
          <i class="fa-solid fa-right-from-bracket"></i>
          <span>Keluar</span>
        </button>
      </div>
    </div>
  `;

  section.querySelectorAll(".drv-profil-item[data-menu]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.showToast("Fitur ini akan segera hadir.", "info");
    });
  });

  section.querySelector("#drv-avatar-edit-btn").addEventListener("click", () => {
    window.showToast("Fitur ini akan segera hadir.", "info");
  });

  section.querySelector("#drv-logout-btn").addEventListener("click", () => {
    showLogoutConfirm(async () => {
      try {
        await signOut(auth);
        window.location.href = "login.html";
      } catch (err) {
        console.error(err);
        window.showToast("Gagal keluar. Coba lagi.", "error");
      }
    });
  });
}

function showLogoutConfirm(onConfirm) {
  const overlay = document.createElement("div");
  overlay.className = "drv-popup-overlay";
  overlay.innerHTML = `
    <div class="drv-popup-box">
      <div class="drv-popup-icon drv-popup-icon-danger"><i class="fa-solid fa-right-from-bracket"></i></div>
      <h2>Keluar Akun?</h2>
      <p>Kamu perlu login lagi untuk mengakses akun ini.</p>
      <div class="drv-popup-actions">
        <button class="drv-popup-btn drv-popup-btn-secondary" id="drv-logout-cancel">Batal</button>
        <button class="drv-popup-btn drv-popup-btn-danger" id="drv-logout-confirm">Ya, Keluar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector("#drv-logout-cancel").addEventListener("click", () => overlay.remove());
  overlay.querySelector("#drv-logout-confirm").addEventListener("click", () => {
    overlay.remove();
    onConfirm();
  });
}

export function unmount(section) {
  section.innerHTML = "";
}