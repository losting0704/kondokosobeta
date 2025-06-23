// /js/modules/dataManager.js

import {
  LOCAL_STORAGE_KEY,
  techTempPoints,
  getAirVolumeMeasurementsByModel,
} from "./config.js";
import * as utils from "./utils.js";

const DataManager = (sandbox) => {
  let records = [];
  let editingIndex = -1;
  let ui;
  let filterState = {};
  let sortState = { key: "dateTime", direction: "desc" };
  let goldenBatchId = null;
  let currentPage = 1;
  const ITEMS_PER_PAGE = 20;

  /**
   * 從 Local Storage 載入數據。
   * 會在應用程式啟動時執行。
   */
  const _loadDataFromLocalStorage = () => {
    try {
      const storedRecords = localStorage.getItem(LOCAL_STORAGE_KEY);
      records = storedRecords ? JSON.parse(storedRecords) : [];
      // 確保每筆紀錄都有一個唯一的 ID，如果沒有則生成一個
      records.forEach((record) => {
        if (!record.id) {
          record.id = crypto.randomUUID();
        }
      });
      // 過濾掉任何無效或非物件的紀錄
      records = records.filter((r) => r && typeof r === "object");

      // 載入當前機台型號的黃金樣板 ID
      if (ui) {
        const dryerModel = ui.getCurrentDryerModel();
        goldenBatchId = localStorage.getItem(`goldenBatchId_${dryerModel}`);
      }
      console.log("DataManager: 已從 Local Storage 載入數據。");
    } catch (e) {
      console.error("DataManager: 載入 Local Storage 失敗", e);
      records = []; // 載入失敗則清空數據
      goldenBatchId = null;
      sandbox.publish("show-message", {
        text: "載入本地數據失敗。",
        type: "error",
      });
    }
  };

  /**
   * 將當前記憶體中的數據儲存到 Local Storage。
   */
  const _saveRecordsToLocalStorage = () => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(records));
      console.log("DataManager: 數據已儲存到 Local Storage。");
    } catch (e) {
      console.error("DataManager: 儲存 Local Storage 失敗", e);
      sandbox.publish("show-message", {
        text: "儲存本地數據失敗。",
        type: "error",
      });
    }
  };

  const _mergeImportedRecords = ({ records: importedRecords }) => {
    if (!Array.isArray(importedRecords) || importedRecords.length === 0) {
      sandbox.publish("show-message", {
        text: "匯入的檔案中沒有可添加的數據。",
        type: "info",
      });
      return;
    }

    const existingIds = new Set(records.map((r) => r.id));
    const recordsToAdd = importedRecords.filter((r) => {
      if (!r.id || existingIds.has(r.id)) {
        r.id = crypto.randomUUID();
      }
      if (typeof r.dryerModel === "string") {
        r.dryerModel = r.dryerModel.toLowerCase();
      }
      if (typeof r.recordType === "string") {
        if (r.recordType.includes("評價")) {
          r.recordType = "evaluationTeam";
        } else if (r.recordType.includes("條件設定")) {
          r.recordType = "conditionSetting";
        } else {
          r.recordType = r.recordType.toLowerCase();
        }
      }
      r.isSynced = false;
      return true;
    });

    records.unshift(...recordsToAdd);
    records.sort(
      (a, b) => new Date(b.dateTime || 0) - new Date(a.dateTime || 0)
    );

    _saveRecordsToLocalStorage();
    _publishDataUpdate();

    sandbox.publish("show-message", {
      text: `成功從 CSV 檔案匯入 ${recordsToAdd.length} 筆紀錄！`,
      type: "success",
    });
    console.log(`DataManager: 從 CSV 合併了 ${recordsToAdd.length} 筆紀錄。`);
  };

  const _saveGoldenBatchIdToLocalStorage = () => {
    try {
      if (!ui) {
        console.warn(
          "DataManager: UIManager 尚未初始化，無法儲存黃金樣板 ID。"
        );
        return;
      }
      const dryerModel = ui.getCurrentDryerModel();
      const storageKey = `goldenBatchId_${dryerModel}`;
      if (goldenBatchId) {
        localStorage.setItem(storageKey, goldenBatchId);
      } else {
        localStorage.removeItem(storageKey);
      }
      console.log(
        `DataManager: 黃金樣板 ID (${goldenBatchId}) 已為機型 ${dryerModel} 儲存。`
      );
    } catch (e) {
      console.error("DataManager: 儲存黃金樣板ID失敗", e);
      sandbox.publish("show-message", {
        text: "儲存黃金樣板設定失敗。",
        type: "error",
      });
    }
  };

  const _getFilteredAndSortedRecords = () => {
    if (!ui) {
      console.warn(
        "DataManager: UIManager 尚未初始化，無法獲取當前 UI 狀態進行過濾。"
      );
      return [];
    }
    const recordType = ui.getCurrentRecordType();
    const dryerModel = ui.getCurrentDryerModel();

    console.log("DataManager: _getFilteredAndSortedRecords called.");
    console.log(
      "DataManager: Current UI RecordType:",
      recordType,
      "DryerModel:",
      dryerModel
    );

    let filtered = records.filter(
      (r) => r.recordType === recordType && r.dryerModel === dryerModel
    );

    if (filterState.rtoStatus && filterState.rtoStatus !== "all") {
      filtered = filtered.filter(
        (record) => record.rtoStatus === filterState.rtoStatus
      );
    }

    // ▼▼▼ 新增 heatingStatus 篩選邏輯 ▼▼▼
    if (filterState.heatingStatus && filterState.heatingStatus !== "all") {
      filtered = filtered.filter(
        (record) => record.heatingStatus === filterState.heatingStatus
      );
    }
    // ▲▲▲ 新增結束 ▲▲▲

    if (filterState.remark) {
      const lowerCaseQuery = filterState.remark.toLowerCase();
      filtered = filtered.filter(
        (record) =>
          record.remark && record.remark.toLowerCase().includes(lowerCaseQuery)
      );
    }

    if (filterState.startDate) {
      filtered = filtered.filter(
        (record) =>
          record.dateTime &&
          record.dateTime.slice(0, 10) >= filterState.startDate
      );
    }
    if (filterState.endDate) {
      filtered = filtered.filter(
        (record) =>
          record.dateTime && record.dateTime.slice(0, 10) <= filterState.endDate
      );
    }

    if (
      filterState.field &&
      (filterState.min !== "" || filterState.max !== "")
    ) {
      const min =
        filterState.min !== "" ? parseFloat(filterState.min) : -Infinity;
      const max =
        filterState.max !== "" ? parseFloat(filterState.max) : Infinity;

      if (!isNaN(min) && !isNaN(max)) {
        filtered = filtered.filter((record) => {
          const value = utils.getNestedValue(record, filterState.field);
          if (value === null || value === undefined) return false;
          const numValue = parseFloat(value);
          return !isNaN(numValue) && numValue >= min && numValue <= max;
        });
      }
    }

    if (sortState.key) {
      filtered.sort((a, b) => {
        let valA = utils.getNestedValue(a, sortState.key);
        let valB = utils.getNestedValue(b, sortState.key);

        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;

        if (
          typeof valA === "string" &&
          isNaN(valA) &&
          typeof valB === "string" &&
          isNaN(valB)
        ) {
          return sortState.direction === "asc"
            ? String(valA).localeCompare(String(valB))
            : String(valB).localeCompare(String(valA));
        } else {
          const numA = parseFloat(valA);
          const numB = parseFloat(valB);
          return sortState.direction === "asc" ? numA - numB : numB - numA;
        }
      });
    }

    if (records.length > 0 && filtered.length === 0) {
      console.warn(
        "DataManager: 沒有紀錄符合當前過濾條件。檢查前幾條已儲存紀錄的類型和機型："
      );
      records.slice(0, 5).forEach((rec, idx) => {
        console.log(
          `Record ${idx}: type=${rec.recordType}, model=${rec.dryerModel}`
        );
      });
    }

    return filtered;
  };

  const _publishDataUpdate = (overridePayload = {}) => {
    const allVisibleRecords = _getFilteredAndSortedRecords();
    const totalPages =
      Math.ceil(allVisibleRecords.length / ITEMS_PER_PAGE) || 1;

    if (currentPage > totalPages) {
      currentPage = 1;
    }

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const paginatedRecords = allVisibleRecords.slice(startIndex, endIndex);

    const recordBeingEdited =
      editingIndex !== -1
        ? records.find((r) => r.id === records[editingIndex].id)
        : null;
    const newEditingIndex = recordBeingEdited
      ? paginatedRecords.findIndex((r) => r.id === recordBeingEdited.id)
      : -1;

    const payload = {
      records: paginatedRecords,
      pagination: { currentPage, totalPages },
      editingIndex: newEditingIndex,
      sortState: { ...sortState },
      goldenBatchId: goldenBatchId,
      ...overridePayload,
    };
    console.log(
      "DataManager: 發布 'data-updated' 事件，數據 payload:",
      payload
    );
    sandbox.publish("data-updated", payload);
  };

  const _changePage = (newPage) => {
    const allVisibleRecords = _getFilteredAndSortedRecords();
    const totalPages =
      Math.ceil(allVisibleRecords.length / ITEMS_PER_PAGE) || 1;
    if (newPage >= 1 && newPage <= totalPages) {
      currentPage = newPage;
      _publishDataUpdate();
      console.log(`DataManager: 切換到第 ${newPage} 頁。`);
    }
  };

  const _setGoldenBatch = (recordId) => {
    goldenBatchId = goldenBatchId === recordId ? null : recordId;
    _saveGoldenBatchIdToLocalStorage();
    _publishDataUpdate();
    sandbox.publish("show-message", {
      text: `黃金樣板已${goldenBatchId ? "設定" : "取消"}。`,
      type: "success",
    });
    console.log(`DataManager: 黃金樣板 ID 已設定為 ${goldenBatchId}`);
  };

  const _analyzeManualComparison = (recordIds) => {
    if (!recordIds || recordIds.length !== 2) {
      _clearCompareChart();
      return;
    }
    const record1 = records.find((r) => r.id === recordIds[0]);
    const record2 = records.find((r) => r.id === recordIds[1]);

    if (!record1 || !record2) {
      sandbox.publish("show-message", {
        text: "選取的紀錄無效，無法進行比較。",
        type: "error",
      });
      _clearCompareChart();
      return;
    }
    const analysisResult = _performComparison(record1, record2);
    _publishDataUpdate({ comparisonAnalysis: analysisResult });
    console.log("DataManager: 已完成數據比較分析。");
  };

  const _performComparison = (recordA, recordB) => {
    const measurementsA = getAirVolumeMeasurementsByModel(recordA.dryerModel);
    const measurementsB = getAirVolumeMeasurementsByModel(recordB.dryerModel);

    const labelMap = new Map();
    measurementsA.forEach((m) => labelMap.set(m.id, m.label));
    measurementsB.forEach((m) => labelMap.set(m.id, m.label));

    const airVolumeLabels = [];
    const airDataA = [];
    const airDataB = [];
    const combinedAirKeys = [
      ...new Set([
        ...Object.keys(recordA.airVolumes || {}),
        ...Object.keys(recordB.airVolumes || {}),
      ]),
    ];

    for (const key of combinedAirKeys) {
      const volumeA = utils.getNestedValue(recordA, `airVolumes.${key}.volume`);
      const volumeB = utils.getNestedValue(recordB, `airVolumes.${key}.volume`);
      const label = labelMap.get(key) || key;
      if (
        (volumeA !== null && !isNaN(volumeA)) ||
        (volumeB !== null && !isNaN(volumeB))
      ) {
        airVolumeLabels.push(label);
        airDataA.push(volumeA || 0);
        airDataB.push(volumeB || 0);
      }
    }

    const tempLabels = techTempPoints.map((p) =>
      p.label.replace("技術溫測實溫_", "")
    );
    const tempDatasets = [];
    const lineNames = ["1(右)", "2", "3(中)", "4", "5(左)"];

    for (let i = 1; i <= 5; i++) {
      const data = tempLabels.map((label) => {
        const point = techTempPoints.find(
          (p) => p.label.replace("技術溫測實溫_", "") === label
        );
        if (!point) return null;
        const recordPointKey = utils.getActualTempRecordKey(point.id);
        return utils.getNestedValue(
          recordA,
          `actualTemps.${recordPointKey}.val${i}`,
          null
        );
      });
      tempDatasets.push({
        label: `紀錄 1 - ${lineNames[i - 1]}`,
        data,
        borderColor: `rgba(54, 162, 235, ${1 - (i - 1) * 0.15})`,
        fill: false,
        tension: 0.1,
      });
    }

    for (let i = 1; i <= 5; i++) {
      const data = tempLabels.map((label) => {
        const point = techTempPoints.find(
          (p) => p.label.replace("技術溫測實溫_", "") === label
        );
        if (!point) return null;
        const recordPointKey = utils.getActualTempRecordKey(point.id);
        return utils.getNestedValue(
          recordB,
          `actualTemps.${recordPointKey}.val${i}`,
          null
        );
      });
      tempDatasets.push({
        label: `紀錄 2 - ${lineNames[i - 1]}`,
        data,
        borderColor: `rgba(255, 159, 64, ${1 - (i - 1) * 0.15})`,
        borderDash: [5, 5],
        fill: false,
        tension: 0.1,
      });
    }

    return {
      airVolumeData:
        airVolumeLabels.length > 0
          ? {
              labels: airVolumeLabels,
              datasets: [
                {
                  label: `紀錄 1 風量 (${
                    recordA.rtoStatus === "yes" ? "RTO啟用" : "RTO停用"
                  })`,
                  data: airDataA,
                  backgroundColor: "rgba(54, 162, 235, 0.6)",
                },
                {
                  label: `紀錄 2 風量 (${
                    recordB.rtoStatus === "yes" ? "RTO啟用" : "RTO停用"
                  })`,
                  data: airDataB,
                  backgroundColor: "rgba(255, 159, 64, 0.6)",
                },
              ],
            }
          : null,
      tempData: { labels: tempLabels, datasets: tempDatasets },
      recordInfo: {
        recordA: `紀錄 1: ${
          recordA.dateTime ? recordA.dateTime.replace("T", " ") : "無時間"
        }`,
        recordB: `紀錄 2: ${
          recordB.dateTime ? recordB.dateTime.replace("T", " ") : "無時間"
        }`,
      },
    };
  };

  const _clearCompareChart = () => {
    _publishDataUpdate({ comparisonAnalysis: null });
    console.log("DataManager: 已清除比較圖表數據。");
  };

  const _addRecord = (newRecord) => {
    newRecord.isSynced = false;
    records.unshift(newRecord);
    _saveRecordsToLocalStorage();
    _publishDataUpdate();
    sandbox.publish("show-message", {
      text: "數據已成功新增！",
      type: "success",
    });
    sandbox.publish("action-completed-clear-form");
    console.log("DataManager: 新紀錄已新增。");
  };

  const _updateRecord = (updatedRecord) => {
    const recordIndex = records.findIndex((r) => r.id === updatedRecord.id);
    if (recordIndex !== -1) {
      updatedRecord.isSynced = false;
      records[recordIndex] = { ...records[recordIndex], ...updatedRecord };
      _saveRecordsToLocalStorage();
      _publishDataUpdate();
      sandbox.publish("show-message", {
        text: "數據已成功更新！",
        type: "success",
      });
      console.log(`DataManager: 紀錄 ID ${updatedRecord.id} 已更新。`);
    } else {
      sandbox.publish("show-message", {
        text: "要更新的紀錄不存在。",
        type: "error",
      });
      console.warn(
        `DataManager: 無法找到紀錄 ID ${updatedRecord.id} 進行更新。`
      );
    }
  };

  const _deleteRecord = (recordId) => {
    const globalIndex = records.findIndex((r) => r.id === recordId);
    if (globalIndex !== -1) {
      if (globalIndex === editingIndex) {
        editingIndex = -1;
        sandbox.publish("action-completed-clear-form");
      }
      records.splice(globalIndex, 1);
      _saveRecordsToLocalStorage();
      _publishDataUpdate();
      sandbox.publish("show-message", { text: "紀錄已刪除。", type: "info" });
      console.log(`DataManager: 紀錄 ID ${recordId} 已刪除。`);
    } else {
      sandbox.publish("show-message", {
        text: "要刪除的紀錄不存在。",
        type: "error",
      });
      console.warn(`DataManager: 無法找到紀錄 ID ${recordId} 進行刪除。`);
    }
  };

  const _loadRecordForEdit = (recordId) => {
    const globalIndex = records.findIndex((r) => r.id === recordId);
    if (globalIndex !== -1) {
      editingIndex = globalIndex;
      sandbox.publish("load-data-to-form-for-edit", records[globalIndex]);
      _publishDataUpdate();
      console.log(`DataManager: 載入紀錄 ID ${recordId} 進行編輯。`);
    } else {
      sandbox.publish("show-message", {
        text: "要編輯的紀錄不存在。",
        type: "error",
      });
      console.warn(`DataManager: 無法找到紀錄 ID ${recordId} 進行編輯。`);
    }
  };

  const _cancelEdit = () => {
    editingIndex = -1;
    _publishDataUpdate();
    sandbox.publish("action-completed-clear-form");
    console.log("DataManager: 編輯模式已取消。");
  };

  const _clearAllData = () => {
    records = [];
    editingIndex = -1;
    goldenBatchId = null;
    _saveRecordsToLocalStorage();
    _saveGoldenBatchIdToLocalStorage();
    _publishDataUpdate();
    sandbox.publish("show-message", { text: "所有數據已清除。", type: "info" });
    console.log("DataManager: 所有數據已清除。");
  };

  const _handleApplyFilters = (filters) => {
    filterState = filters;
    currentPage = 1;
    _publishDataUpdate();
    console.log("DataManager: 已應用篩選器，新的篩選狀態:", filterState);
  };

  const _handleSort = (key) => {
    if (sortState.key === key) {
      sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
    } else {
      sortState.key = key;
      sortState.direction = "desc";
    }
    currentPage = 1;
    _publishDataUpdate();
    console.log("DataManager: 已應用排序，新的排序狀態:", sortState);
  };

  const _replaceAllData = (newRecords) => {
    if (!Array.isArray(newRecords)) {
      sandbox.publish("show-message", {
        text: "載入失敗：檔案格式不正確。",
        type: "error",
      });
      console.error("DataManager: 嘗試取代數據但傳入的不是陣列。", newRecords);
      return;
    }

    newRecords.forEach((r) => {
      r.isSynced = true;
      if (!r.id) r.id = crypto.randomUUID();
      if (typeof r.dryerModel === "string") {
        r.dryerModel = r.dryerModel.toLowerCase();
      }
      if (typeof r.recordType === "string") {
        if (r.recordType === "評價TEAM用") {
          r.recordType = "evaluationTeam";
        } else if (r.recordType === "條件設定用") {
          r.recordType = "conditionSetting";
        } else {
          r.recordType = r.recordType.toLowerCase();
        }
      }
    });
    records = newRecords;
    _saveRecordsToLocalStorage();

    if (newRecords.length > 0) {
      const firstRecord = newRecords[0];
      sandbox.publish("request-view-switch", {
        recordType: firstRecord.recordType,
        dryerModel: firstRecord.dryerModel,
      });
      console.log(
        "DataManager: Replacing all data. Requesting UI view switch to:",
        firstRecord.recordType,
        firstRecord.dryerModel
      );
    } else {
      _publishDataUpdate();
      console.log(
        "DataManager: Replacing all data with an empty set. Refreshing UI."
      );
    }

    sandbox.publish("show-message", {
      text: `主資料庫載入成功！共 ${records.length} 筆紀錄。`,
      type: "success",
    });
  };

  return {
    init: () => {
      ui = sandbox.getModule("uiManager");
      if (!ui) {
        console.error(
          "DataManager: 缺少 uiManager 模組！Data Manager 無法正常運行。"
        );
        sandbox.publish("show-message", {
          text: "核心模組載入失敗，應用程式無法完全啟動。",
          type: "error",
        });
        return;
      }
      _loadDataFromLocalStorage();

      sandbox.subscribe("request-change-page", _changePage);
      sandbox.subscribe("request-set-golden-batch", _setGoldenBatch);
      sandbox.subscribe("request-change-dryer-model", () => {
        currentPage = 1;
        _publishDataUpdate();
      });
      sandbox.subscribe("request-save-data", _addRecord);
      sandbox.subscribe("request-update-data", _updateRecord);
      sandbox.subscribe("request-delete-data", _deleteRecord);
      sandbox.subscribe("request-load-edit-data", _loadRecordForEdit);
      sandbox.subscribe("request-clear-all-data", _clearAllData);
      sandbox.subscribe("request-cancel-edit", _cancelEdit);
      sandbox.subscribe("request-current-data-for-export", () => {
        sandbox.publish("request-export-main-csv", {
          records: _getFilteredAndSortedRecords(),
        });
      });
      sandbox.subscribe("request-record-type-change", () => {
        currentPage = 1;
        _publishDataUpdate();
      });
      sandbox.subscribe("request-apply-filters", _handleApplyFilters);
      sandbox.subscribe("request-sort-history", _handleSort);
      sandbox.subscribe("request-compare-records", _analyzeManualComparison);
      sandbox.subscribe("request-clear-compare-chart", _clearCompareChart);
      sandbox.subscribe("request-manual-data-update", _publishDataUpdate);
      sandbox.subscribe("request-view-raw-data", (recordId) => {
        const record = records.find((r) => r.id === recordId);
        if (record && record.rawChartData) {
          sandbox.publish("plot-raw-data-chart", record.rawChartData);
          sandbox.publish("show-message", {
            text: "原始數據圖已載入。",
            type: "info",
          });
        } else {
          sandbox.publish("show-message", {
            text: "此紀錄不包含有效的原始數據圖表資料。",
            type: "error",
          });
        }
      });
      sandbox.subscribe("request-replace-all-data", (data) =>
        _replaceAllData(data.records)
      );
      sandbox.subscribe(
        "request-merge-imported-records",
        _mergeImportedRecords
      );

      _publishDataUpdate();
      console.log("DataManager: 模組初始化完成。");
    },
  };
};

export default DataManager;
