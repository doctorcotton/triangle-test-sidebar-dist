import React, { useEffect } from 'react';
import { GroupConfig } from '../configEditor';
import { PAGE_SIZE } from '../constants';
import { buildPdf as buildPdfService } from '../services/pdfBuilder';
import { usePdfMode } from '../hooks/usePdfMode';

interface PdfModeProps {
  pdfTableId: string;
  pdfViewId: string;
  testSampleTypeFieldId: string;
  testSampleNameFieldId: string;
  groupConfigs: GroupConfig[];
  pdfAttachmentFieldId?: string;
  onPrimaryFieldChange?: (id: string) => void;
}

export const PdfMode: React.FC<PdfModeProps> = ({
  pdfTableId,
  pdfViewId,
  testSampleTypeFieldId,
  testSampleNameFieldId,
  groupConfigs,
  pdfAttachmentFieldId,
  onPrimaryFieldChange
}) => {
  const pdf = usePdfMode({
    pdfTableId,
    pdfViewId,
    testSampleTypeFieldId,
    testSampleNameFieldId,
    groupConfigs
  });

  useEffect(() => {
    if (pdf.primaryFieldId) {
      onPrimaryFieldChange?.(pdf.primaryFieldId);
    }
  }, [pdf.primaryFieldId, onPrimaryFieldChange]);

  const handleBuildPdf = () =>
    buildPdfService({
      groups: pdf.groups,
      hasLoaded: pdf.hasLoaded,
      testName: pdf.testName,
      testSampleType: pdf.testSampleType,
      testSampleName: pdf.testSampleName,
      setStatus: pdf.setStatus,
      setError: pdf.setError,
      setLoading: pdf.setLoading,
      recordId: pdf.selectedRecordId,
      tableId: pdf.tableId,
      attachmentFieldId: pdfAttachmentFieldId
    });

  if (pdf.initLoading) {
    return (
      <div className="card">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>正在加载记录列表...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2>选择测试记录</h2>
          <div className="card-actions">
            <button
              className="button secondary"
              onClick={() => pdf.fetchRecordList(false)}
              disabled={pdf.recordListLoading || pdf.initLoading}
            >
              {pdf.recordListLoading ? '刷新中...' : '刷新记录'}
            </button>
          </div>
        </div>
        <p className="hint">
          索引列：<strong>{pdf.primaryFieldName}</strong> | 共 {pdf.allRecords.length} 条记录
        </p>

        <div className="search-box">
          <input
            className="input search-input"
            placeholder={`搜索 ${pdf.primaryFieldName}...`}
            value={pdf.searchKeyword}
            onChange={(e) => pdf.setSearchKeyword(e.target.value)}
          />
          {pdf.searchKeyword && (
            <button className="clear-btn" onClick={() => pdf.setSearchKeyword('')}>
              ✕
            </button>
          )}
        </div>

        <div className="record-list">
          {pdf.pagedRecords.length === 0 ? (
            <div className="empty-state">
              {pdf.searchKeyword ? '没有匹配的记录' : '当前视图没有记录'}
            </div>
          ) : (
            pdf.pagedRecords.map((record, idx) => (
              <div
                key={record.recordId}
                className={`record-item ${pdf.selectedRecordId === record.recordId ? 'selected' : ''}`}
                onClick={() => pdf.handleSelectRecord(record)}
              >
                <span className="record-index">{(pdf.currentPage - 1) * PAGE_SIZE + idx + 1}</span>
                <span className="record-name" title={record.primaryValue}>
                  {record.primaryValue || '(空)'}
                </span>
                {pdf.selectedRecordId === record.recordId && <span className="check-icon">✓</span>}
              </div>
            ))
          )}
        </div>

        {pdf.totalPages > 1 && (
          <div className="pagination">
            <button className="page-btn" disabled={pdf.currentPage === 1} onClick={() => pdf.setCurrentPage(pdf.currentPage - 1)}>
              ‹ 上一页
            </button>
            <span className="page-info">
              {pdf.currentPage} / {pdf.totalPages}
            </span>
            <button
              className="page-btn"
              disabled={pdf.currentPage === pdf.totalPages}
              onClick={() => pdf.setCurrentPage(pdf.currentPage + 1)}
            >
              下一页 ›
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h3>当前选择</h3>
        {pdf.selectedRecordId ? (
          <div className="selected-info">
            <span className="tag selected-tag">{pdf.selectedRecordName || pdf.selectedRecordId}</span>
          </div>
        ) : (
          <p className="hint">请从上方列表选择一条记录</p>
        )}

        <div className="row" style={{ marginTop: 12 }}>
          <button className="button" onClick={pdf.loadRecord} disabled={!pdf.selectedRecordId || pdf.loading}>
            读取数据
          </button>
          <button className="button secondary" onClick={handleBuildPdf} disabled={!pdf.hasLoaded || pdf.loading}>
            生成 PDF
          </button>
        </div>

        {pdf.status && <p className="status" style={{ marginTop: 8 }}>{pdf.status}</p>}
        {pdf.error && <p className="error">{pdf.error}</p>}
      </div>

      <div className="card">
        <h3>数据预览</h3>
        {pdf.hasLoaded ? (
          <>
            <div className="preview-meta">
              <span className="meta-item">
                <span className="meta-label">测试名称</span>
                <span className="meta-value">{pdf.testName || '未取到'}</span>
              </span>
              <span className="meta-item">
                <span className="meta-label">测试样品</span>
                <span className="meta-value">{pdf.testSampleName || '-'}</span>
              </span>
              <span className="meta-item">
                <span className="meta-label">测试类型</span>
                <span className="meta-value">{pdf.testSampleType}</span>
              </span>
            </div>
            <div className="preview-table">
              <div className="preview-table-header">
                <span className="col-key">组别</span>
                <span className="col-layout">排布 / 标注</span>
                <span className="col-correct">正确</span>
              </div>
              {pdf.groups.map((g) => (
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
  );
};

export default PdfMode;
