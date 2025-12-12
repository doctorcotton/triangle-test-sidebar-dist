// 静态默认值：来自字段配置表.md，作为优先级最高的字段/表/视图 ID
export const CONFIG_TABLE_DEFAULTS: Record<string, string> = {
  A1_optionFieldId: 'fldaKY29FG',
  A1_correctFieldId: 'fldy2bWWRv',
  A1_qrSourceFieldId: 'fldsR3zqWR',
  A2_optionFieldId: 'fld2RHpy0u',
  A2_correctFieldId: 'fldx2o3Lgi',
  A2_qrSourceFieldId: 'fldXywMvbk',
  A3_optionFieldId: 'fldydHFBk4',
  A3_correctFieldId: 'fld31W1nwZ',
  A3_qrSourceFieldId: 'fldOBZBKmf',
  B1_optionFieldId: 'fldTdq0EFW',
  B1_correctFieldId: 'fldcVgt7y4',
  B1_qrSourceFieldId: 'fldnBKUnXQ',
  B2_optionFieldId: 'fld6vytGo3',
  B2_correctFieldId: 'fldXXl0x45',
  B2_qrSourceFieldId: 'fldMEoecGf',
  B3_optionFieldId: 'fldvVuWrqI',
  B3_correctFieldId: 'fldAmxNmoT',
  B3_qrSourceFieldId: 'fld2C4HTQN',
  PDF_TABLE_ID: 'tbl4gdJDT2WIsQaR',
  PDF_VIEW_ID: 'vew49qffkw',
  TEST_SAMPLE_TYPE_FIELD_ID: 'fldVkMXRX7',
  TEST_SAMPLE_NAME_FIELD_ID: 'fldx25ZXnv',
  STAT_TABLE_ID: 'tblqlWkjrBQgkjLC',
  STAT_VIEW_ID: 'vewbF4p4Un',
  STAT_LINK_FIELD_ID: 'fld8AEYidF',
  STAT_GROUP_FIELD_ID: 'fldZEVzEE5',
  STAT_ANSWER_FIELD_ID: 'fldLgMDaNj',
  STAT_FEEDBACK_FIELD_ID: 'fldsKoAS0M',
  STAT_MODIFIER_FIELD_ID: 'fldu5Grtf7',
  STAT_CREATED_AT_FIELD_ID: 'fldXUKS5mb',
  STAT_CORRECT_A1: 'flduEMPPTd',
  STAT_CORRECT_A2: 'fldpSDUY17',
  STAT_CORRECT_A3: 'fldvaU1KNG',
  STAT_CORRECT_B1: 'fldKIGeara',
  STAT_CORRECT_B2: 'fldnRbSCsb',
  STAT_CORRECT_B3: 'fld3RP57ua',
  REPORT_TABLE_ID: 'tbl4gdJDT2WIsQaR',
  REPORT_FIELD_ID: 'fld45x2mhv',
  REPORT_CONCLUSION_FIELD_ID: 'fldUSbIS4n',
  PDF_ATTACHMENT_FIELD_ID: 'fldkpzT3Dz'
};

// 表名映射：用于根据表名匹配表 ID
export const TABLE_NAME_MAPPING: Record<string, string> = {
  PDF_TABLE_ID: '三点测试项目表',
  STAT_TABLE_ID: '三点测试问卷结果表',
  REPORT_TABLE_ID: '三点测试项目表'
};

// 视图名映射：用于根据视图名匹配视图 ID
export const VIEW_NAME_MAPPING: Record<string, string> = {
  PDF_VIEW_ID: '总表',
  STAT_VIEW_ID: '结果统计'
};

// 字段名映射：用于根据字段名匹配字段 ID（模糊匹配，忽略空格/大小写）
export const FIELD_NAME_MAPPING: Record<string, string> = {
  TEST_SAMPLE_TYPE_FIELD_ID: '测试类型字段',
  TEST_SAMPLE_NAME_FIELD_ID: '测试样品名称字段',
  PDF_ATTACHMENT_FIELD_ID: '测试方案附件字段',
  // 六组字段（PDF表）
  A1_optionFieldId: 'A1选项',
  A1_correctFieldId: 'A1正确答案',
  A1_qrSourceFieldId: 'A1二维码',
  A2_optionFieldId: 'A2选项',
  A2_correctFieldId: 'A2正确答案',
  A2_qrSourceFieldId: 'A2二维码',
  A3_optionFieldId: 'A3选项',
  A3_correctFieldId: 'A3正确答案',
  A3_qrSourceFieldId: 'A3二维码',
  B1_optionFieldId: 'B1选项',
  B1_correctFieldId: 'B1正确答案',
  B1_qrSourceFieldId: 'B1二维码',
  B2_optionFieldId: 'B2选项',
  B2_correctFieldId: 'B2正确答案',
  B2_qrSourceFieldId: 'B2二维码',
  B3_optionFieldId: 'B3选项',
  B3_correctFieldId: 'B3正确答案',
  B3_qrSourceFieldId: 'B3二维码',
  // 统计模式基础字段
  STAT_LINK_FIELD_ID: '关联三点测试名称',
  STAT_GROUP_FIELD_ID: '组别',
  STAT_ANSWER_FIELD_ID: '问卷结果',
  STAT_FEEDBACK_FIELD_ID: '评价',
  STAT_MODIFIER_FIELD_ID: '修改人',
  STAT_CREATED_AT_FIELD_ID: '创建日期',
  // 统计表正确答案映射
  STAT_CORRECT_A1: 'A1正确答案',
  STAT_CORRECT_A2: 'A2正确答案',
  STAT_CORRECT_A3: 'A3正确答案',
  STAT_CORRECT_B1: 'B1正确答案',
  STAT_CORRECT_B2: 'B2正确答案',
  STAT_CORRECT_B3: 'B3正确答案',
  // 报告写入
  REPORT_FIELD_ID: '报告字段',
  REPORT_CONCLUSION_FIELD_ID: '测试结论字段'
};

