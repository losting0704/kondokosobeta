// /js/sw.js

// ▼▼▼ 已將 v4 更新為 v5，以強制更新快取 ▼▼▼
const CACHE_NAME = "dryer-logger-cache-v5";
// ▲▲▲ 修改結束 ▲▲▲

const FILES_TO_CACHE = [
  // --- 核心應用檔案 ---
  "./index.html",
  "./css/style.css",
  "./js/main.js",
  "./js/core.js",
  "./js/modules/config.js",
  "./js/modules/utils.js",
  "./js/modules/uiManager.js",
  "./js/modules/dataManager.js",
  "./js/modules/chartManager.js",
  "./js/modules/csvHandler.js",
  "./js/modules/eventHandler.js",

  // --- PWA 圖示 ---
  "./img/icon-512x512.png",

  // --- Damper 佈局圖 (所有機型) ---
  "./img/damper-layout-vt1.jpg",
  "./img/damper-layout-vt5.jpg",
  "./img/damper-layout-vt6.jpg",
  "./img/damper-layout-vt7.jpg",
  "./img/damper-layout-vt8.jpg",

  // --- HMI 介面背景圖 (SVG) ---
  "./img/vt1-hmi-monitor-1.svg",
  "./img/vt1-hmi-monitor-2.svg",
  "./img/vt1-hmi-pid-1.svg",
  "./img/vt5-hmi-monitor-1.svg",
  "./img/vt5-hmi-monitor-2.svg",
  "./img/vt5-hmi-pid-1.svg",
  "./img/vt6-hmi-monitor-1.svg",
  "./img/vt6-hmi-monitor-2.svg",
  "./img/vt6-hmi-pid-1.svg",
  "./img/vt7-hmi-monitor-1.svg",
  "./img/vt7-hmi-monitor-2.svg",
  "./img/vt7-hmi-pid-1.svg",
  "./img/vt8-hmi-monitor-1.svg",
  "./img/vt8-hmi-monitor-2.svg",
  "./img/vt8-hmi-pid-1.svg",
  "./img/vt8-hmi-pid-2.svg",

  // --- 風量測量點實景圖 (JPG) ---
  // VT1
  "./img/vt1-chamber1-supply-motor-before.jpg",
  "./img/vt1-chamber1-supply-motor-after.jpg",
  "./img/vt1-chamber1-exhaust-motor-before.jpg",
  "./img/vt1-chamber1-exhaust-motor-after.jpg",
  "./img/vt1-chamber2-supply-motor-before.jpg",
  "./img/vt1-chamber2-supply-motor-after.jpg",
  "./img/vt1-chamber2-exhaust-motor-before.jpg",
  "./img/vt1-chamber2-exhaust-motor-after.jpg",
  "./img/vt1-chamber1-upper-ac-supply.jpg",
  "./img/vt1-upper-ac-supply.jpg",
  "./img/vt1-chamber2-upper-ac-supply.jpg",
  "./img/vt1-top-roll-exhaust-fan-before.jpg",
  "./img/vt1-top-roll-exhaust-fan-after.jpg",
  "./img/vt1-lower-ac-supply.jpg",
  "./img/vt1-lower-ac-exhaust.jpg",
  // VT5
  "./img/vt5-chamber1-supply.jpg",
  "./img/vt5-chamber1-exhaust.jpg",
  "./img/vt5-chamber2-supply.jpg",
  "./img/vt5-chamber2-exhaust.jpg",
  "./img/vt5-chamber1-2-exhaust.jpg",
  "./img/vt5-chamber1-upper-ac-supply.jpg",
  "./img/vt5-chamber1-upper-ac-supply-front.jpg",
  "./img/vt5-chamber1-upper-ac-supply-rear.jpg",
  "./img/vt5-chamber2-upper-ac-supply.jpg",
  "./img/vt5-chamber2-upper-ac-supply-front.jpg",
  "./img/vt5-chamber2-upper-ac-supply-rear.jpg",
  // VT6
  "./img/vt6-chamber1-supply.jpg",
  "./img/vt6-chamber1-exhaust.jpg",
  "./img/vt6-chamber2-supply.jpg",
  "./img/vt6-chamber2-exhaust.jpg",
  "./img/vt6-chamber1-upper-ac-supply-upper.jpg",
  "./img/vt6-chamber1-upper-ac-supply-lower.jpg",
  "./img/vt6-chamber1-upper-ac-exhaust.jpg",
  "./img/vt6-chamber2-upper-ac-supply.jpg",
  "./img/vt6-chamber2-upper-ac-exhaust.jpg",
  "./img/vt6-upper-ac-exhaust-1-2.jpg",
  "./img/vt6-top-exhaust-right.jpg",
  "./img/vt6-top-exhaust-left.jpg",
  "./img/vt6-lower-ac-exhaust.jpg",
  // VT7
  "./img/vt7-chamber1-supply.jpg",
  "./img/vt7-chamber1-exhaust.jpg",
  "./img/vt7-chamber2-supply.jpg",
  "./img/vt7-chamber2-exhaust.jpg",
  "./img/vt7-chamber1-2-exhaust.jpg",
  "./img/vt7-chamber1-upper-ac-supply-upper.jpg",
  "./img/vt7-chamber1-upper-ac-supply-lower.jpg",
  "./img/vt7-chamber2-upper-ac-supply.jpg",
  "./img/vt7-top-exhaust.jpg",
  "./img/vt7-upper-ac-exhaust-outdoor.jpg",
  "./img/vt7-lower-ac-supply.jpg",
  "./img/vt7-chamber2-lower-ac-exhaust.jpg",
  // VT8
  "./img/vt8-chamber1-supply.jpg",
  "./img/vt8-chamber2-supply-after-filter.jpg",
  "./img/vt8-chamber2-supply-before-filter.jpg",
  "./img/vt8-chamber1-exhaust-before-motor.jpg",
  "./img/vt8-chamber2-exhaust-before-motor.jpg",
  "./img/vt8-chamber1-upper-ac-supply.jpg",
  "./img/vt8-chamber1-upper-ac-supply-front.jpg",
  "./img/vt8-chamber1-upper-ac-supply-rear.jpg",
  "./img/vt8-chamber2-upper-ac-supply.jpg",
  "./img/vt8-chamber2-upper-ac-supply-front.jpg",
  "./img/vt8-chamber2-upper-ac-supply-rear.jpg",
  "./img/vt8-upper-ac-top-exhaust-outdoor.jpg",
  "./img/vt8-lower-ac-exhaust.jpg",
  "./img/vt8-lower-ac-exhaust-outdoor.jpg",
];

// 1. 安裝 Service Worker 並快取檔案
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Opened cache");
      return cache.addAll(FILES_TO_CACHE);
    })
  );
});

// 2. 攔截網路請求，優先從快取提供資源
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // 如果快取中有，就直接回傳快取的版本
      if (response) {
        return response;
      }
      // 如果快取中沒有，就透過網路去請求
      return fetch(event.request);
    })
  );
});

// 3. 啟用新的 Service Worker 時，刪除舊的快取
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log("Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
