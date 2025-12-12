import React from 'react';
import { GroupKey } from '../configEditor';
import { useStatMode } from '../hooks/useStatMode';

interface StatModeProps {
  statTableId: string;
  statViewId: string;
  statLinkFieldId: string;
  statGroupFieldId: string;
  statAnswerFieldId: string;
  statFeedbackFieldId: string;
  statModifierFieldId: string;
  statCreatedAtFieldId: string;
  statCorrectFieldMap: Record<GroupKey, string>;
  testSampleTypeFieldId: string;
  reportTableId: string;
  reportFieldId: string;
  reportConclusionFieldId: string;
  pdfTableId: string;
  pdfViewId: string;
  primaryFieldId: string;
  testSampleNameFieldId: string;
}

export const StatMode: React.FC<StatModeProps> = (props) => {
  const stat = useStatMode(props);

  return (
    <>
      <div className="card">
        <h2>结果统计模式</h2>
        <p className="hint">
          表：{props.statTableId} | 视图：{props.statViewId} | 关联字段：{props.statLinkFieldId}
        </p>
        <div className="row" style={{ gap: 12, marginBottom: 8 }}>
          <div className="field">
            <div className="field-label">测试名称</div>
            <select className="input" value={stat.selectedTestName} onChange={(e) => stat.setSelectedTestName(e.target.value)}>
              {stat.availableTestNames.length === 0 && <option value="">（暂无数据）</option>}
              {stat.availableTestNames.map((name) => (
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
              value={stat.statTestSearch}
              onChange={(e) => stat.setStatTestSearch(e.target.value)}
              style={{ minWidth: 200 }}
            />
          </div>
          <div className="field">
            <div className="field-label">每组人数</div>
            <input
              className="input"
              type="number"
              min={1}
              value={stat.statGroupSize}
              onChange={(e) => {
                const val = Number(e.target.value) || 0;
                stat.setStatGroupSize(Math.max(val, 1));
              }}
              style={{ width: 100 }}
            />
          </div>
          <div className="field">
            <div className="field-label">报告写入记录 ID</div>
            <input
              className="input"
              value={stat.statWriteRecordId}
              onChange={(e) => stat.setStatWriteRecordId(e.target.value)}
              style={{ minWidth: 200 }}
            />
          </div>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="button" onClick={stat.loadStatData} disabled={stat.statLoading}>
            {stat.statLoading ? '读取中...' : '读取统计数据'}
          </button>
          <button className="button secondary" onClick={stat.buildReport} disabled={stat.statLoading || stat.selectedStatRecords.length === 0}>
            生成 MD 报告
          </button>
          <button className="button secondary" onClick={stat.handleCopyMd} disabled={!stat.statReportMd}>
            复制 MD
          </button>
          <button className="button secondary" onClick={stat.writeStatReportToField} disabled={!stat.statReportMd || stat.statLoading}>
            写入报告字段
          </button>
        </div>
        {stat.statStatus && <p className="status" style={{ marginTop: 8 }}>{stat.statStatus}</p>}
        {stat.statError && <p className="error">{stat.statError}</p>}
      </div>

      <div className="card">
        <h3>数据概览</h3>
        {stat.selectedStatRecords.length === 0 ? (
          <p className="hint">读取并选择测试名称后显示汇总</p>
        ) : (
          <>
            <div className="preview-meta">
              <span className="meta-item">
                <span className="meta-label">测试名称</span>
                <span className="meta-value">{stat.selectedTestName || '-'}</span>
              </span>
              <span className="meta-item">
                <span className="meta-label">有效记录</span>
                <span className="meta-value">{stat.statSummary.total}</span>
              </span>
              <span className="meta-item">
                <span className="meta-label">每组人数（期望）</span>
                <span className="meta-value">{stat.effectiveStatGroupSize}</span>
              </span>
            </div>
            {stat.statCountWarning && <p className="error" style={{ marginTop: 8 }}>{stat.statCountWarning}</p>}
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
              {(Object.keys(stat.statSummary.perGroup) as GroupKey[]).map((k) => {
                const g = stat.statSummary.perGroup[k];
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
        {stat.selectedStatRecords.length === 0 ? (
          <p className="hint">暂无数据</p>
        ) : (() => {
          const correctRecords = stat.selectedStatRecords.filter((r) => r.answer === r.correct);
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
        })()}
      </div>

      <div className="card">
        <h3>Markdown 报告</h3>
        {stat.statReportMd ? <pre className="md-preview">{stat.statReportMd}</pre> : <p className="hint">点击“生成 MD 报告”后显示</p>}
      </div>
    </>
  );
};

export default StatMode;
