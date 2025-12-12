import { GroupConfig, GroupKey } from './configEditor';

export interface LoadedGroup extends GroupConfig {
  options: string[];
  correct: string;
  qrSource: string;
  qrDataUrl?: string; // 二维码图片 Data URL
  sampleLabels: string[]; // 样品标注，如 ['备选', '备选', '标品']
}

export interface RecordItem {
  recordId: string;
  primaryValue: string;
}

export interface StatRecord {
  recordId: string;
  testName: string;
  groupKey: GroupKey;
  answer: string;
  correct: string;
  modifier?: string;
  feedback?: string;
  updatedAt?: number;
  createdAt?: number;
}

export interface ConfigMetaItem {
  key: string;
  label: string;
  category: string;
  type: 'table' | 'view' | 'field' | 'text';
  tableKey?: string;
  desc?: string;
  order?: number;
  fieldType?: number; // 字段类型限制，如 17 表示附件类型
}

export interface OptionMeta {
  id: string;
  name: string;
  type?: number; // 字段类型，用于过滤
}
