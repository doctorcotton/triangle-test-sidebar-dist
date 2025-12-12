import { useCallback, useEffect, useMemo, useState } from 'react';
import { bitable, IFieldMeta } from '@lark-base-open/js-sdk';
import QRCode from 'qrcode';
import { GroupConfig } from '../configEditor';
import { PAGE_SIZE } from '../constants';
import { LoadedGroup, RecordItem } from '../types';
import { fetchFieldValue, getSampleLabels, parseOptions, parseSelectOptionName, toText } from '../utils/dataParsing';

interface UsePdfModeParams {
  pdfTableId: string;
  pdfViewId: string;
  testSampleTypeFieldId: string;
  testSampleNameFieldId: string;
  groupConfigs: GroupConfig[];
}

export function usePdfMode({
  pdfTableId,
  pdfViewId,
  testSampleTypeFieldId,
  testSampleNameFieldId,
  groupConfigs
}: UsePdfModeParams) {
  const [tableId, setTableId] = useState<string>('');
  const [viewId, setViewId] = useState<string>('');
  const [primaryFieldId, setPrimaryFieldId] = useState<string>('');
  const [primaryFieldName, setPrimaryFieldName] = useState<string>('');

  const [allRecords, setAllRecords] = useState<RecordItem[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<RecordItem[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  const [selectedRecordId, setSelectedRecordId] = useState<string>('');
  const [selectedRecordName, setSelectedRecordName] = useState<string>('');

  const [testName, setTestName] = useState<string>('三点测试');
  const [testSampleType, setTestSampleType] = useState<string>('备选');
  const [testSampleName, setTestSampleName] = useState<string>('');
  const [groups, setGroups] = useState<LoadedGroup[]>([]);

  const [initLoading, setInitLoading] = useState<boolean>(true);
  const [recordListLoading, setRecordListLoading] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [status, setStatus] = useState<string>('');

  const totalPages = useMemo(() => Math.ceil(filteredRecords.length / PAGE_SIZE), [filteredRecords]);
  const pagedRecords = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredRecords.slice(start, start + PAGE_SIZE);
  }, [filteredRecords, currentPage]);

  const hasLoaded = useMemo(() => groups.length > 0, [groups]);

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
          primaryField = fieldMetaList.find((f) => f.type === 1) || fieldMetaList[0];
        }
        setPrimaryFieldId(primaryField?.id || '');
        setPrimaryFieldName(primaryField?.name || '索引列');

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

  useEffect(() => {
    fetchRecordList(true);
    const off = bitable.base.onSelectionChange(async () => {});
    return () => {
      off();
    };
  }, [fetchRecordList]);

  useEffect(() => {
    if (!searchKeyword.trim()) {
      setFilteredRecords(allRecords);
    } else {
      const keyword = searchKeyword.toLowerCase();
      const filtered = allRecords.filter((r) => r.primaryValue.toLowerCase().includes(keyword));
      setFilteredRecords(filtered);
    }
    setCurrentPage(1);
  }, [searchKeyword, allRecords]);

  const handleSelectRecord = useCallback((record: RecordItem) => {
    setSelectedRecordId(record.recordId);
    setSelectedRecordName(record.primaryValue);
    setGroups([]);
    setStatus('');
  }, []);

  const loadRecord = useCallback(async () => {
    if (!selectedRecordId) {
      setError('请先选择一条记录');
      return;
    }
    setError('');
    setStatus('正在读取数据...');
    setLoading(true);
    try {
      const table = await bitable.base.getTableById(tableId);

      if (primaryFieldId) {
        const nameVal = await fetchFieldValue(table, primaryFieldId, selectedRecordId);
        setTestName(toText(nameVal) || '三点测试');
      }

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

        let sampleLabels = getSampleLabels(options, correct, sampleType);
        if (cfg.key.startsWith('B')) {
          sampleLabels = sampleLabels.map((label) => (label === '标品' ? sampleType : '标品'));
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
  }, [groupConfigs, primaryFieldId, selectedRecordId, tableId, testSampleNameFieldId, testSampleTypeFieldId]);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  return {
    // 状态
    tableId,
    viewId,
    primaryFieldId,
    primaryFieldName,
    allRecords,
    filteredRecords,
    currentPage,
    searchKeyword,
    selectedRecordId,
    selectedRecordName,
    testName,
    testSampleType,
    testSampleName,
    groups,
    initLoading,
    recordListLoading,
    loading,
    error,
    status,
    totalPages,
    pagedRecords,
    hasLoaded,
    // 操作
    setSearchKeyword,
    fetchRecordList,
    handleSelectRecord,
    loadRecord,
    setCurrentPage: goToPage,
    setStatus,
    setError,
    setLoading
  };
}
