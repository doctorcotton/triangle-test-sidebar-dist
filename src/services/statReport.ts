import { GroupKey } from '../configEditor';
import { TEST_TYPE_RULES, FACTORY_MIN_N, FACTORY_MAX_N, FACTORY_BASE_THRESHOLD, ALT_MIN_N, ALT_MAX_N, ALT_BASE_MAX_ALLOWED } from '../constants';
import { StatRecord } from '../types';
import { clampSampleSize, getAlphaByType, getThresholdByType } from '../utils/statistics';

interface StatReportParams {
  selectedStatRecords: StatRecord[];
  statTestType: string;
  statGroupSize: number;
  statCountWarning: string;
  selectedTestName: string;
  statSampleName: string;
}

interface StatReportResult {
  md?: string;
  status?: string;
  error?: string;
  pass?: boolean;
}

export function buildStatReport({
  selectedStatRecords,
  statTestType,
  statGroupSize,
  statCountWarning,
  selectedTestName,
  statSampleName
}: StatReportParams): StatReportResult {
  if (!selectedStatRecords.length) {
    return { error: '当前选择的测试无记录，请先读取数据或切换测试名称。' };
  }

  const records = selectedStatRecords;
  const totalPeople = records.length;
  const typeRule = TEST_TYPE_RULES[statTestType];
  const expectedPerGroup = Math.max(statGroupSize, typeRule?.groupSize ?? 0);
  const expectedTotalByRule = Math.max(0, expectedPerGroup) * 6;
  const countMismatch = expectedTotalByRule > 0 && totalPeople !== expectedTotalByRule;
  const countShortage = expectedTotalByRule > 0 && totalPeople < expectedTotalByRule;
  const correctCount = records.filter((r) => r.answer === r.correct).length;
  const alpha = getAlphaByType(statTestType);
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

  const optionStr = (optionCount: Record<string, number>) =>
    Object.entries(optionCount)
      .sort((a, b) => b[1] - a[1])
      .map(([opt, cnt]) => `${opt || '-'}(${cnt})`)
      .join('，');

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

  const warningLines = statCountWarning ? [`> ⚠️ **样本量提示**：${statCountWarning}`, ''] : [];
  const expectedDesc =
    expectedTotalByRule > 0
      ? `模板预期样本量：每组 **${expectedPerGroup}** 人 × 6 组 = **${expectedTotalByRule}** 份；实际问卷 **${totalPeople}** 份。`
      : '每组预期人数未设置，实际以记录为准。';

  const md = [
    '## 一、测试批次',
    '',
    `- **测试名称**：${selectedTestName || '未获取到测试批次名称'}`,
    `- **测试样品**：${statSampleName || '未获取'}`,
    '',
    '## 二、测试方法',
    '',
    '参照国家标准 **GB/T 12311-2012《感官分析方法 三点检验》** 进行三点品评。',
    '',
    '## 三、测试原理',
    '',
    `- **测试类型**：\`${statTestType}\`（α=${alpha}）`,
    `- **判定规则**：${passRuleDescWithType}`,
    `- **样本量说明**：${expectedDesc}`,
    '',
    '## 四、测试结果',
    '',
    ...warningLines,
    resultDesc,
    '',
    '## 五、测试结论',
    '',
    `**${conclusion}**`,
    '',
    '---',
    '',
    '### 表1：各组三联样检验结果',
    '',
    '| 组别 | 人数 | 正确 | 正确率 | 选项分布 |',
    '| :---: | :---: | :---: | :---: | :--- |',
    groupTableRows,
    '',
    '### 表2：正确记录明细',
    '',
    '| 组别 | 填表人 | 评价 |',
    '| :---: | :---: | :--- |',
    correctRows,
    '',
    '---',
    '',
    '> 💡 **说明**：选项分布按问卷选择计数；显著性判定按 GB/T 12311 表 A.1（p=0.30，α=0.05）自动计算。'
  ].join('\n');

  return {
    md,
    status: statCountWarning ? `${statCountWarning} 已生成报告，可复制为 MD` : '报告已生成，可复制为 MD',
    pass
  };
}
