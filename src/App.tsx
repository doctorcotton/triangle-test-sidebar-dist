import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { bitable, IFieldMeta, IRecord } from '@lark-base-open/js-sdk';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';
import dayjs from 'dayjs';
// 使用完整的 Arial Unicode 字体（包含全部中文字符）
import chineseFontUrl from './assets/ArialUnicode.ttf?url';

type GroupKey = 'A1' | 'A2' | 'A3' | 'B1' | 'B2' | 'B3';

interface GroupConfig {
  key: GroupKey;
  optionFieldId: string;
  correctFieldId: string;
  qrSourceFieldId: string;
}

interface LoadedGroup extends GroupConfig {
  options: string[];
  correct: string;
  qrSource: string;
  qrDataUrl?: string; // 二维码图片的 Data URL
  sampleLabels: string[]; // 样品标注，如 ['备选', '备选', '标品']
}

// 测试类型字段ID（备选/工厂样品）
const TEST_SAMPLE_TYPE_FIELD_ID = 'fld9MkM2Dt';
// 测试样品名称字段ID
const TEST_SAMPLE_NAME_FIELD_ID = 'fldxvyb5Tt';

interface RecordItem {
  recordId: string;
  primaryValue: string;
}

const GROUPS: GroupConfig[] = [
  { key: 'A1', optionFieldId: 'fldacaDBFo', correctFieldId: 'fld6gqxNcC', qrSourceFieldId: 'fldhIV6aac' },
  { key: 'A2', optionFieldId: 'fldJtMjLZS', correctFieldId: 'fldkH6ZAOF', qrSourceFieldId: 'fldOzZHsmg' },
  { key: 'A3', optionFieldId: 'fldcI4D25x', correctFieldId: 'fldzaEw5m1', qrSourceFieldId: 'fldT44t40R' },
  { key: 'B1', optionFieldId: 'fldHsoqeJ7', correctFieldId: 'fld9t9uVGa', qrSourceFieldId: 'flde5cAgDx' },
  { key: 'B2', optionFieldId: 'fldREcfxgd', correctFieldId: 'fld3C5MSLW', qrSourceFieldId: 'fldSoyTeKY' },
  { key: 'B3', optionFieldId: 'fldwZVopiE', correctFieldId: 'fld1JVVIaL', qrSourceFieldId: 'flda85E6bz' }
];

const PAGE_SIZE = 10;

function toText(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'object' && val !== null) {
    // 处理数组类型
    if (Array.isArray(val)) {
      if (val.length === 0) return '';
      const first = val[0];
      if (typeof first === 'object' && first !== null && 'text' in first) {
        return String((first as any).text || '');
      }
      return String(first);
    }
    // 处理对象类型（如公式字段返回的对象）
    if ('text' in val) return String((val as any).text || '');
    if ('value' in val) return String((val as any).value || '');
  }
  return String(val);
}

function parseOptions(raw: unknown): string[] {
  const text = toText(raw);
  if (!text) return [];
  const matches = text.match(/[A-Za-z0-9]+/g);
  return matches ?? [];
}

// 字体加载：优先使用打包的本地字体，确保离线可用
let cachedChineseFont: Uint8Array | null = null;
const FONT_MAGIC_LIST = ['OTTO', 'true', 'typ1', 'wOFF', 'wOF2'];

function isValidFontBytes(bytes: Uint8Array): boolean {
  if (!bytes || bytes.length < 4) return false;
  const sigStr = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (FONT_MAGIC_LIST.includes(sigStr)) return true;
  const sigNum = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
  // TrueType: 0x00010000
  return sigNum === 0x00010000;
}

async function loadChineseFont(): Promise<Uint8Array | null> {
  console.log('[Font] 开始加载中文字体...');
  if (cachedChineseFont) {
    console.log('[Font] 使用缓存的字体, 大小:', cachedChineseFont.byteLength, 'bytes');
    return cachedChineseFont;
  }

  // 优先使用打包的本地字体（通过 Vite import 获取正确路径）
  console.log('[Font] 尝试加载打包的本地字体:', chineseFontUrl);
  try {
    const res = await fetch(chineseFontUrl);
    console.log('[Font] 响应状态:', res.status, res.statusText);
    if (res.ok) {
      const buffer = await res.arrayBuffer();
      console.log('[Font] 获取到 buffer, 大小:', buffer.byteLength, 'bytes');
      if (buffer && buffer.byteLength > 10000) {
        const bytes = new Uint8Array(buffer);
        if (!isValidFontBytes(bytes)) {
          console.error('[Font] 文件签名异常，疑似下载到 HTML/404，而非字体文件');
          return null;
        }
        cachedChineseFont = bytes;
        console.log('[Font] ✓ 本地字体加载成功');
        return cachedChineseFont;
      }
    }
  } catch (err) {
    console.warn('[Font] 本地字体加载失败:', err);
  }

  console.error('[Font] ✗ 字体加载失败');
  return null;
}

// 检测字符串是否包含中文
function containsChinese(str: string): boolean {
  return /[\u4e00-\u9fff]/.test(str);
}

// 根据正确答案位置生成样品标注
function getSampleLabels(options: string[], correct: string, sampleType: string): string[] {
  if (options.length !== 3) return ['?', '?', '?'];
  const testLabel = sampleType || '备选'; // 备选 或 工厂样品
  const correctIndex = options.findIndex((opt) => opt === correct);
  
  // 生成标注数组：正确位置是"标品"，其他是testLabel
  return options.map((_, idx) => (idx === correctIndex ? '标品' : testLabel));
}

async function fetchFieldValue(table: any, fieldId: string, recordId: string) {
  const field = await table.getField(fieldId);
  return field.getValue(recordId);
}

const App: React.FC = () => {
  // 表/视图/字段元数据
  const [tableId, setTableId] = useState<string>('');
  const [viewId, setViewId] = useState<string>('');
  const [primaryFieldId, setPrimaryFieldId] = useState<string>('');
  const [primaryFieldName, setPrimaryFieldName] = useState<string>('');

  // 记录列表
  const [allRecords, setAllRecords] = useState<RecordItem[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<RecordItem[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  // 选中的记录
  const [selectedRecordId, setSelectedRecordId] = useState<string>('');
  const [selectedRecordName, setSelectedRecordName] = useState<string>('');

  // 加载的数据
  const [testName, setTestName] = useState<string>('三点测试');
  const [testSampleType, setTestSampleType] = useState<string>('备选'); // 备选/工厂样品
  const [testSampleName, setTestSampleName] = useState<string>(''); // 测试样品名称
  const [groups, setGroups] = useState<LoadedGroup[]>([]);

  // 状态
  const [initLoading, setInitLoading] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [status, setStatus] = useState<string>('');

  // 计算分页数据
  const totalPages = useMemo(() => Math.ceil(filteredRecords.length / PAGE_SIZE), [filteredRecords]);
  const pagedRecords = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredRecords.slice(start, start + PAGE_SIZE);
  }, [filteredRecords, currentPage]);

  const hasLoaded = useMemo(() => groups.length > 0, [groups]);

  // 初始化：获取当前表、视图、字段元数据、记录列表
  useEffect(() => {
    const init = async () => {
      setInitLoading(true);
      setError('');
      try {
        // 获取当前活动表
        const table = await bitable.base.getActiveTable();
        const tId = table.id;
        setTableId(tId);

        // 获取当前视图
        const view = await table.getActiveView();
        const vId = view.id;
        setViewId(vId);

        // 获取字段元数据，找索引列
        const fieldMetaList: IFieldMeta[] = await table.getFieldMetaList();
        let primaryField = fieldMetaList.find((f) => f.isPrimary);
        if (!primaryField) {
          // 兜底：取第一个文本类型字段
          primaryField = fieldMetaList.find((f) => f.type === 1) || fieldMetaList[0];
        }
        setPrimaryFieldId(primaryField?.id || '');
        setPrimaryFieldName(primaryField?.name || '索引列');

        // 获取当前视图下的记录ID列表（保持视图顺序）
        const recordIdList = await view.getVisibleRecordIdList();
        
        if (!recordIdList || recordIdList.length === 0) {
          setAllRecords([]);
          setFilteredRecords([]);
          setInitLoading(false);
          return;
        }

        // 批量获取记录的索引列值
        const primaryFieldObj = await table.getField(primaryField!.id);
        const records: RecordItem[] = [];
        
        for (const recId of recordIdList) {
          if (!recId) continue;
          try {
            const val = await primaryFieldObj.getValue(recId);
            records.push({
              recordId: recId,
              primaryValue: toText(val) || recId
            });
          } catch {
            records.push({
              recordId: recId,
              primaryValue: recId
            });
          }
        }

        setAllRecords(records);
        setFilteredRecords(records);
      } catch (err) {
        console.error('初始化失败:', err);
        setError('初始化失败，请检查是否在多维表格环境中运行插件。');
      } finally {
        setInitLoading(false);
      }
    };

    init();

    // 监听选择变化（可选：当用户在表格中选择记录时自动选中）
    const off = bitable.base.onSelectionChange(async (event) => {
      // 可以在这里处理选择变化
    });

    return () => {
      off();
    };
  }, []);

  // 搜索过滤
  useEffect(() => {
    if (!searchKeyword.trim()) {
      setFilteredRecords(allRecords);
    } else {
      const keyword = searchKeyword.toLowerCase();
      const filtered = allRecords.filter((r) =>
        r.primaryValue.toLowerCase().includes(keyword)
      );
      setFilteredRecords(filtered);
    }
    setCurrentPage(1);
  }, [searchKeyword, allRecords]);

  // 选择记录
  const handleSelectRecord = useCallback((record: RecordItem) => {
    setSelectedRecordId(record.recordId);
    setSelectedRecordName(record.primaryValue);
    setGroups([]); // 清空已加载的数据
    setStatus('');
  }, []);

  // 加载选中记录的数据
  const loadRecord = async () => {
    if (!selectedRecordId) {
      setError('请先选择一条记录');
      return;
    }
    setError('');
    setStatus('正在读取数据...');
    setLoading(true);
    try {
      const table = await bitable.base.getTableById(tableId);

      // 获取测试名称（索引列值）
      if (primaryFieldId) {
        const nameVal = await fetchFieldValue(table, primaryFieldId, selectedRecordId);
        setTestName(toText(nameVal) || '三点测试');
      }

      // 获取测试样品类型（备选/工厂样品）
      let sampleType = '备选';
      try {
        const sampleTypeRaw = await fetchFieldValue(table, TEST_SAMPLE_TYPE_FIELD_ID, selectedRecordId);
        const sampleTypeText = toText(sampleTypeRaw);
        if (sampleTypeText) {
          sampleType = sampleTypeText;
        }
      } catch {
        // 字段不存在时使用默认值
      }
      setTestSampleType(sampleType);

      // 获取测试样品名称
      try {
        const sampleNameRaw = await fetchFieldValue(table, TEST_SAMPLE_NAME_FIELD_ID, selectedRecordId);
        setTestSampleName(toText(sampleNameRaw));
      } catch {
        setTestSampleName('');
      }

      const loaded: LoadedGroup[] = [];
      for (const cfg of GROUPS) {
        const optionsRaw = await fetchFieldValue(table, cfg.optionFieldId, selectedRecordId);
        const correctRaw = await fetchFieldValue(table, cfg.correctFieldId, selectedRecordId);
        const qrSourceRaw = await fetchFieldValue(table, cfg.qrSourceFieldId, selectedRecordId);

        const options = parseOptions(optionsRaw);
        const correct = toText(correctRaw);
        const qrSource = toText(qrSourceRaw);
        
        // 计算样品标注
        let sampleLabels = getSampleLabels(options, correct, sampleType);
        // B组与A组相反：标品与测试类型互换
        if (cfg.key.startsWith('B')) {
          sampleLabels = sampleLabels.map((label) =>
            label === '标品' ? sampleType : '标品'
          );
        }

        let qrDataUrl = '';
        if (qrSource) {
          try {
            qrDataUrl = await QRCode.toDataURL(qrSource, {
              errorCorrectionLevel: 'M',
              margin: 1,
              width: 128
            });
          } catch {
            qrDataUrl = '';
          }
        }

        loaded.push({
          ...cfg,
          options,
          correct,
          qrSource,
          qrDataUrl,
          sampleLabels
        });
      }
      setGroups(loaded);
      setStatus('读取完成，可生成 PDF');
    } catch (err) {
      console.error(err);
      setError('读取数据失败，请检查字段是否存在或记录是否有效。');
      setStatus('');
    } finally {
      setLoading(false);
    }
  };

  const buildPdf = async () => {
    console.log('[PDF] ===== 开始生成 PDF =====');
    console.log('[PDF] hasLoaded:', hasLoaded);
    console.log('[PDF] groups:', groups);
    console.log('[PDF] testName:', testName);
    console.log('[PDF] testSampleType:', testSampleType);
    console.log('[PDF] testSampleName:', testSampleName);

    if (!hasLoaded) {
      console.warn('[PDF] 数据未加载，终止生成');
      setError('请先读取记录数据');
      return;
    }
    setError('');
    setStatus('正在生成 PDF...');
    setLoading(true);

    try {
      console.log('[PDF] Step 1: 创建 PDFDocument...');
      const pdfDoc = await PDFDocument.create();
      console.log('[PDF] Step 1: PDFDocument 创建成功');

      console.log('[PDF] Step 2: 注册 fontkit...');
      pdfDoc.registerFontkit(fontkit);
      console.log('[PDF] Step 2: fontkit 注册成功');

      console.log('[PDF] Step 3: 加载中文字体...');
      setStatus('正在加载中文字体...');
      const chineseFontBytes = await loadChineseFont();
      console.log('[PDF] Step 3: 字体加载结果:', chineseFontBytes ? `成功 (${chineseFontBytes.byteLength} bytes)` : '失败');

      // 检测内容是否包含中文
      const allText = [testName, testSampleName, testSampleType, ...groups.flatMap(g => [g.correct, ...g.options])].join('');
      const hasChinese = containsChinese(allText);
      console.log('[PDF] Step 3: 内容包含中文:', hasChinese);

      // 如果内容包含中文但字体加载失败，直接报错
      if (hasChinese && !chineseFontBytes) {
        const errorMsg = '中文字体加载失败，无法生成包含中文的 PDF。\n\n解决方案：\n1. 检查网络连接\n2. 或将中文字体文件（如 NotoSansSC-Regular.otf）放到 public/fonts/ 目录';
        console.error('[PDF] ✗', errorMsg);
        setError(errorMsg);
        setStatus('');
        setLoading(false);
        return;
      }

      console.log('[PDF] Step 4: 嵌入字体...');
      setStatus('正在嵌入字体...');
      const font = chineseFontBytes
        ? await pdfDoc.embedFont(chineseFontBytes, { subset: true })
        : await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontIsChinese = Boolean(chineseFontBytes);
      console.log('[PDF] Step 4: 字体嵌入成功, fontIsChinese:', fontIsChinese);

      // 竖版 A4 尺寸
      const pageSize: [number, number] = [595, 842];
      const margin = 36;

      // ========== 第一页：摘要页（与前端数据预览一致） ==========
      console.log('[PDF] Step 5: 添加摘要页...');
      const summary = pdfDoc.addPage(pageSize);

      // 标题
      const titleSize = 16;
      const titleText = testName || '三点测试';
      console.log('[PDF] Step 5a: 绘制标题:', titleText);
      summary.drawText(titleText, {
        x: margin,
        y: pageSize[1] - margin - titleSize,
        size: titleSize,
        font,
        color: rgb(0.13, 0.45, 0.85) // 蓝色标题
      });

      // 生成时间
      const timeY = pageSize[1] - margin - titleSize - 16;
      console.log('[PDF] Step 5b: 绘制生成时间...');
      summary.drawText(`生成时间：${dayjs().format('YYYY/MM/DD HH:mm')}`, {
        x: margin,
        y: timeY,
        size: 9,
        font,
        color: rgb(0.5, 0.5, 0.5)
      });

      // 测试信息区域（测试名称、测试样品、测试类型）- 三栏均分
      const infoY = timeY - 32;
      const infoColWidth = (pageSize[0] - margin * 2) / 3;
      const labelColor = rgb(0.5, 0.5, 0.5);
      const valueColor = rgb(0.15, 0.15, 0.15);

      console.log('[PDF] Step 5c: 绘制测试信息...');
      // 测试名称
      summary.drawText('测试名称', { x: margin, y: infoY, size: 8, font, color: labelColor });
      summary.drawText(testName || '-', { x: margin, y: infoY - 16, size: 10, font, color: valueColor });
      // 测试样品
      summary.drawText('测试样品', { x: margin + infoColWidth, y: infoY, size: 8, font, color: labelColor });
      summary.drawText(testSampleName || '-', { x: margin + infoColWidth, y: infoY - 16, size: 10, font, color: valueColor });
      // 测试类型
      summary.drawText('测试类型', { x: margin + infoColWidth * 2, y: infoY, size: 8, font, color: labelColor });
      summary.drawText(testSampleType || '-', { x: margin + infoColWidth * 2, y: infoY - 16, size: 10, font, color: valueColor });

      // 表格区域
      const tableTop = infoY - 52;
      const tableWidth = pageSize[0] - margin * 2;
      const colKeyWidth = 50;
      const colCorrectWidth = 60;
      const colLayoutWidth = tableWidth - colKeyWidth - colCorrectWidth;
      const cellPadding = 10;
      const headerHeight = 32;
      const rowHeight = 64; // 每行高度（包含排布+标注两行，增加间距）

      // 表头背景
      console.log('[PDF] Step 5d: 绘制表头...');
      summary.drawRectangle({
        x: margin,
        y: tableTop - headerHeight,
        width: tableWidth,
        height: headerHeight,
        color: rgb(0.13, 0.45, 0.85) // 蓝色背景
      });

      // 表头文字（白色，各列居中）
      const headerTextY = tableTop - headerHeight + 10;
      // 组别表头居中
      const headerKey = '组别';
      const headerKeyWidth = font.widthOfTextAtSize(headerKey, 11);
      summary.drawText(headerKey, { x: margin + colKeyWidth / 2 - headerKeyWidth / 2, y: headerTextY, size: 11, font, color: rgb(1, 1, 1) });
      // 排布/标注表头居中
      const headerLayout = '排布 / 标注';
      const headerLayoutWidth = font.widthOfTextAtSize(headerLayout, 11);
      summary.drawText(headerLayout, { x: margin + colKeyWidth + colLayoutWidth / 2 - headerLayoutWidth / 2, y: headerTextY, size: 11, font, color: rgb(1, 1, 1) });
      // 正确表头居中
      const headerCorrect = '正确';
      const headerCorrectWidth = font.widthOfTextAtSize(headerCorrect, 11);
      summary.drawText(headerCorrect, { x: margin + colKeyWidth + colLayoutWidth + colCorrectWidth / 2 - headerCorrectWidth / 2, y: headerTextY, size: 11, font, color: rgb(1, 1, 1) });

      // 表格内容
      console.log('[PDF] Step 5e: 绘制各组数据...');
      let currentY = tableTop - headerHeight;
      const optionCellWidth = colLayoutWidth / 3;

      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        const rowTop = currentY;
        const rowBottom = currentY - rowHeight;

        // 交替行背景
        if (i % 2 === 1) {
          summary.drawRectangle({
            x: margin,
            y: rowBottom,
            width: tableWidth,
            height: rowHeight,
            color: rgb(0.975, 0.975, 0.975)
          });
        }

        // 行分隔线
        summary.drawLine({
          start: { x: margin, y: rowBottom },
          end: { x: margin + tableWidth, y: rowBottom },
          thickness: 0.5,
          color: rgb(0.88, 0.88, 0.88)
        });

        // 组别（蓝色，居中）
        const cellTextY = rowTop - 26;
        const keyWidth = font.widthOfTextAtSize(g.key, 12);
        summary.drawText(g.key, {
          x: margin + colKeyWidth / 2 - keyWidth / 2,
          y: cellTextY,
          size: 12,
          font,
          color: rgb(0.13, 0.45, 0.85)
        });

        // 排布选项（3列，居中对齐）
        for (let j = 0; j < 3; j++) {
          const optX = margin + colKeyWidth + j * optionCellWidth + optionCellWidth / 2;
          const optVal = g.options[j] || '-';
          const optWidth = font.widthOfTextAtSize(optVal, 12);
          summary.drawText(optVal, {
            x: optX - optWidth / 2,
            y: cellTextY,
            size: 12,
            font,
            color: rgb(0.15, 0.15, 0.15)
          });

          // 标注（在选项下方，增加间距）
          const labelVal = g.sampleLabels[j] || '';
          if (labelVal) {
            const isStandard = labelVal === '标品';
            const labelFontSize = 8;
            const labelWidth = font.widthOfTextAtSize(labelVal, labelFontSize);
            const labelBgWidth = labelWidth + 14;
            const labelBgHeight = 18;
            const labelBgX = optX - labelBgWidth / 2;
            const labelBgY = cellTextY - 26;

            // 标注背景（圆角效果用矩形模拟）
            summary.drawRectangle({
              x: labelBgX,
              y: labelBgY,
              width: labelBgWidth,
              height: labelBgHeight,
              color: isStandard ? rgb(0.88, 0.96, 0.90) : rgb(0.96, 0.96, 0.96),
              borderColor: isStandard ? rgb(0.35, 0.72, 0.45) : rgb(0.82, 0.82, 0.82),
              borderWidth: 0.8
            });

            // 标注文字（垂直居中）
            summary.drawText(labelVal, {
              x: optX - labelWidth / 2,
              y: labelBgY + 5,
              size: labelFontSize,
              font,
              color: isStandard ? rgb(0.18, 0.55, 0.28) : rgb(0.45, 0.45, 0.45)
            });
          }
        }

        // 正确答案（蓝色，居中）
        const correctVal = g.correct || '-';
        const correctWidth = font.widthOfTextAtSize(correctVal, 13);
        summary.drawText(correctVal, {
          x: margin + colKeyWidth + colLayoutWidth + colCorrectWidth / 2 - correctWidth / 2,
          y: cellTextY,
          size: 13,
          font,
          color: rgb(0.13, 0.45, 0.85)
        });

        currentY = rowBottom;
      }

      // 表格底部边框
      summary.drawLine({
        start: { x: margin, y: currentY },
        end: { x: margin + tableWidth, y: currentY },
        thickness: 0.5,
        color: rgb(0.88, 0.88, 0.88)
      });

      console.log('[PDF] Step 5: 摘要页完成');

      // ========== 第二页：二维码页（横版，8列×6行，每列一个组别，行间有裁剪间距） ==========
      console.log('[PDF] Step 6: 添加二维码页...');
      const qrPageSize: [number, number] = [842, 595]; // 横版 A4
      const qrPage = pdfDoc.addPage(qrPageSize);
      const qrMargin = 12;
      const qrCols = 8;
      const qrRows = groups.length; // 6行（6个组）
      const rowGap = 8; // 行间裁剪间距
      const totalRowGap = rowGap * (qrRows - 1); // 总间距
      const qrCellW = (qrPageSize[0] - qrMargin * 2) / qrCols;
      const qrCellH = (qrPageSize[1] - qrMargin * 2 - totalRowGap) / qrRows;
      const qrLabelSize = 8;
      const qrSize = Math.min(qrCellW - 6, qrCellH - 16);
      console.log('[PDF] Step 6: 二维码页参数 - cols:', qrCols, 'rows:', qrRows, 'cellW:', qrCellW, 'cellH:', qrCellH, 'qrSize:', qrSize);

      console.log('[PDF] Step 7: 生成二维码图片...');
      const qrImages = await Promise.all(
        groups.map(async (g) => {
          const text = g.qrSource || '缺少链接';
          console.log(`[PDF]   - 生成 ${g.key} 二维码, 内容长度: ${text.length}`);
          try {
            const dataUrl = await QRCode.toDataURL(text, {
              errorCorrectionLevel: 'M',
              margin: 1,
              width: 512
            });
            console.log(`[PDF]   - ${g.key} 二维码生成成功`);
            const image = await pdfDoc.embedPng(dataUrl);
            return { key: g.key, image };
          } catch (qrErr) {
            console.error(`[PDF]   - ${g.key} 二维码生成/嵌入失败:`, qrErr);
            throw qrErr;
          }
        })
      );
      console.log('[PDF] Step 7: 所有二维码图片生成完成, 共', qrImages.length, '个');

      console.log('[PDF] Step 8: 绘制二维码到页面（8列×6行，行间有间距）...');
      // 每行是一个组别，每列重复该组的二维码
      groups.forEach((g, rowIdx) => {
        const img = qrImages.find((i) => i.key === g.key)?.image;
        // 计算当前行的 Y 坐标（包含行间间距）
        const rowOffsetY = rowIdx * (qrCellH + rowGap);

        for (let col = 0; col < qrCols; col++) {
          const cellX = qrMargin + col * qrCellW;
          const cellY = qrPageSize[1] - qrMargin - rowOffsetY - qrCellH;

          // 二维码图片居中
          if (img) {
            const imgX = cellX + (qrCellW - qrSize) / 2;
            const imgY = cellY + (qrCellH - qrSize - 12) / 2 + 12;
            qrPage.drawImage(img, { x: imgX, y: imgY, width: qrSize, height: qrSize });
          }

          // 标签：只显示组别（居中）
          const label = g.key;
          const labelWidth = font.widthOfTextAtSize(label, qrLabelSize);
          const labelX = cellX + (qrCellW - labelWidth) / 2;
          qrPage.drawText(label, {
            x: labelX,
            y: cellY + 3,
            size: qrLabelSize,
            font,
            color: rgb(0.35, 0.35, 0.35)
          });
        }
      });
      console.log('[PDF] Step 8: 二维码绘制完成');

      console.log('[PDF] Step 9: 保存 PDF 文档...');
      const pdfBytes = await pdfDoc.save();
      console.log('[PDF] Step 9: PDF 保存成功, 大小:', pdfBytes.byteLength, 'bytes');

      const uint8Array = new Uint8Array(pdfBytes);
      const blob = new Blob([uint8Array], { type: 'application/pdf' });
      const fileName = `${testName || '三点测试'}_${dayjs().format('YYYYMMDD_HHmm')}.pdf`;
      console.log('[PDF] Step 10: 准备下载, 文件名:', fileName, 'Blob 大小:', blob.size);

      // 使用多种方式尝试下载，兼容不同环境
      try {
        // 方式1: 使用 navigator.msSaveOrOpenBlob (IE/Edge)
        if ((navigator as any).msSaveOrOpenBlob) {
          console.log('[PDF] Step 10: 使用 msSaveOrOpenBlob 下载...');
          (navigator as any).msSaveOrOpenBlob(blob, fileName);
        } else {
          // 方式2: 创建链接下载
          console.log('[PDF] Step 10: 使用 createObjectURL + click 下载...');
          const url = URL.createObjectURL(blob);
          console.log('[PDF] Step 10: ObjectURL:', url);
          const link = document.createElement('a');
          link.href = url;
          link.download = fileName;
          link.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
          document.body.appendChild(link);
          console.log('[PDF] Step 10: 触发 click...');

          // 触发点击
          link.click();
          console.log('[PDF] Step 10: click 已触发');

          // 清理
          setTimeout(() => {
            if (link.parentNode) {
              link.parentNode.removeChild(link);
            }
            URL.revokeObjectURL(url);
            console.log('[PDF] Step 10: 清理完成');
          }, 200);
        }
        console.log('[PDF] ===== PDF 生成并下载成功 =====');
        setStatus(
          fontIsChinese
            ? 'PDF 已生成并下载（已嵌入中文字体）'
            : 'PDF 已生成并下载（未加载到中文字体，中文可能显示异常）'
        );
      } catch (downloadErr) {
        console.error('[PDF] 下载方式失败，尝试新窗口打开:', downloadErr);
        // 方式3: 新窗口打开
        const url = URL.createObjectURL(blob);
        console.log('[PDF] Step 10: 使用 window.open 打开:', url);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        setStatus(
          fontIsChinese
            ? 'PDF 已生成，请在新窗口保存（已嵌入中文字体）'
            : 'PDF 已生成，请在新窗口保存（未加载到中文字体，中文可能显示异常）'
        );
      }
    } catch (err) {
      console.error('[PDF] ===== PDF 生成失败 =====');
      console.error('[PDF] 错误类型:', (err as Error)?.name);
      console.error('[PDF] 错误消息:', (err as Error)?.message);
      console.error('[PDF] 错误堆栈:', (err as Error)?.stack);
      console.error('[PDF] 完整错误对象:', err);
      setError('生成 PDF 失败，请检查字段数据或重试。');
      setStatus('');
    } finally {
      setLoading(false);
      console.log('[PDF] ===== buildPdf 执行结束 =====');
    }
  };

  // 翻页
  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  if (initLoading) {
    return (
      <div className="app">
        <div className="card">
          <div className="loading-container">
            <div className="spinner"></div>
            <p>正在加载记录列表...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* 记录选择区域 */}
      <div className="card">
        <h2>选择测试记录</h2>
        <p className="hint">
          索引列：<strong>{primaryFieldName}</strong> | 共 {allRecords.length} 条记录
        </p>

        {/* 搜索框 */}
        <div className="search-box">
          <input
            className="input search-input"
            placeholder={`搜索 ${primaryFieldName}...`}
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
          />
          {searchKeyword && (
            <button className="clear-btn" onClick={() => setSearchKeyword('')}>
              ✕
            </button>
          )}
        </div>

        {/* 记录列表 */}
        <div className="record-list">
          {pagedRecords.length === 0 ? (
            <div className="empty-state">
              {searchKeyword ? '没有匹配的记录' : '当前视图没有记录'}
            </div>
          ) : (
            pagedRecords.map((record, idx) => (
              <div
                key={record.recordId}
                className={`record-item ${selectedRecordId === record.recordId ? 'selected' : ''}`}
                onClick={() => handleSelectRecord(record)}
              >
                <span className="record-index">{(currentPage - 1) * PAGE_SIZE + idx + 1}</span>
                <span className="record-name" title={record.primaryValue}>
                  {record.primaryValue || '(空)'}
                </span>
                {selectedRecordId === record.recordId && <span className="check-icon">✓</span>}
              </div>
            ))
          )}
        </div>

        {/* 分页控制 */}
        {totalPages > 1 && (
          <div className="pagination">
            <button
              className="page-btn"
              disabled={currentPage === 1}
              onClick={() => goToPage(currentPage - 1)}
            >
              ‹ 上一页
            </button>
            <span className="page-info">
              {currentPage} / {totalPages}
            </span>
            <button
              className="page-btn"
              disabled={currentPage === totalPages}
              onClick={() => goToPage(currentPage + 1)}
            >
              下一页 ›
            </button>
          </div>
        )}
      </div>

      {/* 操作区域 */}
      <div className="card">
        <h3>当前选择</h3>
        {selectedRecordId ? (
          <div className="selected-info">
            <span className="tag selected-tag">{selectedRecordName || selectedRecordId}</span>
          </div>
        ) : (
          <p className="hint">请从上方列表选择一条记录</p>
        )}

        <div className="row" style={{ marginTop: 12 }}>
          <button
            className="button"
            onClick={loadRecord}
            disabled={!selectedRecordId || loading}
          >
            读取数据
          </button>
          <button
            className="button secondary"
            onClick={buildPdf}
            disabled={!hasLoaded || loading}
          >
            生成 PDF
          </button>
        </div>

        {status && <p className="status" style={{ marginTop: 8 }}>{status}</p>}
        {error && <p className="error">{error}</p>}
      </div>

      {/* 数据预览 */}
      <div className="card">
        <h3>数据预览</h3>
        {hasLoaded ? (
          <>
            <div className="preview-meta">
              <span className="meta-item">
                <span className="meta-label">测试名称</span>
                <span className="meta-value">{testName || '未取到'}</span>
              </span>
              <span className="meta-item">
                <span className="meta-label">测试样品</span>
                <span className="meta-value">{testSampleName || '-'}</span>
              </span>
              <span className="meta-item">
                <span className="meta-label">测试类型</span>
                <span className="meta-value">{testSampleType}</span>
              </span>
            </div>
            <div className="preview-table">
              <div className="preview-table-header">
                <span className="col-key">组别</span>
                <span className="col-layout">排布 / 标注</span>
                <span className="col-correct">正确</span>
              </div>
              {groups.map((g) => (
                <div key={g.key} className="preview-table-row">
                  <span className="col-key">{g.key}</span>
                  <span className="col-layout">
                    <div className="layout-values">
                      {g.options.map((opt, idx) => (
                        <span key={idx} className="layout-cell">
                          {opt || '-'}
                        </span>
                      ))}
                    </div>
                    <div className="layout-labels">
                      {g.sampleLabels.map((label, idx) => (
                        <span key={idx} className={`sample-label ${label === '标品' ? 'is-standard' : ''}`}>
                          {label}
                        </span>
                      ))}
                    </div>
                  </span>
                  <span className="col-correct">{g.correct || '-'}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="hint">选择记录并点击"读取数据"后显示预览</p>
        )}
      </div>
    </div>
  );
};

export default App;
