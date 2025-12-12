import { useCallback, useEffect, useMemo, useState } from 'react';
import { bitable } from '@lark-base-open/js-sdk';
import {
  DEFAULT_GROUPS,
  DEFAULT_IDS,
  GroupConfig,
  GroupKey,
  mergeGroupConfigs,
  loadConfigFromTable,
  saveConfigToTable
} from '../configEditor';
import {
  PDF_TABLE_ID,
  PDF_VIEW_ID,
  TEST_SAMPLE_TYPE_FIELD_ID,
  TEST_SAMPLE_NAME_FIELD_ID,
  STAT_CORRECT_FIELD_MAP_KEYS
} from '../constants';
import { ConfigMetaItem, OptionMeta } from '../types';

export function useConfig(mode: 'pdf' | 'stat' | 'config') {
  const [groupConfigs, setGroupConfigs] = useState<GroupConfig[]>(DEFAULT_GROUPS);
  const [configStatus, setConfigStatus] = useState<string>('');
  const [configMap, setConfigMap] = useState<Record<string, string>>({});
  const [configTableId, setConfigTableId] = useState<string>('');
  const [configLoading, setConfigLoading] = useState<boolean>(true);
  const [configError, setConfigError] = useState<string>('');
  const [configDraft, setConfigDraft] = useState<Record<string, string>>({});
  const [tableList, setTableList] = useState<OptionMeta[]>([]);
  const [fieldMap, setFieldMap] = useState<Record<string, OptionMeta[]>>({});
  const [viewMap, setViewMap] = useState<Record<string, OptionMeta[]>>({});
  const [metaLoaded, setMetaLoaded] = useState(false);

  const defaultConfigMap = useMemo(() => {
    const map: Record<string, string> = {
      ...DEFAULT_IDS
    };
    DEFAULT_GROUPS.forEach((g) => {
      map[`${g.key}_optionFieldId`] = g.optionFieldId;
      map[`${g.key}_correctFieldId`] = g.correctFieldId;
      map[`${g.key}_qrSourceFieldId`] = g.qrSourceFieldId;
    });
    return map;
  }, []);

  const configMeta = useMemo<ConfigMetaItem[]>(() => {
    const items: ConfigMetaItem[] = [
      // ===== 1. PDF模式（三点测试表） =====
      { key: 'PDF_TABLE_ID', label: '三点测试表', category: '1. PDF模式 - 表/视图', type: 'table', order: 1 },
      { key: 'PDF_VIEW_ID', label: '视图', category: '1. PDF模式 - 表/视图', type: 'view', tableKey: 'PDF_TABLE_ID', order: 2 },
      { key: 'TEST_SAMPLE_TYPE_FIELD_ID', label: '测试类型字段', category: '1. PDF模式 - 基础字段', type: 'field', tableKey: 'PDF_TABLE_ID', order: 3 },
      { key: 'TEST_SAMPLE_NAME_FIELD_ID', label: '测试样品名称字段', category: '1. PDF模式 - 基础字段', type: 'field', tableKey: 'PDF_TABLE_ID', order: 4 },
      { key: 'PDF_ATTACHMENT_FIELD_ID', label: '测试方案附件字段', category: '1. PDF模式 - 基础字段', type: 'field', tableKey: 'PDF_TABLE_ID', fieldType: 17, order: 5 },

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
      { key: 'REPORT_CONCLUSION_FIELD_ID', label: '测试结论字段', category: '4. 报告写入', type: 'field', tableKey: 'REPORT_TABLE_ID', fieldType: 3, order: 202 },
      { key: 'REPORT_RECORD_ID_DEFAULT', label: '默认记录 ID', category: '4. 报告写入', type: 'text', order: 203 }
    ];
    // 六组字段（PDF表）
    DEFAULT_GROUPS.forEach((g, idx) => {
      const baseOrder = 10 + idx * 10;
      items.push(
        { key: `${g.key}_optionFieldId`, label: `${g.key} 选项`, category: '2. PDF模式 - 六组字段', type: 'field', tableKey: 'PDF_TABLE_ID', order: baseOrder },
        { key: `${g.key}_correctFieldId`, label: `${g.key} 正确答案`, category: '2. PDF模式 - 六组字段', type: 'field', tableKey: 'PDF_TABLE_ID', order: baseOrder + 1 },
        { key: `${g.key}_qrSourceFieldId`, label: `${g.key} 二维码`, category: '2. PDF模式 - 六组字段', type: 'field', tableKey: 'PDF_TABLE_ID', order: baseOrder + 2 }
      );
    });
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

  // 预计算配置值
  const pdfTableId = getCfg('PDF_TABLE_ID', DEFAULT_IDS.PDF_TABLE_ID);
  const pdfViewId = getCfg('PDF_VIEW_ID', DEFAULT_IDS.PDF_VIEW_ID);
  const testSampleTypeFieldId = getCfg('TEST_SAMPLE_TYPE_FIELD_ID', DEFAULT_IDS.TEST_SAMPLE_TYPE_FIELD_ID);
  const testSampleNameFieldId = getCfg('TEST_SAMPLE_NAME_FIELD_ID', DEFAULT_IDS.TEST_SAMPLE_NAME_FIELD_ID);
  const pdfAttachmentFieldId = getCfg('PDF_ATTACHMENT_FIELD_ID', DEFAULT_IDS.PDF_ATTACHMENT_FIELD_ID);

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
  const reportConclusionFieldId = getCfg('REPORT_CONCLUSION_FIELD_ID', DEFAULT_IDS.REPORT_CONCLUSION_FIELD_ID);
  const reportRecordIdDefault = getCfg('REPORT_RECORD_ID_DEFAULT', DEFAULT_IDS.REPORT_RECORD_ID_DEFAULT);

  // 加载配置表（先用默认配置，异步加载配置表）
  useEffect(() => {
    // 立即使用默认配置，不阻塞渲染
    setConfigLoading(false);
    setGroupConfigs(DEFAULT_GROUPS);
    setConfigStatus('使用默认配置');

    const loadConfig = async () => {
      try {
        const { config, tableId } = await loadConfigFromTable();
        if (Object.keys(config).length > 0) {
          setConfigTableId(tableId);
          setConfigMap(config);
          setConfigDraft(config);
          setGroupConfigs(mergeGroupConfigs(DEFAULT_GROUPS, config));
          setConfigStatus(`配置表已加载 (ID: ${tableId})`);
        }
      } catch (err) {
        console.error('[config] 加载失败', err);
        setConfigStatus('使用默认配置（配置表加载失败）');
      }
    };
    loadConfig();
  }, []);

  useEffect(() => {
    setGroupConfigs(mergeGroupConfigs(DEFAULT_GROUPS, configMap));
  }, [configMap]);

  // 辅助函数：获取表名
  const getTableName = async (table: any): Promise<string> => {
    try {
      if (table.name) return table.name;
      if (typeof table.getName === 'function') {
        const name = await table.getName();
        if (name) return name;
      }
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
  useEffect(() => {
    if (mode !== 'config' || metaLoaded) return;

    const loadMeta = async () => {
      try {
        const tables = await bitable.base.getTableList();
        const tableMeta: OptionMeta[] = [];

        await Promise.all(
          tables.map(async (t) => {
            try {
              const fullTable = await bitable.base.getTableById(t.id);
              const name = await getTableName(fullTable);
              tableMeta.push({ id: t.id, name: name || t.id });
            } catch {
              tableMeta.push({ id: t.id, name: t.id });
            }
          })
        );
        setTableList(tableMeta);

        const fMap: Record<string, OptionMeta[]> = {};
        const vMap: Record<string, OptionMeta[]> = {};

        await Promise.all(
          tables.map(async (t) => {
            try {
              const table = await bitable.base.getTableById(t.id);
              const fields = await table.getFieldMetaList();
              // 存储字段元数据，包含类型信息
              fMap[t.id] = fields.map((f: any) => ({ 
                id: f.id, 
                name: f.name,
                type: f.type // 保存字段类型用于过滤
              }));
              const views = await table.getViewList();
              const viewMeta: OptionMeta[] = [];
              await Promise.all(
                views.map(async (v: any) => {
                  const vName = await getViewName(v);
                  viewMeta.push({ id: v.id, name: vName || v.id });
                })
              );
              vMap[t.id] = viewMeta;
            } catch (e) {
              console.warn('[config] load meta failed', t.id, e);
            }
          })
        );

        setFieldMap(fMap);
        setViewMap(vMap);
        setMetaLoaded(true);
      } catch (e) {
        console.warn('[config] load table list failed', e);
      }
    };
    loadMeta();
  }, [mode, metaLoaded]);

  const saveDraftToTable = useCallback(async () => {
    setConfigStatus('正在保存到配置表...');
    setConfigError('');
    try {
      await saveConfigToTable(configDraft);
      setConfigMap(configDraft);
      setGroupConfigs(mergeGroupConfigs(DEFAULT_GROUPS, configDraft));
      setConfigStatus('配置已保存到配置表');
    } catch (e) {
      console.error('[config] save failed', e);
      setConfigError('保存失败，请重试');
      setConfigStatus('');
    }
  }, [configDraft]);

  const restoreDefaultDraft = useCallback(() => {
    setConfigDraft(defaultConfigMap);
    setConfigStatus('已恢复默认（未写回配置表）');
  }, [defaultConfigMap]);

  return {
    // 配置状态
    groupConfigs,
    configStatus,
    configMap,
    configTableId,
    configLoading,
    configError,
    configDraft,
    setConfigDraft,
    configMeta,
    defaultConfigMap,
    saveDraftToTable,
    restoreDefaultDraft,
    // 元数据
    tableList,
    fieldMap,
    viewMap,
    metaLoaded,
    // 计算字段
    getCfg,
    pdfTableId,
    pdfViewId,
    testSampleTypeFieldId,
    testSampleNameFieldId,
    pdfAttachmentFieldId,
    statTableId,
    statViewId,
    statLinkFieldId,
    statGroupFieldId,
    statAnswerFieldId,
    statFeedbackFieldId,
    statModifierFieldId,
    statCreatedAtFieldId,
    statCorrectFieldMap,
    reportTableId,
    reportFieldId,
    reportConclusionFieldId,
    reportRecordIdDefault,
    setConfigStatus,
    setConfigError
  };
}
