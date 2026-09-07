// drv-chat-room.js — room chat 1-on-1 antara driver dan customer.

import { getActiveChat, buildChatId } from "./chat-state.js";

let unsubscribeMessages = null;
let unsubscribeChat = null;

function formatJamPesan(timestamp) {
  if (!timestamp || !timestamp.toDate) return "";
  return timestamp.toDate().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function getInitial(name) {
  return (name || "C").trim().charAt(0).toUpperCase();
}

export function mount(section, { user, db }) {
  const appHeader = document.getElementById("app-header");
  if (appHeader) appHeader.hidden = true;
  const bottomNav = document.getElementById("bottom-nav");
  if (bottomNav) bottomNav.classList.add("bottom-nav-hide");

  const chat = getActiveChat();

  if (!chat || !chat.customerUid) {
    section.innerHTML = `
      <div class="chatroom-wrap">
        <div class="chatroom-topbar">
          <button class="chatroom-icon-btn" id="chatroom-back"><i class="fa-solid fa-arrow-left"></i></button>
        </div>
        <p class="chatroom-empty">Nggak ada chat yang dipilih.</p>
      </div>
    `;
    section.querySelector("#chatroom-back").addEventListener("click", () => {
      window.location.hash = "#/chat-list";
    });
    return;
  }

  const chatId = buildChatId(user.uid, chat.customerUid);

  section.innerHTML = `
    <div class="chatroom-wrap">
      <div class="chatroom-topbar">
        <button class="chatroom-icon-btn" id="chatroom-back"><i class="fa-solid fa-arrow-left"></i></button>
        <div class="chatroom-avatar chatroom-avatar-fallback">${getInitial(chat.customerName)}</div>
        <p class="chatroom-name">${escapeHtml(chat.customerName || "Customer")}</p>
      </div>
      <div class="chatroom-messages" id="chatroom-messages">
        <p class="chatroom-loading">Memuat percakapan...</p>
      </div>
      <form class="chatroom-inputbar" id="chatroom-form">
        <input type="text" id="chatroom-input" placeholder="Ketik pesan..." autocomplete="off" />
        <button type="submit" id="chatroom-send"><i class="fa-solid fa-paper-plane"></i></button>
      </form>
    </div>
  `;

  section.querySelector("#chatroom-back").addEventListener("click", () => {
    window.location.hash = "#/chat-list";
  });

  const messagesEl = section.querySelector("#chatroom-messages");
  const formEl = section.querySelector("#chatroom-form");
  const inputEl = section.querySelector("#chatroom-input");

  let latestMessages = null;
  let latestChatData = null;

  let freshCustomerName = chat.customerName || "";
  let freshCustomerFoto = chat.customerFoto || "";

  function updateHeaderProfile(name, foto) {
    const nameEl = section.querySelector(".chatroom-name");
    if (name && nameEl) nameEl.textContent = name;

    const avatarEl = section.querySelector(".chatroom-avatar");
    if (foto && avatarEl && avatarEl.tagName === "IMG") {
      avatarEl.src = foto;
    } else if (foto && avatarEl) {
      avatarEl.outerHTML = `<img src="${escapeHtml(foto)}" alt="" class="chatroom-avatar" />`;
    }
  }

  function renderHeaderAvatar() {
    const foto = freshCustomerFoto || latestChatData?.customerFoto || chat.customerFoto;
    updateHeaderProfile(freshCustomerName, foto);
  }

  renderHeaderAvatar();

  function renderMessages() {
    if (!latestMessages) return;

    if (latestMessages.length === 0) {
      messagesEl.innerHTML = `<p class="chatroom-empty">Mulai obrolan dengan customer.</p>`;
      return;
    }

    const customerReadAtMs = latestChatData?.lastReadByCustomerAt?.toMillis?.() || 0;

    messagesEl.innerHTML = latestMessages
      .map((m) => {
        const mine = m.senderId === user.uid;
        let statusIcon = "";
        if (mine) {
          const msgMs = m.createdAt?.toMillis?.() || Infinity;
          const isRead = m.createdAt && customerReadAtMs >= msgMs;
          statusIcon = isRead
            ? `<i class="fa-solid fa-check-double chatroom-check chatroom-check-read"></i>`
            : `<i class="fa-solid fa-check chatroom-check"></i>`;
        }
        return `
          <div class="chatroom-bubble-row ${mine ? "chatroom-bubble-row-mine" : ""}">
            <div class="chatroom-bubble ${mine ? "chatroom-bubble-mine" : "chatroom-bubble-theirs"}">
              <p>${escapeHtml(m.text || "")}</p>
              <span class="chatroom-bubble-time">${formatJamPesan(m.createdAt)}${statusIcon}</span>
            </div>
          </div>
        `;
      })
      .join("");
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js").then(
    ({ doc, setDoc, getDoc, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, updateDoc, increment }) => {
      const chatRef = doc(db, "chats", chatId);
      const messagesRef = collection(db, "chats", chatId, "messages");

      function notify(message) {
        if (typeof window.showToast === "function") {
          window.showToast(message, "error");
        } else {
          console.warn(message);
        }
      }

      function markReadByDriver() {
        updateDoc(chatRef, {
          unreadForDriver: 0,
          lastReadByDriverAt: serverTimestamp(),
        }).catch((err) => console.error(err));
      }

      getDoc(doc(db, "public_profiles", chat.customerUid))
        .catch(() => null)
        .then((profSnap) => {
          if (profSnap && profSnap.exists()) {
            const prof = profSnap.data();
            if (prof.name) freshCustomerName = prof.name;
            if (typeof prof.photoURL === "string" && prof.photoURL) freshCustomerFoto = prof.photoURL;
            renderHeaderAvatar();
          }
          return getDoc(chatRef);
        })
        .then((snap) => {
          if (!snap.exists()) {
            return setDoc(chatRef, {
              customerUid: chat.customerUid,
              driverUid: user.uid,
              customerName: freshCustomerName,
              customerFoto: freshCustomerFoto,
              lastMessage: "",
              lastMessageAt: serverTimestamp(),
              createdAt: serverTimestamp(),
              unreadForCustomer: 0,
              unreadForDriver: 0,
            });
          }
          const existing = snap.data();
          const patch = {};
          if (!existing.customerName && freshCustomerName) patch.customerName = freshCustomerName;
          if (!existing.customerFoto && freshCustomerFoto) patch.customerFoto = freshCustomerFoto;
          if (Object.keys(patch).length > 0) {
            return updateDoc(chatRef, patch);
          }
        })
        .then(() => {
          unsubscribeChat = onSnapshot(chatRef, (snap) => {
            latestChatData = snap.data() || null;
            renderMessages();
            renderHeaderAvatar();
          });

          markReadByDriver();

          const q = query(messagesRef, orderBy("createdAt", "asc"));
          unsubscribeMessages = onSnapshot(
            q,
            (snapshot) => {
              latestMessages = snapshot.docs.map((d) => d.data());
              renderMessages();
              markReadByDriver();
            },
            (err) => {
              console.error(err);
              messagesEl.innerHTML = `<p class="chatroom-empty">Gagal memuat pesan. Coba refresh halaman.</p>`;
            }
          );

          formEl.addEventListener("submit", async (e) => {
            e.preventDefault();
            const text = inputEl.value.trim();
            if (!text) return;

            inputEl.value = "";
            inputEl.disabled = true;

            try {
              await addDoc(messagesRef, {
                senderId: user.uid,
                senderRole: "driver",
                text,
                createdAt: serverTimestamp(),
              });
              await updateDoc(chatRef, {
                lastMessage: text,
                lastMessageAt: serverTimestamp(),
                lastSenderId: user.uid,
                unreadForCustomer: increment(1),
              });
            } catch (err) {
              console.error(err);
              notify("Gagal mengirim pesan. Coba lagi ya.");
              inputEl.value = text;
            } finally {
              inputEl.disabled = false;
              inputEl.focus();
            }
          });
        })
        .catch((err) => {
          console.error(err);
          messagesEl.innerHTML = `<p class="chatroom-empty">Gagal memuat percakapan. Coba refresh halaman.</p>`;
        });
    }
  );
}

export function unmount(section) {
  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }
  if (unsubscribeChat) {
    unsubscribeChat();
    unsubscribeChat = null;
  }
  const appHeader = document.getElementById("app-header");
  if (appHeader) appHeader.hidden = false;

  const bottomNav = document.getElementById("bottom-nav");
  if (bottomNav) bottomNav.classList.remove("bottom-nav-hide");

  section.innerHTML = "";
}
