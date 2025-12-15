import { useCallback, useEffect, useMemo, useState } from 'react';
import { bitable } from '@lark-base-open/js-sdk';
import { DEFAULT_STAT_TEST_TYPE, TEST_TYPE_RULES } from '../constants';
import { GroupKey } from '../configEditor';
import { StatRecord } from '../types';
import { parseSelectOptionName, parseUserName, toText, toTimestamp } from '../utils/dataParsing';
import { buildStatReport } from '../services/statReport';

interface UseStatModeParams {
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

export function useStatMode({
  statTableId,
  statViewId,
  statLinkFieldId,
  statGroupFieldId,
  statAnswerFieldId,
  statFeedbackFieldId,
  statModifierFieldId,
  statCreatedAtFieldId,
  statCorrectFieldMap,
  testSampleTypeFieldId,
  reportTableId,
  reportFieldId,
  reportConclusionFieldId,
  pdfTableId,
  pdfViewId,
  primaryFieldId,
  testSampleNameFieldId
}: UseStatModeParams) {
  const [statRecords, setStatRecords] = useState<StatRecord[]>([]);
  const [selectedTestName, setSelectedTestName] = useState<string>('');
  const [statTestType, setStatTestType] = useState<string>(DEFAULT_STAT_TEST_TYPE);
  const [statSampleName, setStatSampleName] = useState<string>('');
  const [statGroupSize, setStatGroupSize] = useState<number>(6);
  const [statReportMd, setStatReportMd] = useState<string>('');
  const [statReportForTestName, setStatReportForTestName] = useState<string>(''); // 记录当前报告对应的任务名称
  const [statLoading, setStatLoading] = useState<boolean>(false);
  const [statError, setStatError] = useState<string>('');
  const [statStatus, setStatStatus] = useState<string>('');
  const [statWriteRecordId, setStatWriteRecordId] = useState<string>('');
  const [statTestSearch, setStatTestSearch] = useState<string>('');
  const [timeRange, setTimeRange] = useState<'2weeks' | '1month' | '2months' | '3months'>('2weeks');

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
    [pdfTableId, pdfViewId, primaryFieldId, testSampleNameFieldId]
  );

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
    // 切换任务时，如果报告不是当前任务的，清除旧报告
    if (statReportForTestName && statReportForTestName !== selectedTestName) {
      setStatReportMd('');
      setStatReportForTestName('');
    }
  }, [selectedTestName, fetchSampleNameByTest, statReportForTestName]);

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

  const statExpectedTotal = useMemo(() => Math.max(0, effectiveStatGroupSize) * 6, [effectiveStatGroupSize]);
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

  // 计算时间范围的起始时间戳
  const getTimeRangeStartTimestamp = useCallback((range: '2weeks' | '1month' | '2months' | '3months'): number => {
    const now = Date.now();
    const ranges = {
      '2weeks': 14 * 24 * 60 * 60 * 1000, // 14天
      '1month': 30 * 24 * 60 * 60 * 1000, // 30天
      '2months': 60 * 24 * 60 * 60 * 1000, // 60天
      '3months': 90 * 24 * 60 * 60 * 1000 // 90天
    };
    return now - ranges[range];
  }, []);

  const loadStatData = useCallback(async () => {
    setStatError('');
    const timeRangeStart = getTimeRangeStartTimestamp(timeRange);
    const timeRangeLabel = {
      '2weeks': '最近2周',
      '1month': '最近1个月',
      '2months': '最近2个月',
      '3months': '最近3个月'
    }[timeRange];
    setStatStatus(`正在读取统计数据（${timeRangeLabel}）...`);
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

      // 获取字段对象（一次性获取，避免重复调用）
      setStatStatus(`正在准备批量读取（${timeRangeLabel}）...`);
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

      // 批量获取字段值：使用 Promise.all 并行获取
      const validRecordIds = recordIds.filter((id): id is string => !!id);
      const totalCount = validRecordIds.length;
      setStatStatus(`正在批量读取记录数据（${timeRangeLabel}）... 0/${totalCount}`);

      const temp: StatRecord[] = [];
      
      // 批量处理：每次处理50条记录，避免一次性处理太多导致内存问题
      const batchSize = 50;
      for (let batchStart = 0; batchStart < validRecordIds.length; batchStart += batchSize) {
        const batchEnd = Math.min(batchStart + batchSize, validRecordIds.length);
        const batchIds = validRecordIds.slice(batchStart, batchEnd);
        
        setStatStatus(`正在批量读取记录数据（${timeRangeLabel}）... ${batchStart}/${totalCount}`);
        
        // 并行获取这一批记录的所有字段值
        const batchPromises = batchIds.map(async (rid) => {
          try {
            // 并行获取所有字段值
            const [
              updatedAtResult,
              createdRaw,
              testNameRaw,
              groupRaw,
              answerRaw,
              feedbackRaw,
              modifierRaw,
              sampleTypeRaw
            ] = await Promise.all([
              // 获取更新时间
              (async () => {
                try {
                  const recMeta = (await (table as any)?.getRecord?.(rid)) || null;
                  return (recMeta as any)?.updatedAt || 0;
                } catch {
                  return 0;
                }
              })(),
              // 获取创建时间
              createdField.getValue(rid).catch(() => null),
              // 获取其他字段
              linkField.getValue(rid).catch(() => null),
              groupField.getValue(rid).catch(() => null),
              answerField.getValue(rid).catch(() => null),
              feedbackField.getValue(rid).catch(() => null),
              modifierField.getValue(rid).catch(() => null),
              sampleTypeField ? sampleTypeField.getValue(rid).catch(() => null) : Promise.resolve(null)
            ]);

            const updatedAt = updatedAtResult;
            const createdAt = createdRaw ? toTimestamp(createdRaw) : 0;

            // 时间过滤：只处理创建时间在时间范围内的记录
            if (createdAt > 0 && createdAt < timeRangeStart) {
              return null;
            }

            const testName = toText(testNameRaw);
            const groupText = toText(groupRaw).toUpperCase() as GroupKey;
            if (!['A1', 'A2', 'A3', 'B1', 'B2', 'B3'].includes(groupText)) {
              return null;
            }

            const answer = parseSelectOptionName(answerRaw);
            const correctFieldId = statCorrectFieldMap[groupText];
            if (!correctFieldCache[groupText]) {
              correctFieldCache[groupText] = await table.getField(correctFieldId);
            }
            const correctRaw = await correctFieldCache[groupText]!.getValue(rid).catch(() => null);
            const correct = correctRaw ? (parseSelectOptionName(correctRaw) || toText(correctRaw)) : '';

            const feedback = feedbackRaw ? toText(feedbackRaw) : '';
            const modifier = modifierRaw ? parseUserName(modifierRaw) : '';

            if (!detectedSampleType && sampleTypeRaw) {
              const sampleTypeText = toText(sampleTypeRaw);
              if (sampleTypeText) {
                detectedSampleType = sampleTypeText;
              }
            }

            return {
              recordId: rid,
              testName,
              groupKey: groupText,
              answer,
              correct,
              modifier,
              feedback,
              updatedAt,
              createdAt
            } as StatRecord;
          } catch (e) {
            console.warn('[stat] 读取记录失败', rid, e);
            return null;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        const validResults = batchResults.filter((r): r is StatRecord => r !== null);
        temp.push(...validResults);
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
      const filteredCount = temp.length;
      const totalFiltered = recordIds.length;
      setStatStatus(`读取完成，共 ${filteredCount} 条记录（${timeRangeLabel}，从 ${totalFiltered} 条中筛选）`);
      
      // 记录数量警告
      if (filteredCount > 10000) {
        console.warn(`[stat] 警告：读取的记录数量较多（${filteredCount} 条），可能影响性能`);
      }
    } catch (err) {
      console.error('[stat] 读取失败', err);
      setStatError('读取统计数据失败，请检查视图与字段配置。');
      setStatStatus('');
    } finally {
      setStatLoading(false);
    }
  }, [
    statTableId,
    statViewId,
    statLinkFieldId,
    statGroupFieldId,
    statAnswerFieldId,
    statFeedbackFieldId,
    statModifierFieldId,
    statCreatedAtFieldId,
    statCorrectFieldMap,
    testSampleTypeFieldId,
    selectedTestName,
    timeRange,
    getTimeRangeStartTimestamp
  ]);

  const buildReport = useCallback(() => {
    setStatError('');
    const result = buildStatReport({
      selectedStatRecords,
      statTestType,
      statGroupSize,
      statCountWarning,
      selectedTestName,
      statSampleName
    });
    if (result.error) {
      setStatError(result.error);
      return;
    }
    if (result.md) {
      setStatReportMd(result.md);
      setStatReportForTestName(selectedTestName); // 记录报告对应的任务名称
    }
    setStatStatus(result.status || '');
  }, [selectedStatRecords, statTestType, statGroupSize, statCountWarning, selectedTestName, statSampleName]);

  const handleCopyMd = useCallback(async () => {
    if (!statReportMd) return;
    try {
      await navigator.clipboard.writeText(statReportMd);
      setStatStatus('MD 已复制到剪贴板');
    } catch {
      setStatStatus('复制失败，请手动选择文本复制');
    }
  }, [statReportMd]);

  const writeStatReportToField = useCallback(async () => {
    setStatError('');
    if (!selectedTestName) {
      setStatError('请先选择测试名称');
      return;
    }
    
    // 如果没有报告，或者报告不是当前任务的，自动生成报告
    let currentReportMd = statReportMd;
    if (!statReportMd || statReportForTestName !== selectedTestName) {
      setStatStatus('正在自动生成当前任务的报告...');
      const reportResult = buildStatReport({
        selectedStatRecords,
        statTestType,
        statGroupSize,
        statCountWarning,
        selectedTestName,
        statSampleName
      });
      if (reportResult.error) {
        setStatError(reportResult.error);
        setStatStatus('');
        return;
      }
      if (reportResult.md) {
        currentReportMd = reportResult.md;
        setStatReportMd(reportResult.md);
        setStatReportForTestName(selectedTestName);
      } else {
        setStatError('生成报告失败，请检查数据');
        setStatStatus('');
        return;
      }
    }
    
    setStatStatus('正在查找对应记录...');
    try {
      // 获取测试结论（pass值）
      const reportResult = buildStatReport({
        selectedStatRecords,
        statTestType,
        statGroupSize,
        statCountWarning,
        selectedTestName,
        statSampleName
      });
      const isPass = reportResult.pass ?? false;

      let targetRecordId: string | null = null;
      let matchedRecordId: string | null = null;

      // 首先尝试在 PDF 表中根据测试名称查找记录（按主键字段）
      const canSearchByTestName = pdfTableId && pdfViewId && primaryFieldId;
      if (canSearchByTestName) {
        try {
          const sourceTable = await bitable.base.getTableById(pdfTableId);
          const sourceView = await sourceTable.getViewById(pdfViewId);
          const nameField = await sourceTable.getField(primaryFieldId);
          const recordIds = await sourceView.getVisibleRecordIdList();

          for (const rid of recordIds) {
            if (!rid) continue;
            try {
              const value = await nameField.getValue(rid);
              const valueText = toText(value);
              if (valueText === selectedTestName) {
                matchedRecordId = rid;
                break;
              }
            } catch {
              // 忽略单条记录错误
            }
          }
        } catch (err) {
          console.warn('[stat] 通过测试名称查找记录失败，将使用手动输入的记录ID', err);
        }
      }

      // 如果 PDF 表找到匹配且写入表与 PDF 表相同，则直接使用该记录
      if (matchedRecordId && reportTableId === pdfTableId) {
        targetRecordId = matchedRecordId;
      }

      // 如果找不到，使用手动输入的记录ID
      if (!targetRecordId) {
        targetRecordId = statWriteRecordId.trim();
        if (!targetRecordId) {
          setStatError('未找到对应记录，请填写报告写入的记录 ID');
          setStatStatus('');
          return;
        }
        setStatStatus(`未找到匹配记录，使用记录 ID: ${targetRecordId}，正在写入报告...`);
      } else {
        setStatStatus(`找到对应记录，正在写入报告...`);
      }

      const table = await bitable.base.getTableById(reportTableId);
      const reportField = await table.getField(reportFieldId);
      await reportField.setValue(targetRecordId, currentReportMd);

      // 写入测试结论字段
      if (reportConclusionFieldId) {
        try {
          const conclusionField = await table.getField(reportConclusionFieldId);
          // 根据pass值设置选项：测试通过 optEymPCVi，测试不通过 optrN5PWei
          const optionId = isPass ? 'optEymPCVi' : 'optrN5PWei';
          await conclusionField.setValue(targetRecordId, optionId);
        } catch (conclusionErr) {
          console.warn('[stat] 写入测试结论失败', conclusionErr);
          // 不阻断主流程，只记录警告
        }
      }

      setStatStatus(`报告已成功写入到记录${targetRecordId === statWriteRecordId.trim() ? '' : `（${targetRecordId}）`}`);
    } catch (err) {
      console.error('[stat] 写入报告失败', err);
      setStatError('写入失败，请检查记录 ID/字段权限');
      setStatStatus('');
    }
  }, [statReportMd, statReportForTestName, statWriteRecordId, reportTableId, reportFieldId, reportConclusionFieldId, selectedTestName, pdfTableId, pdfViewId, primaryFieldId, selectedStatRecords, statTestType, statGroupSize, statCountWarning, statSampleName]);

  return {
    statRecords,
    selectedTestName,
    setSelectedTestName,
    statTestType,
    setStatTestType,
    statSampleName,
    statGroupSize,
    setStatGroupSize,
    statReportMd,
    statLoading,
    statError,
    statStatus,
    statWriteRecordId,
    setStatWriteRecordId,
    statTestSearch,
    setStatTestSearch,
    timeRange,
    setTimeRange,
    availableTestNames,
    selectedStatRecords,
    effectiveStatGroupSize,
    statSummary,
    statCountWarning,
    loadStatData,
    buildReport,
    handleCopyMd,
    writeStatReportToField,
    setStatError,
    setStatStatus
  };
}
