// 需求状态枚举 — 5 种状态全覆盖
export const STATUS_ENUM: Record<string, { text: string; status: string }> = {
  pending: { text: '待处理', status: 'Warning' },
  in_progress: { text: '处理中', status: 'Processing' },
  completed: { text: '已完成', status: 'Success' },
  withdrawn: { text: '已退回', status: 'Error' },
  canceled: { text: '已取消', status: 'Default' },
  deleted: { text: '已删除', status: 'Default' },  // ← 新增
};

// 需求类型选项
export const REQUEST_TYPE_OPTIONS = [
  { label: '基金筛选', value: '基金筛选' },
  { label: '报告定制', value: '报告定制' },
  { label: '定期报告', value: '定期报告' },
  { label: '调研', value: '调研' },
  { label: '量化策略开发', value: '量化策略开发' },
  { label: '工具/系统开发', value: '工具/系统开发' },
  { label: '其他', value: '其他' },
];

// 研究范围选项
export const RESEARCH_SCOPE_OPTIONS = [
  { label: '纯债', value: '纯债' },
  { label: '固收+', value: '固收+' },
  { label: '权益', value: '权益' },
  { label: '量化', value: '量化' },
  { label: '资产配置', value: '资产配置' },
  { label: '综合/行业', value: '综合/行业' },
  { label: '不涉及', value: '不涉及' },
];

// 机构类型与部门的级联映射字典
export const ORG_DEPARTMENT_MAP: Record<string, string[]> = {
  '银行': ['金市', '资管', '其他'],
  '券商': ['自营', '资管', '其他'],
  '保险': ['母公司', '资管', '其他'],
};
