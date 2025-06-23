// /js/modules/eventHandler.js

import * as utils from "./utils.js";

const EventHandler = (sandbox) => {
  let ui;
  let debouncedValidate;

  const safeAddEventListener = (element, event, handler) => {
    if (element) {
      element.addEventListener(event, handler);
    }
  };

  const _handleKeyboardShortcuts = (e) => {
    const dom = ui.getDomElements();
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      const isUpdateMode = dom.updateDataBtn.style.display !== "none";
      if (isUpdateMode) dom.updateDataBtn.click();
      else dom.saveDataBtn.click();
    } else if (e.key === "Escape") {
      const isUpdateMode = dom.updateDataBtn.style.display !== "none";
      if (isUpdateMode) {
        e.preventDefault();
        dom.cancelEditBtn.click();
      }
    }
  };

  const _attachEventListeners = () => {
    const dom = ui.getDomElements();
    document.addEventListener("keydown", _handleKeyboardShortcuts);
    debouncedValidate = utils.debounce((inputElement) => {
      sandbox.publish("request-validate-field", { element: inputElement });
    }, 500);

    // --- 資料庫管理流程事件綁定 ---
    safeAddEventListener(dom.loadMasterDbBtn, "click", () => {
      sandbox.publish("request-load-master-db-start");
    });
    safeAddEventListener(dom.createMasterDbBtn, "click", () => {
      sandbox.publish("request-create-master-db-start");
    });
    safeAddEventListener(dom.mergeToMasterBtn, "click", () => {
      sandbox.publish("request-merge-start");
    });
    safeAddEventListener(dom.exportForPowerBIBtn, "click", () => {
      sandbox.publish("request-export-all-for-powerbi");
    });
    safeAddEventListener(dom.exportDailyJsonBtn, "click", () => {
      sandbox.publish("request-export-daily-json");
    });

    // --- 原有功能的事件綁定 ---
    safeAddEventListener(dom.saveDataBtn, "click", () => {
      if (ui.validateForm()) {
        sandbox.publish("request-save-data", ui.getRecordDataFromForm());
      } else {
        sandbox.publish("show-message", {
          text: "請修正表單中的錯誤欄位。",
          type: "error",
        });
      }
    });
    safeAddEventListener(dom.setNowBtn, "click", (e) => {
      e.preventDefault();
      sandbox.publish("request-set-now");
    });
    safeAddEventListener(dom.updateDataBtn, "click", () => {
      if (ui.validateForm()) {
        sandbox.publish("request-update-data", ui.getRecordDataFromForm());
      }
    });
    safeAddEventListener(dom.cancelEditBtn, "click", () =>
      sandbox.publish("request-cancel-edit")
    );
    safeAddEventListener(dom.clearDataBtn, "click", () =>
      sandbox.publish("request-confirm", {
        message: "您確定要清除所有本地儲存的數據嗎？此操作無法復原！",
        onConfirm: () => sandbox.publish("request-clear-all-data"),
      })
    );
    safeAddEventListener(dom.exportCsvBtn, "click", () =>
      sandbox.publish("request-current-data-for-export")
    );

    // ★★★★★ 修正開始 ★★★★★
    // 新增「匯入 CSV」按鈕的事件監聽
    safeAddEventListener(dom.importCsvBtn, "click", () => {
      // 點擊「匯入 CSV」按鈕時，觸發隱藏的檔案選擇視窗
      if (dom.csvFileInput) {
        dom.csvFileInput.click();
      }
    });

    // 新增檔案選擇視窗的事件監聽
    safeAddEventListener(dom.csvFileInput, "change", (e) => {
      if (e.target.files.length > 0) {
        // 當使用者選擇檔案後，發布事件，請 CsvHandler 處理
        sandbox.publish("request-import-csv-records", {
          file: e.target.files[0],
        });
        // 清空檔案輸入，以便下次可以選擇同一個檔案
        e.target.value = "";
      }
    });
    // ★★★★★ 修正結束 ★★★★★

    safeAddEventListener(dom.exportChartBtn, "click", () =>
      sandbox.publish("request-export-main-chart")
    );
    safeAddEventListener(dom.exportRawChartButton, "click", () =>
      sandbox.publish("request-export-raw-chart")
    );
    safeAddEventListener(
      document.getElementById("exportAirVolumeChartBtn"),
      "click",
      () => sandbox.publish("request-export-air-volume-chart")
    );
    safeAddEventListener(
      document.getElementById("exportTempCompareChartBtn"),
      "click",
      () => sandbox.publish("request-export-temp-compare-chart")
    );
    safeAddEventListener(dom.rawCsvFileInput, "change", (e) => {
      if (e.target.files[0]) {
        sandbox.publish("request-import-raw-csv", { file: e.target.files[0] });
        e.target.value = "";
      }
    });
    if (dom.radioButtons) {
      dom.radioButtons.forEach((radio) => {
        safeAddEventListener(radio, "change", (e) =>
          sandbox.publish("request-toggle-sections", e.target.value)
        );
      });
    }
    safeAddEventListener(dom.dryerModelSelect, "change", (e) =>
      sandbox.publish("request-change-dryer-model", e.target.value)
    );
    safeAddEventListener(dom.applyFiltersBtn, "click", () =>
      sandbox.publish("request-apply-filters", ui.getFilters())
    );
    safeAddEventListener(dom.resetFiltersBtn, "click", () => ui.resetFilters());
    safeAddEventListener(dom.imageModalClose, "click", () =>
      dom.imageModalOverlay.classList.remove("visible")
    );
    safeAddEventListener(document.body, "click", (e) => {
      const button = e.target.closest("button");
      if (
        button &&
        button.classList.contains("icon-btn") &&
        button.dataset.imageSrc
      ) {
        sandbox.publish("show-image-modal", {
          src: button.dataset.imageSrc,
          caption: button.dataset.imageCaption || "實景圖",
        });
        return;
      }
      if (
        button &&
        button.classList.contains("pagination-button") &&
        button.dataset.page
      ) {
        const page = parseInt(button.dataset.page, 10);
        if (!isNaN(page)) sandbox.publish("request-change-page", page);
        return;
      }
      const tableRow = e.target.closest("tr");
      if (
        tableRow &&
        dom.dataTableBody &&
        tableRow.parentElement === dom.dataTableBody
      ) {
        if (e.target.classList.contains("compare-checkbox")) {
          sandbox.publish(
            "compare-selection-changed",
            e.target.dataset.recordId
          );
          return;
        }
        const targetButton = e.target.closest("button");
        const recordId = targetButton?.dataset.recordId;
        if (targetButton && recordId) {
          if (targetButton.classList.contains("golden-batch-btn"))
            sandbox.publish("request-set-golden-batch", recordId);
          else if (targetButton.classList.contains("edit-btn"))
            sandbox.publish("request-load-edit-data", recordId);
          else if (targetButton.classList.contains("delete-btn")) {
            sandbox.publish("request-confirm", {
              message: "確定要刪除這筆紀錄嗎？此操作無法恢復！",
              onConfirm: () => sandbox.publish("request-delete-data", recordId),
            });
          } else if (targetButton.classList.contains("view-raw-btn")) {
            sandbox.publish("request-view-raw-data", recordId);
            document
              .getElementById("rawTemperatureChartContainer")
              ?.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }
      }
      const tableHeader = e.target.closest("th[data-sort-key]");
      if (tableHeader)
        sandbox.publish("request-sort-history", tableHeader.dataset.sortKey);
      const header = e.target.closest(".accordion-toggle");
      if (header) sandbox.publish("request-toggle-accordion", header);
    });
    safeAddEventListener(dom.allInputFieldsContainer, "input", (e) => {
      const target = e.target;
      if (
        !target.id ||
        (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA")
      )
        return;
      debouncedValidate(target);
      if (
        target.id.startsWith("air_speed_") ||
        target.id.startsWith("air_temp_")
      ) {
        const measureId = target.id
          .replace("air_speed_", "")
          .replace("air_temp_", "");
        sandbox.publish("request-update-air-volume-row", measureId);
      } else if (
        target.id.startsWith("techTemp_") &&
        !target.id.endsWith("_diff")
      ) {
        const pointId = target.id.split("_")[1];
        sandbox.publish("request-update-tech-temp-row", pointId);
      }
      if (target.closest('.record-section[data-type="evaluationTeam"]')) {
        sandbox.publish("request-chart-preview", ui.getRecordDataFromForm());
      }
    });
  };

  return {
    init: () => {
      ui = sandbox.getModule("uiManager");
      if (!ui) {
        console.error("EventHandler: 缺少 uiManager 模組！應用程式無法啟動。");
        return;
      }
      console.log("EventHandler: 模組初始化完成");
      try {
        _attachEventListeners();
      } catch (error) {
        console.error("EventHandler: 綁定事件時發生未預期的錯誤:", error);
        sandbox.publish("show-message", {
          text: "應用程式事件處理器啟動失敗。",
          type: "error",
        });
      }
    },
  };
};

export default EventHandler;
