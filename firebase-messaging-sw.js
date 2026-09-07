// firebase-messaging-sw.js — app DRIVER
// Nangkep push notification pas tab/app lagi di background atau tertutup.
// Taruh file ini SEJAJAR dengan index.html driver (di dalam folder driver/).

importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBE5g9DrxN-ZAumkFQDSW2KknhYyuUXKUA",
  authDomain: "klien-5c5cb.firebaseapp.com",
  projectId: "klien-5c5cb",
  storageBucket: "klien-5c5cb.firebasestorage.app",
  messagingSenderId: "1047587810737",
  appId: "1:1047587810737:web:a40f87b3b293b6747c6190",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "SuruhBeli Driver";
  const body = payload.notification?.body || "";

  self.registration.showNotification(title, {
    body,
    icon: "logo.png",
    badge: "logo.png",
    data: payload.data || {},
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow("./index.html"));
});
