import { GroupKey } from './configEditor';

// ===== 基础表/字段ID =====
export const TEST_SAMPLE_TYPE_FIELD_ID = 'fld9MkM2Dt';
export const TEST_SAMPLE_NAME_FIELD_ID = 'fldxvyb5Tt';
export const PDF_TABLE_ID = 'tblZSyNrU9rdiX0R';
export const PDF_VIEW_ID = 'vewbZ8zNey';

// 统计模式：字段映射键（从配置表读取）
export const STAT_CORRECT_FIELD_MAP_KEYS: Record<GroupKey, string> = {
  A1: 'STAT_CORRECT_A1',
  A2: 'STAT_CORRECT_A2',
  A3: 'STAT_CORRECT_A3',
  B1: 'STAT_CORRECT_B1',
  B2: 'STAT_CORRECT_B2',
  B3: 'STAT_CORRECT_B3'
};

// 分页大小
export const PAGE_SIZE = 10;

// 测试类型规则
export const TEST_TYPE_RULES: Record<string, { groupSize: number; alpha: number; name: string; p: number }> = {
  // 备选测试按表 A.2（Pd=30%）取相似判定值，这里给定 p=0.2 近似，关键阈值使用表值覆盖
  备选测试: { groupSize: 7, alpha: 0.05, name: '备选测试 (α=0.05)', p: 0.2 },
  // 工厂样品按差异检出（p≈1/3）
  工厂样品: { groupSize: 6, alpha: 0.1, name: '工厂样品 (α=0.10)', p: 1 / 3 }
};

// 工厂样品（差异检验）阈值：≤36 固定 18；37~54 按表 1 的 x_min
export const FACTORY_MIN_N = 36;
export const FACTORY_MAX_N = 54;
export const FACTORY_BASE_THRESHOLD = 18;
export const FACTORY_DIFF_THRESHOLD_TABLE: Record<number, number> = {
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
export const ALT_MIN_N = 42;
export const ALT_MAX_N = 54;
export const ALT_BASE_MAX_ALLOWED = 16; // 显著阈值 = 17
export const ALT_SIMILARITY_MAX_TABLE: Record<number, number> = {
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

export const DEFAULT_STAT_TEST_TYPE = '备选测试';
