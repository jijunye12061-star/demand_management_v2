// 需求状态枚举 — 5 种状态全覆盖
export const STATUS_ENUM: Record<string, { text: string; status: string }> = {
  pending: { text: '待处理', status: 'Warning' },
  in_progress: { text: '处理中', status: 'Processing' },
  completed: { text: '已完成', status: 'Success' },
  withdrawn: { text: '已退回', status: 'Error' },
  canceled: { text: '已取消', status: 'Default' },
  deleted: { text: '已删除', status: 'Default' },  // ← 新增
};

// 需求类型选项（一级分类，5种）
export const REQUEST_TYPE_OPTIONS = [
  { label: '专项报告', value: '专项报告' },
  { label: '调研', value: '调研' },
  { label: '基金筛选', value: '基金筛选' },
  { label: '定期报告', value: '定期报告' },
  { label: '内部项目', value: '内部项目' },
];

// 二级分类选项（按一级分类索引，无二级分类的类型不含 key）
export const SUB_TYPE_OPTIONS: Record<string, { label: string; value: string }[]> = {
  专项报告: [
    { label: '定制报告', value: '定制报告' },
    { label: '深度报告', value: '深度报告' },
  ],
  调研: [
    { label: '线上独家调研', value: '线上独家调研' },
    { label: '线下专访调研', value: '线下专访调研' },
  ],
  定期报告: [
    { label: '周报', value: '周报' },
    { label: '月报', value: '月报' },
    { label: '季报', value: '季报' },
    { label: '其他周期', value: '其他周期' },
  ],
  内部项目: [
    { label: '课题研究', value: '课题研究' },
    { label: '系统建设', value: '系统建设' },
    { label: '培训赋能', value: '培训赋能' },
    { label: '数据库建设', value: '数据库建设' },
    { label: '客户拜访', value: '客户拜访' },
    { label: '其他', value: '其他' },
  ],
};

// 销售可选的需求类型（仅专项报告/基金筛选）
export const SALES_REQUEST_TYPE_OPTIONS = [
  { label: '专项报告', value: '专项报告' },
  { label: '基金筛选', value: '基金筛选' },
];

// 工作模式选项
export const WORK_MODE_OPTIONS = [
  { label: '服务模式', value: 'service' },
  { label: '主动模式', value: 'proactive' },
];

// 工作模式规则（与后端保持一致）
export const WORK_MODE_RULES: Record<string, { mode: 'locked' | 'user_select'; value?: string; default?: string }> = {
  专项报告: { mode: 'user_select', default: 'service' },
  调研: { mode: 'locked', value: 'proactive' },
  基金筛选: { mode: 'locked', value: 'service' },
  定期报告: { mode: 'user_select', default: 'proactive' },
  内部项目: { mode: 'locked', value: 'proactive' },
};

// 研究范围选项
export const RESEARCH_SCOPE_OPTIONS = [
  { label: '纯债', value: '纯债' },
  { label: '固收+', value: '固收+' },
  { label: '权益', value: '权益' },
  { label: '量化及指增', value: '量化及指增' },
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
