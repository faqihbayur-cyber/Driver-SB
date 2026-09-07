// chat-state.js — context sederhana buat oper data "siapa yang lagi diajak chat"
// antar view, karena router cuma pakai hash tanpa parameter.

let activeChat = null; // { customerUid, customerName, customerFoto }

export function setActiveChat(customer) {
  activeChat = customer;
}

export function getActiveChat() {
  return activeChat;
}

export function buildChatId(uidA, uidB) {
  return [uidA, uidB].sort().join("_");
}