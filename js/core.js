// core.js - 核心模組管理器與事件中心 (沙箱)

console.log("Core: 核心模組已載入");

const modules = {};
const eventBus = {};

const registerModule = (moduleId, creator) => {
  modules[moduleId] = {
    creator: creator,
    instance: null,
  };
  console.log(`Core: 模組 [${moduleId}] 已註冊`);
};

const startModule = (moduleId) => {
  console.log(`Core: 正在啟動模組 [${moduleId}]...`);
  const sandbox = {
    publish: (eventName, data) => {
      publishEvent(eventName, data);
    },
    subscribe: (eventName, callback) => {
      subscribeToEvent(eventName, callback);
    },
    getModule: (targetModuleId) => {
      if (modules[targetModuleId] && modules[targetModuleId].instance) {
        return modules[targetModuleId].instance;
      }
      console.warn(
        `模組 [${moduleId}] 嘗試取得一個不存在或未啟動的模組 [${targetModuleId}]`
      );
      return null;
    },
  };

  try {
    modules[moduleId].instance = modules[moduleId].creator(sandbox);
    if (typeof modules[moduleId].instance.init === "function") {
      modules[moduleId].instance.init();
      console.log(`Core: 模組 [${moduleId}] 已成功啟動`);
    } else {
      console.warn(`Core: 模組 [${moduleId}] 沒有 'init' 方法。`);
    }
  } catch (error) {
    console.error(`Core: 啟動模組 [${moduleId}] 時發生錯誤:`, error);
    throw error; // 將錯誤拋出，讓頂層的 try-catch 可以捕獲
  }
};

const startAllModules = () => {
  console.log("Core: 開始啟動所有模組...");

  // ★★★ 關鍵修正 ★★★
  // 調整初始化順序，確保 eventHandler 最後啟動。
  // 它依賴所有其他模組，所以必須等其他模組都準備好。
  const initOrder = [
    "uiManager",
    "dataManager",
    "chartManager",
    "csvHandler",
    "eventHandler", // 將 eventHandler 移至最後
  ];

  initOrder.forEach((moduleId) => {
    if (modules[moduleId]) {
      startModule(moduleId);
    } else {
      console.warn(
        `Core: 警告！在初始化順序中定義的模組 [${moduleId}] 並未被註冊。`
      );
    }
  });

  console.log("Core: 所有模組已啟動完成。");
};

const publishEvent = (eventName, data) => {
  if (eventBus[eventName]) {
    eventBus[eventName].forEach((callback) => {
      try {
        // 使用 setTimeout 確保事件回呼是非同步的，避免阻塞
        setTimeout(() => callback(data), 0);
      } catch (error) {
        console.error(`執行事件 '${eventName}' 的回呼時發生錯誤:`, error);
      }
    });
  }
};

const subscribeToEvent = (eventName, callback) => {
  if (!eventBus[eventName]) {
    eventBus[eventName] = [];
  }
  eventBus[eventName].push(callback);
};

export { registerModule, startAllModules };
