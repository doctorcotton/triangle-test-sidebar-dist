import React, { useState } from 'react';
import PdfMode from './components/PdfMode';
import StatMode from './components/StatMode';
import ConfigMode from './components/ConfigMode';
import { useConfig } from './hooks/useConfig';

const App: React.FC = () => {
  const [mode, setMode] = useState<'pdf' | 'stat' | 'config'>('pdf');
  const [primaryFieldId, setPrimaryFieldId] = useState<string>('');
  const config = useConfig(mode);

  const statProps = {
    statTableId: config.statTableId,
    statViewId: config.statViewId,
    statLinkFieldId: config.statLinkFieldId,
    statGroupFieldId: config.statGroupFieldId,
    statAnswerFieldId: config.statAnswerFieldId,
    statFeedbackFieldId: config.statFeedbackFieldId,
    statModifierFieldId: config.statModifierFieldId,
    statCreatedAtFieldId: config.statCreatedAtFieldId,
    statCorrectFieldMap: config.statCorrectFieldMap,
    testSampleTypeFieldId: config.testSampleTypeFieldId,
    reportTableId: config.reportTableId,
    reportFieldId: config.reportFieldId,
    reportConclusionFieldId: config.reportConclusionFieldId,
    pdfTableId: config.pdfTableId,
    pdfViewId: config.pdfViewId,
    primaryFieldId,
    testSampleNameFieldId: config.testSampleNameFieldId
  };

  return (
    <div className="app">
      <div className="tab-bar">
        <button className={`tab-btn ${mode === 'pdf' ? 'active' : ''}`} onClick={() => setMode('pdf')}>
          PDF 生成模式
        </button>
        <button className={`tab-btn ${mode === 'stat' ? 'active' : ''}`} onClick={() => setMode('stat')}>
          结果统计模式
        </button>
        <button className={`tab-btn ${mode === 'config' ? 'active' : ''}`} onClick={() => setMode('config')}>
          字段配置模式
        </button>
      </div>

      {mode === 'pdf' && (
        <PdfMode
          pdfTableId={config.pdfTableId}
          pdfViewId={config.pdfViewId}
          testSampleTypeFieldId={config.testSampleTypeFieldId}
          testSampleNameFieldId={config.testSampleNameFieldId}
          groupConfigs={config.groupConfigs}
          pdfAttachmentFieldId={config.pdfAttachmentFieldId}
          onPrimaryFieldChange={setPrimaryFieldId}
        />
      )}

      {mode === 'stat' && <StatMode {...statProps} />}

      {mode === 'config' && (
        <ConfigMode
          configMeta={config.configMeta}
          configDraft={config.configDraft}
          configMap={config.configMap}
          defaultConfigMap={config.defaultConfigMap}
          tableList={config.tableList}
          fieldMap={config.fieldMap}
          viewMap={config.viewMap}
          metaLoaded={config.metaLoaded}
          configTableId={config.configTableId}
          configStatus={config.configStatus}
          configError={config.configError}
          setConfigDraft={config.setConfigDraft}
          saveDraftToTable={config.saveDraftToTable}
          restoreDefaultDraft={config.restoreDefaultDraft}
        />
      )}
    </div>
  );
};

export default App;
