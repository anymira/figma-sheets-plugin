/// <reference types="@figma/plugin-typings" />

// Открываем окошко плагина
figma.showUI(__html__, { width: 500, height: 520 });

(async () => {
  const savedApiKey = await figma.clientStorage.getAsync("apiKey");

  // Проверяем, выбрана ли таблица созданная плагином
  const selection = figma.currentPage.selection[0];
  let tableData = null;

  if (selection && selection.type === "FRAME") {
    const sheetId = selection.getPluginData("sheetId");
    const sheetName = selection.getPluginData("sheetName");
    const range = selection.getPluginData("range");

    if (sheetId) {
      tableData = { sheetId, sheetName, range };
    }
  }

  const savedLang = await figma.clientStorage.getAsync("lang");

  figma.ui.postMessage({
    type: "init",
    savedApiKey: savedApiKey || "",
    savedLang: savedLang || "ru",
    selectedTable: tableData,
  });
})();

// Слушаем сообщения от UI
figma.ui.onmessage = async (msg) => {
  if (msg.type === "save-key") {
    await figma.clientStorage.setAsync("apiKey", msg.apiKey);
    figma.notify("✅ API ключ сохранён");
  }
  if (msg.type === "save-lang") {
    await figma.clientStorage.setAsync("lang", msg.lang);
  }

  if (msg.type === "create-table") {
    await createTableInFigma(
      msg.tableData,
      msg.sheetId,
      msg.sheetName,
      msg.range,
    );
    figma.closePlugin();
  }
  if (msg.type === "update-table") {
    const selection = figma.currentPage.selection[0];

    if (!selection || selection.type !== "FRAME") {
      figma.notify("❌ Выберите таблицу для обновления");
      return;
    }

    await updateTableInFigma(
      selection as FrameNode,
      msg.tableData,
      msg.sheetId,
      msg.sheetName,
      msg.range,
    );

    figma.notify("✅ Таблица обновлена!");
    figma.closePlugin();
  }
  if (msg.type === "create-multiple-tables") {
    const viewport = figma.viewport.center;
    let xOffset = 0;

    for (let i = 0; i < msg.tables.length; i++) {
      const table = msg.tables[i];

      await createTableInFigma(
        table.data,
        msg.sheetId,
        table.sheetName,
        msg.range,
      );

      const createdTable = figma.currentPage.children[
        figma.currentPage.children.length - 1
      ] as FrameNode;

      if (i === 0) {
        // Первая таблица остаётся в центре
        createdTable.x = viewport.x - createdTable.width / 2;
        createdTable.y = viewport.y - createdTable.height / 2;
      } else {
        // Остальные справа от предыдущей
        const prevTable = figma.currentPage.children[
          figma.currentPage.children.length - 2
        ] as FrameNode;
        createdTable.x = prevTable.x + prevTable.width + 50; // 50px отступ
        createdTable.y = prevTable.y;
      }
    }

    // Выделяем все созданные таблицы
    const createdTables = figma.currentPage.children.slice(-msg.tables.length);
    figma.currentPage.selection = createdTables as SceneNode[];
    figma.viewport.scrollAndZoomIntoView(createdTables);

    figma.notify(`✅ Импортировано таблиц: ${msg.tables.length}`);
    figma.closePlugin();
  }
};

async function updateTableInFigma(
  existingTable: FrameNode,
  data: string[][],
  sheetId: string,
  sheetName: string,
  range: string,
) {
  // Загружаем шрифты
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });

  const CELL_HEIGHT = 40;
  const PADDING = 12;
  const MIN_CELL_WIDTH = 100;

  const HEADER_COLOR = { r: 0.09, g: 0.63, b: 0.98 };
  const BORDER_COLOR = { r: 0.88, g: 0.88, b: 0.88 };
  const ROW_EVEN = { r: 1, g: 1, b: 1 };
  const ROW_ODD = { r: 0.97, g: 0.97, b: 0.97 };

  // Вычисляем ширину колонок
  const columnWidths: number[] = [];
  data.forEach((row) => {
    row.forEach((cellValue, colIndex) => {
      const textLength = String(cellValue ?? "").length;
      const estimatedWidth = Math.max(
        MIN_CELL_WIDTH,
        textLength * 8 + PADDING * 2,
      );
      if (!columnWidths[colIndex] || estimatedWidth > columnWidths[colIndex]) {
        columnWidths[colIndex] = estimatedWidth;
      }
    });
  });

  // Удаляем все старые строки
  existingTable.children.forEach((child) => child.remove());

  // Создаём новые строки с новыми данными
  data.forEach((row, rowIndex) => {
    const isHeader = rowIndex === 0;

    const rowFrame = figma.createFrame();
    rowFrame.name = isHeader ? "Header" : `Row ${rowIndex}`;
    rowFrame.layoutMode = "HORIZONTAL";
    rowFrame.counterAxisSizingMode = "AUTO";
    rowFrame.primaryAxisSizingMode = "AUTO";
    rowFrame.fills = [];

    row.forEach((cellValue, colIndex) => {
      const cell = figma.createFrame();
      cell.name = `Cell ${rowIndex}-${colIndex}`;
      cell.resize(columnWidths[colIndex], CELL_HEIGHT);
      cell.primaryAxisSizingMode = "FIXED";
      cell.counterAxisSizingMode = "FIXED";
      cell.layoutMode = "HORIZONTAL";
      cell.counterAxisAlignItems = "CENTER";
      cell.paddingLeft = PADDING;
      cell.paddingRight = PADDING;

      if (isHeader) {
        cell.fills = [{ type: "SOLID", color: HEADER_COLOR }];
      } else {
        cell.fills = [
          {
            type: "SOLID",
            color: rowIndex % 2 === 0 ? ROW_EVEN : ROW_ODD,
          },
        ];
      }

      cell.strokes = [{ type: "SOLID", color: BORDER_COLOR }];
      cell.strokeWeight = 1;

      const text = figma.createText();
      const cellText = String(cellValue ?? "");
      text.characters = cellText;
      text.fontSize = 13;
      text.fontName = {
        family: "Inter",
        style: isHeader ? "Bold" : "Regular",
      };
      text.fills = [
        {
          type: "SOLID",
          color: isHeader ? { r: 1, g: 1, b: 1 } : { r: 0.1, g: 0.1, b: 0.1 },
        },
      ];

      // Автовыравнивание по типу данных
      if (!isHeader) {
        const trimmedText = cellText.trim();

        const normalized = trimmedText.replace(/\s/g, "").replace(",", ".");
        const isNumber =
          normalized !== "" &&
          !isNaN(parseFloat(normalized)) &&
          isFinite(Number(normalized));

        console.log(
          `Cell: "${cellText}" | Normalized: "${normalized}" | Is Number: ${isNumber}`,
        );

        if (isNumber) {
          text.textAlignHorizontal = "RIGHT";
          cell.primaryAxisAlignItems = "MAX";
        } else {
          text.textAlignHorizontal = "LEFT";
          cell.primaryAxisAlignItems = "MIN";
        }
      } else {
        text.textAlignHorizontal = "LEFT";
        cell.primaryAxisAlignItems = "MIN";
      }

      text.layoutGrow = 1;

      cell.appendChild(text);
      rowFrame.appendChild(cell);
    });

    existingTable.appendChild(rowFrame);
  });

  // Обновляем метаданные
  existingTable.setPluginData("sheetId", sheetId);
  existingTable.setPluginData("sheetName", sheetName);
  existingTable.setPluginData("range", range || "");
}
async function createTableInFigma(
  data: string[][],
  sheetId: string,
  sheetName: string,
  range: string,
) {
  // Загружаем шрифты
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });

  const CELL_HEIGHT = 40;
  const PADDING = 12;
  const MIN_CELL_WIDTH = 100; // минимальная ширина

  // Цвета
  const HEADER_COLOR = { r: 0.09, g: 0.63, b: 0.98 };
  const BORDER_COLOR = { r: 0.88, g: 0.88, b: 0.88 };
  const ROW_EVEN = { r: 1, g: 1, b: 1 };
  const ROW_ODD = { r: 0.97, g: 0.97, b: 0.97 };

  // Вычисляем ширину каждой колонки по самому длинному тексту
  const columnWidths: number[] = [];

  data.forEach((row, rowIndex) => {
    row.forEach((cellValue, colIndex) => {
      const textLength = String(cellValue ?? "").length;
      const estimatedWidth = Math.max(
        MIN_CELL_WIDTH,
        textLength * 8 + PADDING * 2,
      );

      if (!columnWidths[colIndex] || estimatedWidth > columnWidths[colIndex]) {
        columnWidths[colIndex] = estimatedWidth;
      }
    });
  });

  // Создаём общий контейнер
  const tableFrame = figma.createFrame();
  tableFrame.name = "Google Sheet Table";
  tableFrame.layoutMode = "VERTICAL";
  tableFrame.counterAxisSizingMode = "AUTO";
  tableFrame.primaryAxisSizingMode = "AUTO";
  tableFrame.fills = [];

  // Проходим по каждой строке
  data.forEach((row, rowIndex) => {
    const isHeader = rowIndex === 0;

    const rowFrame = figma.createFrame();
    rowFrame.name = isHeader ? "Header" : `Row ${rowIndex}`;
    rowFrame.layoutMode = "HORIZONTAL";
    rowFrame.counterAxisSizingMode = "AUTO";
    rowFrame.primaryAxisSizingMode = "AUTO";
    rowFrame.fills = [];

    row.forEach((cellValue, colIndex) => {
      const cell = figma.createFrame();
      cell.name = `Cell ${rowIndex}-${colIndex}`;
      cell.resize(columnWidths[colIndex], CELL_HEIGHT);
      cell.primaryAxisSizingMode = "FIXED";
      cell.counterAxisSizingMode = "FIXED";
      cell.layoutMode = "HORIZONTAL";
      cell.counterAxisAlignItems = "CENTER";
      cell.paddingLeft = PADDING;
      cell.paddingRight = PADDING;

      if (isHeader) {
        cell.fills = [{ type: "SOLID", color: HEADER_COLOR }];
      } else {
        cell.fills = [
          {
            type: "SOLID",
            color: rowIndex % 2 === 0 ? ROW_EVEN : ROW_ODD,
          },
        ];
      }

      cell.strokes = [{ type: "SOLID", color: BORDER_COLOR }];
      cell.strokeWeight = 1;

      const text = figma.createText();
      const cellText = String(cellValue ?? "");
      text.characters = cellText;
      text.fontSize = 13;
      text.fontName = {
        family: "Inter",
        style: isHeader ? "Bold" : "Regular",
      };
      text.fills = [
        {
          type: "SOLID",
          color: isHeader ? { r: 1, g: 1, b: 1 } : { r: 0.1, g: 0.1, b: 0.1 },
        },
      ];

      // Автовыравнивание по типу данных
      if (!isHeader) {
        const trimmedText = cellText.trim();

        const normalized = trimmedText.replace(/\s/g, "").replace(",", ".");
        const isNumber =
          normalized !== "" &&
          !isNaN(parseFloat(normalized)) &&
          isFinite(Number(normalized));

        console.log(
          `Cell: "${cellText}" | Normalized: "${normalized}" | Is Number: ${isNumber}`,
        );

        if (isNumber) {
          text.textAlignHorizontal = "RIGHT";
          cell.primaryAxisAlignItems = "MAX";
        } else {
          text.textAlignHorizontal = "LEFT";
          cell.primaryAxisAlignItems = "MIN";
        }
      } else {
        text.textAlignHorizontal = "LEFT";
        cell.primaryAxisAlignItems = "MIN";
      }

      text.layoutGrow = 1;

      cell.appendChild(text);
      rowFrame.appendChild(cell);
    });

    tableFrame.appendChild(rowFrame);
  });

  const viewport = figma.viewport.center;
  tableFrame.x = viewport.x - tableFrame.width / 2;
  tableFrame.y = viewport.y - tableFrame.height / 2;

  // Сохраняем метаданные таблицы
  tableFrame.setPluginData("sheetId", sheetId);
  tableFrame.setPluginData("sheetName", sheetName);
  tableFrame.setPluginData("range", range || "");

  figma.currentPage.appendChild(tableFrame);
  figma.viewport.scrollAndZoomIntoView([tableFrame]);
}
