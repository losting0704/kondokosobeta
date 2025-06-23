// /js/modules/uiManager.js

// 說明：
// 這個模組是應用程式的「使用者介面控制器」。
// 它負責：
// 1. 抓取並快取所有需要操作的 DOM 元素。
// 2. 根據數據動態渲染表單輸入、風量網格、溫測網格、HMI 區塊和歷史數據表格。
// 3. 處理表單驗證和數據讀取。
// 4. 管理模態視窗、訊息提示、載入指示器。
// 5. 訂閱和發布與 UI 相關的事件。

import {
  generateFieldConfigurations, // 從 config.js 獲取所有欄位的配置
  getAirVolumeMeasurementsByModel, // 從 config.js 獲取特定機型的風量測量點
  techTempPoints, // 從 config.js 獲取技術溫測點
  hmiLayouts, // 從 config.js 獲取 HMI 佈局圖
  hmiFieldsByModel, // 從 config.js 獲取特定機型的 HMI 欄位
  damperLayoutsByModel, // <-- 在這裡加上新的 import
} from "./config.js";
import * as utils from "./utils.js"; // 引入工具函式

const UIManager = (sandbox) => {
  // 使用 'self' 來代表這個模組的上下文，避免 'this' 關鍵字的混淆問題
  const self = {
    dom: {}, // 用於儲存快取後的 DOM 元素的物件
    _currentDryerModel: "vt8", // 當前選定的乾燥機型號，預設為小寫 'vt8'
    _fieldConfigurations: [], // 當前機型和紀錄類型下的所有欄位配置
    selectedToCompareIds: [], // 用於圖表比較的已選紀錄 ID 陣列 (最多兩個)
    tempRawData: null, // 用於暫存從 CSV 匯入的原始數據，待儲存到紀錄中

    /**
     * 快取所有需要操作的 DOM 元素。
     * 這樣可以避免每次操作時都重新查詢 DOM，提高效能。
     */
    _cacheDom() {
      // 輔助函式，簡化 document.getElementById 的呼叫
      const D = (id) => document.getElementById(id);

      // 將所有常用 DOM 元素儲存到 self.dom 物件中
      self.dom = {
        setNowBtn: D("setNowBtn"), // 設定現在時間按鈕
        radioEvaluationTeam: D("radioEvaluationTeam"), // 評價 TEAM 用 radio
        radioConditionSetting: D("radioConditionSetting"), // 條件設定用 radio
        radioButtons: document.querySelectorAll('input[name="recordType"]'), // 紀錄類型 radio 群組
        dateTimeInput: D("dateTime"), // 日期時間輸入框
        remarkInput: D("remark"), // 備註輸入框
        dryerModelSelect: D("dryerModelSelect"), // 乾燥機型號選擇下拉選單
        airAndExternalGrid: D("evaluationTeam_airAndExternal_grid"), // 機外顯示區塊的網格容器
        airVolumeGrid: D("airVolumeGrid"), // 風量量測區塊的網格容器
        techTempGrid: D("techTempGrid"), // 技術溫測實溫區塊的網格容器
        damperOpeningGrid: D("damperOpeningGrid"), // 給排氣 Damper 開度區塊的網格容器
        saveDataBtn: D("saveDataBtn"), // 儲存數據按鈕
        updateDataBtn: D("updateDataBtn"), // 更新數據按鈕
        cancelEditBtn: D("cancelEditBtn"), // 取消編輯按鈕
        clearDataBtn: D("clearDataBtn"), // 清除所有數據按鈕
        dataTableBody: D("dataTableBody"), // 歷史數據表格的 tbody
        messageBox: D("messageBox"), // 訊息提示框
        confirmModalOverlay: D("confirmModalOverlay"), // 確認彈窗的遮罩
        confirmModalMessage: D("confirmModalMessage"), // 確認彈窗的訊息文字
        confirmYesBtn: D("confirmYesBtn"), // 確認彈窗的「是」按鈕
        confirmNoBtn: D("confirmNoBtn"), // 確認彈窗的「否」按鈕
        dynamicTableHeadersRow: D("dynamicTableHeaders"), // 動態生成表格頭的行
        importCsvBtn: D("importCsvBtn"), // 匯入 CSV 按鈕
        csvFileInput: D("csvFileInput"), // 隱藏的 CSV 檔案輸入框
        exportCsvBtn: D("exportCsvBtn"), // 匯出 CSV 按鈕
        exportChartBtn: D("exportChartBtn"), // 匯出技術溫測圖按鈕
        rawCsvFileInput: D("rawCsvFileInput"), // 匯入原始溫測數據 CSV 檔案輸入框
        exportRawChartButton: D("exportRawChartButton"), // 匯出原始溫測圖按鈕
        allInputFieldsContainer: document.querySelector(".container"), // 包含所有輸入欄位的最外層容器
        emptyStateMessage: D("emptyStateMessage"), // 表格無數據時的提示訊息
        imageModalOverlay: D("imageModalOverlay"), // 圖片燈箱的遮罩
        imageModalClose: document.querySelector(".image-modal-close"), // 圖片燈箱的關閉按鈕
        modalImage: D("modalImage"), // 圖片燈箱中的圖片
        modalCaption: D("modalCaption"), // 圖片燈箱的圖片說明
        filterStartDate: D("filterStartDate"), // 篩選器：開始日期
        filterEndDate: D("filterEndDate"), // 篩選器：結束日期
        filterFieldSelect: D("filterFieldSelect"), // 篩選器：數值欄位選擇下拉選單
        filterValueMin: D("filterValueMin"), // 篩選器：數值最小值
        filterValueMax: D("filterValueMax"), // 篩選器：數值最大值
        filterRtoStatus: D("filterRtoStatus"), // 篩選器：RTO 狀態
        filterHeatingStatus: D("filterHeatingStatus"), // 篩選器：升溫啟用狀態 (新增)
        filterRemarkKeyword: D("filterRemarkKeyword"), // 篩選器：備註關鍵字
        applyFiltersBtn: D("applyFiltersBtn"), // 篩選器：套用篩選按鈕
        resetFiltersBtn: D("resetFiltersBtn"), // 篩選器：重設篩選按鈕
        hmiContainer: D("hmi-sections-container"), // HMI 區塊的容器
        viewDamperLayoutBtn: D("viewDamperLayoutBtn"), // <-- 新增這一行
        loadingOverlay: D("loadingOverlay"), // 載入遮罩
        paginationContainer: D("paginationContainer"), // 分頁按鈕容器
        loadMasterDbBtn: D("loadMasterDbBtn"), // 載入主資料庫按鈕
        createMasterDbBtn: D("createMasterDbBtn"), // 從歷史 CSV 建立主資料庫按鈕
        mergeToMasterBtn: D("mergeToMasterBtn"), // 合併資料至主資料庫按鈕
        exportForPowerBIBtn: D("exportForPowerBIBtn"), // 匯出 Power BI 專用 CSV 按鈕
        exportDailyJsonBtn: D("exportDailyJsonBtn"), // 匯出本日新紀錄 (JSON) 按鈕
        historyCsvInput: D("historyCsvInput"), // 歷史 CSV 輸入 (用於建立主資料庫)
        masterJsonInput: D("masterJsonInput"), // 主資料庫 JSON 輸入
        dailyJsonInput: D("dailyJsonInput"), // 每日 JSON 輸入
      };
    },

    /**
     * 根據當前選擇的紀錄類型，填充篩選數值欄位下拉選單。
     */
    _populateFilterSelect() {
      const currentType = self.getCurrentRecordType(); // 取得當前紀錄類型 (評價TEAM用 或 條件設定用)
      self._fieldConfigurations = generateFieldConfigurations(
        self._currentDryerModel // 重新生成當前機型下的所有欄位配置
      );
      // 過濾出適用於當前紀錄類型、數值型或計算型、且會在表格中顯示的欄位
      const numericFields = self._fieldConfigurations.filter(
        (f) =>
          f.recordTypes.includes(currentType) &&
          (f.elemType === "number" || f.isCalculated) &&
          f.inTable
      );

      // 清空舊的選項，並新增預設選項
      self.dom.filterFieldSelect.innerHTML =
        '<option value="">-- 請選擇欄位 --</option>';
      // 為每個符合條件的欄位添加選項到篩選下拉選單
      numericFields.forEach((field) => {
        const option = new Option(
          field.csvHeader || field.label, // 選項顯示文字 (優先使用 csvHeader)
          field.dataKey // 選項值 (對應到數據中的路徑)
        );
        self.dom.filterFieldSelect.add(option);
      });
    },

    /**
     * 渲染分頁按鈕。
     * @param {object} pagination - 包含 currentPage (當前頁碼) 和 totalPages (總頁數) 的物件。
     */
    _renderPagination({ currentPage, totalPages }) {
      if (!self.dom.paginationContainer) return; // 如果分頁容器不存在則退出
      self.dom.paginationContainer.innerHTML = ""; // 清空現有分頁按鈕
      if (totalPages <= 1) return; // 如果總頁數少於等於 1 則不顯示分頁

      let paginationHtml = "";
      // 生成「上一頁」按鈕
      paginationHtml += `<button class="pagination-button" data-page="${
        currentPage - 1
      }" ${currentPage === 1 ? "disabled" : ""}>&laquo; 上一頁</button>`;

      const pageRange = 2; // 當前頁碼前後顯示的頁數範圍
      let startPage = Math.max(1, currentPage - pageRange); // 計算起始頁碼
      let endPage = Math.min(totalPages, currentPage + pageRange); // 計算結束頁碼

      // 處理第一頁和省略號
      if (currentPage - pageRange > 1) {
        paginationHtml += `<button class="pagination-button" data-page="1">1</button>`;
        if (currentPage - pageRange > 2) {
          paginationHtml += `<span class="pagination-ellipsis">...</span>`;
        }
      }

      // 生成頁碼按鈕
      for (let i = startPage; i <= endPage; i++) {
        paginationHtml += `<button class="pagination-button ${
          i === currentPage ? "active" : ""
        }" data-page="${i}">${i}</button>`;
      }

      // 處理最後一頁和省略號
      if (currentPage + pageRange < totalPages) {
        if (currentPage + pageRange < totalPages - 1) {
          paginationHtml += `<span class="pagination-ellipsis">...</span>`;
        }
        paginationHtml += `<button class="pagination-button" data-page="${totalPages}">${totalPages}</button>`;
      }

      // 生成「下一頁」按鈕
      paginationHtml += `<button class="pagination-button" data-page="${
        currentPage + 1
      }" ${
        currentPage === totalPages ? "disabled" : ""
      }>下一頁 &raquo;</button>`;
      self.dom.paginationContainer.innerHTML = paginationHtml; // 將生成的 HTML 插入到容器中
    },

    /**
     * 渲染歷史數據表格。
     * @param {object} data - 包含 records (當前頁數據)、editingIndex (正在編輯的索引)、
     * sortState (排序狀態)、goldenBatchId (黃金樣板 ID)、pagination (分頁信息) 的物件。
     */
    _renderTable({
      records,
      editingIndex,
      sortState,
      goldenBatchId,
      pagination,
    }) {
      try {
        const currentRecordType = self.getCurrentRecordType(); // 取得當前紀錄類型
        self._fieldConfigurations = generateFieldConfigurations(
          self._currentDryerModel // 根據當前機型重新生成欄位配置
        );
        // 過濾出適用於當前紀錄類型且需要在表格中顯示的欄位配置
        const tableHeaderConfigs = self._fieldConfigurations.filter(
          (f) => f.inTable && f.recordTypes.includes(currentRecordType)
        );

        // 定義固定欄位的寬度，用於 CSS `left` 定位
        const stickyColumnWidths = [50, 70, 90, 100, 180];
        let headerHtml = `<th class="sticky-col" style="left: 0; min-width: ${stickyColumnWidths[0]}px;">比較</th>`;
        let stickyOffset = stickyColumnWidths[0]; // 初始偏移量為第一個固定欄位的寬度

        // 生成動態表格頭
        tableHeaderConfigs.forEach((f, index) => {
          const isSortable = f.dataKey && f.id !== "recordTypeDisplay"; // 判斷是否可排序
          const sortKey = isSortable ? `data-sort-key="${f.dataKey}"` : ""; // 排序鍵屬性
          const sortClass = isSortable ? "sortable" : ""; // 排序 CSS 類別
          let sortIndicator = "";

          // 如果當前欄位是排序依據，顯示排序指示器
          if (isSortable && sortState && sortState.key === f.dataKey) {
            sortIndicator = sortState.direction === "asc" ? " ▲" : " ▼";
          }
          const thContent = `${f.csvHeader || f.label}${sortIndicator}`; // 表頭文字內容

          // 判斷是否為固定欄位 (最多前 4 個額外欄位，加上比較欄位共 5 個)
          if (index < 4 && index < stickyColumnWidths.length - 1) {
            headerHtml += `<th class="sticky-col ${sortClass}" ${sortKey} style="left: ${stickyOffset}px; min-width: ${
              stickyColumnWidths[index + 1]
            }px;">${thContent}</th>`;
            stickyOffset += stickyColumnWidths[index + 1]; // 更新下一個固定欄位的偏移量
          } else {
            headerHtml += `<th class="${sortClass}" ${sortKey}>${thContent}</th>`;
          }
        });
        // 插入完整的表格頭 HTML (包含操作欄)
        self.dom.dynamicTableHeadersRow.innerHTML =
          headerHtml + "<th>操作</th>";

        self.dom.dataTableBody.innerHTML = ""; // 清空表格內容
        const hasRecords = records && records.length > 0; // 檢查是否有數據
        self.dom.emptyStateMessage.style.display = hasRecords
          ? "none"
          : "block"; // 顯示或隱藏無數據訊息

        if (hasRecords) {
          // 遍歷每條紀錄並生成表格行
          records.forEach((record, index) => {
            const row = self.dom.dataTableBody.insertRow(); // 插入新行
            const recordId = record.id; // 紀錄 ID
            row.dataset.index = index; // 設定行索引
            row.dataset.id = recordId; // 設定行 ID

            // 根據紀錄狀態添加 CSS 類別
            if (recordId === goldenBatchId)
              row.classList.add("golden-batch-row"); // 黃金樣板行
            if (index === editingIndex) row.classList.add("row-editing"); // 正在編輯的行
            if (self.selectedToCompareIds.includes(recordId))
              row.classList.add("compare-selected-row"); // 正在比較的行

            // 生成「比較」核取方塊的儲存格
            const compareCell = row.insertCell();
            compareCell.className = "sticky-col";
            compareCell.style.left = "0px";
            compareCell.innerHTML = `<input type="checkbox" class="compare-checkbox" data-record-id="${recordId}" ${
              self.selectedToCompareIds.includes(recordId) ? "checked" : ""
            }>`;

            let cellOffset = stickyColumnWidths[0]; // 數據儲存格的初始偏移量
            // 遍歷每個欄位配置，生成數據儲存格
            tableHeaderConfigs.forEach((fieldConfig, colIndex) => {
              const td = row.insertCell(); // 插入新儲存格
              // 如果是固定欄位，設定 CSS 類別和位置
              if (colIndex < 4 && colIndex < stickyColumnWidths.length - 1) {
                td.classList.add("sticky-col");
                td.style.left = `${cellOffset}px`;
                td.style.minWidth = `${stickyColumnWidths[colIndex + 1]}px`;
                cellOffset += stickyColumnWidths[colIndex + 1]; // 更新下一個固定欄位的偏移量
              }
              // 從紀錄中安全地取得欄位值
              let valueToDisplay = utils.getNestedValue(
                record,
                fieldConfig.dataKey,
                ""
              );

              // 特殊處理顯示文字 (例如將內部 'evaluationTeam' 轉換為 '評價TEAM用')
              if (fieldConfig.dataKey === "recordType") {
                valueToDisplay =
                  record.recordType === "evaluationTeam"
                    ? "評價TEAM用"
                    : "條件設定用";
              } else if (fieldConfig.dataKey === "rtoStatus") {
                const rtoValue = utils.getNestedValue(record, "rtoStatus");
                valueToDisplay =
                  rtoValue === "yes" ? "有" : rtoValue === "no" ? "無" : "";
              } else if (fieldConfig.dataKey === "heatingStatus") {
                // ★★★ 新增：處理升溫啟用狀態的顯示 ★★★
                const heatingValue = utils.getNestedValue(
                  record,
                  "heatingStatus"
                );
                valueToDisplay =
                  heatingValue === "yes"
                    ? "有"
                    : heatingValue === "no"
                    ? "無"
                    : "";
              } else if (fieldConfig.dataKey === "dryerModel") {
                valueToDisplay = record.dryerModel
                  ? record.dryerModel.toUpperCase()
                  : "";
              }

              td.textContent = valueToDisplay; // 設定儲存格文字內容
            });

            // 生成操作按鈕儲存格
            const actionsTd = row.insertCell();
            actionsTd.className = "actions";
            // 判斷是否有原始數據圖表可供查看
            const hasRawData =
              record.rawChartData &&
              record.rawChartData.data &&
              record.rawChartData.data.length > 0;
            // 根據是否有原始數據決定是否顯示「查看原始數據」按鈕
            const viewRawBtnHtml = hasRawData
              ? `<button class="button button-danger view-raw-btn" title="查看此紀錄的原始匯入數據" data-record-id="${recordId}"><span>查看原始數據</span></button>`
              : "";
            actionsTd.innerHTML = `
              <button class="button button-icon golden-batch-btn" title="設為黃金樣板" data-record-id="${recordId}">⭐</button>
              ${viewRawBtnHtml}
              <button class="button button-edit edit-btn" title="編輯" data-record-id="${recordId}"><span>編輯</span></button>
              <button class="button button-danger delete-btn" title="刪除" data-record-id="${recordId}"><span>刪除</span></button>
            `;
          });
        }
        if (pagination) {
          self._renderPagination(pagination); // 渲染分頁按鈕
        }
      } catch (error) {
        console.error("UIManager: _renderTable 渲染時發生嚴重錯誤:", error);
      }
    },

    /**
     * 處理比較功能中的紀錄選擇。
     * @param {string} recordId - 被選擇或取消選擇的紀錄 ID。
     */
    _handleCompareSelection(recordId) {
      const index = self.selectedToCompareIds.indexOf(recordId);
      if (index > -1) {
        // 如果已存在，則從選取陣列中移除
        self.selectedToCompareIds.splice(index, 1);
      } else {
        // 如果選取超過兩個，移除最舊的一個，然後再添加新的
        if (self.selectedToCompareIds.length >= 2) {
          self.selectedToCompareIds.shift();
        }
        self.selectedToCompareIds.push(recordId);
      }
      // 發布事件通知數據管理器更新 UI (例如，更新表格行的選取狀態)
      sandbox.publish("request-manual-data-update");
      // 如果選擇了兩條紀錄，則請求進行比較分析；否則清除比較圖表
      if (self.selectedToCompareIds.length === 2) {
        sandbox.publish("request-compare-records", self.selectedToCompareIds);
      } else {
        sandbox.publish("request-clear-compare-chart");
      }
    },

    /**
     * 將日期時間輸入框設定為當前日期時間。
     */
    _setDateTimeToNow() {
      const now = new Date();
      // 考慮時區偏移，確保獲取本地時間
      const timezoneOffset = now.getTimezoneOffset() * 60000;
      const localTime = new Date(now.getTime() - timezoneOffset);
      // 格式化為 "YYYY-MM-DDTHH:mm" 格式，符合 datetime-local 輸入框的要求
      const formattedDateTime = localTime.toISOString().slice(0, 16);
      self.dom.dateTimeInput.value = formattedDateTime;
    },

    /**
     * 更新單個風量測量行的風量計算結果。
     * @param {string} measureId - 風量測量點的 ID。
     */
    _updateAirVolumeRow(measureId) {
      // 根據當前機型和測量點 ID 找到對應的測量配置
      const measure = getAirVolumeMeasurementsByModel(
        self._currentDryerModel
      ).find((m) => m.id === measureId);
      if (!measure) return; // 如果找不到配置則退出

      // 獲取風速、溫度輸入框和風量輸出顯示元素
      const speedInput = document.getElementById(`air_speed_${measureId}`);
      const tempInput = document.getElementById(`air_temp_${measureId}`);
      const volumeOutput = document.getElementById(`air_volume_${measureId}`);

      // 只有在測量點狀態正常且所有元素都存在時才進行計算和更新
      if (
        measure.status === "normal" &&
        speedInput &&
        tempInput &&
        volumeOutput
      ) {
        // 使用工具函式計算風量
        const volume = utils.calculateAirVolume(
          tempInput.value,
          speedInput.value,
          measure.area
        );
        // 更新風量顯示，保留一位小數，如果無效則顯示 "0.0"
        volumeOutput.textContent = isNaN(volume) ? "0.0" : volume.toFixed(1);
      }
    },

    /**
     * 更新單個技術溫測行的溫差計算結果。
     * @param {string} pointId - 技術溫測點的 ID。
     */
    _updateTechTempRow(pointId) {
      // 獲取該溫測點所有 5 個輸入框的元素
      const inputs = Array.from({ length: 5 }, (_, i) =>
        document.getElementById(`techTemp_${pointId}_${i + 1}`)
      );
      // 獲取溫差顯示輸入框元素
      const diffOutput = document.getElementById(`techTemp_${pointId}_diff`);

      if (inputs.every(Boolean) && diffOutput) {
        // 從輸入框中提取有效數值
        const validValues = inputs
          .map((input) => parseFloat(input.value))
          .filter((val) => !isNaN(val));

        if (validValues.length > 0) {
          // 計算最大值和最小值之間的差值，並更新溫差顯示，保留兩位小數
          diffOutput.value = (
            Math.max(...validValues) - Math.min(...validValues)
          ).toFixed(2);
        } else {
          // 如果沒有有效數值，溫差顯示為 "0.00"
          diffOutput.value = "0.00";
        }
      }
    },

    /**
     * 根據當前乾燥機型號，渲染「機外顯示與風量設定」區塊的輸入欄位。
     * @param {string} dryerModel - 當前選定的乾燥機型號。
     */
    _renderAirAndExternalInputs(dryerModel) {
      if (!self.dom.airAndExternalGrid) return; // 如果容器不存在則退出
      self.dom.airAndExternalGrid.innerHTML = ""; // 清空現有內容

      // 重新生成當前機型下的所有欄位配置
      self._fieldConfigurations = generateFieldConfigurations(dryerModel);
      // 過濾出屬於 "airExternal" 群組且適用於 "evaluationTeam" 紀錄類型的欄位，並按順序排序
      const airAndExternalFields = self._fieldConfigurations
        .filter(
          (f) =>
            f.group === "airExternal" &&
            f.recordTypes.includes("evaluationTeam")
        )
        .sort((a, b) => a.order - b.order);

      // 為每個欄位配置生成 HTML 輸入框
      airAndExternalFields.forEach((fieldConfig) => {
        const formGroup = document.createElement("div");
        formGroup.className = "form-group";
        if (fieldConfig.elemType === "number") {
          // 如果是數值型輸入框，生成對應的 label 和 input
          formGroup.innerHTML = `
            <label for="${fieldConfig.id}">${fieldConfig.label}</label>
            <input type="number" id="${
              fieldConfig.id
            }" class="styled-input" step="0.1"
              placeholder="${fieldConfig.label // 使用 label 去掉 HTML 和前綴作為 placeholder
                .replace(/<small>.*<\/small>/, "")
                .replace(/風量設定&机外顯示_/, "")
                .trim()}"
              data-field-name="${fieldConfig.label}"
            />
            <span class="error-message" id="error_${fieldConfig.id}"></span>`;
        }
        self.dom.airAndExternalGrid.appendChild(formGroup); // 將生成的元素添加到容器中
      });
    },

    /**
     * 根據當前乾燥機型號，渲染「風量量測」區塊的網格。
     * @param {string} dryerModel - 當前選定的乾燥機型號。
     */
    _renderAirVolumeGrid(dryerModel) {
      // 獲取當前機型所有風量測量點的配置
      const measurements = getAirVolumeMeasurementsByModel(dryerModel);
      // 插入網格的標頭行
      self.dom.airVolumeGrid.innerHTML = `<div class="grid-header-row"><span>測量位置</span><span>風管(m)</span><span>面積(㎡)</span><span>風速(m/s)</span><span>溫度(℃)</span><span>風量(Nm³/分)</span></div>`;
      // 為每個測量點生成網格行
      measurements.forEach((measure) => {
        const row = document.createElement("div");
        row.className = "air-measurement-row";
        if (measure.status === "normal") {
          // 如果測量點狀態正常，顯示可輸入風速和溫度，並計算風量
          row.innerHTML = `<div class="location-cell"><span>${
            measure.label
          }</span><button class="icon-btn" title="${
            measure.imageUrl ? "查看實景圖" : "無實景圖片"
          }" data-image-src="${measure.imageUrl || ""}" data-image-caption="${
            measure.label
          }" ${
            !measure.imageUrl ? "disabled" : ""
          }><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg></button></div><span class="fixed-value">${
            measure.duct
          }</span><span class="calculated-area">${measure.area.toFixed(
            3
          )}</span><div class="input-with-error"><input type="number" id="air_speed_${
            measure.id
          }" class="styled-input" step="0.01" placeholder="0.00"></div><div class="input-with-error"><input type="number" id="air_temp_${
            measure.id
          }" class="styled-input" step="0.1" placeholder="0.0"></div><span class="calculated-output" id="air_volume_${
            measure.id
          }">0.0</span>`;
        } else {
          // 如果測量點狀態異常 (危險或沒測量點)，顯示狀態文字並禁用輸入
          const statusText =
            measure.status === "dangerous" ? "測定危険" : "沒量測點";
          row.innerHTML = `<div class="location-cell"><span>${measure.label}</span></div><span class="fixed-value">${measure.duct}</span><span class="calculated-area">N/A</span><div class="input-with-error"><input type="text" value="${statusText}" class="styled-input status-text" disabled></div><div class="input-with-error"><input type="text" value="N/A" class="styled-input status-text" disabled></div><span class="calculated-output" id="air_volume_${measure.id}">0.0</span>`;
        }
        self.dom.airVolumeGrid.appendChild(row); // 將生成的元素添加到容器中
      });
    },

    /**
     * 生成「技術溫測實溫」區塊的輸入欄位網格。
     */
    _generateTechTempInputs() {
      // 插入網格的標頭行
      self.dom.techTempGrid.innerHTML = `<div class="record-label">紀錄-每分</div><div class="grid-header">1(右)</div><div class="grid-header">2</div><div class="grid-header">3(中)</div><div class="grid-header">4</div><div class="grid-header">5(左)</div><div class="grid-header">溫差</div>`;
      // 遍歷每個技術溫測點
      techTempPoints.forEach((point) => {
        // 創建行標籤
        const labelSpan = document.createElement("span");
        labelSpan.className = "grid-row-label";
        labelSpan.textContent = point.label.replace("技術溫測實溫_", "");
        self.dom.techTempGrid.appendChild(labelSpan); // 添加到網格中

        // 為每個溫測點生成 5 個輸入框 (val1 到 val5)
        for (let i = 1; i <= 5; i++) {
          const inputWrapper = document.createElement("div");
          inputWrapper.className = "input-with-error";
          const fieldId = `techTemp_${point.id}_${i}`;
          inputWrapper.innerHTML = `<input type="number" id="${fieldId}" class="styled-input" step="0.1" placeholder="0.0" data-field-name="技術溫測實溫 ${point.id}.${i}"><span class="error-message" id="error_${fieldId}"></span>`;
          self.dom.techTempGrid.appendChild(inputWrapper); // 添加到網格中
        }
        // 生成溫差顯示框
        const diffInputWrapper = document.createElement("div");
        diffInputWrapper.className = "input-with-error";
        diffInputWrapper.innerHTML = `<input type="text" id="techTemp_${point.id}_diff" class="styled-input" value="0.00" disabled>`;
        self.dom.techTempGrid.appendChild(diffInputWrapper); // 添加到網格中
      });
    },

    /**
     * 生成「給排氣 Damper 開度」區塊的輸入欄位。
     */
    _generateDamperOpeningInputs() {
      self.dom.damperOpeningGrid.innerHTML = ""; // 清空現有內容

      // 重新生成當前機型下的所有欄位配置
      self._fieldConfigurations = generateFieldConfigurations(
        self._currentDryerModel
      );
      // 過濾出屬於 "damperOpening" 群組的欄位
      const damperFields = self._fieldConfigurations.filter(
        (f) => f.group === "damperOpening"
      );

      // 為每個 Damper 欄位生成輸入框
      damperFields.forEach((fieldConfig) => {
        const formGroup = document.createElement("div");
        formGroup.className = "form-group";
        formGroup.innerHTML = `<label for="${fieldConfig.id}">${
          fieldConfig.label
        }</label><input type="number" id="${
          fieldConfig.id
        }" class="styled-input" step="0.1" placeholder="${
          fieldConfig.label.split(" ")[1] || "" // 使用 label 的第二部分作為 placeholder
        }" data-field-name="${
          fieldConfig.label
        }"><span class="error-message" id="error_${fieldConfig.id}"></span>`;
        self.dom.damperOpeningGrid.appendChild(formGroup); // 添加到容器中
      });
    },

    /**
     * 根據當前乾燥機型號，渲染 HMI (人機介面) 區塊。
     * @param {string} dryerModel - 當前選定的乾燥機型號。
     */
    _renderHmiSections(dryerModel) {
      self.dom.hmiContainer.innerHTML = ""; // 清空現有內容

      const layouts = hmiLayouts[dryerModel] || {}; // 獲取機型對應的 HMI 佈局圖
      const fieldGroups = hmiFieldsByModel[dryerModel] || {}; // 獲取機型對應的 HMI 欄位組
      // 定義 HMI 區塊的標題
      const sectionTitles = {
        monitor1: "監控主畫面 - 1",
        monitor2: "監控主畫面 - 2",
        pid1: "PID參數設定 - 1",
        pid2: "PID參數設定 - 2",
      };

      // 遍歷每個 HMI 佈局區塊
      for (const sectionKey in layouts) {
        if (!layouts[sectionKey]) continue; // 如果沒有佈局圖則跳過

        const bgImage = layouts[sectionKey]; // 背景圖路徑
        const sectionWrapper = document.createElement("div");
        sectionWrapper.id = `conditionSetting_${sectionKey}_wrapper`;
        sectionWrapper.className = "record-section";
        sectionWrapper.dataset.type = "conditionSetting"; // 設定數據類型
        // 生成 HMI 區塊的 HTML 結構 (標題、手風琴內容、背景圖)
        let hmiHtml = `<h2 class="section-header accordion-toggle">${
          sectionTitles[sectionKey] || "HMI 區塊"
        }</h2><div class="accordion-content"><div class="hmi-layout-container"><img src="${bgImage}" alt="${
          sectionTitles[sectionKey]
        } HMI 佈局圖" class="hmi-background">`;

        const fields = fieldGroups[sectionKey] || []; // 獲取該區塊下的所有 HMI 欄位
        // 為每個 HMI 欄位生成帶有絕對定位的輸入框
        fields.forEach((field) => {
          const pos = field.position || {}; // 獲取定位信息
          // 生成 CSS style 字串，用於定位輸入框
          const styleString = `top: ${pos.top || "0%"}; left: ${
            pos.left || "0%"
          }; width: ${pos.width || "20%"}; height: ${pos.height || "15%"};`;
          hmiHtml += `<div class="hmi-input-field" style="${styleString}"><div class="form-group"><label for="${field.id}">${field.label}</label><input type="number" id="${field.id}" class="styled-input" step="0.1" data-field-name="${field.id}" /><span class="error-message" id="error_${field.id}"></span></div></div>`;
        });
        hmiHtml += `</div></div>`; // 結束 HMI 佈局容器和手風琴內容
        sectionWrapper.innerHTML = hmiHtml; // 將生成的 HTML 插入到區塊包裝器中
        self.dom.hmiContainer.appendChild(sectionWrapper); // 將區塊添加到 HMI 容器中
      }
    },

    /**
     * 根據當前選擇的紀錄類型 (評價TEAM用 或 條件設定用)，切換顯示相關的表單區塊。
     */
    _toggleSections() {
      const selectedType = self.getCurrentRecordType(); // 獲取當前選定的紀錄類型

      // 根據紀錄類型切換 body 的 CSS 類別，用於主題切換
      document.body.classList.toggle(
        "theme-condition-setting",
        selectedType === "conditionSetting"
      );

      // 遍歷所有帶有 data-type 屬性的區塊，根據其 data-type 顯示或隱藏
      document
        .querySelectorAll(".record-section[data-type]")
        .forEach((section) => {
          section.style.display =
            section.dataset.type === selectedType ? "block" : "none";
        });
      // 特殊處理 HMI 容器的顯示/隱藏
      if (self.dom.hmiContainer) {
        self.dom.hmiContainer.style.display =
          selectedType === "conditionSetting" ? "block" : "none";
      }
    },

    /**
     * 顯示應用程式訊息。
     * @param {object} data - 包含 text (訊息文字) 和 type (訊息類型，如 'info', 'success', 'error') 的物件。
     */
    _showMessage({ text, type = "info" }) {
      self.dom.messageBox.textContent = text; // 設定訊息文字
      self.dom.messageBox.className = `message-box visible ${type}`; // 設定 CSS 類別以顯示和樣式化
      // 3 秒後自動隱藏訊息框
      setTimeout(() => self.dom.messageBox.classList.remove("visible"), 3000);
    },

    /**
     * 顯示確認彈窗。
     * @param {object} options - 包含 message (訊息文字)、onConfirm (確認回呼函式)、onCancel (取消回呼函式) 的物件。
     */
    _showConfirmModal({ message, onConfirm, onCancel }) {
      self.dom.confirmModalMessage.textContent = message; // 設定確認訊息
      self.dom.confirmModalOverlay.classList.add("visible"); // 顯示彈窗遮罩

      // 定義「是」按鈕的事件處理函式
      const yesHandler = () => {
        self.dom.confirmModalOverlay.classList.remove("visible"); // 隱藏彈窗
        onConfirm(); // 執行確認回呼
        // 移除事件監聽器，避免重複觸發
        self.dom.confirmYesBtn.removeEventListener("click", yesHandler);
        self.dom.confirmNoBtn.removeEventListener("click", noHandler);
      };
      // 定義「否」按鈕的事件處理函式
      const noHandler = () => {
        self.dom.confirmModalOverlay.classList.remove("visible"); // 隱藏彈窗
        if (onCancel) onCancel(); // 如果有取消回呼，則執行
        // 移除事件監聽器，避免重複觸發
        self.dom.confirmYesBtn.removeEventListener("click", yesHandler);
        self.dom.confirmNoBtn.removeEventListener("click", noHandler);
      };
      // 為確認按鈕添加一次性事件監聽器
      self.dom.confirmYesBtn.addEventListener("click", yesHandler, {
        once: true,
      });
      self.dom.confirmNoBtn.addEventListener("click", noHandler, {
        once: true,
      });
    },

    /**
     * 顯示圖片燈箱。
     * @param {object} data - 包含 src (圖片來源) 和 caption (圖片說明) 的物件。
     */
    _showImageModal({ src, caption }) {
      self.dom.modalImage.src = src; // 設定圖片來源
      self.dom.modalCaption.textContent = caption; // 設定圖片說明
      self.dom.imageModalOverlay.classList.add("visible"); // 顯示圖片燈箱
    },

    /**
     * 驗證單個輸入欄位的值。
     * @param {HTMLElement} inputElement - 要驗證的輸入元素。
     * @returns {boolean} - 驗證結果，true 表示有效，false 表示無效。
     */
    _validateInput(inputElement) {
      // 重新生成當前機型下的所有欄位配置
      self._fieldConfigurations = generateFieldConfigurations(
        self._currentDryerModel
      );
      // 找到與當前輸入元素 ID 匹配的欄位配置
      const fieldConfig = self._fieldConfigurations.find(
        (f) => f.id === inputElement.id
      );
      // 獲取錯誤訊息顯示元素
      const errorElement = document.getElementById(`error_${inputElement.id}`);

      // 清除之前的錯誤狀態
      inputElement.classList.remove("invalid-input");
      if (errorElement) {
        errorElement.textContent = "";
        errorElement.classList.remove("show");
      }

      if (!fieldConfig) return true; // 如果沒有找到配置，則認為有效

      // 檢查是否為必填欄位且為空
      if (fieldConfig.required && inputElement.value.trim() === "") {
        inputElement.classList.add("invalid-input");
        if (errorElement) {
          errorElement.textContent = `${fieldConfig.label.replace(
            /<small>.*<\/small>/,
            ""
          )} 不能為空。`; // 顯示必填錯誤訊息
          errorElement.classList.add("show");
        }
        return false;
      }

      // 檢查百分比驗證規則 (0-100)
      if (
        fieldConfig.validation === "percentage" &&
        inputElement.value.trim() !== ""
      ) {
        const value = parseFloat(inputElement.value);
        if (isNaN(value) || value < 0 || value > 100) {
          inputElement.classList.add("invalid-input");
          if (errorElement) {
            errorElement.textContent = `請輸入 0 到 100 之間的數字。`; // 顯示百分比範圍錯誤訊息
            errorElement.classList.add("show");
          }
          return false;
        }
      }
      return true; // 驗證通過
    },

    /**
     * 切換手風琴 (Accordion) 區塊的展開/收合狀態。
     * @param {HTMLElement} header - 手風琴區塊的標頭元素。
     */
    _toggleAccordion(header) {
      header.classList.toggle("active"); // 切換 'active' 類別
      const content = header.nextElementSibling; // 獲取手風琴的內容區塊

      if (content && content.classList.contains("accordion-content")) {
        if (content.style.maxHeight) {
          // 如果內容已展開，則收合
          content.style.maxHeight = null;
          content.style.paddingTop = null;
          content.style.paddingBottom = null;
        } else {
          // 如果內容已收合，則展開
          content.style.maxHeight = content.scrollHeight + "px"; // 設定最大高度為其實際高度
          content.style.paddingTop = "20px"; // 添加內邊距
          content.style.paddingBottom = "20px"; // 添加內邊距
        }
      }
    },

    /**
     * 清空表單所有輸入欄位，並重置狀態。
     */
    _clearForm() {
      // 清空「機外顯示」區塊中的數值輸入和錯誤訊息
      document
        .querySelectorAll(
          '#evaluationTeam_airAndExternal_grid input[type="number"], #evaluationTeam_airAndExternal_grid .error-message'
        )
        .forEach((el) => {
          if (el.tagName === "INPUT") {
            el.value = "";
            el.classList.remove("invalid-input");
          } else {
            el.textContent = "";
            el.classList.remove("show");
          }
        });

      // 清空所有非禁用且不在「機外顯示」區塊內的數值輸入框和文字區
      document
        .querySelectorAll('input[type="number"], textarea')
        .forEach((el) => {
          if (
            !el.disabled &&
            !el.closest("#evaluationTeam_airAndExternal_grid")
          ) {
            el.value = "";
          }
        });

      // 清空所有錯誤訊息顯示元素
      document.querySelectorAll(".error-message").forEach((el) => {
        if (!el.closest("#evaluationTeam_airAndExternal_grid")) {
          el.textContent = "";
          el.classList.remove("show");
        }
      });
      // 移除所有無效輸入的 CSS 類別
      document
        .querySelectorAll(".invalid-input")
        .forEach((el) => el.classList.remove("invalid-input"));

      self._setDateTimeToNow(); // 設定日期時間為現在

      // 重置 RTO 啟用狀態為「無」
      const rtoNoRadio = document.getElementById("rtoNo");
      if (rtoNoRadio) rtoNoRadio.checked = true;

      // ★★★ 新增：重置升溫啟用狀態為「無」 ★★★
      const heatingNoRadio = document.getElementById("heatingNo");
      if (heatingNoRadio) heatingNoRadio.checked = true;

      // 切換按鈕顯示狀態 (顯示儲存按鈕，隱藏更新和取消按鈕)
      self.dom.updateDataBtn.style.display = "none";
      self.dom.cancelEditBtn.style.display = "none";
      self.dom.saveDataBtn.style.display = "inline-flex";
      self.tempRawData = null; // 清空暫存的原始數據
      sandbox.publish("form-cleared"); // 發布表單已清除事件
    },

    /**
     * 將數據載入到表單中，用於編輯或預覽。
     * @param {object} record - 要載入的紀錄物件。
     * @param {boolean} isForEdit - 是否為編輯模式 (影響按鈕顯示)。
     */
    _loadDataToForm(record, isForEdit = false) {
      self._clearForm(); // 先清空表單

      // 根據紀錄類型設定對應的 radio button
      if (record.recordType === "evaluationTeam") {
        self.dom.radioEvaluationTeam.checked = true;
      } else if (record.recordType === "conditionSetting") {
        self.dom.radioConditionSetting.checked = true;
      }

      // 根據紀錄中的機型設定下拉選單並更新內部變數
      if (record.dryerModel) {
        self.dom.dryerModelSelect.value = record.dryerModel.toLowerCase();
        self._currentDryerModel = record.dryerModel.toLowerCase();
      }

      // 重新渲染與機型相關的動態區塊
      self._renderAirAndExternalInputs(self._currentDryerModel);
      self._renderAirVolumeGrid(self._currentDryerModel);
      self._generateDamperOpeningInputs();
      self._renderHmiSections(self._currentDryerModel);

      // 重新生成當前機型下的所有欄位配置
      self._fieldConfigurations = generateFieldConfigurations(
        self._currentDryerModel
      );

      self._toggleSections(); // 切換顯示相關的區塊
      self._populateFilterSelect(); // 重新填充篩選器下拉選單

      // ★★★ 處理 RTO 和 Heating Status 的 Radio Button 狀態 ★★★
      const rtoStatusRadio = document.querySelector(
        `input[name="rtoStatus"][value="${record.rtoStatus}"]`
      );
      if (rtoStatusRadio) rtoStatusRadio.checked = true;

      const heatingStatusRadio = document.querySelector(
        `input[name="heatingStatus"][value="${record.heatingStatus}"]`
      );
      if (heatingStatusRadio) heatingStatusRadio.checked = true;
      // ★★★ 結束處理 Radio Button ★★★

      // 遍歷所有欄位配置，將紀錄中的數據填充到對應的輸入框中
      self._fieldConfigurations.forEach((field) => {
        // 確保欄位屬於當前紀錄類型且不是計算欄位，且不是已在上方明確處理的 radio 類型
        if (
          field.recordTypes.includes(record.recordType) &&
          !field.isCalculated &&
          field.elemType !== "radio" // 排除 radio 類型，因為已在上方處理
        ) {
          const valueToSet = utils.getNestedValue(record, field.dataKey, null); // 安全地獲取巢狀值
          const el = document.getElementById(field.id);
          if (el) {
            el.value = valueToSet ?? ""; // 設定輸入框的值，如果為 null/undefined 則設為空字串
          }
        }
      });

      // 更新技術溫測和風量計算欄位
      techTempPoints.forEach((p) => self._updateTechTempRow(p.id));
      getAirVolumeMeasurementsByModel(self._currentDryerModel).forEach((m) =>
        self._updateAirVolumeRow(m.id)
      );

      // 根據是否為編輯模式，切換按鈕顯示
      if (isForEdit) {
        self.dom.updateDataBtn.style.display = "inline-flex";
        self.dom.cancelEditBtn.style.display = "inline-flex";
        self.dom.saveDataBtn.style.display = "none";
      }
      // 如果紀錄包含原始數據圖表資料，則暫存並發布事件請求繪製
      if (record.rawChartData) {
        self.tempRawData = record.rawChartData;
        sandbox.publish("plot-raw-data-chart", record.rawChartData);
      }
      // 發布事件請求預覽主圖表 (技術溫測圖)
      sandbox.publish("request-chart-preview", record);
    },

    /**
     * 模組初始化函式。在應用程式啟動時由 Core 模組呼叫。
     */
    init() {
      console.log("UIManager: 模組初始化完成");
      self._cacheDom(); // 快取所有 DOM 元素

      // 根據預設順序填充乾燥機型號下拉選單
      const dryerModelOrder = ["vt1", "vt5", "vt6", "vt7", "vt8"];
      self.dom.dryerModelSelect.innerHTML = dryerModelOrder
        .map((m) => `<option value="${m}">${m.toUpperCase()}</option>`)
        .join("");

      // 設定預設機型為 vt8
      self.dom.dryerModelSelect.value = "vt8";
      self._currentDryerModel = "vt8";

      // 渲染初始的動態區塊內容
      self._renderAirAndExternalInputs(self._currentDryerModel);
      self._renderAirVolumeGrid(self._currentDryerModel);
      self._generateTechTempInputs();
      self._generateDamperOpeningInputs();
      self._renderHmiSections(self._currentDryerModel);

      self._populateFilterSelect(); // 填充篩選器下拉選單
      self._toggleSections(); // 根據預設紀錄類型切換區塊顯示
      self._setDateTimeToNow(); // 設定日期時間為現在
      self._subscribeToEvents(); // 訂閱應用程式事件
    },

    /**
     * 訂閱來自其他模組的事件。
     */
    _subscribeToEvents() {
      // 訂閱欄位驗證請求事件
      sandbox.subscribe("request-validate-field", (data) => {
        if (data && data.element) self._validateInput(data.element);
      });
      // 訂閱切換原始圖表匯出按鈕禁用狀態事件
      sandbox.subscribe("toggle-raw-chart-export-button", (data) => {
        if (self.dom.exportRawChartButton)
          self.dom.exportRawChartButton.disabled = data.disabled;
      });
      // 訂閱設定活動紀錄類型事件 (由數據管理器觸發，例如載入主資料庫後)
      sandbox.subscribe("request-set-active-record-type", (recordType) => {
        if (recordType === "evaluationTeam")
          self.dom.radioEvaluationTeam.checked = true;
        else if (recordType === "conditionSetting")
          self.dom.radioConditionSetting.checked = true;
        self._toggleSections(); // 切換區塊顯示
        self._populateFilterSelect(); // 重新填充篩選器
        setTimeout(() => sandbox.publish("request-record-type-change"), 0); // 延遲發布紀錄類型變更事件
      });
      // 訂閱數據更新事件 (從數據管理器接收，用於重新渲染表格)
      sandbox.subscribe("data-updated", (data) => self._renderTable(data));
      // 訂閱動作完成，清空表單事件
      sandbox.subscribe("action-completed-clear-form", () => self._clearForm());
      // 訂閱載入數據到表單事件 (用於預覽)
      sandbox.subscribe("load-data-to-form", (record) =>
        self._loadDataToForm(record, false)
      );
      // 訂閱載入數據到表單以供編輯事件
      sandbox.subscribe("load-data-to-form-for-edit", (record) =>
        self._loadDataToForm(record, true)
      );
      // 訂閱顯示訊息事件
      sandbox.subscribe("show-message", (data) => self._showMessage(data));
      // 訂閱請求確認彈窗事件
      sandbox.subscribe("request-confirm", (data) =>
        self._showConfirmModal(data)
      );
      // 訂閱顯示圖片燈箱事件
      sandbox.subscribe("show-image-modal", (data) =>
        self._showImageModal(data)
      );
      // 訂閱設定現在時間事件
      sandbox.subscribe("request-set-now", () => self._setDateTimeToNow());
      // 訂閱更新風量行事件 (當風速或溫度改變時)
      sandbox.subscribe("request-update-air-volume-row", (id) =>
        self._updateAirVolumeRow(id)
      );
      // 訂閱更新技術溫測行事件 (當溫測值改變時)
      sandbox.subscribe("request-update-tech-temp-row", (id) =>
        self._updateTechTempRow(id)
      );
      // 訂閱比較選擇變更事件 (核取方塊點擊時)
      sandbox.subscribe("compare-selection-changed", (id) =>
        self._handleCompareSelection(id)
      );
      // 訂閱原始 CSV 數據解析完成事件 (暫存數據用於後續儲存)
      sandbox.subscribe("raw-csv-data-parsed", (parsedResult) => {
        if (parsedResult && parsedResult.data && parsedResult.data.length > 0) {
          self.tempRawData = parsedResult;
          self._showMessage({
            text: "原始數據已載入，待儲存。",
            type: "info",
          });
        } else {
          self.tempRawData = null;
        }
      });
      // 訂閱請求切換區塊顯示事件 (例如，紀錄類型 radio 改變時)
      sandbox.subscribe("request-toggle-sections", () => {
        self._toggleSections(); // 切換區塊顯示
        self._populateFilterSelect(); // 重新填充篩選器
        sandbox.publish("request-record-type-change"); // 發布紀錄類型變更事件
      });
      // 訂閱請求切換視圖事件 (例如，載入主資料庫時可能觸發)
      sandbox.subscribe("request-view-switch", (data) => {
        console.log("UIManager: Received view switch request. Data:", data);

        // 根據請求的 recordType 設定 radio button
        if (data.recordType === "evaluationTeam") {
          self.dom.radioEvaluationTeam.checked = true;
        } else if (data.recordType === "conditionSetting") {
          self.dom.radioConditionSetting.checked = true;
        }

        // 根據請求的 dryerModel 設定下拉選單並更新內部變數
        const newDryerModel = data.dryerModel.toLowerCase();
        self.dom.dryerModelSelect.value = newDryerModel;
        self._currentDryerModel = newDryerModel;

        self._toggleSections(); // 切換區塊顯示
        self._populateFilterSelect(); // 重新填充篩選器

        // 發布機型變更和紀錄類型變更事件，讓數據管理器重新載入數據
        sandbox.publish("request-change-dryer-model", newDryerModel);
        sandbox.publish("request-record-type-change");

        console.log(
          "UIManager: UI switched to RecordType:",
          self.getCurrentRecordType(),
          "DryerModel:",
          self.getCurrentDryerModel()
        );
      });
      // 訂閱機型變更事件
      sandbox.subscribe("request-change-dryer-model", (model) => {
        const newModel = model.toLowerCase();
        self._currentDryerModel = newModel; // 更新當前機型
        // ▼▼▼ 在此處新增更新 Damper 圖片路徑的邏輯 ▼▼▼
        if (self.dom.viewDamperLayoutBtn) {
          // 從設定檔中找到對應機型的圖片路徑，如果找不到則使用預設值
          const imagePath =
            damperLayoutsByModel[newModel] || "./img/damper-layout.jpg";
          self.dom.viewDamperLayoutBtn.dataset.imageSrc = imagePath;
        }
        // ▲▲▲ 新增結束 ▲▲▲
        // 重新渲染所有與機型相關的動態 UI 元素
        self._renderAirAndExternalInputs(newModel);
        self._renderAirVolumeGrid(newModel);
        self._generateDamperOpeningInputs();
        self._renderHmiSections(newModel);
        self._populateFilterSelect(); // 重新填充篩選器
        self._clearForm(); // 清空表單
      });
      // 訂閱顯示載入指示器事件
      sandbox.subscribe("show-loader", () => {
        if (self.dom.loadingOverlay)
          self.dom.loadingOverlay.classList.add("visible");
      });
      // 訂閱隱藏載入指示器事件
      sandbox.subscribe("hide-loader", () => {
        if (self.dom.loadingOverlay)
          self.dom.loadingOverlay.classList.remove("visible");
      });
      // 訂閱請求切換手風琴事件
      sandbox.subscribe("request-toggle-accordion", (header) =>
        self._toggleAccordion(header)
      );
    },

    /**
     * 獲取當前選定的紀錄類型 (evaluationTeam 或 conditionSetting)。
     * @returns {string} - 當前選定的紀錄類型。
     */
    getCurrentRecordType() {
      const checkedRadio = document.querySelector(
        'input[name="recordType"]:checked'
      );
      return checkedRadio ? checkedRadio.value : "evaluationTeam"; // 預設為 'evaluationTeam'
    },

    /**
     * 獲取當前選定的乾燥機型號。
     * @returns {string} - 當前選定的乾燥機型號 (小寫)。
     */
    getCurrentDryerModel() {
      if (self.dom.dryerModelSelect && self.dom.dryerModelSelect.value) {
        return self.dom.dryerModelSelect.value.toLowerCase();
      }
      return self._currentDryerModel; // 如果 DOM 元素不可用，返回內部儲存的值
    },

    /**
     * 從表單中收集所有數據，組合成一個紀錄物件。
     * @returns {object} - 包含所有表單數據的紀錄物件。
     */
    getRecordDataFromForm() {
      // 初始化紀錄物件，包含基本資訊和巢狀數據結構
      const recordData = {
        id: crypto.randomUUID(), // 生成唯一 ID
        recordType: self.getCurrentRecordType(), // 紀錄類型
        dryerModel: self._currentDryerModel.toLowerCase(), // 機型
        // 從 radio button 獲取 RTO 和 Heating Status
        rtoStatus: document.querySelector('input[name="rtoStatus"]:checked')
          ?.value,
        heatingStatus: document.querySelector(
          'input[name="heatingStatus"]:checked'
        )?.value, // ★★★ 新增：獲取升溫啟用狀態 ★★★
        airVolumes: {}, // 風量數據
        actualTemps: {}, // 技術溫測實溫數據
        hmiData: {}, // HMI 數據
        damperOpeningData: {}, // Damper 開度數據
      };

      // 重新生成當前機型下的所有欄位配置
      self._fieldConfigurations = generateFieldConfigurations(
        self._currentDryerModel
      );

      // 遍歷所有欄位配置，從對應的輸入框中提取值並設定到 recordData 物件中
      self._fieldConfigurations.forEach((field) => {
        // 確保欄位屬於當前紀錄類型，不是計算欄位，且有 dataKey
        if (
          field.recordTypes.includes(recordData.recordType) &&
          !field.isCalculated &&
          field.dataKey
        ) {
          const el = document.getElementById(field.id);
          if (el) {
            let value;
            // 根據輸入框類型處理值 (數值型轉換為浮點數，其他直接取值)
            if (el.type === "number") {
              value = el.value === "" ? null : parseFloat(el.value);
            } else {
              value = el.value;
            }
            utils.setNestedValue(recordData, field.dataKey, value); // 安全地設定巢狀值
          }
        }
      });

      // 針對風量測量點，重新計算風量並儲存
      const airMeasurements = getAirVolumeMeasurementsByModel(
        self._currentDryerModel
      );
      airMeasurements.forEach((measure) => {
        if (measure.status === "normal") {
          const speed = utils.getNestedValue(
            recordData,
            `airVolumes.${measure.id}.speed`
          );
          const temp = utils.getNestedValue(
            recordData,
            `airVolumes.${measure.id}.temp`
          );
          const volume = utils.calculateAirVolume(temp, speed, measure.area); // 重新計算風量
          if (!recordData.airVolumes[measure.id])
            recordData.airVolumes[measure.id] = {};
          recordData.airVolumes[measure.id].volume = isNaN(volume)
            ? null
            : volume;
        }
      });

      // 針對技術溫測點，重新計算溫差並儲存
      techTempPoints.forEach((point) => {
        const recordPointKey = utils.getActualTempRecordKey(point.id);
        const tempValues = [];
        for (let i = 1; i <= 5; i++) {
          const val = utils.getNestedValue(
            recordData,
            `actualTemps.${recordPointKey}.val${i}`
          );
          if (val !== null) tempValues.push(val);
        }
        if (!recordData.actualTemps[recordPointKey])
          recordData.actualTemps[recordPointKey] = {};
        if (tempValues.length > 0) {
          const diff = Math.max(...tempValues) - Math.min(...tempValues);
          recordData.actualTemps[recordPointKey].diff = parseFloat(
            diff.toFixed(2)
          );
        } else {
          recordData.actualTemps[recordPointKey].diff = null;
        }
      });
      // 如果有暫存的原始圖表數據，則添加到紀錄物件中
      if (self.tempRawData) {
        recordData.rawChartData = self.tempRawData;
      }
      return recordData; // 返回組裝好的紀錄物件
    },

    /**
     * 驗證整個表單。
     * @returns {boolean} - 表單是否有效。
     */
    validateForm() {
      // 重新生成當前機型下的所有欄位配置
      self._fieldConfigurations = generateFieldConfigurations(
        self._currentDryerModel
      );
      let isValid = true; // 驗證結果標誌
      const currentType = self.getCurrentRecordType(); // 當前紀錄類型

      // 遍歷所有欄位配置，對每個可見且非禁用的輸入框進行驗證
      self._fieldConfigurations.forEach((field) => {
        if (field.recordTypes.includes(currentType)) {
          const el = document.getElementById(field.id);
          if (el && !el.disabled) {
            // 如果任何一個欄位驗證失敗，將 isValid 設為 false
            if (!self._validateInput(el)) isValid = false;
          }
        }
      });
      return isValid; // 返回總體驗證結果
    },

    /**
     * 獲取當前篩選器設定的值。
     * @returns {object} - 包含所有篩選器值的物件。
     */
    getFilters() {
      return {
        startDate: self.dom.filterStartDate.value, // 開始日期
        endDate: self.dom.filterEndDate.value, // 結束日期
        field: self.dom.filterFieldSelect.value, // 篩選數值欄位
        min: self.dom.filterValueMin.value, // 數值最小值
        max: self.dom.filterValueMax.value, // 數值最大值
        rtoStatus: self.dom.filterRtoStatus.value, // RTO 狀態
        heatingStatus: self.dom.filterHeatingStatus.value, // ★★★ 新增：獲取升溫啟用狀態篩選值 ★★★
        remark: self.dom.filterRemarkKeyword.value.trim(), // 備註關鍵字
      };
    },

    /**
     * 重設所有篩選器為預設值。
     */
    resetFilters() {
      // 清空所有篩選輸入框和選擇框的值
      self.dom.filterStartDate.value = "";
      self.dom.filterEndDate.value = "";
      self.dom.filterFieldSelect.value = "";
      self.dom.filterValueMin.value = "";
      self.dom.filterValueMax.value = "";
      self.dom.filterRtoStatus.value = "all";
      self.dom.filterHeatingStatus.value = "all"; // ★★★ 新增：重置升溫啟用狀態篩選值 ★★★
      self.dom.filterRemarkKeyword.value = "";
      // 發布事件請求應用篩選器，傳入一個空物件表示清除所有篩選
      sandbox.publish("request-apply-filters", {});
    },

    getDomElements: () => self.dom, // 提供外部訪問內部快取 DOM 元素的介面
    getCurrentFieldConfigurations: () => self._fieldConfigurations, // 提供外部訪問當前欄位配置的介面
  };

  return self; // 返回 UIManager 模組的公共介面
};

export default UIManager; // 匯出 UIManager 模組
