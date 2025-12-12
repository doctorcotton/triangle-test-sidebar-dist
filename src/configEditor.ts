import { bitable } from '@lark-base-open/js-sdk';

export type GroupKey = 'A1' | 'A2' | 'A3' | 'B1' | 'B2' | 'B3';

export interface GroupConfig {
  key: GroupKey;
  optionFieldId: string;
  correctFieldId: string;
  qrSourceFieldId: string;
}

export interface ConfigItem {
  key: string;
  value: string;
  category: ConfigCategory;
  desc?: string;
  recordId?: string;
}

export type ConfigCategory = '六组字段' | 'PDF模式' | '统计模式' | '报告写入';

export const CONFIG_TABLE_NAME = '三点测试助手配置表';
export const CONFIG_FIELDS = {
  KEY: '配置项',
  CATEGORY: '类别',
  VALUE: '值',
  DESC: '说明'
};

// 默认 ID 配置
export const DEFAULT_IDS = {
  PDF_TABLE_ID: 'tblZSyNrU9rdiX0R',
  PDF_VIEW_ID: 'vewbZ8zNey',
  TEST_SAMPLE_TYPE_FIELD_ID: 'fld9MkM2Dt',
  TEST_SAMPLE_NAME_FIELD_ID: 'fldxvyb5Tt',
  STAT_TABLE_ID: 'tblnYJUgwh4EujFo',
  STAT_VIEW_ID: 'vewiJFIJP2',
  STAT_LINK_FIELD_ID: 'fldy6JzLZ4',
  STAT_GROUP_FIELD_ID: 'fldwm4lnfs',
  STAT_ANSWER_FIELD_ID: 'fldtTL13A4',
  STAT_FEEDBACK_FIELD_ID: 'fldPdCMW3S',
  STAT_CREATED_AT_FIELD_ID: 'fldcGrCB1v',
  STAT_MODIFIER_FIELD_ID: 'fldqKjnjrO',
  // 统计表中的正确答案引用字段（引用 PDF 表的正确答案）
  STAT_CORRECT_A1: 'fldIzHNHm7',
  STAT_CORRECT_A2: 'fldVzAOBd3',
  STAT_CORRECT_A3: 'fldD1h3TUH',
  STAT_CORRECT_B1: 'fldwwErrTk',
  STAT_CORRECT_B2: 'fld7uW4l9A',
  STAT_CORRECT_B3: 'fld59KLDB3',
  REPORT_TABLE_ID: 'tblZSyNrU9rdiX0R',
  REPORT_FIELD_ID: 'fldD58x9LP',
  REPORT_CONCLUSION_FIELD_ID: 'fldbp62Xzq', // 测试结论字段ID
  PDF_ATTACHMENT_FIELD_ID: 'fldTp1OsR3' // 测试方案附件字段ID
};

export const DEFAULT_GROUPS: GroupConfig[] = [
  { key: 'A1', optionFieldId: 'fldacaDBFo', correctFieldId: 'fld6gqxNcC', qrSourceFieldId: 'fldhIV6aac' },
  { key: 'A2', optionFieldId: 'fldJtMjLZS', correctFieldId: 'fldkH6ZAOF', qrSourceFieldId: 'fldOzZHsmg' },
  { key: 'A3', optionFieldId: 'fldcI4D25x', correctFieldId: 'fldzaEw5m1', qrSourceFieldId: 'fldT44t40R' },
  { key: 'B1', optionFieldId: 'fldHsoqeJ7', correctFieldId: 'fld9t9uVGa', qrSourceFieldId: 'flde5cAgDx' },
  { key: 'B2', optionFieldId: 'fldREcfxgd', correctFieldId: 'fld3C5MSLW', qrSourceFieldId: 'fldSoyTeKY' },
  { key: 'B3', optionFieldId: 'fldwZVopiE', correctFieldId: 'fld1JVVIaL', qrSourceFieldId: 'flda85E6bz' }
];

export function mergeGroupConfigs(base: GroupConfig[], overrides: Record<string, string>): GroupConfig[] {
  return base.map((cfg) => ({
    ...cfg,
    optionFieldId: overrides[`${cfg.key}_optionFieldId`] ?? cfg.optionFieldId,
    correctFieldId: overrides[`${cfg.key}_correctFieldId`] ?? cfg.correctFieldId,
    qrSourceFieldId: overrides[`${cfg.key}_qrSourceFieldId`] ?? cfg.qrSourceFieldId
  }));
}

function buildDefaultConfigItems(): ConfigItem[] {
  const list: ConfigItem[] = [];
  // 组别
  DEFAULT_GROUPS.forEach((g) => {
    list.push(
      { key: `${g.key}_optionFieldId`, value: g.optionFieldId, category: '六组字段', desc: `${g.key} 选项字段 ID` },
      { key: `${g.key}_correctFieldId`, value: g.correctFieldId, category: '六组字段', desc: `${g.key} 正确答案字段 ID` },
      { key: `${g.key}_qrSourceFieldId`, value: g.qrSourceFieldId, category: '六组字段', desc: `${g.key} 二维码字段 ID` }
    );
  });
  // PDF
  list.push(
    { key: 'PDF_TABLE_ID', value: DEFAULT_IDS.PDF_TABLE_ID, category: 'PDF模式', desc: 'PDF 模式表 ID' },
    { key: 'PDF_VIEW_ID', value: DEFAULT_IDS.PDF_VIEW_ID, category: 'PDF模式', desc: 'PDF 模式视图 ID' },
    { key: 'TEST_SAMPLE_TYPE_FIELD_ID', value: DEFAULT_IDS.TEST_SAMPLE_TYPE_FIELD_ID, category: 'PDF模式', desc: '测试类型字段 ID' },
    { key: 'TEST_SAMPLE_NAME_FIELD_ID', value: DEFAULT_IDS.TEST_SAMPLE_NAME_FIELD_ID, category: 'PDF模式', desc: '测试样品名称字段 ID' }
  );
  // 统计
  list.push(
    { key: 'STAT_TABLE_ID', value: DEFAULT_IDS.STAT_TABLE_ID, category: '统计模式', desc: '统计表 ID' },
    { key: 'STAT_VIEW_ID', value: DEFAULT_IDS.STAT_VIEW_ID, category: '统计模式', desc: '统计视图 ID' },
    { key: 'STAT_LINK_FIELD_ID', value: DEFAULT_IDS.STAT_LINK_FIELD_ID, category: '统计模式', desc: '关联三点测试名称字段 ID' },
    { key: 'STAT_GROUP_FIELD_ID', value: DEFAULT_IDS.STAT_GROUP_FIELD_ID, category: '统计模式', desc: '组别字段 ID' },
    { key: 'STAT_ANSWER_FIELD_ID', value: DEFAULT_IDS.STAT_ANSWER_FIELD_ID, category: '统计模式', desc: '问卷结果字段 ID' },
    { key: 'STAT_FEEDBACK_FIELD_ID', value: DEFAULT_IDS.STAT_FEEDBACK_FIELD_ID, category: '统计模式', desc: '评价字段 ID' },
    { key: 'STAT_MODIFIER_FIELD_ID', value: DEFAULT_IDS.STAT_MODIFIER_FIELD_ID, category: '统计模式', desc: '修改人字段 ID' },
    { key: 'STAT_CREATED_AT_FIELD_ID', value: DEFAULT_IDS.STAT_CREATED_AT_FIELD_ID, category: '统计模式', desc: '创建日期字段 ID' },
    // 统计表中的正确答案引用字段（需要用户在配置中选择统计表的字段）
    { key: 'STAT_CORRECT_A1', value: DEFAULT_IDS.STAT_CORRECT_A1, category: '统计模式', desc: 'A1 正确答案字段（统计表引用字段）' },
    { key: 'STAT_CORRECT_A2', value: DEFAULT_IDS.STAT_CORRECT_A2, category: '统计模式', desc: 'A2 正确答案字段（统计表引用字段）' },
    { key: 'STAT_CORRECT_A3', value: DEFAULT_IDS.STAT_CORRECT_A3, category: '统计模式', desc: 'A3 正确答案字段（统计表引用字段）' },
    { key: 'STAT_CORRECT_B1', value: DEFAULT_IDS.STAT_CORRECT_B1, category: '统计模式', desc: 'B1 正确答案字段（统计表引用字段）' },
    { key: 'STAT_CORRECT_B2', value: DEFAULT_IDS.STAT_CORRECT_B2, category: '统计模式', desc: 'B2 正确答案字段（统计表引用字段）' },
    { key: 'STAT_CORRECT_B3', value: DEFAULT_IDS.STAT_CORRECT_B3, category: '统计模式', desc: 'B3 正确答案字段（统计表引用字段）' }
  );
  // 报告
  list.push(
    { key: 'REPORT_TABLE_ID', value: DEFAULT_IDS.REPORT_TABLE_ID, category: '报告写入', desc: '报告写入表 ID' },
    { key: 'REPORT_FIELD_ID', value: DEFAULT_IDS.REPORT_FIELD_ID, category: '报告写入', desc: '报告写入字段 ID' },
    { key: 'REPORT_CONCLUSION_FIELD_ID', value: DEFAULT_IDS.REPORT_CONCLUSION_FIELD_ID, category: '报告写入', desc: '测试结论字段 ID' }
  );
  // PDF模式 - 测试方案附件字段
  list.push(
    { key: 'PDF_ATTACHMENT_FIELD_ID', value: DEFAULT_IDS.PDF_ATTACHMENT_FIELD_ID, category: 'PDF模式', desc: '测试方案附件字段 ID' }
  );
  return list;
}

// 辅助函数：获取表名
async function getTableName(table: any): Promise<string> {
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
    console.warn('[config] getTableName failed:', e);
  }
  return '';
}

// 获取配置表的字段ID映射
async function getConfigFieldIds(table: any): Promise<Record<string, string>> {
  const fieldMetas = await table.getFieldMetaList();
  const map: Record<string, string> = {};
  for (const f of fieldMetas) {
    map[f.name] = f.id;
  }
  return map;
}

async function ensureConfigTable(): Promise<{ table: any; fieldIds: Record<string, string> }> {
  const tables = await bitable.base.getTableList();
  
  // 遍历表并异步获取名称进行匹配
  for (const t of tables) {
    try {
      const fullTable = await bitable.base.getTableById(t.id);
      const tableName = await getTableName(fullTable);
      if (tableName === CONFIG_TABLE_NAME) {
        console.log('[config] 找到已存在的配置表:', t.id, tableName);
        const fieldIds = await getConfigFieldIds(fullTable);
        return { table: fullTable, fieldIds };
      }
    } catch (e) {
      console.warn('[config] 检查表名失败:', t.id, e);
    }
  }

  console.log('[config] 配置表不存在，正在创建...');
  // 创建表
  const createRes: any = await bitable.base.addTable({
    name: CONFIG_TABLE_NAME,
    fields: [
      { name: CONFIG_FIELDS.KEY, type: 1, isPrimary: true } as any,
      {
        name: CONFIG_FIELDS.CATEGORY,
        type: 3,
        property: {
          options: [
            { id: 'opt-group', name: '六组字段' },
            { id: 'opt-pdf', name: 'PDF模式' },
            { id: 'opt-stat', name: '统计模式' },
            { id: 'opt-report', name: '报告写入' }
          ]
        }
      } as any,
      { name: CONFIG_FIELDS.VALUE, type: 1 } as any,
      { name: CONFIG_FIELDS.DESC, type: 1 } as any
    ]
  });
  const newId = createRes?.tableId || createRes?.id;
  console.log('[config] 配置表创建成功:', newId);
  const table = await bitable.base.getTableById(newId);
  const fieldIds = await getConfigFieldIds(table);
  return { table, fieldIds };
}

async function addDefaultRecords(table: any, fieldIds: Record<string, string>) {
  const items = buildDefaultConfigItems();
  const keyFieldId = fieldIds[CONFIG_FIELDS.KEY];
  const categoryFieldId = fieldIds[CONFIG_FIELDS.CATEGORY];
  const valueFieldId = fieldIds[CONFIG_FIELDS.VALUE];
  const descFieldId = fieldIds[CONFIG_FIELDS.DESC];
  
  if (!keyFieldId || !valueFieldId) {
    console.error('[config] 配置表字段ID未找到:', fieldIds);
    return;
  }
  
  for (const item of items) {
    try {
      const fields: Record<string, any> = {
        [keyFieldId]: item.key,
        [valueFieldId]: item.value
      };
      if (categoryFieldId) {
        fields[categoryFieldId] = item.category;
      }
      if (descFieldId) {
        fields[descFieldId] = item.desc || '';
      }
      await table.addRecord({ fields });
    } catch (e) {
      console.warn('[config] add default failed', item, e);
    }
  }
}

function parseSingleSelect(val: any): string {
  if (Array.isArray(val) && val.length > 0) {
    const first = val[0];
    if (first && typeof first === 'object') {
      return first.name || first.text || '';
    }
  }
  return '';
}

export async function loadConfigFromTable(): Promise<{ tableId: string; config: Record<string, string> }> {
  const { table, fieldIds } = await ensureConfigTable();
  const tableId = table.id;
  const keyFieldId = fieldIds[CONFIG_FIELDS.KEY];
  const valueFieldId = fieldIds[CONFIG_FIELDS.VALUE];
  
  if (!keyFieldId || !valueFieldId) {
    console.error('[config] 配置表字段ID未找到:', fieldIds);
    return { tableId, config: Object.fromEntries(buildDefaultConfigItems().map((i) => [i.key, i.value])) };
  }
  
  const views = (await table.getViewList()) as any[];
  const view = views?.[0] || (await table.getActiveView());
  let recordIds: string[] = [];
  try {
    recordIds = await view.getVisibleRecordIdList();
  } catch {
    recordIds = [];
  }

  if (!recordIds || recordIds.length === 0) {
    await addDefaultRecords(table, fieldIds);
    return { tableId, config: Object.fromEntries(buildDefaultConfigItems().map((i) => [i.key, i.value])) };
  }

  const config: Record<string, string> = {};
  const validRecordIds = recordIds.filter((id): id is string => !!id);
  
  // 并行读取所有记录
  const results = await Promise.all(
    validRecordIds.map(async (rid) => {
      try {
        const [key, val] = await Promise.all([
          table.getCellValue(keyFieldId, rid),
          table.getCellValue(valueFieldId, rid)
        ]);
        const keyText = (Array.isArray(key) ? key[0]?.text : key?.text) || key?.value || key || '';
        const valText = (Array.isArray(val) ? val[0]?.text : val?.text) || val?.value || val || '';
        return { keyText, valText };
      } catch (e) {
        console.warn('[config] read record failed', rid, e);
        return null;
      }
    })
  );
  
  // 处理结果
  for (const result of results) {
    if (result && result.keyText && result.valText) {
      config[String(result.keyText)] = String(result.valText);
    }
  }
  // 若为空则写入默认
  if (Object.keys(config).length === 0) {
    await addDefaultRecords(table, fieldIds);
    return { tableId, config: Object.fromEntries(buildDefaultConfigItems().map((i) => [i.key, i.value])) };
  }
  return { tableId, config };
}

export async function saveConfigToTable(overrides: Record<string, string>) {
  const { table, fieldIds } = await ensureConfigTable();
  const keyFieldId = fieldIds[CONFIG_FIELDS.KEY];
  const categoryFieldId = fieldIds[CONFIG_FIELDS.CATEGORY];
  const valueFieldId = fieldIds[CONFIG_FIELDS.VALUE];
  const descFieldId = fieldIds[CONFIG_FIELDS.DESC];
  
  if (!keyFieldId || !valueFieldId) {
    console.error('[config] 配置表字段ID未找到:', fieldIds);
    return;
  }
  
  const views = (await table.getViewList()) as any[];
  const view = views?.[0] || (await table.getActiveView());
  let recordIds: string[] = [];
  try {
    recordIds = await view.getVisibleRecordIdList();
  } catch {
    recordIds = [];
  }

  const existing: Record<string, string> = {};
  for (const rid of recordIds) {
    try {
      const key = await table.getCellValue(keyFieldId, rid);
      const keyText = (Array.isArray(key) ? key[0]?.text : key?.text) || key?.value || key || '';
      if (keyText) {
        existing[String(keyText)] = rid;
      }
    } catch {
      // ignore
    }
  }

  const items = buildDefaultConfigItems();
  const merged = items.map((i) => ({
    ...i,
    value: overrides[i.key] ?? i.value
  }));

  for (const item of merged) {
    const rid = existing[item.key];
    const fields: Record<string, any> = {
      [keyFieldId]: item.key,
      [valueFieldId]: item.value
    };
    if (categoryFieldId) {
      fields[categoryFieldId] = item.category;
    }
    if (descFieldId) {
      fields[descFieldId] = item.desc || '';
    }
    try {
      if (rid && table.setRecord) {
        await table.setRecord(rid, { fields });
      } else {
        await table.addRecord({ fields });
      }
    } catch (e) {
      console.warn('[config] save record failed', item, e);
    }
  }
}

