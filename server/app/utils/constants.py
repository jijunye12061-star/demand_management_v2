REQUEST_TYPES = ["专项报告", "调研", "基金筛选", "定期报告", "内部项目"]

# 二级分类（按一级索引）- 基金筛选无子类型
SUB_TYPES = {
    "专项报告": ["定制报告", "深度报告"],
    "调研": ["线上独家调研", "线下专访调研"],
    "定期报告": ["周报", "月报", "季报", "其他周期"],
    "内部项目": ["课题研究", "系统建设", "培训赋能", "数据库建设", "客户拜访", "其他"],
}

RESEARCH_SCOPES = ["纯债", "固收+", "权益", "量化及指增", "资产配置", "综合/行业", "不涉及"]

ORG_TYPES = ["银行", "券商", "保险", "理财", "FOF", "信托", "私募", "期货", "其他"]

DEPARTMENT_MAP = {
    "银行": ["金市", "资管", "其他"],
    "券商": ["自营", "资管", "其他"],
    "保险": ["母公司", "资管", "其他"],
}

STATUSES = ["pending", "in_progress", "completed", "canceled", "withdrawn", "deleted"]

# 工作模式
WORK_MODES = ["service", "proactive"]

# work_mode 规则：locked=固定值, user_select=用户选择
WORK_MODE_RULES = {
    "专项报告": {"mode": "user_select", "default": "service"},
    "调研": {"mode": "locked", "value": "proactive"},
    "基金筛选": {"mode": "locked", "value": "service"},
    "定期报告": {"mode": "user_select", "default": "proactive"},
    "内部项目": {"mode": "locked", "value": "proactive"},
}

# Sales 可见的类型（仅 service 类）
SALES_REQUEST_TYPES = ["专项报告", "基金筛选"]
