import {
  ALT_BASE_MAX_ALLOWED,
  ALT_MAX_N,
  ALT_MIN_N,
  ALT_SIMILARITY_MAX_TABLE,
  FACTORY_BASE_THRESHOLD,
  FACTORY_DIFF_THRESHOLD_TABLE,
  FACTORY_MAX_N,
  FACTORY_MIN_N,
  TEST_TYPE_RULES
} from '../constants';

// 计算二项分布尾概率，求显著性阈值（α=0.05, p=0.3 对应 Pd=30%）
export function binomProb(n: number, k: number, p: number): number {
  if (k < 0 || k > n) return 0;
  if (p <= 0 || p >= 1) return k === (p >= 1 ? n : 0) ? 1 : 0;
  // 使用对数组合数避免溢出
  let logComb = 0;
  const m = Math.min(k, n - k);
  for (let i = 1; i <= m; i++) {
    logComb += Math.log(n - m + i) - Math.log(i);
  }
  const logProb = logComb + k * Math.log(p) + (n - k) * Math.log(1 - p);
  return Math.exp(logProb);
}

export function binomTail(n: number, k: number, p: number): number {
  let sum = 0;
  for (let i = k; i <= n; i++) {
    sum += binomProb(n, i, p);
  }
  return sum;
}

export function getSignificanceThreshold(n: number, alpha = 0.05, p = 0.3): number {
  if (n <= 0) return 0;
  for (let k = 0; k <= n; k++) {
    const tail = binomTail(n, k, p);
    if (tail <= alpha) return k;
  }
  return n + 1; // 理论上不应该到达这里
}

export function clampSampleSize(n: number, minN: number, maxN: number): number {
  if (n <= minN) return minN;
  if (n >= maxN) return maxN;
  return n;
}

// 按测试类型获取显著性阈值（正确数达到该值即判定存在显著差异）
export function getThresholdByType(statTestType: string, sampleSize: number): number {
  if (statTestType === '工厂样品') {
    const n = clampSampleSize(sampleSize, FACTORY_MIN_N, FACTORY_MAX_N);
    if (n <= FACTORY_MIN_N) return FACTORY_BASE_THRESHOLD;
    const tableVal = FACTORY_DIFF_THRESHOLD_TABLE[n];
    return tableVal ?? FACTORY_DIFF_THRESHOLD_TABLE[FACTORY_MAX_N] ?? FACTORY_BASE_THRESHOLD;
  }

  // 默认按备选测试相似判定
  const n = clampSampleSize(sampleSize, ALT_MIN_N, ALT_MAX_N);
  if (n <= ALT_MIN_N) return ALT_BASE_MAX_ALLOWED + 1; // 17
  const xMax = ALT_SIMILARITY_MAX_TABLE[n];
  return (xMax ?? ALT_SIMILARITY_MAX_TABLE[ALT_MAX_N] ?? ALT_BASE_MAX_ALLOWED) + 1;
}

export function getAlphaByType(statTestType: string): number {
  const rule = TEST_TYPE_RULES[statTestType];
  return rule?.alpha ?? 0.05;
}
