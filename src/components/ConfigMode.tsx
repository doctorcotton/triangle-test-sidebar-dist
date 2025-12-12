import React from 'react';
import { ConfigMetaItem, OptionMeta } from '../types';
import SearchableSelect from './SearchableSelect';

interface ConfigModeProps {
  configMeta: ConfigMetaItem[];
  configDraft: Record<string, string>;
  configMap: Record<string, string>;
  defaultConfigMap: Record<string, string>;
  tableList: OptionMeta[];
  fieldMap: Record<string, OptionMeta[]>;
  viewMap: Record<string, OptionMeta[]>;
  metaLoaded: boolean;
  configTableId: string;
  configStatus: string;
  configError: string;
  setConfigDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  saveDraftToTable: () => Promise<void>;
  restoreDefaultDraft: () => void;
}

const ConfigMode: React.FC<ConfigModeProps> = ({
  configMeta,
  configDraft,
  configMap,
  defaultConfigMap,
  tableList,
  fieldMap,
  viewMap,
  metaLoaded,
  configTableId,
  configStatus,
  configError,
  setConfigDraft,
  saveDraftToTable,
  restoreDefaultDraft
}) => {
  const grouped = React.useMemo(() => {
    const filtered = configMeta;
    const g: Record<string, typeof filtered> = {};
    filtered.forEach((m) => {
      g[m.category] = g[m.category] || [];
      g[m.category].push(m);
    });
    return g;
  }, [configMeta]);

  const getVal = (key: string) => configDraft[key] ?? configMap[key] ?? defaultConfigMap[key] ?? '';
  const handleChange = (key: string, val: string) => {
    setConfigDraft((prev) => ({ ...prev, [key]: val }));
  };

  const renderFieldSelect = (item: any) => {
    const tableId = getVal(item.tableKey || '');
    let options = (tableId && fieldMap[tableId]) || [];
    // 如果指定了字段类型限制，则过滤字段
    if (item.fieldType !== undefined && options.length > 0) {
      options = options.filter((opt: any) => opt.type === item.fieldType);
    }
    const val = getVal(item.key);
    return <SearchableSelect options={options} value={val} onChange={(v) => handleChange(item.key, v)} placeholder={item.fieldType === 17 ? "请选择附件字段" : "请选择字段"} />;
  };
  const renderViewSelect = (item: any) => {
    const tableId = getVal(item.tableKey || '');
    const options = (tableId && viewMap[tableId]) || [];
    const val = getVal(item.key);
    return <SearchableSelect options={options} value={val} onChange={(v) => handleChange(item.key, v)} placeholder="请选择视图" />;
  };
  const renderTableSelect = (item: any) => {
    const val = getVal(item.key);
    return <SearchableSelect options={tableList} value={val} onChange={(v) => handleChange(item.key, v)} placeholder="请选择表" />;
  };

  return (
    <div className="card">
      <h2>字段配置模式</h2>
      <p className="hint">配置存储在「三点测试助手配置表」（自动创建），下拉先选表再选字段，支持搜索。</p>
      <div className="row" style={{ gap: 12, marginBottom: 8 }}>
        <div className="field" style={{ minWidth: 220, flex: 1 }}>
          <div className="field-label">配置表 ID</div>
          <input className="input" value={configTableId || '未加载'} readOnly />
        </div>
      </div>
      {!metaLoaded ? (
        <div className="loading-container" style={{ padding: '20px' }}>
          <div className="spinner"></div>
          <p>正在加载表/字段元数据...</p>
        </div>
      ) : (
        <div className="config-list">
          {Object.keys(grouped).map((cat) => (
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
          ))}
        </div>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="button" onClick={saveDraftToTable}>
          保存到配置表
        </button>
        <button className="button secondary" onClick={restoreDefaultDraft}>
          恢复默认
        </button>
      </div>
      {configStatus && <p className="status" style={{ marginTop: 8 }}>{configStatus}</p>}
      {configError && <p className="error">{configError}</p>}
    </div>
  );
};

export default ConfigMode;
