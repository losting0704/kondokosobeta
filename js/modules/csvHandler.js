// /js/modules/csvHandler.js

import { generateFieldConfigurations } from "./config.js";
import * as utils from "./utils.js";

const CsvHandler = (sandbox) => {
  let ui;

  // 建立一個包含所有機型欄位設定的主映射表
  const masterHeaderMap = new Map();
  const supportedModels = ["vt1", "vt5", "vt6", "vt7", "vt8"];
  supportedModels.forEach((model) => {
    const modelFieldConfigs = generateFieldConfigurations(model);
    masterHeaderMap.set(model, modelFieldConfigs);
  });

  const _triggerDownload = (content, filename, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /**
   * 解析 CSV 資料列，智慧相容新舊兩種標頭格式，並正確轉換狀態
   * @param {Array} rows - 從 PapaParse 解析出來的資料列
   * @returns {Array} 轉換後的標準紀錄物件陣列
   */
  const _parseCsvRowsToRecords = (rows) => {
    const importedRecords = [];
    for (const row of rows) {
      const recordTypeValue = row["類型"] || "";
      let recordType = "";
      if (recordTypeValue.includes("評價")) {
        recordType = "evaluationTeam";
      } else if (recordTypeValue.includes("條件設定")) {
        recordType = "conditionSetting";
      } else {
        recordType = recordTypeValue.toLowerCase();
      }

      const dryerModel = (row["機台型號"] || "vt8").toLowerCase();

      if (!recordType || !dryerModel || !supportedModels.includes(dryerModel)) {
        console.warn(`跳過一行，因類型或機型無效:`, row);
        continue;
      }

      const allConfigsForModel = masterHeaderMap.get(dryerModel);
      if (!allConfigsForModel) {
        console.warn(`跳過一行，因找不到機型 "${dryerModel}" 的設定。`);
        continue;
      }

      const recordData = {
        id: crypto.randomUUID(),
        recordType,
        dryerModel,
        isSynced: true,
        airVolumes: {},
        actualTemps: {},
        recorder1Data: {},
        recorder2Data: {},
        airExternalData: {},
        damperOpeningData: {},
        hmiData: {},
        rawChartData: null,
      };

      for (const headerFromFile in row) {
        const trimmedHeader = headerFromFile.trim();
        let value = row[headerFromFile];

        // ▼▼▼ 新增開始 ▼▼▼
        // 特別處理 RTO 和 升溫 狀態
        if (trimmedHeader === "RTO啟用狀態") {
          recordData.rtoStatus =
            value === "有" ? "yes" : value === "無" ? "no" : null;
          continue;
        }

        if (trimmedHeader === "升溫狀態") {
          recordData.heatingStatus =
            value === "有" ? "yes" : value === "無" ? "no" : null;
          continue;
        }
        // ▲▲▲ 新增結束 ▲▲▲

        let config = allConfigsForModel.find(
          (c) => c.csvHeader === trimmedHeader
        );

        if (!config) {
          const modelPrefix = `${dryerModel.toUpperCase()}_`;
          config = allConfigsForModel.find((c) => {
            if (!c.csvHeader || !c.csvHeader.startsWith(modelPrefix))
              return false;
            const oldHeaderEquivalent = c.csvHeader.substring(
              modelPrefix.length
            );
            return oldHeaderEquivalent === trimmedHeader;
          });
        }

        if (config && config.dataKey) {
          if (
            value === null ||
            value === undefined ||
            String(value).trim() === "" ||
            String(value).toLowerCase() === "null"
          ) {
            value = null;
          } else if (config.elemType === "number" || config.isCalculated) {
            const num = parseFloat(value);
            value = isNaN(num) ? null : num;
          }
          if (value !== undefined) {
            utils.setNestedValue(recordData, config.dataKey, value);
          }
        }
      }
      importedRecords.push(recordData);
    }
    return importedRecords;
  };

  const _handleImportCsvRecords = ({ file }) => {
    if (!file) return;
    sandbox.publish("show-loader");
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: "utf-8",
      complete: (results) => {
        sandbox.publish("hide-loader");
        if (results.errors.length) {
          sandbox.publish("show-message", {
            text: `檔案 ${file.name} 解析失敗: ${results.errors[0].message}`,
            type: "error",
          });
        } else {
          const importedRecords = _parseCsvRowsToRecords(results.data);
          if (importedRecords.length > 0) {
            sandbox.publish("request-merge-imported-records", {
              records: importedRecords,
            });
          } else {
            sandbox.publish("show-message", {
              text: "CSV 檔案中未找到有效數據。",
              type: "info",
            });
          }
        }
      },
      error: (err) => {
        sandbox.publish("hide-loader");
        sandbox.publish("show-message", {
          text: `讀取檔案 ${file.name} 失敗: ${err.message}`,
          type: "error",
        });
      },
    });
  };

  const _promptForFiles = (inputElement, callback) => {
    inputElement.onchange = (event) => {
      if (event.target.files && event.target.files.length > 0) {
        callback(event.target.files);
      }
      inputElement.onchange = null;
      inputElement.value = "";
    };
    inputElement.click();
  };

  const _startLoadMasterDbFlow = () => {
    const dom = ui.getDomElements();
    sandbox.publish("show-message", {
      text: "請選擇要載入的主資料庫檔案 (all_records.json)",
      type: "info",
    });
    _promptForFiles(dom.masterJsonInput, (files) => {
      const file = files[0];
      sandbox.publish("show-loader");
      file
        .text()
        .then((content) => {
          const allRecords = JSON.parse(content);
          sandbox.publish("request-replace-all-data", { records: allRecords });
        })
        .catch((err) => {
          sandbox.publish("show-message", {
            text: `檔案讀取或解析失敗: ${err.message}`,
            type: "error",
          });
        })
        .finally(() => {
          sandbox.publish("hide-loader");
        });
    });
  };

  const _startCreateMasterDbFlow = () => {
    const dom = ui.getDomElements();
    _promptForFiles(dom.historyCsvInput, (files) => {
      _handleCreateMasterDb(files);
    });
  };

  const _handleCreateMasterDb = (files) => {
    if (!files || files.length === 0) return;
    sandbox.publish("show-message", {
      text: `正在讀取 ${files.length} 個CSV檔案...`,
      type: "info",
    });
    sandbox.publish("show-loader");

    const fileReadPromises = Array.from(files).map((file) => {
      return new Promise((resolve, reject) => {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          encoding: "utf-8",
          complete: (results) => {
            if (results.errors.length) {
              reject(
                new Error(
                  `檔案 ${file.name} 解析失敗: ${results.errors[0].message}`
                )
              );
            } else {
              resolve(_parseCsvRowsToRecords(results.data));
            }
          },
          error: (err) =>
            reject(new Error(`讀取檔案 ${file.name} 失敗: ${err.message}`)),
        });
      });
    });

    Promise.all(fileReadPromises)
      .then((arrayOfRecordArrays) => {
        const allRecords = arrayOfRecordArrays.flatMap((records) => records);
        if (allRecords.length > 0) {
          allRecords.sort(
            (a, b) => new Date(b.dateTime || 0) - new Date(a.dateTime || 0)
          );
          const jsonContent = JSON.stringify(allRecords, null, 2);
          _triggerDownload(
            jsonContent,
            "all_records.json",
            "application/json;charset=utf-8;"
          );
          sandbox.publish("show-message", {
            text: `主資料庫 all_records.json 已成功建立！共合併了 ${allRecords.length} 筆紀錄。`,
            type: "success",
          });
        } else {
          sandbox.publish("show-message", {
            text: "所有選擇的CSV中均無有效數據可建立資料庫。",
            type: "error",
          });
        }
      })
      .catch((error) => {
        sandbox.publish("show-message", { text: error.message, type: "error" });
      })
      .finally(() => {
        sandbox.publish("hide-loader");
      });
  };

  const _createDailyJsonFile = ({ dailyRecords }) => {
    const processedRecords = dailyRecords.map((r) => ({
      ...r,
      dryerModel:
        typeof r.dryerModel === "string"
          ? r.dryerModel.toLowerCase()
          : r.dryerModel,
      recordType:
        typeof r.recordType === "string"
          ? r.recordType.includes("評價")
            ? "evaluationTeam"
            : r.recordType.includes("條件設定")
            ? "conditionSetting"
            : r.recordType.toLowerCase()
          : r.recordType,
    }));

    const jsonContent = JSON.stringify(processedRecords, null, 2);
    const date = new Date().toISOString().slice(0, 10);
    _triggerDownload(
      jsonContent,
      `tablet-data-${date}.json`,
      "application/json;charset=utf-8;"
    );
    sandbox.publish("records-successfully-exported", {
      ids: dailyRecords.map((r) => r.id),
    });
    sandbox.publish("show-message", {
      text: `本日新紀錄 (${dailyRecords.length} 筆) 已匯出。`,
      type: "success",
    });
  };

  const _handleMergeStart = () => {
    const dom = ui.getDomElements();
    sandbox.publish("show-message", {
      text: "請先選擇您的「主資料庫檔案 (all_records.json)」",
      type: "info",
    });

    _promptForFiles(dom.masterJsonInput, (masterFiles) => {
      const masterFile = masterFiles[0];
      sandbox.publish("show-message", {
        text: "接著，請選擇從平板匯出的「本日新紀錄檔案」",
        type: "info",
      });

      _promptForFiles(dom.dailyJsonInput, (dailyFiles) => {
        const dailyFile = dailyFiles[0];
        sandbox.publish("show-loader");

        Promise.all([masterFile.text(), dailyFile.text()])
          .then(([masterContent, dailyContent]) => {
            const masterRecords = JSON.parse(masterContent);
            const dailyRecords = JSON.parse(dailyContent);

            const standardizedMaster = masterRecords.map((r) => ({
              ...r,
              dryerModel:
                typeof r.dryerModel === "string"
                  ? r.dryerModel.toLowerCase()
                  : r.dryerModel,
              recordType:
                typeof r.recordType === "string"
                  ? r.recordType.includes("評價")
                    ? "evaluationTeam"
                    : r.recordType.includes("條件設定")
                    ? "conditionSetting"
                    : r.recordType.toLowerCase()
                  : r.recordType,
            }));
            const standardizedDaily = dailyRecords.map((r) => ({
              ...r,
              dryerModel:
                typeof r.dryerModel === "string"
                  ? r.dryerModel.toLowerCase()
                  : r.dryerModel,
              recordType:
                typeof r.recordType === "string"
                  ? r.recordType.includes("評價")
                    ? "evaluationTeam"
                    : r.recordType.includes("條件設定")
                    ? "conditionSetting"
                    : r.recordType.toLowerCase()
                  : r.recordType,
            }));

            sandbox.publish("request-merge-records", {
              masterRecords: standardizedMaster,
              dailyRecords: standardizedDaily,
            });
          })
          .catch((err) => {
            sandbox.publish("show-message", {
              text: `檔案讀取或解析失敗: ${err.message}`,
              type: "error",
            });
          })
          .finally(() => {
            sandbox.publish("hide-loader");
          });
      });
    });
  };

  const _createNewMasterFile = ({ finalRecords }) => {
    const jsonContent = JSON.stringify(finalRecords, null, 2);
    _triggerDownload(
      jsonContent,
      "all_records.json",
      "application/json;charset=utf-8;"
    );
    sandbox.publish("show-message", {
      text: "資料合併成功！新的主資料庫 all_records.json 已儲存。",
      type: "success",
    });
  };

  const _exportAllForPowerBI = () => {
    const dom = ui.getDomElements();
    sandbox.publish("show-message", {
      text: "請選擇您的「主資料庫檔案 (all_records.json)」以進行匯出",
      type: "info",
    });

    _promptForFiles(dom.masterJsonInput, (files) => {
      const file = files[0];
      sandbox.publish("show-loader");

      file
        .text()
        .then((content) => {
          const allRecords = JSON.parse(content);
          if (!Array.isArray(allRecords))
            throw new Error("JSON格式不正確，並非紀錄陣列。");

          const allHeaders = new Map();
          supportedModels.forEach((model) => {
            generateFieldConfigurations(model).forEach((config) => {
              if (config.inTable) {
                const header = config.csvHeader || config.label;
                if (!allHeaders.has(header)) {
                  allHeaders.set(header, config);
                }
              }
            });
          });
          const sortedFieldConfigs = Array.from(allHeaders.values()).sort(
            (a, b) => (a.order || 9999) - (b.order || 9999)
          );

          const dataForCsv = allRecords.map((record) => {
            const row = {};
            sortedFieldConfigs.forEach((fieldConfig) => {
              const header = fieldConfig.csvHeader || fieldConfig.label;
              let valueToPush = "";
              if (fieldConfig.dataKey === "recordType") {
                valueToPush =
                  record.recordType === "evaluationTeam"
                    ? "評價TEAM用"
                    : record.recordType === "conditionSetting"
                    ? "條件設定用"
                    : record.recordType;
              } else if (fieldConfig.dataKey === "dryerModel") {
                valueToPush = record.dryerModel
                  ? record.dryerModel.toUpperCase()
                  : "";
              } else if (fieldConfig.dataKey === "rtoStatus") {
                valueToPush =
                  record.rtoStatus === "yes"
                    ? "有"
                    : record.rtoStatus === "no"
                    ? "無"
                    : "";
              } else if (fieldConfig.dataKey === "heatingStatus") {
                valueToPush =
                  record.heatingStatus === "yes"
                    ? "有"
                    : record.heatingStatus === "no"
                    ? "無"
                    : "";
              } else {
                valueToPush = utils.getNestedValue(
                  record,
                  fieldConfig.dataKey,
                  ""
                );
              }
              row[header] = valueToPush;
            });
            return row;
          });

          const csvContent = Papa.unparse(dataForCsv);
          _triggerDownload(
            "\ufeff" + csvContent,
            "power_bi_export_full.csv",
            "text/csv;charset=utf-8;"
          );
          sandbox.publish("show-message", {
            text: `成功為 Power BI 匯出 ${allRecords.length} 筆完整紀錄！`,
            type: "success",
          });
        })
        .catch((err) => {
          sandbox.publish("show-message", {
            text: `匯出失敗: ${err.message}`,
            type: "error",
          });
        })
        .finally(() => {
          sandbox.publish("hide-loader");
        });
    });
  };

  const _exportMainCsv = ({ records }) => {
    if (!records || records.length === 0) {
      sandbox.publish("show-message", {
        text: "目前沒有數據可以匯出。",
        type: "info",
      });
      return;
    }

    try {
      const firstRecord = records[0];
      const recordType = firstRecord.recordType;
      const dryerModel = firstRecord.dryerModel;

      const fieldConfigs = generateFieldConfigurations(dryerModel);
      const headersConfig = fieldConfigs.filter(
        (f) => f.inTable && f.recordTypes.includes(recordType)
      );

      const dataForCsv = records.map((record) => {
        const row = {};
        headersConfig.forEach((fieldConfig) => {
          const header = fieldConfig.csvHeader || fieldConfig.label;
          let valueToPush = "";
          if (fieldConfig.dataKey === "recordType") {
            valueToPush =
              record.recordType === "evaluationTeam"
                ? "評價TEAM用"
                : "條件設定用";
          } else if (fieldConfig.dataKey === "dryerModel") {
            valueToPush = record.dryerModel
              ? record.dryerModel.toUpperCase()
              : "";
          } else if (fieldConfig.dataKey === "rtoStatus") {
            const rtoValue = utils.getNestedValue(record, "rtoStatus");
            valueToPush =
              rtoValue === "yes" ? "有" : rtoValue === "no" ? "無" : "";
            // ▼▼▼ 新增開始 ▼▼▼
          } else if (fieldConfig.dataKey === "heatingStatus") {
            const heatingValue = utils.getNestedValue(record, "heatingStatus");
            valueToPush =
              heatingValue === "yes" ? "有" : heatingValue === "no" ? "無" : "";
            // ▲▲▲ 新增結束 ▲▲▲
          } else {
            valueToPush = utils.getNestedValue(record, fieldConfig.dataKey, "");
          }
          row[header] = valueToPush;
        });
        return row;
      });

      const csvContent = Papa.unparse(dataForCsv);
      const timestamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[-:T]/g, "");
      _triggerDownload(
        "\ufeff" + csvContent,
        `乾燥機數據_${dryerModel}_${timestamp}.csv`,
        "text/csv;charset=utf-8;"
      );
      sandbox.publish("show-message", {
        text: "CSV 檔案已成功匯出！",
        type: "success",
      });
    } catch (error) {
      console.error("匯出 CSV 時發生錯誤:", error);
      sandbox.publish("show-message", {
        text: `匯出失敗: ${error.message}`,
        type: "error",
      });
    }
  };

  return {
    init: () => {
      ui = sandbox.getModule("uiManager");
      if (!ui) {
        console.error("CsvHandler: 缺少 uiManager 模組！");
        return;
      }

      console.log("CsvHandler: 模組初始化完成");

      sandbox.subscribe("request-load-master-db-start", _startLoadMasterDbFlow);
      sandbox.subscribe(
        "request-create-master-db-start",
        _startCreateMasterDbFlow
      );
      sandbox.subscribe("request-create-daily-json-file", _createDailyJsonFile);
      sandbox.subscribe("request-merge-start", _handleMergeStart);
      sandbox.subscribe("request-create-new-master-file", _createNewMasterFile);
      sandbox.subscribe("request-export-all-for-powerbi", _exportAllForPowerBI);
      sandbox.subscribe("request-import-csv-records", _handleImportCsvRecords);
      sandbox.subscribe("request-export-main-csv", _exportMainCsv);
    },
  };
};

export default CsvHandler;
