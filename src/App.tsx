import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { bitable, IFieldMeta, PermissionEntity, OperationType } from '@lark-base-open/js-sdk';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';
import dayjs from 'dayjs';
// 使用完整的 Arial Unicode 字体（包含全部中文字符）
import chineseFontUrl from './assets/ArialUnicode.ttf?url';
import {
  GroupKey,
  GroupConfig,
  DEFAULT_GROUPS,
  mergeGroupConfigs,
  loadConfigFromTable,
  saveConfigToTable,
  DEFAULT_IDS
} from './configEditor';

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
const PDF_TABLE_ID = 'tblZSyNrU9rdiX0R';
const PDF_VIEW_ID = 'vewbZ8zNey';

// 统计模式：字段映射将从配置表读取（带默认值）
const STAT_CORRECT_FIELD_MAP_KEYS: Record<GroupKey, string> = {
  A1: 'STAT_CORRECT_A1',
  A2: 'STAT_CORRECT_A2',
  A3: 'STAT_CORRECT_A3',
  B1: 'STAT_CORRECT_B1',
  B2: 'STAT_CORRECT_B2',
  B3: 'STAT_CORRECT_B3'
};

interface RecordItem {
  recordId: string;
  primaryValue: string;
}

interface StatRecord {
  recordId: string;
  testName: string;
  groupKey: GroupKey;
  answer: string;
  correct: string;
  modifier?: string;
  feedback?: string;
  updatedAt?: number;
  createdAt?: number;
}

const BASE_GROUPS: GroupConfig[] = DEFAULT_GROUPS;

const PAGE_SIZE = 10;

const TEST_TYPE_RULES: Record<string, { groupSize: number; alpha: number; name: string; p: number }> = {
  // 备选测试按表 A.2（Pd=30%）取相似判定值，这里给定 p=0.2 近似，关键阈值使用表值覆盖
  备选测试: { groupSize: 7, alpha: 0.05, name: '备选测试 (α=0.05)', p: 0.2 },
  // 工厂样品按差异检出（p≈1/3）
  工厂样品: { groupSize: 6, alpha: 0.1, name: '工厂样品 (α=0.10)', p: 1 / 3 }
};

// 工厂样品（差异检验）阈值：≤36 固定 18；37~54 按表 1 的 x_min
const FACTORY_MIN_N = 36;
const FACTORY_MAX_N = 54;
const FACTORY_BASE_THRESHOLD = 18;
const FACTORY_DIFF_THRESHOLD_TABLE: Record<number, number> = {
  37: 18,
  38: 18,
  39: 18,
  40: 19,
  41: 19,
  42: 20,
  43: 20,
  44: 20,
  45: 21,
  46: 21,
  47: 21,
  48: 22,
  49: 22,
  50: 23,
  51: 23,
  52: 23,
  53: 24,
  54: 24
};

// 备选测试（相似检验）阈值：≤42 最大允许正确数 16（显著阈值 17）；43~54 按表 2 的 x_max
const ALT_MIN_N = 42;
const ALT_MAX_N = 54;
const ALT_BASE_MAX_ALLOWED = 16; // 显著阈值 = 17
const ALT_SIMILARITY_MAX_TABLE: Record<number, number> = {
  43: 17,
  44: 18,
  45: 18,
  46: 19,
  47: 19,
  48: 20,
  49: 20,
  50: 20,
  51: 21,
  52: 21,
  53: 22,
  54: 22
};

const DEFAULT_STAT_TEST_TYPE = '备选测试';

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

// 解析单选题选项名称
function parseSelectOptionName(val: unknown): string {
  if (val == null) return '';
  if (Array.isArray(val) && val.length > 0) {
    const first = val[0] as any;
    if (first && typeof first === 'object') {
      return String(first.name || first.text || first.value || '');
    }
  }
  if (typeof val === 'object' && 'name' in (val as any)) {
    return String((val as any).name || '');
  }
  return toText(val);
}

// 解析用户/多维引用中的填表人
function parseUserName(val: unknown): string {
  if (val == null) return '';
  const pickName = (obj: any) =>
    obj?.name || obj?.enName || obj?.en_name || obj?.text || obj?.value || '';
  if (Array.isArray(val) && val.length > 0) {
    const first = val[0];
    if (first && typeof first === 'object') {
      return String(pickName(first) || '');
    }
    return toText(first);
  }
  if (typeof val === 'object') {
    return String(pickName(val) || toText(val));
  }
  return toText(val);
}

function toTimestamp(val: unknown): number {
  const text = toText(val);
  if (!text) return 0;
  const t = Date.parse(text);
  return Number.isFinite(t) ? t : 0;
}

// 计算二项分布尾概率，求显著性阈值（α=0.05, p=0.3 对应 Pd=30%）
function binomProb(n: number, k: number, p: number): number {
  if (k < 0 || k > n) return 0;
  if (p <= 0 || p >= 1) return k === (p >= 1 ? n : 0) ? 1 : 0;
  // 使用对数组合数避免溢出
  let logComb = 0;
  const m = Math.min(k, n - k);
  for (let i = 1; i <= m; i++) {
    logComb += Math.log(n - m + i) - Math.log(i);
  }
  const logProb = logComb + k * Math.log(p) + (n - k) * Math.log(1 - p);
  return Math.exp(logProb);
}

function binomTail(n: number, k: number, p: number): number {
  let sum = 0;
  for (let i = k; i <= n; i++) {
    sum += binomProb(n, i, p);
  }
  return sum;
}

function getSignificanceThreshold(n: number, alpha = 0.05, p = 0.3): number {
  if (n <= 0) return 0;
  for (let k = 0; k <= n; k++) {
    const tail = binomTail(n, k, p);
    if (tail <= alpha) return k;
  }
  return n + 1; // 理论上不应该到达这里
}

function clampSampleSize(n: number, minN: number, maxN: number): number {
  if (n <= minN) return minN;
  if (n >= maxN) return maxN;
  return n;
}

// 按测试类型获取显著性阈值（正确数达到该值即判定存在显著差异）
function getThresholdByType(statTestType: string, sampleSize: number): number {
  if (statTestType === '工厂样品') {
    const n = clampSampleSize(sampleSize, FACTORY_MIN_N, FACTORY_MAX_N);
    if (n <= FACTORY_MIN_N) return FACTORY_BASE_THRESHOLD;
    const tableVal = FACTORY_DIFF_THRESHOLD_TABLE[n];
    return tableVal ?? FACTORY_DIFF_THRESHOLD_TABLE[FACTORY_MAX_N] ?? FACTORY_BASE_THRESHOLD;
  }

  // 默认按备选测试相似判定
  const n = clampSampleSize(sampleSize, ALT_MIN_N, ALT_MAX_N);
  if (n <= ALT_MIN_N) return ALT_BASE_MAX_ALLOWED + 1; // 17
  const xMax = ALT_SIMILARITY_MAX_TABLE[n];
  return (xMax ?? ALT_SIMILARITY_MAX_TABLE[ALT_MAX_N] ?? ALT_BASE_MAX_ALLOWED) + 1;
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
  // 模式
  const [mode, setMode] = useState<'pdf' | 'stat' | 'config'>('pdf');
  const [groupConfigs, setGroupConfigs] = useState<GroupConfig[]>(BASE_GROUPS);
  const [configStatus, setConfigStatus] = useState<string>('');
  const [configMap, setConfigMap] = useState<Record<string, string>>({});
  const [configTableId, setConfigTableId] = useState<string>('');
  const [configLoading, setConfigLoading] = useState<boolean>(true);
  const [configError, setConfigError] = useState<string>('');
  const [configDraft, setConfigDraft] = useState<Record<string, string>>({});
  const [tableList, setTableList] = useState<{ id: string; name: string }[]>([]);
  const [fieldMap, setFieldMap] = useState<Record<string, { id: string; name: string }[]>>({});
  const [viewMap, setViewMap] = useState<Record<string, { id: string; name: string }[]>>({});

  const defaultConfigMap = useMemo(() => {
    const map: Record<string, string> = {
      ...DEFAULT_IDS
    };
    BASE_GROUPS.forEach((g) => {
      map[`${g.key}_optionFieldId`] = g.optionFieldId;
      map[`${g.key}_correctFieldId`] = g.correctFieldId;
      map[`${g.key}_qrSourceFieldId`] = g.qrSourceFieldId;
    });
    // 统计表的正确答案字段使用 DEFAULT_IDS 中的配置（统计表的引用字段）
    // 如果 DEFAULT_IDS 中没有配置，则不设置默认值（需要用户手动选择）
    return map;
  }, []);

  const configMeta = useMemo(() => {
    const items: {
      key: string;
      label: string;
      category: string;
      type: 'table' | 'view' | 'field' | 'text';
      tableKey?: string;
      desc?: string;
      order?: number; // 排序
    }[] = [
      // ===== 1. PDF模式（三点测试表） =====
      { key: 'PDF_TABLE_ID', label: '三点测试表', category: '1. PDF模式 - 表/视图', type: 'table', order: 1 },
      { key: 'PDF_VIEW_ID', label: '视图', category: '1. PDF模式 - 表/视图', type: 'view', tableKey: 'PDF_TABLE_ID', order: 2 },
      { key: 'TEST_SAMPLE_TYPE_FIELD_ID', label: '测试类型字段', category: '1. PDF模式 - 基础字段', type: 'field', tableKey: 'PDF_TABLE_ID', order: 3 },
      { key: 'TEST_SAMPLE_NAME_FIELD_ID', label: '测试样品名称字段', category: '1. PDF模式 - 基础字段', type: 'field', tableKey: 'PDF_TABLE_ID', order: 4 },
      
      // ===== 2. 六组字段（PDF表中的A1-B3字段） =====
      // 在下面的 forEach 中添加
      
      // ===== 3. 统计模式（问卷结果表） =====
      { key: 'STAT_TABLE_ID', label: '问卷结果表', category: '3. 统计模式 - 表/视图', type: 'table', order: 100 },
      { key: 'STAT_VIEW_ID', label: '视图', category: '3. 统计模式 - 表/视图', type: 'view', tableKey: 'STAT_TABLE_ID', order: 101 },
      { key: 'STAT_LINK_FIELD_ID', label: '关联测试名称', category: '3. 统计模式 - 基础字段', type: 'field', tableKey: 'STAT_TABLE_ID', order: 102 },
      { key: 'STAT_GROUP_FIELD_ID', label: '组别', category: '3. 统计模式 - 基础字段', type: 'field', tableKey: 'STAT_TABLE_ID', order: 103 },
      { key: 'STAT_ANSWER_FIELD_ID', label: '问卷结果', category: '3. 统计模式 - 基础字段', type: 'field', tableKey: 'STAT_TABLE_ID', order: 104 },
      { key: 'STAT_FEEDBACK_FIELD_ID', label: '评价', category: '3. 统计模式 - 基础字段', type: 'field', tableKey: 'STAT_TABLE_ID', order: 105 },
      { key: 'STAT_CREATED_AT_FIELD_ID', label: '创建日期', category: '3. 统计模式 - 基础字段', type: 'field', tableKey: 'STAT_TABLE_ID', order: 106 },
      { key: 'STAT_MODIFIER_FIELD_ID', label: '修改人', category: '3. 统计模式 - 基础字段', type: 'field', tableKey: 'STAT_TABLE_ID', order: 107 },
      // 统计表中的正确答案引用字段
      { key: 'STAT_CORRECT_A1', label: 'A1 正确答案', category: '3. 统计模式 - 正确答案字段', type: 'field', tableKey: 'STAT_TABLE_ID', order: 110 },
      { key: 'STAT_CORRECT_A2', label: 'A2 正确答案', category: '3. 统计模式 - 正确答案字段', type: 'field', tableKey: 'STAT_TABLE_ID', order: 111 },
      { key: 'STAT_CORRECT_A3', label: 'A3 正确答案', category: '3. 统计模式 - 正确答案字段', type: 'field', tableKey: 'STAT_TABLE_ID', order: 112 },
      { key: 'STAT_CORRECT_B1', label: 'B1 正确答案', category: '3. 统计模式 - 正确答案字段', type: 'field', tableKey: 'STAT_TABLE_ID', order: 113 },
      { key: 'STAT_CORRECT_B2', label: 'B2 正确答案', category: '3. 统计模式 - 正确答案字段', type: 'field', tableKey: 'STAT_TABLE_ID', order: 114 },
      { key: 'STAT_CORRECT_B3', label: 'B3 正确答案', category: '3. 统计模式 - 正确答案字段', type: 'field', tableKey: 'STAT_TABLE_ID', order: 115 },
      
      // ===== 4. 报告写入 =====
      { key: 'REPORT_TABLE_ID', label: '报告表', category: '4. 报告写入', type: 'table', order: 200 },
      { key: 'REPORT_FIELD_ID', label: '报告字段', category: '4. 报告写入', type: 'field', tableKey: 'REPORT_TABLE_ID', order: 201 },
      { key: 'REPORT_RECORD_ID_DEFAULT', label: '默认记录 ID', category: '4. 报告写入', type: 'text', order: 202 }
    ];
    // 六组字段（PDF表）
    BASE_GROUPS.forEach((g, idx) => {
      const baseOrder = 10 + idx * 10;
      items.push(
        { key: `${g.key}_optionFieldId`, label: `${g.key} 选项`, category: '2. PDF模式 - 六组字段', type: 'field', tableKey: 'PDF_TABLE_ID', order: baseOrder },
        { key: `${g.key}_correctFieldId`, label: `${g.key} 正确答案`, category: '2. PDF模式 - 六组字段', type: 'field', tableKey: 'PDF_TABLE_ID', order: baseOrder + 1 },
        { key: `${g.key}_qrSourceFieldId`, label: `${g.key} 二维码`, category: '2. PDF模式 - 六组字段', type: 'field', tableKey: 'PDF_TABLE_ID', order: baseOrder + 2 }
      );
    });
    // 按 order 排序
    items.sort((a, b) => (a.order || 0) - (b.order || 0));
    return items;
  }, []);

  const getCfg = useCallback(
    (key: string, fallback: string) => {
      // 空字符串也视为无效值，回退到默认
      const draft = configDraft[key];
      const saved = configMap[key];
      const def = defaultConfigMap[key];
      if (draft && draft.trim()) return draft;
      if (saved && saved.trim()) return saved;
      if (def && def.trim()) return def;
      return fallback;
    },
    [configMap, configDraft, defaultConfigMap]
  );

  const pdfTableId = getCfg('PDF_TABLE_ID', DEFAULT_IDS.PDF_TABLE_ID);
  const pdfViewId = getCfg('PDF_VIEW_ID', DEFAULT_IDS.PDF_VIEW_ID);
  const testSampleTypeFieldId = getCfg('TEST_SAMPLE_TYPE_FIELD_ID', DEFAULT_IDS.TEST_SAMPLE_TYPE_FIELD_ID);
  const testSampleNameFieldId = getCfg('TEST_SAMPLE_NAME_FIELD_ID', DEFAULT_IDS.TEST_SAMPLE_NAME_FIELD_ID);

  const statTableId = getCfg('STAT_TABLE_ID', DEFAULT_IDS.STAT_TABLE_ID);
  const statViewId = getCfg('STAT_VIEW_ID', DEFAULT_IDS.STAT_VIEW_ID);
  const statLinkFieldId = getCfg('STAT_LINK_FIELD_ID', DEFAULT_IDS.STAT_LINK_FIELD_ID);
  const statGroupFieldId = getCfg('STAT_GROUP_FIELD_ID', DEFAULT_IDS.STAT_GROUP_FIELD_ID);
  const statAnswerFieldId = getCfg('STAT_ANSWER_FIELD_ID', DEFAULT_IDS.STAT_ANSWER_FIELD_ID);
  const statFeedbackFieldId = getCfg('STAT_FEEDBACK_FIELD_ID', DEFAULT_IDS.STAT_FEEDBACK_FIELD_ID);
  const statModifierFieldId = getCfg('STAT_MODIFIER_FIELD_ID', DEFAULT_IDS.STAT_MODIFIER_FIELD_ID);
  const statCreatedAtFieldId = getCfg('STAT_CREATED_AT_FIELD_ID', DEFAULT_IDS.STAT_CREATED_AT_FIELD_ID);

  const statCorrectFieldMap = useMemo(() => {
    const map: Record<GroupKey, string> = {
      A1: getCfg(STAT_CORRECT_FIELD_MAP_KEYS.A1, DEFAULT_GROUPS[0].correctFieldId),
      A2: getCfg(STAT_CORRECT_FIELD_MAP_KEYS.A2, DEFAULT_GROUPS[1].correctFieldId),
      A3: getCfg(STAT_CORRECT_FIELD_MAP_KEYS.A3, DEFAULT_GROUPS[2].correctFieldId),
      B1: getCfg(STAT_CORRECT_FIELD_MAP_KEYS.B1, DEFAULT_GROUPS[3].correctFieldId),
      B2: getCfg(STAT_CORRECT_FIELD_MAP_KEYS.B2, DEFAULT_GROUPS[4].correctFieldId),
      B3: getCfg(STAT_CORRECT_FIELD_MAP_KEYS.B3, DEFAULT_GROUPS[5].correctFieldId)
    };
    return map;
  }, [getCfg]);

  const reportTableId = getCfg('REPORT_TABLE_ID', DEFAULT_IDS.REPORT_TABLE_ID);
  const reportFieldId = getCfg('REPORT_FIELD_ID', DEFAULT_IDS.REPORT_FIELD_ID);
  const reportRecordIdDefault = getCfg('REPORT_RECORD_ID_DEFAULT', DEFAULT_IDS.REPORT_RECORD_ID_DEFAULT);

  // 加载配置表（先用默认配置，异步加载配置表）
  useEffect(() => {
    // 立即使用默认配置，不阻塞渲染
    setConfigLoading(false);
    setGroupConfigs(BASE_GROUPS);
    setConfigStatus('使用默认配置');
    
    // 异步加载配置表
    const loadConfig = async () => {
      try {
        const { config, tableId } = await loadConfigFromTable();
        // 只有当配置表有实际内容时才更新
        if (Object.keys(config).length > 0) {
          setConfigTableId(tableId);
          setConfigMap(config);
          setConfigDraft(config);
          setGroupConfigs(mergeGroupConfigs(BASE_GROUPS, config));
          setConfigStatus(`配置表已加载 (ID: ${tableId})`);
        }
      } catch (err) {
        console.error('[config] 加载失败', err);
        // 失败时保持默认配置，不显示错误（因为默认配置已经在用了）
        setConfigStatus('使用默认配置（配置表加载失败）');
      }
    };
    loadConfig();
  }, []);

  useEffect(() => {
    setGroupConfigs(mergeGroupConfigs(BASE_GROUPS, configMap));
  }, [configMap]);

  // 辅助函数：获取表名
  const getTableName = async (table: any): Promise<string> => {
    try {
      // 方法1: 直接属性
      if (table.name) return table.name;
      // 方法2: getName() 方法
      if (typeof table.getName === 'function') {
        const name = await table.getName();
        if (name) return name;
      }
      // 方法3: getMeta() 方法
      if (typeof table.getMeta === 'function') {
        const meta = await table.getMeta();
        if (meta?.name) return meta.name;
      }
    } catch (e) {
      console.warn('[meta] getTableName failed:', e);
    }
    return '';
  };

  // 辅助函数：获取视图名
  const getViewName = async (view: any): Promise<string> => {
    try {
      if (view.name) return view.name;
      if (typeof view.getName === 'function') {
        const name = await view.getName();
        if (name) return name;
      }
      if (typeof view.getMeta === 'function') {
        const meta = await view.getMeta();
        if (meta?.name) return meta.name;
      }
    } catch (e) {
      console.warn('[meta] getViewName failed:', e);
    }
    return '';
  };

  // 加载表/字段/视图列表（仅在配置模式时加载，且只加载一次）
  const [metaLoaded, setMetaLoaded] = useState(false);
  useEffect(() => {
    // 只在配置模式且尚未加载时才加载元数据
    if (mode !== 'config' || metaLoaded) return;
    
    const loadMeta = async () => {
      try {
        const tables = await bitable.base.getTableList();
        const tableMeta: { id: string; name: string }[] = [];
        
        // 并行获取所有表名
        await Promise.all(tables.map(async (t) => {
          try {
            const fullTable = await bitable.base.getTableById(t.id);
            const name = await getTableName(fullTable);
            tableMeta.push({ id: t.id, name: name || t.id });
          } catch {
            tableMeta.push({ id: t.id, name: t.id });
          }
        }));
        setTableList(tableMeta);

        const fMap: Record<string, { id: string; name: string }[]> = {};
        const vMap: Record<string, { id: string; name: string }[]> = {};
        
        // 并行获取所有表的字段和视图
        await Promise.all(tables.map(async (t) => {
          try {
            const table = await bitable.base.getTableById(t.id);
            const fields = await table.getFieldMetaList();
            fMap[t.id] = fields.map((f) => ({ id: f.id, name: f.name }));
            const views = await table.getViewList();
            const viewMeta: { id: string; name: string }[] = [];
            await Promise.all(views.map(async (v: any) => {
              const vName = await getViewName(v);
              viewMeta.push({ id: v.id, name: vName || v.id });
            }));
            vMap[t.id] = viewMeta;
          } catch (e) {
            console.warn('[config] load meta failed', t.id, e);
          }
        }));
        
        setFieldMap(fMap);
        setViewMap(vMap);
        setMetaLoaded(true);
      } catch (e) {
        console.warn('[config] load table list failed', e);
      }
    };
    loadMeta();
  }, [mode, metaLoaded]);
  // 表/视图/字段元数据（PDF模式）
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
  const [recordListLoading, setRecordListLoading] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [status, setStatus] = useState<string>('');

  // 统计模式状态
  const [statRecords, setStatRecords] = useState<StatRecord[]>([]);
  const [selectedTestName, setSelectedTestName] = useState<string>('');
  const [statTestType, setStatTestType] = useState<string>(DEFAULT_STAT_TEST_TYPE);
  const [statSampleName, setStatSampleName] = useState<string>('');
  const [statGroupSize, setStatGroupSize] = useState<number>(6);
  const [statReportMd, setStatReportMd] = useState<string>('');
  const [statLoading, setStatLoading] = useState<boolean>(false);
  const [statError, setStatError] = useState<string>('');
  const [statStatus, setStatStatus] = useState<string>('');
  const [statWriteRecordId, setStatWriteRecordId] = useState<string>('');
  const [statTestSearch, setStatTestSearch] = useState<string>('');

  // 计算分页数据
  const totalPages = useMemo(() => Math.ceil(filteredRecords.length / PAGE_SIZE), [filteredRecords]);
  const pagedRecords = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredRecords.slice(start, start + PAGE_SIZE);
  }, [filteredRecords, currentPage]);

  const hasLoaded = useMemo(() => groups.length > 0, [groups]);

  const availableTestNames = useMemo(() => {
    const map: Record<string, number> = {};
    statRecords.forEach((r) => {
      if (!r.testName) return;
      const ts = r.updatedAt ?? r.createdAt ?? 0;
      if (!(r.testName in map) || ts > map[r.testName]) {
        map[r.testName] = ts;
      }
    });
    let list = Object.entries(map)
      .map(([name, ts]) => ({ name, ts }))
      .sort((a, b) => b.ts - a.ts)
      .map((i) => i.name);
    if (statTestSearch.trim()) {
      const keyword = statTestSearch.toLowerCase();
      list = list.filter((n) => n.toLowerCase().includes(keyword));
    }
    return list;
  }, [statRecords, statTestSearch]);

  const selectedStatRecords = useMemo(() => {
    if (!selectedTestName) return statRecords;
    return statRecords.filter((r) => r.testName === selectedTestName);
  }, [statRecords, selectedTestName]);

  const fetchSampleNameByTest = useCallback(
    async (testName: string) => {
      if (!testName) return;
      const tableId = pdfTableId;
      const viewId = pdfViewId;
      const primaryFieldIdVal = primaryFieldId;
      const sampleFieldIdVal = testSampleNameFieldId;
      if (!tableId || !viewId || !primaryFieldIdVal || !sampleFieldIdVal) return;
      const tableIdSafe = tableId as string;
      const viewIdSafe = viewId as string;
      const primaryFieldIdSafe = primaryFieldIdVal!;
      const sampleFieldIdSafe = sampleFieldIdVal!;
      try {
        const table = await bitable.base.getTableById(tableIdSafe);
        const view = await table.getViewById(viewIdSafe);
        const recordIds = await view.getVisibleRecordIdList();
        const primaryField = await table.getField(primaryFieldIdSafe);
        const sampleField = await table.getField(sampleFieldIdSafe);
        for (const rid of recordIds) {
          if (!rid) continue;
          try {
            const nameRaw = await primaryField.getValue(rid);
            const nameText = toText(nameRaw);
            if (nameText === testName) {
              const sampleRaw = await sampleField.getValue(rid);
              setStatSampleName(toText(sampleRaw));
              return;
            }
          } catch {
            // ignore single record error
          }
        }
      } catch {
        // ignore load error
      }
    },
    [bitable, pdfTableId, pdfViewId, primaryFieldId, testSampleNameFieldId]
  );

  // 当可选测试名称列表变化时，确保选中项有效
  useEffect(() => {
    if (availableTestNames.length === 0) return;
    if (!selectedTestName || !availableTestNames.includes(selectedTestName)) {
      setSelectedTestName(availableTestNames[0]);
    }
  }, [availableTestNames, selectedTestName]);

  useEffect(() => {
    if (selectedTestName) {
      fetchSampleNameByTest(selectedTestName);
    } else {
      setStatSampleName('');
    }
  }, [selectedTestName, fetchSampleNameByTest]);

  // 根据测试类型自动设定每组人数
  useEffect(() => {
    const rule = TEST_TYPE_RULES[statTestType];
    if (rule) {
      setStatGroupSize((prev) => Math.max(prev, rule.groupSize));
    }
  }, [statTestType, statGroupSize]);

  const effectiveStatGroupSize = useMemo(() => {
    const rule = TEST_TYPE_RULES[statTestType];
    const minSize = rule?.groupSize ?? 0;
    return Math.max(statGroupSize, minSize);
  }, [statGroupSize, statTestType]);

  const currentAlpha = useMemo(() => {
    const rule = TEST_TYPE_RULES[statTestType];
    return rule?.alpha ?? 0.05;
  }, [statTestType]);

  const statSummary = useMemo(() => {
    const perGroup: Record<GroupKey, { total: number; correct: number }> = {
      A1: { total: 0, correct: 0 },
      A2: { total: 0, correct: 0 },
      A3: { total: 0, correct: 0 },
      B1: { total: 0, correct: 0 },
      B2: { total: 0, correct: 0 },
      B3: { total: 0, correct: 0 }
    };
    selectedStatRecords.forEach((r) => {
      perGroup[r.groupKey].total += 1;
      if (r.answer === r.correct) perGroup[r.groupKey].correct += 1;
    });
    return {
      total: selectedStatRecords.length,
      perGroup
    };
  }, [selectedStatRecords]);

  // 统计模式：样本量校验（期望每组人数 * 6 组）
  const statExpectedTotal = useMemo(
    () => Math.max(0, effectiveStatGroupSize) * 6,
    [effectiveStatGroupSize]
  );
  const statCountWarning = useMemo(() => {
    if (statExpectedTotal <= 0) return '';
    if (statSummary.total !== statExpectedTotal) {
      const shortage = statSummary.total < statExpectedTotal;
      const base = `问卷数量 ${statSummary.total} 与模板预期样本量（每组 ${effectiveStatGroupSize} 人 × 6 组 = ${statExpectedTotal} 份）不一致`;
      return shortage
        ? `${base}，数量不足将无法通过，请补足问卷。`
        : `${base}，如已调整抽样计划，请同步更新「每组人数」，避免人数校验不通过。`;
    }
    return '';
  }, [statSummary.total, statExpectedTotal, effectiveStatGroupSize]);

  useEffect(() => {
    if (!statWriteRecordId) {
      setStatWriteRecordId(reportRecordIdDefault);
    }
  }, [reportRecordIdDefault, statWriteRecordId]);

  // 加载记录列表，可用于初始化或手动刷新
  const fetchRecordList = useCallback(
    async (isInitial = false) => {
      if (isInitial) {
        setInitLoading(true);
      } else {
        setRecordListLoading(true);
      }
      setError('');
      try {
        const table = await bitable.base.getTableById(pdfTableId);
        setTableId(pdfTableId);

        // 固定视图，失败则回退 active view
        let view = null as any;
        try {
          view = await table.getViewById(pdfViewId);
          setViewId(pdfViewId);
        } catch {
          view = await table.getActiveView();
          setViewId(view.id);
        }

        // 获取字段元数据，找索引列
        const fieldMetaList: IFieldMeta[] = await table.getFieldMetaList();
        let primaryField = fieldMetaList.find((f) => f.isPrimary);
        if (!primaryField) {
          // 兜底：取第一个文本类型字段
          primaryField = fieldMetaList.find((f) => f.type === 1) || fieldMetaList[0];
        }
        setPrimaryFieldId(primaryField?.id || '');
        setPrimaryFieldName(primaryField?.name || '索引列');

        // 获取视图下的记录ID列表（保持视图顺序）
        const recordIdList = await view.getVisibleRecordIdList();
        
        if (!recordIdList || recordIdList.length === 0) {
          setAllRecords([]);
          setFilteredRecords([]);
          setStatus(isInitial ? '' : '当前视图没有记录');
          setSelectedRecordId((prev) => {
            if (prev) {
              setGroups([]);
              setSelectedRecordName('');
            }
            return '';
          });
          return;
        }

        // 批量获取记录的索引列值（并行获取）
        const primaryFieldObj = primaryField ? await table.getField(primaryField.id) : null;
        const validRecordIds = recordIdList.filter((id: string | undefined): id is string => !!id);
        
        const recordPromises = validRecordIds.map(async (recId: string) => {
          try {
            const val = primaryFieldObj ? await primaryFieldObj.getValue(recId) : '';
            return {
              recordId: recId,
              primaryValue: toText(val) || recId
            };
          } catch {
            return {
              recordId: recId,
              primaryValue: recId
            };
          }
        });
        
        const records = await Promise.all(recordPromises);
        setAllRecords(records);
        setFilteredRecords(records);

        // 保持或重置当前选中项
        setSelectedRecordId((prev) => {
          if (!prev) return '';
          const hit = records.find((r) => r.recordId === prev);
          if (hit) {
            setSelectedRecordName(hit.primaryValue || prev);
            return prev;
          }
          setGroups([]);
          setSelectedRecordName('');
          return '';
        });

        if (!isInitial) {
          setStatus(`记录已刷新（${records.length} 条）`);
        }
      } catch (err) {
        console.error('加载记录失败:', err);
        if (isInitial) {
          setError('初始化失败，请检查固定表/视图是否存在。');
        } else {
          setError('刷新记录失败，请检查表/视图配置。');
        }
      } finally {
        if (isInitial) {
          setInitLoading(false);
        } else {
          setRecordListLoading(false);
        }
      }
    },
    [pdfTableId, pdfViewId]
  );

  // 初始化：仅针对 PDF 模式的主表，固定表/视图（从配置获取），避免读取问卷表
  useEffect(() => {
    fetchRecordList(true);

    // 监听选择变化（可选）
    const off = bitable.base.onSelectionChange(async () => {});
    return () => {
      off();
    };
  }, [fetchRecordList]);

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

  // 统计模式：读取数据
  const loadStatData = async () => {
    setStatError('');
    setStatStatus('正在读取统计数据...');
    setStatLoading(true);
    setStatReportMd('');
    try {
      const table = await bitable.base.getTableById(statTableId);
      const view = await table.getViewById(statViewId);
      const recordIds = await view.getVisibleRecordIdList();
      if (!recordIds || recordIds.length === 0) {
        setStatRecords([]);
        setStatStatus('当前视图没有记录');
        setSelectedTestName('');
        return;
      }

      // 预取字段对象
      const linkField = await table.getField(statLinkFieldId);
      const groupField = await table.getField(statGroupFieldId);
      const answerField = await table.getField(statAnswerFieldId);
      const feedbackField = await table.getField(statFeedbackFieldId);
      const modifierField = await table.getField(statModifierFieldId);
      const createdField = await table.getField(statCreatedAtFieldId);
      const correctFieldCache: Partial<Record<GroupKey, any>> = {};
      let sampleTypeField: any = null;
      try {
        sampleTypeField = await table.getField(testSampleTypeFieldId);
      } catch {
        sampleTypeField = null;
      }
      let detectedSampleType = '';

      const temp: StatRecord[] = [];
      for (const rid of recordIds) {
        if (!rid) continue;
        try {
          let updatedAt = 0;
          try {
            const recMeta = (await (table as any)?.getRecord?.(rid)) || null;
            updatedAt = (recMeta as any)?.updatedAt || 0;
          } catch {
            updatedAt = 0;
          }
          let createdAt = 0;
          try {
            const createdRaw = await createdField.getValue(rid);
            createdAt = toTimestamp(createdRaw);
          } catch {
            createdAt = 0;
          }

          const testNameRaw = await linkField.getValue(rid);
          const testName = toText(testNameRaw);
          const groupRaw = await groupField.getValue(rid);
          const groupText = toText(groupRaw).toUpperCase() as GroupKey;
          if (!['A1', 'A2', 'A3', 'B1', 'B2', 'B3'].includes(groupText)) {
            continue;
          }

          const answerRaw = await answerField.getValue(rid);
          const answer = parseSelectOptionName(answerRaw);

          const correctFieldId = statCorrectFieldMap[groupText];
          if (!correctFieldCache[groupText]) {
            correctFieldCache[groupText] = await table.getField(correctFieldId);
          }
          const correctRaw = await correctFieldCache[groupText]!.getValue(rid);
          const correct = parseSelectOptionName(correctRaw) || toText(correctRaw);

          let feedback = '';
          let modifier = '';
          try {
            const fbRaw = await feedbackField.getValue(rid);
            feedback = toText(fbRaw);
          } catch {
            feedback = '';
          }
          try {
            const modifierRaw = await modifierField.getValue(rid);
            modifier = parseUserName(modifierRaw);
          } catch {
            modifier = '';
          }

          if (!detectedSampleType && sampleTypeField) {
            try {
              const sampleTypeRaw = await sampleTypeField.getValue(rid);
              const sampleTypeText = toText(sampleTypeRaw);
              if (sampleTypeText) {
                detectedSampleType = sampleTypeText;
              }
            } catch {
              // ignore
            }
          }

          temp.push({
            recordId: rid,
            testName,
            groupKey: groupText,
            answer,
            correct,
            modifier,
            feedback,
            updatedAt,
            createdAt
          });
        } catch (e) {
          console.warn('[stat] 读取记录失败', rid, e);
        }
      }

      setStatRecords(temp);
      const normalizedSampleType = (() => {
        const t = (detectedSampleType || '').trim();
        if (!t) return DEFAULT_STAT_TEST_TYPE;
        if (t.includes('厂')) return '工厂样品';
        return '备选测试';
      })();
      setStatTestType(normalizedSampleType);
      const sortedNames = (() => {
        const map: Record<string, number> = {};
        temp.forEach((r) => {
          if (!r.testName) return;
          const ts = r.updatedAt ?? r.createdAt ?? 0;
          if (!(r.testName in map) || ts > map[r.testName]) {
            map[r.testName] = ts;
          }
        });
        return Object.entries(map)
          .map(([name, ts]) => ({ name, ts }))
          .sort((a, b) => b.ts - a.ts)
          .map((i) => i.name);
      })();

      if (!selectedTestName && sortedNames.length > 0) {
        setSelectedTestName(sortedNames[0]);
      } else if (selectedTestName) {
        const stillExists = sortedNames.includes(selectedTestName);
        if (!stillExists && sortedNames.length > 0) {
          setSelectedTestName(sortedNames[0]);
        }
      }
      setStatStatus(`读取完成，共 ${temp.length} 条记录`);
    } catch (err) {
      console.error('[stat] 读取失败', err);
      setStatError('读取统计数据失败，请检查视图与字段配置。');
      setStatStatus('');
    } finally {
      setStatLoading(false);
    }
  };

  // 统计模式：生成 Markdown 报告
  const buildStatReport = () => {
    setStatError('');
    if (!selectedStatRecords.length) {
      setStatError('当前选择的测试无记录，请先读取数据或切换测试名称。');
      return;
    }

    const records = selectedStatRecords;
    const totalPeople = records.length;
    const typeRule = TEST_TYPE_RULES[statTestType];
    const expectedPerGroup = Math.max(statGroupSize, typeRule?.groupSize ?? 0);
    const expectedTotalByRule = Math.max(0, expectedPerGroup) * 6;
    const countMismatch = expectedTotalByRule > 0 && totalPeople !== expectedTotalByRule;
    const countShortage = expectedTotalByRule > 0 && totalPeople < expectedTotalByRule;
    const correctCount = records.filter((r) => r.answer === r.correct).length;
    const alpha = typeRule?.alpha ?? 0.05;
    const minSampleLimit = statTestType === '工厂样品' ? FACTORY_MIN_N : ALT_MIN_N;
    const maxSampleLimit = statTestType === '工厂样品' ? FACTORY_MAX_N : ALT_MAX_N;
    const baseBeforeClamp = expectedTotalByRule > 0 ? Math.max(expectedTotalByRule, totalPeople) : totalPeople;
    const thresholdBase = clampSampleSize(baseBeforeClamp, minSampleLimit, maxSampleLimit);
    const threshold = getThresholdByType(statTestType, thresholdBase);
    const insufficient = totalPeople < threshold; // 样本数小于显著性判定所需最少正确数 -> 无法判定（仅兜底）
    const significant = !insufficient && correctCount >= threshold;
    const passByRule = !significant;
    const pass = !countShortage && passByRule;
    const rangeDesc = statTestType === '工厂样品'
      ? `样本量下限 ${FACTORY_MIN_N}，上限 ${FACTORY_MAX_N}（≤${FACTORY_MIN_N} 固定阈值 ${FACTORY_BASE_THRESHOLD}；${FACTORY_MIN_N + 1}~${FACTORY_MAX_N} 按表值）`
      : `样本量下限 ${ALT_MIN_N}，上限 ${ALT_MAX_N}（≤${ALT_MIN_N} 固定阈值 ${ALT_BASE_MAX_ALLOWED + 1}；${ALT_MIN_N + 1}~${ALT_MAX_N} 按表值）`;
    const passRuleDesc = expectedTotalByRule > 0
      ? `每组 ${expectedPerGroup} 人 × 6 组（阈值按样本量 ${thresholdBase} 份计算，${rangeDesc}），α=${alpha}，正确数 < ${threshold} 视为无显著差异（通过）；≥${threshold} 判定存在显著差异`
      : `阈值按样本量 ${thresholdBase} 份计算，${rangeDesc}，α=${alpha}：正确数 < ${threshold} 视为无显著差异（通过）；≥${threshold} 判定存在显著差异`;
    const passRuleDescWithType = typeRule ? `${typeRule.name}：${passRuleDesc}` : passRuleDesc;
    const resultDesc = countShortage
      ? `本次共有 ${totalPeople} 份有效记录，低于预期样本量 ${expectedTotalByRule} 份，样本不足，无法按规则判定，请补足样本。`
      : `本次共有 ${totalPeople} 份有效记录${countMismatch ? `（与预期 ${expectedTotalByRule} 份不一致，请核查抽样）` : ''}，正确 ${correctCount} 份。判定规则：${passRuleDescWithType}。结论：${pass ? '符合通过标准' : '未满足通过标准'}。`;
    const conclusion = countShortage
      ? `${selectedTestName || '该样品'} 样本量不足，无法按规则判定，请补足样本后再次生成报告。`
      : pass
        ? `${selectedTestName || '该样品'} 满足判定规则（${passRuleDescWithType}），测试通过。`
        : `${selectedTestName || '该样品'} 未满足判定规则（${passRuleDescWithType}），请关注差异来源。`;

    const correctRecords = records.filter((r) => r.answer === r.correct);

    const groupStats: Record<GroupKey, { total: number; correct: number; optionCount: Record<string, number> }> = {
      A1: { total: 0, correct: 0, optionCount: {} },
      A2: { total: 0, correct: 0, optionCount: {} },
      A3: { total: 0, correct: 0, optionCount: {} },
      B1: { total: 0, correct: 0, optionCount: {} },
      B2: { total: 0, correct: 0, optionCount: {} },
      B3: { total: 0, correct: 0, optionCount: {} }
    };

    records.forEach((r) => {
      const g = groupStats[r.groupKey];
      g.total += 1;
      if (r.answer === r.correct) g.correct += 1;
      const key = r.answer || '-';
      g.optionCount[key] = (g.optionCount[key] || 0) + 1;
    });

    const optionStr = (optionCount: Record<string, number>) => {
      return Object.entries(optionCount)
        .sort((a, b) => b[1] - a[1])
        .map(([opt, cnt]) => `${opt || '-'}(${cnt})`)
        .join('，');
    };

    const groupTableRows = (['A1', 'A2', 'A3', 'B1', 'B2', 'B3'] as GroupKey[])
      .map((key) => {
        const g = groupStats[key];
        const correctRate = g.total ? ((g.correct / g.total) * 100).toFixed(1) + '%' : '-';
        return `| ${key} | ${g.total} | ${g.correct} | ${correctRate} | ${optionStr(g.optionCount)} |`;
      })
      .join('\n');

    const correctRows =
      correctRecords.length === 0
        ? '（暂无正确记录）'
        : correctRecords
            .map((m) => `| ${m.groupKey} | ${m.modifier || '-'} | ${m.feedback || '-'} |`)
            .join('\n');

    const title = `${selectedTestName || '三点测试'} 三点检验报告`;
    const warningLines = statCountWarning ? [`> 样本量提示：${statCountWarning}`, ''] : [];
    const expectedDesc =
      expectedTotalByRule > 0
        ? `模板预期样本量：每组 ${expectedPerGroup} 人 × 6 组 = ${expectedTotalByRule} 份；实际问卷 ${totalPeople} 份。`
        : '每组预期人数未设置，实际以记录为准。';

    const md = [
      `# ${title}`,
      '',
      '一、测试批次',
      `${selectedTestName || '未获取到测试批次名称'} 测试样品：${statSampleName || '未获取'}`,
      '',
      '二、测试方法',
      '参照国家标准 GB/T 12311-2012《感官分析方法 三点检验》进行三点品评。',
      '',
      '三、测试原理',
      `当前测试类型：${statTestType}（α=${alpha}），判定规则：${passRuleDescWithType}。${expectedDesc}`,
      '',
      '四、测试结果',
      ...warningLines,
      resultDesc,
      '',
      '五、测试结论',
      conclusion,
      '',
      '表1：各组三联样检验结果',
      '| 组别 | 人数 | 正确 | 正确率 | 选项分布 |',
      '| ---- | ---- | ---- | ------ | -------- |',
      groupTableRows,
      '',
      '表2：正确记录明细',
      '| 组别 | 填表人 | 评价 |',
      '| ---- | ---- | ---- |',
      correctRows,
      '',
      '> 说明：选项分布按问卷选择计数；显著性判定按 GB/T 12311 表 A.1（p=0.30，α=0.05）自动计算。'
    ].join('\n');

    setStatReportMd(md);
    setStatStatus(
      statCountWarning
        ? `${statCountWarning} 已生成报告，可复制为 MD`
        : '报告已生成，可复制为 MD'
    );
  };

  const handleCopyMd = async () => {
    if (!statReportMd) return;
    try {
      await navigator.clipboard.writeText(statReportMd);
      setStatStatus('MD 已复制到剪贴板');
    } catch {
      setStatStatus('复制失败，请手动选择文本复制');
    }
  };

  const writeStatReportToField = async () => {
    setStatError('');
    if (!statReportMd) {
      setStatError('请先生成 MD 报告');
      return;
    }
      const rid = statWriteRecordId.trim() || reportRecordIdDefault;
    if (!rid) {
      setStatError('请填写报告写入的记录 ID');
      return;
    }
    setStatStatus('正在写入报告到字段...');
    try {
      const table = await bitable.base.getTableById(reportTableId);
      const field = await table.getField(reportFieldId);
      await field.setValue(rid, statReportMd);
      setStatStatus('报告已写入字段');
    } catch (err) {
      console.error('[stat] 写入报告失败', err);
      setStatError('写入失败，请检查记录 ID/字段权限');
      setStatStatus('');
    }
  };

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
        const sampleTypeRaw = await fetchFieldValue(table, testSampleTypeFieldId, selectedRecordId);
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
        const sampleNameRaw = await fetchFieldValue(table, testSampleNameFieldId, selectedRecordId);
        setTestSampleName(toText(sampleNameRaw));
      } catch {
        setTestSampleName('');
      }

      const loaded: LoadedGroup[] = [];
      for (const cfg of groupConfigs) {
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

  if (initLoading && mode === 'pdf') {
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
      <div className="tab-bar">
        <button
          className={`tab-btn ${mode === 'pdf' ? 'active' : ''}`}
          onClick={() => setMode('pdf')}
        >
          PDF 生成模式
        </button>
        <button
          className={`tab-btn ${mode === 'stat' ? 'active' : ''}`}
          onClick={() => setMode('stat')}
        >
          结果统计模式
        </button>
        <button
          className={`tab-btn ${mode === 'config' ? 'active' : ''}`}
          onClick={() => setMode('config')}
        >
          字段配置模式
        </button>
      </div>

      {mode === 'pdf' ? (
        <>
          {/* 记录选择区域 */}
          <div className="card">
            <div className="card-header">
              <h2>选择测试记录</h2>
              <div className="card-actions">
                <button
                  className="button secondary"
                  onClick={() => fetchRecordList(false)}
                  disabled={recordListLoading || initLoading}
                >
                  {recordListLoading ? '刷新中...' : '刷新记录'}
                </button>
              </div>
            </div>
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
        </>
      ) : mode === 'stat' ? (
        <>
          <div className="card">
            <h2>结果统计模式</h2>
            <p className="hint">
              表：{statTableId} | 视图：{statViewId} | 关联字段：{statLinkFieldId}
            </p>
            <div className="row" style={{ gap: 12, marginBottom: 8 }}>
              <div className="field">
                <div className="field-label">测试名称</div>
                <select
                  className="input"
                  value={selectedTestName}
                  onChange={(e) => setSelectedTestName(e.target.value)}
                >
                  {availableTestNames.length === 0 && <option value="">（暂无数据）</option>}
                  {availableTestNames.map((name) => (
                    <option key={name} value={name}>
                      {name || '(空)'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <div className="field-label">搜索测试名称</div>
                <input
                  className="input"
                  placeholder="输入关键字过滤"
                  value={statTestSearch}
                  onChange={(e) => setStatTestSearch(e.target.value)}
                  style={{ minWidth: 200 }}
                />
              </div>
              <div className="field">
                <div className="field-label">每组人数</div>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={statGroupSize}
                  onChange={(e) => {
                    const rule = TEST_TYPE_RULES[statTestType];
                    const minSize = rule?.groupSize ?? 1;
                    const val = Number(e.target.value) || 0;
                    setStatGroupSize(Math.max(val, minSize));
                  }}
                  style={{ width: 100 }}
                />
              </div>
              <div className="field">
                <div className="field-label">报告写入记录 ID</div>
                <input
                  className="input"
                  value={statWriteRecordId}
                  onChange={(e) => setStatWriteRecordId(e.target.value)}
                  placeholder={reportRecordIdDefault}
                  style={{ minWidth: 200 }}
                />
              </div>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="button" onClick={loadStatData} disabled={statLoading}>
                {statLoading ? '读取中...' : '读取统计数据'}
              </button>
              <button
                className="button secondary"
                onClick={buildStatReport}
                disabled={statLoading || selectedStatRecords.length === 0}
              >
                生成 MD 报告
              </button>
              <button
                className="button secondary"
                onClick={handleCopyMd}
                disabled={!statReportMd}
              >
                复制 MD
              </button>
              <button
                className="button secondary"
                onClick={writeStatReportToField}
                disabled={!statReportMd || statLoading}
              >
                写入报告字段
              </button>
            </div>
            {statStatus && <p className="status" style={{ marginTop: 8 }}>{statStatus}</p>}
            {statError && <p className="error">{statError}</p>}
          </div>

          <div className="card">
            <h3>数据概览</h3>
            {selectedStatRecords.length === 0 ? (
              <p className="hint">读取并选择测试名称后显示汇总</p>
            ) : (
              <>
                <div className="preview-meta">
                  <span className="meta-item">
                    <span className="meta-label">测试名称</span>
                    <span className="meta-value">{selectedTestName || '-'}</span>
                  </span>
                  <span className="meta-item">
                    <span className="meta-label">有效记录</span>
                    <span className="meta-value">{statSummary.total}</span>
                  </span>
                  <span className="meta-item">
                    <span className="meta-label">每组人数（期望）</span>
                    <span className="meta-value">{effectiveStatGroupSize}</span>
                  </span>
                </div>
                {statCountWarning && (
                  <p className="error" style={{ marginTop: 8 }}>{statCountWarning}</p>
                )}
                <div className="preview-table">
                  <div className="preview-table-header">
                    <span className="col-key">组别</span>
                    <span className="col-layout">
                      <div className="layout-values">
                        <span className="layout-cell">人数</span>
                        <span className="layout-cell">正确</span>
                      </div>
                    </span>
                    <span className="col-correct">正确率</span>
                  </div>
                  {(Object.keys(statSummary.perGroup) as GroupKey[]).map((k) => {
                    const g = statSummary.perGroup[k];
                    const rate = g.total ? `${((g.correct / g.total) * 100).toFixed(1)}%` : '-';
                    return (
                      <div key={k} className="preview-table-row">
                        <span className="col-key">{k}</span>
                        <span className="col-layout">
                          <div className="layout-values">
                            <span className="layout-cell">人数：{g.total}</span>
                            <span className="layout-cell">正确：{g.correct}</span>
                          </div>
                        </span>
                        <span className="col-correct">{rate}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="card">
            <h3>正确记录明细</h3>
            {selectedStatRecords.length === 0 ? (
              <p className="hint">暂无数据</p>
            ) : (
              (() => {
                const correctRecords = selectedStatRecords.filter((r) => r.answer === r.correct);
                if (correctRecords.length === 0) {
                  return <p className="hint">暂无正确记录</p>;
                }
                return (
                  <div className="preview-table">
                    <div className="preview-table-header">
                      <span className="col-key">组别</span>
                      <span className="col-person">填表人</span>
                      <span className="col-correct">评价</span>
                    </div>
                    {correctRecords.map((m) => (
                      <div key={m.recordId} className="preview-table-row">
                        <span className="col-key">{m.groupKey}</span>
                        <span className="col-person">{m.modifier || '-'}</span>
                        <span className="col-correct">{m.feedback || '-'}</span>
                      </div>
                    ))}
                  </div>
                );
              })()
            )}
          </div>

          <div className="card">
            <h3>Markdown 报告</h3>
            {statReportMd ? (
              <pre className="md-preview">{statReportMd}</pre>
            ) : (
              <p className="hint">点击“生成 MD 报告”后显示</p>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="card">
            <h2>字段配置模式</h2>
            <p className="hint">配置存储在「三点测试助手配置表」（自动创建），下拉先选表再选字段，支持搜索。</p>
            <div className="row" style={{ gap: 12, marginBottom: 8 }}>
              <div className="field" style={{ minWidth: 220, flex: 1 }}>
                <div className="field-label">配置表 ID</div>
                <input className="input" value={configTableId || '未加载'} readOnly />
              </div>
            </div>
            {!metaLoaded && mode === 'config' ? (
              <div className="loading-container" style={{ padding: '20px' }}>
                <div className="spinner"></div>
                <p>正在加载表/字段元数据...</p>
              </div>
            ) : (
              <div className="config-list">
                {(() => {
                  const filtered = configMeta;
                  const grouped: Record<string, typeof filtered> = {};
                  filtered.forEach((m) => {
                    grouped[m.category] = grouped[m.category] || [];
                    grouped[m.category].push(m);
                  });
                  const getVal = (key: string) => configDraft[key] ?? configMap[key] ?? defaultConfigMap[key] ?? '';
                  const handleChange = (key: string, val: string) => {
                    setConfigDraft((prev) => ({ ...prev, [key]: val }));
                  };
                  // 可搜索的下拉组件
                  const SearchableSelect: React.FC<{
                    options: { id: string; name: string }[];
                    value: string;
                    onChange: (val: string) => void;
                    placeholder: string;
                  }> = ({ options, value, onChange, placeholder }) => {
                    const [search, setSearch] = React.useState('');
                    const [open, setOpen] = React.useState(false);
                    const ref = React.useRef<HTMLDivElement>(null);
                    
                    // 点击外部关闭
                    React.useEffect(() => {
                      if (!open) return;
                      const handleClickOutside = (e: MouseEvent) => {
                        if (ref.current && !ref.current.contains(e.target as Node)) {
                          setOpen(false);
                          setSearch('');
                        }
                      };
                      document.addEventListener('mousedown', handleClickOutside);
                      return () => document.removeEventListener('mousedown', handleClickOutside);
                    }, [open]);
                    
                    const filtered = options.filter(
                      (o) =>
                        o.name.toLowerCase().includes(search.toLowerCase()) ||
                        o.id.toLowerCase().includes(search.toLowerCase())
                    );
                    const selected = options.find((o) => o.id === value);
                    // 如果有值但在选项中找不到，显示 ID（可能是其他表的字段）
                    const displayText = selected
                      ? selected.name
                      : value
                        ? `${value}（未匹配）`
                        : null;
                    return (
                      <div className="searchable-select" ref={ref}>
                        <div
                          className="searchable-select-trigger input"
                          onClick={() => setOpen(!open)}
                        >
                          {displayText ? (
                            <span className={!selected && value ? 'unmatched' : ''}>{displayText}</span>
                          ) : (
                            <span className="placeholder">{placeholder}</span>
                          )}
                          <span className="arrow">▾</span>
                        </div>
                        {open && (
                          <div className="searchable-select-dropdown">
                            <input
                              className="searchable-select-search"
                              placeholder="搜索..."
                              value={search}
                              onChange={(e) => setSearch(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              autoFocus
                            />
                            <div className="searchable-select-options">
                              <div
                                className={`searchable-select-option ${!value ? 'selected' : ''}`}
                                onClick={() => {
                                  onChange('');
                                  setOpen(false);
                                  setSearch('');
                                }}
                              >
                                {placeholder}
                              </div>
                              {filtered.map((o) => (
                                <div
                                  key={o.id}
                                  className={`searchable-select-option ${o.id === value ? 'selected' : ''}`}
                                  onClick={() => {
                                    onChange(o.id);
                                    setOpen(false);
                                    setSearch('');
                                  }}
                                  title={o.id}
                                >
                                  {o.name}
                                </div>
                              ))}
                              {filtered.length === 0 && (
                                <div className="searchable-select-empty">无匹配项</div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  };
                  const renderFieldSelect = (item: any) => {
                    const tableId = getVal(item.tableKey || '');
                    const options = (tableId && fieldMap[tableId]) || [];
                    const val = getVal(item.key);
                    return (
                      <SearchableSelect
                        options={options}
                        value={val}
                        onChange={(v) => handleChange(item.key, v)}
                        placeholder="请选择字段"
                      />
                    );
                  };
                  const renderViewSelect = (item: any) => {
                    const tableId = getVal(item.tableKey || '');
                    const options = (tableId && viewMap[tableId]) || [];
                    const val = getVal(item.key);
                    return (
                      <SearchableSelect
                        options={options}
                        value={val}
                        onChange={(v) => handleChange(item.key, v)}
                        placeholder="请选择视图"
                      />
                    );
                  };
                  const renderTableSelect = (item: any) => {
                    const val = getVal(item.key);
                    return (
                      <SearchableSelect
                        options={tableList}
                        value={val}
                        onChange={(v) => handleChange(item.key, v)}
                        placeholder="请选择表"
                      />
                    );
                  };
                  return Object.keys(grouped).map((cat) => (
                    <div key={cat} className="config-category">
                      <div className="config-title">{cat}</div>
                      <div className="config-list">
                        {grouped[cat].map((item) => (
                          <div key={item.key} className="config-item">
                            <div className="field-label">
                              {item.label} <span style={{ color: '#8f959e' }}>({item.key})</span>
                            </div>
                            {item.type === 'table'
                              ? renderTableSelect(item)
                              : item.type === 'view'
                              ? renderViewSelect(item)
                              : item.type === 'field'
                              ? renderFieldSelect(item)
                              : (
                                <input
                                  className="input"
                                  value={getVal(item.key)}
                                  onChange={(e) => handleChange(item.key, e.target.value)}
                                  placeholder={defaultConfigMap[item.key] || ''}
                                />
                                )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}
            <div className="row" style={{ marginTop: 12 }}>
              <button
                className="button"
                onClick={async () => {
                  setConfigStatus('正在保存到配置表...');
                  setConfigError('');
                  try {
                    await saveConfigToTable(configDraft);
                    setConfigMap(configDraft);
                    setGroupConfigs(mergeGroupConfigs(BASE_GROUPS, configDraft));
                    setConfigStatus('配置已保存到配置表');
                  } catch (e) {
                    console.error('[config] save failed', e);
                    setConfigError('保存失败，请重试');
                    setConfigStatus('');
                  }
                }}
              >
                保存到配置表
              </button>
              <button
                className="button secondary"
                onClick={() => {
                  setConfigDraft(defaultConfigMap);
                  setConfigStatus('已恢复默认（未写回配置表）');
                }}
              >
                恢复默认
              </button>
            </div>
            {configStatus && <p className="status" style={{ marginTop: 8 }}>{configStatus}</p>}
            {configError && <p className="error">{configError}</p>}
          </div>
        </>
      )}
    </div>
  );
};

export default App;
