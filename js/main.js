// /js/main.js

import { registerModule, startAllModules } from "./core.js";

import UIManager from "./modules/uiManager.js";
import DataManager from "./modules/dataManager.js";
import ChartManager from "./modules/chartManager.js";
import CsvHandler from "./modules/csvHandler.js";
import EventHandler from "./modules/eventHandler.js";

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM 已載入，準備啟動應用程式...");

  // 核心原則：被依賴的模組先註冊
  registerModule("uiManager", UIManager); // UIManager 必須最先註冊
  registerModule("dataManager", DataManager);
  registerModule("chartManager", ChartManager);
  registerModule("csvHandler", CsvHandler);
  registerModule("eventHandler", EventHandler);

  try {
    startAllModules();
    document.body.style.opacity = "1";
  } catch (error) {
    console.error("應用程式啟動失敗:", error);
    const loadingOverlay = document.getElementById("loadingOverlay");
    if (loadingOverlay) {
      loadingOverlay.classList.remove("visible");
    }
    const messageBox = document.getElementById("messageBox");
    if (messageBox) {
      messageBox.textContent = "應用程式啟動失敗，請檢查控制台錯誤。";
      messageBox.className = "message-box visible error";
    }
    document.body.style.opacity = "1";
  }

  console.log("===================================");
  console.log("乾燥機數據紀錄器已嘗試啟動！");
  console.log("===================================");

  // ▼▼▼ 在這裡加入 PWA 註冊程式碼 ▼▼▼
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("./sw.js")
      .then((registration) => {
        console.log("Service Worker 註冊成功:", registration);
      })
      .catch((error) => {
        console.log("Service Worker 註冊失敗:", error);
      });
  }
  // ▲▲▲ PWA 註冊程式碼結束 ▲▲▲
});
