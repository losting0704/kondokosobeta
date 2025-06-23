// /js/modules/utils.js

// 說明：
// 這個模組是應用程式的「工具箱」。
// 它包含了所有可重複使用的、純粹的輔助函式。
// 這些函式不依賴任何其他模組的狀態，只接收輸入並回傳輸出。

/**
 * 【★★★ 新增的函式 ★★★】
 * 建立一個 Debounce (防抖動) 函式。
 * 它會延遲執行一個函式，直到使用者停止輸入一段時間後。
 * @param {Function} func - 要延遲執行的函式。
 * @param {number} wait - 延遲的毫秒數 (例如 500)。
 * @returns {Function} 一個新的、具備防抖動功能的函式。
 */
const debounce = (func, wait) => {
  let timeout;

  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };

    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * 安全地取得巢狀物件的值
 * @param {object} obj - 要操作的物件
 * @param {string} path - 值的路徑，例如 "recorder1Data.chamber1_lower"
 * @param {*} defaultValue - 如果找不到值，回傳的預設值
 * @returns {*} 物件中的值或預設值
 */
const getNestedValue = (obj, path, defaultValue = null) => {
  const value = path.split(".").reduce((acc, part) => acc && acc[part], obj);
  return value === undefined || value === null ? defaultValue : value;
};

/**
 * 安全地設定巢狀物件的值
 * @param {object} obj - 要操作的物件
 * @param {string} path - 值的路徑
 * @param {*} value - 要設定的值
 */
const setNestedValue = (obj, path, value) => {
  const parts = path.split(".");
  const last = parts.pop();
  const target = parts.reduce((acc, part) => {
    if (!acc[part] || typeof acc[part] !== "object") {
      acc[part] = {};
    }
    return acc[part];
  }, obj);
  target[last] = value;
};

/**
 * 根據風管規格計算面積 (m²)
 * @param {string} ductValue - 風管規格，例如 "φ0.55" 或 "0.65*0.65"
 * @returns {number} 計算出的面積
 */
const calculateArea = (ductValue) => {
  if (!ductValue) return 0;
  let area = 0;
  if (ductValue.includes("*")) {
    const parts = ductValue.split("*").map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      area = parts[0] * parts[1];
    }
  } else if (ductValue.includes("φ") || ductValue.includes("Ф")) {
    const diameter = parseFloat(ductValue.replace(/[^0-9.]/g, ""));
    if (!isNaN(diameter)) {
      const radius = diameter / 2;
      area = Math.PI * radius * radius;
    }
  }
  return parseFloat(area.toFixed(3));
};

/**
 * 計算風量 (Nm³/分)
 * @param {number|string} temperature - 溫度 (℃)
 * @param {number|string} windSpeed - 風速 (m/s)
 * @param {number|string} area - 面積 (m²)
 * @returns {number} 計算出的風量
 */
const calculateAirVolume = (temperature, windSpeed, area) => {
  const K_CONSTANT_FOR_AIR_VOLUME = 273;
  const tempNum =
    String(temperature).trim() === "" || temperature === null
      ? 0
      : parseFloat(temperature);
  const speedNum =
    String(windSpeed).trim() === "" || windSpeed === null
      ? 0
      : parseFloat(windSpeed);
  const areaNum =
    String(area).trim() === "" || area === null ? 0 : parseFloat(area);
  if (
    isNaN(tempNum) ||
    isNaN(speedNum) ||
    isNaN(areaNum) ||
    K_CONSTANT_FOR_AIR_VOLUME + tempNum === 0
  ) {
    return 0;
  }
  const volume =
    (K_CONSTANT_FOR_AIR_VOLUME / (K_CONSTANT_FOR_AIR_VOLUME + tempNum)) *
    areaNum *
    speedNum *
    60;
  return parseFloat(volume.toFixed(1));
};

/**
 * 根據技術溫測點的 ID 轉換為紀錄物件中的 key
 * @param {string} pointId - 例如 "1", "12", "T1"
 * @returns {string} 轉換後的 key，例如 "point1", "point12", "pointT1"
 */
const getActualTempRecordKey = (pointId) => {
  if (pointId.startsWith("T")) return `point${pointId}`;
  return `point${parseInt(pointId)}`;
};

/**
 * 轉義 CSV 中的特殊字元，避免格式錯誤
 * @param {*} value - 要轉義的值
 * @returns {string} 轉義後的字串
 */
const escapeCsv = (value) => {
  if (value === null || value === undefined) return "";
  let stringValue = String(value);
  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n")
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

/**
 * 【★★★ 重新加入的函式 ★★★】
 * 根據技術溫測點 ID，從紀錄中取得對應的「機台顯示溫度」
 * @param {string} pointId - 技術溫測點 ID
 * @param {object} record - 完整的單筆紀錄物件
 * @returns {number|null} 計算出的平均溫度或 null
 */
const getMachineDisplayTempForPoint = (pointId, record) => {
  if (!record) return null;
  const recorder1Data = record.recorder1Data || {};
  const recorder2Data = record.recorder2Data || {};

  const getAverage = (values) => {
    const validValues = values
      .filter((v) => v !== null && v !== undefined && !isNaN(parseFloat(v)))
      .map(parseFloat);
    if (validValues.length === 0) return null;
    const sum = validValues.reduce((a, b) => a + b, 0);
    return parseFloat((sum / validValues.length).toFixed(2));
  };

  switch (pointId) {
    case "1":
    case "2":
    case "3":
    case "4":
      return getAverage([
        recorder1Data.chamber1_lower_right,
        recorder1Data.chamber1_lower_middle,
        recorder1Data.chamber1_lower_left,
      ]);
    case "5":
    case "6":
    case "7":
      return typeof recorder1Data.chamber1_middle_middle === "number"
        ? recorder1Data.chamber1_middle_middle
        : null;
    case "8":
    case "9":
    case "10":
    case "11":
      return getAverage([
        recorder1Data.chamber1_upper_right,
        recorder1Data.chamber1_upper_middle,
        recorder1Data.chamber1_upper_left,
      ]);
    case "T1":
    case "T2":
      // 使用正確的頂層 dataKey
      return typeof record.airExternal_top_roll_chamber_celsius === "number"
        ? record.airExternal_top_roll_chamber_celsius
        : null;
    case "12":
    case "13":
    case "14":
    case "15":
      return getAverage([
        recorder2Data.chamber2_upper_right,
        recorder2Data.chamber2_upper_middle,
        recorder2Data.chamber2_upper_left,
      ]);
    case "16":
    case "17":
    case "18":
      return typeof recorder2Data.chamber2_middle_middle === "number"
        ? recorder2Data.chamber2_middle_middle
        : null;
    case "19":
    case "20":
    case "21":
    case "22":
      return getAverage([
        recorder2Data.chamber2_lower_right,
        recorder2Data.chamber2_lower_middle,
        recorder2Data.chamber2_lower_left,
      ]);
    default:
      return null;
  }
};

// 使用 export 將這些函式匯出，讓其他模組可以透過 import 使用
export {
  debounce,
  getNestedValue,
  setNestedValue,
  calculateArea,
  calculateAirVolume,
  getActualTempRecordKey,
  escapeCsv,
  getMachineDisplayTempForPoint, // 確保新函式被匯出
};
