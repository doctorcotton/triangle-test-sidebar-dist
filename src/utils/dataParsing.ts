// 数据解析与格式化相关工具函数

export function toText(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'object' && val !== null) {
    // 处理数组类型
    if (Array.isArray(val)) {
      if (val.length === 0) return '';
      const first = val[0];
      if (typeof first === 'object' && first !== null && 'text' in first) {
        return String((first as any).text || '');
      }
      return String(first);
    }
    // 处理对象类型（如公式字段返回的对象）
    if ('text' in val) return String((val as any).text || '');
    if ('value' in val) return String((val as any).value || '');
  }
  return String(val);
}

export function parseOptions(raw: unknown): string[] {
  const text = toText(raw);
  if (!text) return [];
  const matches = text.match(/[A-Za-z0-9]+/g);
  return matches ?? [];
}

// 解析单选题选项名称
export function parseSelectOptionName(val: unknown): string {
  if (val == null) return '';
  if (Array.isArray(val) && val.length > 0) {
    const first = val[0] as any;
    if (first && typeof first === 'object') {
      return String(first.name || first.text || first.value || '');
    }
  }
  if (typeof val === 'object' && 'name' in (val as any)) {
    return String((val as any).name || '');
  }
  return toText(val);
}

// 解析用户/多维引用中的填表人
export function parseUserName(val: unknown): string {
  if (val == null) return '';
  const pickName = (obj: any) =>
    obj?.name || obj?.enName || obj?.en_name || obj?.text || obj?.value || '';
  if (Array.isArray(val) && val.length > 0) {
    const first = val[0];
    if (first && typeof first === 'object') {
      return String(pickName(first) || '');
    }
    return toText(first);
  }
  if (typeof val === 'object') {
    return String(pickName(val) || toText(val));
  }
  return toText(val);
}

export function toTimestamp(val: unknown): number {
  const text = toText(val);
  if (!text) return 0;
  const t = Date.parse(text);
  return Number.isFinite(t) ? t : 0;
}

// 根据正确答案位置生成样品标注
export function getSampleLabels(options: string[], correct: string, sampleType: string): string[] {
  if (options.length !== 3) return ['?', '?', '?'];
  const testLabel = sampleType || '备选'; // 备选 或 工厂样品
  const correctIndex = options.findIndex((opt) => opt === correct);

  // 生成标注数组：正确位置是"标品"，其他是testLabel
  return options.map((_, idx) => (idx === correctIndex ? '标品' : testLabel));
}

export async function fetchFieldValue(table: any, fieldId: string, recordId: string) {
  const field = await table.getField(fieldId);
  return field.getValue(recordId);
}
