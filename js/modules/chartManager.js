// /js/modules/chartManager.js (已整合檢視 Raw Data 功能)

import { techTempPoints } from "./config.js";
import * as utils from "./utils.js";

// 用於在主圖表無數據時顯示提示文字的客製化外掛
const mainChartNoDataPlugin = {
  id: "mainChartNoData",
  afterDraw: (chart) => {
    // 檢查所有數據集是否都沒有有效的數據點
    const hasData = chart.data.datasets.some(
      (ds) => ds.data && ds.data.some((point) => point !== null)
    );
    if (!hasData) {
      const { ctx, chartArea } = chart;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 16px 'Noto Sans TC'";
      ctx.fillStyle = "#999";
      ctx.fillText(
        "沒有可用於圖表的評價數據",
        chartArea.width / 2,
        chartArea.height / 2
      );
      ctx.restore();
    }
  },
};

const ChartManager = (sandbox) => {
  // --- 模組私有屬性 ---
  let temperatureChartInstance = null; // 主圖表（技術溫測實溫）的實例
  let rawTemperatureChartInstance = null; // 原始數據圖表的實例
  let airVolumeCompareChartInstance = null; // 風量比較圖的實例
  let tempCompareChartInstance = null; // 溫度比較圖的實例
  let datasetVisibility = {}; // 記住主圖表各數據線的顯示/隱藏狀態
  let rawDatasetVisibility = {}; // 記住原始數據圖表各數據線的顯示/隱藏狀態

  const _getTimestamp = () => {
    const now = new Date();
    const YYYY = now.getFullYear();
    const MM = String(now.getMonth() + 1).padStart(2, "0");
    const DD = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    return `${YYYY}${MM}${DD}_${hh}${mm}${ss}`;
  };

  const _updateAirVolumeComparisonChart = (analysisData) => {
    const container = document.getElementById("dashboard-rto-chart-container");
    const ctx = document.getElementById("dashboardRtoChart")?.getContext("2d");
    const dashboardContainer = document.getElementById("dashboard-container");

    if (airVolumeCompareChartInstance) {
      airVolumeCompareChartInstance.destroy();
      airVolumeCompareChartInstance = null;
    }

    const airVolumeData = analysisData?.airVolumeData;
    if (!airVolumeData || !ctx) {
      if (container) container.style.display = "none";
      if (!tempCompareChartInstance && dashboardContainer)
        dashboardContainer.style.display = "none";
      return;
    }
    if (dashboardContainer) dashboardContainer.style.display = "block";
    if (container) container.style.display = "block";

    airVolumeCompareChartInstance = new Chart(ctx, {
      type: "bar",
      data: airVolumeData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: "風量比較", font: { size: 18 } },
          subtitle: {
            display: true,
            text: [
              analysisData.recordInfo.recordA,
              analysisData.recordInfo.recordB,
            ],
            position: "bottom",
            align: "start",
          },
          legend: { position: "top" },
        },
        scales: {
          x: { title: { display: true, text: "風量測量位置" } },
          y: {
            beginAtZero: true,
            title: { display: true, text: "風量 (Nm³/分)" },
          },
        },
      },
    });
  };

  const _updateTempComparisonChart = (analysisData) => {
    const container = document.getElementById("dashboard-temp-chart-container");
    const ctx = document.getElementById("dashboardTempChart")?.getContext("2d");
    const dashboardContainer = document.getElementById("dashboard-container");

    if (tempCompareChartInstance) {
      tempCompareChartInstance.destroy();
      tempCompareChartInstance = null;
    }

    const tempData = analysisData?.tempData;
    if (!tempData || !ctx) {
      if (container) container.style.display = "none";
      if (!airVolumeCompareChartInstance && dashboardContainer)
        dashboardContainer.style.display = "none";
      return;
    }
    if (dashboardContainer) dashboardContainer.style.display = "block";
    if (container) container.style.display = "block";

    tempCompareChartInstance = new Chart(ctx, {
      type: "line",
      data: tempData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: "技術實測溫度比較 (5條溫測線)",
            font: { size: 18 },
          },
          subtitle: {
            display: true,
            text: [
              analysisData.recordInfo.recordA,
              analysisData.recordInfo.recordB,
            ],
            position: "bottom",
            align: "start",
          },
          legend: { position: "top" },
        },
        scales: {
          x: { title: { display: true, text: "溫測點位" } },
          y: {
            beginAtZero: false,
            title: { display: true, text: "溫度 (°C)" },
          },
        },
      },
    });
  };

  const _addKeyboardNavigationToLegend = (chartId) => {
    const chartElement = document.getElementById(chartId);
    if (!chartElement) return;
    const container = chartElement.closest(
      ".chart-container, .raw-data-chart-section"
    );
    if (!container) return;
    const legendContainer = container.querySelector(
      'div[aria-label="Chart legend"]'
    );
    if (!legendContainer) return;

    const legendItems = legendContainer.querySelectorAll("li");
    legendItems.forEach((item) => {
      if (item.getAttribute("tabindex") === "0") return;
      item.setAttribute("tabindex", "0");
      item.setAttribute("role", "button");
      item.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          item.click();
        }
      });
    });
  };

  const _updateMainChart = (source) => {
    const ctx = document.getElementById("temperatureChart").getContext("2d");
    if (temperatureChartInstance) {
      Object.keys(datasetVisibility).forEach((label) => {
        const datasetIndex = temperatureChartInstance.data.datasets.findIndex(
          (ds) => ds.label === label
        );
        if (datasetIndex !== -1) {
          datasetVisibility[label] =
            temperatureChartInstance.isDatasetVisible(datasetIndex);
        }
      });
      temperatureChartInstance.destroy();
    }
    let recordToChart = null;
    if (source) {
      if (Array.isArray(source)) {
        for (let i = source.length - 1; i >= 0; i--) {
          if (source[i] && source[i].recordType === "evaluationTeam") {
            recordToChart = source[i];
            break;
          }
        }
      } else if (
        typeof source === "object" &&
        source.recordType === "evaluationTeam"
      ) {
        recordToChart = source;
      }
    }
    const chartLabels = techTempPoints.map((p) =>
      p.label.replace("技術溫測實溫_", "")
    );
    const datasets = [];
    const datasetLabels = ["1(右)", "2", "3(中)", "4", "5(左)"];
    const allDataValues = [];
    for (let i = 1; i <= 5; i++) {
      const label = datasetLabels[i - 1];
      const data = chartLabels.map((pointLabel) => {
        if (recordToChart) {
          const pointDefinition = techTempPoints.find(
            (p) => p.label.replace("技術溫測實溫_", "") === pointLabel
          );
          if (pointDefinition) {
            const recordPointKey = utils.getActualTempRecordKey(
              pointDefinition.id
            );
            const value = utils.getNestedValue(
              recordToChart,
              `actualTemps.${recordPointKey}.val${i}`
            );
            if (value !== null && !isNaN(value)) allDataValues.push(value);
            return value;
          }
        }
        return null;
      });
      const isHidden =
        datasetVisibility[label] === undefined
          ? true
          : !datasetVisibility[label];
      datasets.push({
        label,
        data,
        fill: false,
        tension: 0.1,
        order: 0,
        hidden: isHidden,
        borderColor: `hsl(${i * 60}, 70%, 50%)`,
        backgroundColor: `hsla(${i * 60}, 70%, 50%, 0.2)`,
      });
    }

    // ▼▼▼【★★★ 重新加入的程式碼區塊 ★★★】▼▼▼
    const machineDisplayLabel = "機台顯示溫度";
    const machineDisplayData = chartLabels.map((label) => {
      if (recordToChart) {
        const pointDefinition = techTempPoints.find(
          (p) => p.label.replace("技術溫測實溫_", "") === label
        );
        if (pointDefinition) {
          const value = utils.getMachineDisplayTempForPoint(
            pointDefinition.id,
            recordToChart
          );
          if (value !== null && !isNaN(value)) {
            allDataValues.push(value);
          }
          return value;
        }
      }
      return null;
    });

    const isMachineHidden =
      datasetVisibility[machineDisplayLabel] === undefined
        ? false
        : !datasetVisibility[machineDisplayLabel];

    datasets.push({
      label: machineDisplayLabel,
      data: machineDisplayData,
      borderColor: "red",
      backgroundColor: "rgba(255, 0, 0, 0.2)",
      fill: false,
      borderWidth: 2.5,
      tension: 0.1,
      order: 1,
      hidden: isMachineHidden,
    });
    // ▲▲▲【★★★ 重新加入結束 ★★★】▲▲▲

    let yMin = 0,
      yMax = 10;
    const filteredDataValues = allDataValues.filter(
      (v) => v !== null && !isNaN(v)
    );
    if (filteredDataValues.length > 0) {
      let dataMin = Math.min(...filteredDataValues);
      let dataMax = Math.max(...filteredDataValues);
      const paddingValue = (dataMax - dataMin) * 0.1 || 5;
      yMin = Math.floor(dataMin - paddingValue);
      yMax = Math.ceil(dataMax + paddingValue);
      if (yMin < 0 && dataMin >= 0) yMin = 0;
    }
    temperatureChartInstance = new Chart(ctx, {
      type: "line",
      data: { labels: chartLabels, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: "點位名稱" } },
          y: {
            title: { display: true, text: "溫度 (°C)" },
            min: yMin,
            max: yMax,
          },
        },
        plugins: {
          title: { display: true, text: "技術溫測實溫分佈圖" },
          tooltip: {
            callbacks: {
              title: (context) => {
                const pointDefinition = techTempPoints.find(
                  (p) =>
                    p.label.replace("技術溫測實溫_", "") === context[0].label
                );
                return pointDefinition
                  ? pointDefinition.label
                  : context[0].label;
              },
              label: (context) => {
                const label = context.dataset.label || "";
                const value = context.parsed.y;
                return `${label}: ${
                  value !== null ? value.toFixed(2) + " °C" : "N/A"
                }`;
              },
            },
          },
          legend: {
            position: "top",
            onClick: (e, legendItem, legend) => {
              const index = legendItem.datasetIndex;
              const ci = legend.chart;
              if (ci.isDatasetVisible(index)) {
                ci.hide(index);
                datasetVisibility[legendItem.text] = false;
              } else {
                ci.show(index);
                datasetVisibility[legendItem.text] = true;
              }
            },
            onHover: (e) => {
              if (e.native.target) e.native.target.style.cursor = "pointer";
            },
            onLeave: (e) => {
              if (e.native.target) e.native.target.style.cursor = "default";
            },
          },
        },
        animation: {
          onComplete: () => _addKeyboardNavigationToLegend("temperatureChart"),
        },
      },
      plugins: [mainChartNoDataPlugin],
    });
  };

  const _plotRawData = (results) => {
    sandbox.publish("clear-raw-chart-error");

    if (!results || !results.data || results.data.length === 0) {
      if (rawTemperatureChartInstance) {
        rawTemperatureChartInstance.destroy();
        rawTemperatureChartInstance = null;
      }
      sandbox.publish("toggle-raw-chart-export-button", { disabled: true });
      return;
    }

    if (results.errors && results.errors.length > 0) {
      const errorMessagesText = results.errors
        .map((err) => `(第 ${err.row + 1} 行) ${err.message}`)
        .join("; ");
      sandbox.publish(
        "show-raw-chart-error",
        "CSV 解析錯誤: " + errorMessagesText
      );
      return;
    }

    const dataRows = results.data;
    const headersFromPapaParse = results.fields || [];
    const channelColumnsToPlot = [
      "CH01",
      "CH02",
      "CH03",
      "CH04",
      "CH05",
      "AVE",
    ];

    const datasets = [];
    let foundChannelsCount = 0;
    const defaultColors = [
      "rgba(255, 159, 64, 1)",
      "rgba(54, 162, 235, 1)",
      "rgba(255, 206, 86, 1)",
      "rgba(75, 192, 192, 1)",
      "rgba(153, 102, 255, 1)",
      "rgba(255, 99, 132, 1)",
    ];
    channelColumnsToPlot.forEach((columnKey, index) => {
      if (headersFromPapaParse.includes(columnKey)) {
        foundChannelsCount++;
        const channelData = dataRows.map((row) =>
          typeof row[columnKey] === "number" && !isNaN(row[columnKey])
            ? row[columnKey]
            : null
        );
        const isHidden =
          rawDatasetVisibility[columnKey] !== undefined
            ? !rawDatasetVisibility[columnKey]
            : false;
        datasets.push({
          label: columnKey,
          data: channelData,
          borderColor: defaultColors[index % defaultColors.length],
          hidden: isHidden,
          fill: false,
          tension: 0.1,
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 4,
        });
      }
    });
    if (foundChannelsCount === 0) {
      sandbox.publish(
        "show-raw-chart-error",
        `CSV 表頭必須包含至少一個以下欄位: ${channelColumnsToPlot.join(", ")}`
      );
      return;
    }
    const elapsedSeconds = dataRows.map((_, index) => index * 10);
    const maxActualElapsedSeconds =
      elapsedSeconds.length > 0 ? elapsedSeconds[elapsedSeconds.length - 1] : 0;
    let xAxisMax = Math.ceil(maxActualElapsedSeconds / 100.0) * 100 || 100;
    const chartData = { labels: elapsedSeconds, datasets: datasets };
    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: "linear",
          min: 0,
          max: xAxisMax,
          title: { display: true, text: "時間 (分鐘)", font: { size: 14 } },
          ticks: {
            stepSize: 100,
            callback: (value) =>
              value % 100 === 0 ? (value / 60).toFixed(1) : null,
          },
        },
        y: {
          title: { display: true, text: "溫度 (°C)", font: { size: 14 } },
          grace: "5%",
        },
      },
      plugins: {
        legend: {
          position: "top",
          onClick: (e, legendItem, legend) => {
            const index = legendItem.datasetIndex;
            const ci = legend.chart;
            ci.isDatasetVisible(index) ? ci.hide(index) : ci.show(index);
            rawDatasetVisibility[legendItem.text] = ci.isDatasetVisible(index);
          },
          onHover: (e) => (e.native.target.style.cursor = "pointer"),
          onLeave: (e) => (e.native.target.style.cursor = "default"),
        },
        title: {
          display: true,
          text: "原始溫度數據圖 (CSV 匯入)",
          font: { size: 18 },
        },
        tooltip: { mode: "index", intersect: false },
      },
      animation: {
        onComplete: () => _addKeyboardNavigationToLegend("rawTemperatureChart"),
      },
    };
    const ctx = document.getElementById("rawTemperatureChart").getContext("2d");
    if (rawTemperatureChartInstance) {
      rawTemperatureChartInstance.destroy();
    }
    rawTemperatureChartInstance = new Chart(ctx, {
      type: "line",
      data: chartData,
      options: chartOptions,
    });
    sandbox.publish("toggle-raw-chart-export-button", { disabled: false });
  };

  const _exportMainChart = () => {
    if (!temperatureChartInstance) {
      sandbox.publish("show-message", {
        text: "目前沒有主圖表可以匯出。",
        type: "info",
      });
      return;
    }
    const chartCanvas = document.getElementById("temperatureChart");
    const ctx = chartCanvas.getContext("2d");
    ctx.save();
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--bg-container")
        .trim() || "#FFFFFF";
    ctx.fillRect(0, 0, chartCanvas.width, chartCanvas.height);
    const image = chartCanvas.toDataURL("image/png", 1.0);
    ctx.restore();
    const link = document.createElement("a");
    link.href = image;
    link.download = `技術溫測圖_${_getTimestamp()}.png`;
    link.click();
    sandbox.publish("show-message", {
      text: "主圖表已成功匯出為 PNG！",
      type: "success",
    });
  };

  const _exportRawChart = () => {
    if (!rawTemperatureChartInstance) {
      sandbox.publish("show-raw-chart-error", "沒有原始數據圖表可供匯出。");
      return;
    }
    const chartCanvas = document.getElementById("rawTemperatureChart");
    const ctx = chartCanvas.getContext("2d");
    ctx.save();
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--bg-container")
        .trim() || "#FFFFFF";
    ctx.fillRect(0, 0, chartCanvas.width, chartCanvas.height);
    const image = chartCanvas.toDataURL("image/png", 1.0);
    ctx.restore();
    const link = document.createElement("a");
    link.href = image;
    link.download = `原始數據圖_${_getTimestamp()}.png`;
    link.click();
    sandbox.publish("show-message", {
      text: "原始數據圖表已成功匯出為 PNG！",
      type: "success",
    });
  };

  const _exportAirVolumeCompareChart = () => {
    if (!airVolumeCompareChartInstance) {
      sandbox.publish("show-message", {
        text: "沒有風量比較圖可供匯出。",
        type: "info",
      });
      return;
    }
    const chartCanvas = document.getElementById("dashboardRtoChart");
    const ctx = chartCanvas.getContext("2d");
    ctx.save();
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--bg-container")
        .trim() || "#FFFFFF";
    ctx.fillRect(0, 0, chartCanvas.width, chartCanvas.height);
    const image = chartCanvas.toDataURL("image/png", 1.0);
    ctx.restore();

    const link = document.createElement("a");
    link.href = image;
    link.download = `風量比較圖_${_getTimestamp()}.png`;
    link.click();
  };

  const _exportTempCompareChart = () => {
    if (!tempCompareChartInstance) {
      sandbox.publish("show-message", {
        text: "沒有溫度比較圖可供匯出。",
        type: "info",
      });
      return;
    }
    const chartCanvas = document.getElementById("dashboardTempChart");
    const ctx = chartCanvas.getContext("2d");
    ctx.save();
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--bg-container")
        .trim() || "#FFFFFF";
    ctx.fillRect(0, 0, chartCanvas.width, chartCanvas.height);
    const image = chartCanvas.toDataURL("image/png", 1.0);
    ctx.restore();

    const link = document.createElement("a");
    link.href = image;
    link.download = `溫度比較圖_${_getTimestamp()}.png`;
    link.click();
  };

  return {
    init: () => {
      console.log("ChartManager: 模組初始化完成");

      sandbox.subscribe("data-updated", (data) => {
        _updateMainChart(data ? data.records : []);
        const comparisonData = data ? data.comparisonAnalysis : null;
        _updateAirVolumeComparisonChart(comparisonData);
        _updateTempComparisonChart(comparisonData);
      });
      sandbox.subscribe("load-data-to-form", (record) =>
        _updateMainChart(record)
      );
      sandbox.subscribe("form-cleared", () => {
        _updateMainChart(null);
        _plotRawData(null);
      });
      sandbox.subscribe("raw-csv-data-parsed", _plotRawData);
      sandbox.subscribe("plot-raw-data-chart", _plotRawData);
      sandbox.subscribe("request-export-main-chart", _exportMainChart);
      sandbox.subscribe("request-export-raw-chart", _exportRawChart);
      sandbox.subscribe("request-chart-preview", (recordDataFromEvent) => {
        _updateMainChart(recordDataFromEvent);
      });
      sandbox.subscribe(
        "request-export-air-volume-chart",
        _exportAirVolumeCompareChart
      );
      sandbox.subscribe(
        "request-export-temp-compare-chart",
        _exportTempCompareChart
      );

      _updateMainChart([]);
      _updateAirVolumeComparisonChart(null);
      _updateTempComparisonChart(null);
    },
  };
};

export default ChartManager;
