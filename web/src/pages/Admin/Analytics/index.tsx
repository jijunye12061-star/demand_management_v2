import React, { useState, useEffect, useMemo } from 'react';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { Tabs, Segmented, Card, Row, Col, Spin, Input, Select, Space, App } from 'antd';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import {
  getCharts, getResearcherMatrix, getTypeMatrix,
  getOrgMatrix, getSalesMatrix, getDownloadStats,
} from '@/services/admin';

const COLORS = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16', '#2f54eb', '#a0d911'];

const PERIOD_ITEMS = [
  { label: '今日', value: 'today' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '当季', value: 'quarter' },
  { label: '今年', value: 'year' },
];

// ─────────────────────────────────────────────────────────
// 通用：周期选择器 + 简洁饼图/柱状图
// ─────────────────────────────────────────────────────────

const PeriodSelector: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <div style={{ marginBottom: 16 }}>
    <Segmented options={PERIOD_ITEMS} value={value} onChange={(v) => onChange(v as string)} />
  </div>
);

const RPie: React.FC<{ data: { name: string; value: number }[]; title: string; height?: number }> = ({ data, title, height = 280 }) => {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>暂无数据</div>;
  return (
    <Card title={title} size="small">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v: number) => [`${v} 件`, '数量']} />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────
// Tab 1: 统计看板
// ─────────────────────────────────────────────────────────

const ChartsTab: React.FC = () => {
  const { message } = App.useApp();
  const [period, setPeriod] = useState('month');
  const [charts, setCharts] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getCharts(period).then(setCharts).catch(() => message.error('获取图表数据失败')).finally(() => setLoading(false));
  }, [period]);

  const workload = charts?.researcher_workload || [];

  return (
    <Spin spinning={loading}>
      <PeriodSelector value={period} onChange={setPeriod} />
      <Row gutter={16}>
        <Col span={12}><RPie data={charts?.type_distribution || []} title="需求类型分布" /></Col>
        <Col span={12}><RPie data={charts?.org_type_distribution || []} title="客户类型分布" /></Col>
      </Row>
      <Card title="研究员工作量对比" size="small" style={{ marginTop: 16 }}>
        <ResponsiveContainer width="100%" height={Math.max(260, workload.length * 36)}>
          <BarChart data={workload} layout="vertical" margin={{ left: 60, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={70} />
            <Tooltip />
            <Legend />
            <Bar dataKey="completed" name="已完成" fill="#52c41a" stackId="a" />
            <Bar dataKey="in_progress" name="处理中" fill="#1890ff" stackId="a" />
            <Bar dataKey="pending" name="待处理" fill="#faad14" stackId="a" />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </Spin>
  );
};

// ─────────────────────────────────────────────────────────
// Tab 2: 研究员视角 (矩阵 + 图表)
// ─────────────────────────────────────────────────────────

const ResearcherTab: React.FC = () => {
  const { message } = App.useApp();
  const [matrix, setMatrix] = useState<any[]>([]);
  const [charts, setCharts] = useState<any>(null);
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(false);

  const load = async (p: string) => {
    setLoading(true);
    try {
      const [m, c] = await Promise.all([getResearcherMatrix(), getCharts(p)]);
      setMatrix(m);
      setCharts(c);
    } catch { message.error('加载失败'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(period); }, [period]);

  // 根据当前选择的 period 维度生成柱状图
  const periodKey = period as string;
  const barData = matrix.map((r) => ({ name: r.name, 完成件数: r[periodKey] || 0 })).filter(d => d.完成件数 > 0);
  const workload = charts?.researcher_workload || [];
  // 工时图
  const hoursData = workload.map((r: any) => ({ name: r.name, 已完成: r.completed, 处理中: r.in_progress, 待处理: r.pending }));

  const matrixCols: ProColumns<any>[] = [
    { title: '研究员', dataIndex: 'name', fixed: 'left', width: 100 },
    { title: '今日', dataIndex: 'today', sorter: (a: any, b: any) => a.today - b.today },
    { title: '本周', dataIndex: 'week', sorter: (a: any, b: any) => a.week - b.week },
    { title: '本月', dataIndex: 'month', sorter: (a: any, b: any) => a.month - b.month },
    { title: '当季', dataIndex: 'quarter', sorter: (a: any, b: any) => a.quarter - b.quarter },
    { title: '今年', dataIndex: 'year', sorter: (a: any, b: any) => a.year - b.year },
  ];

  // 总计行
  const summary = matrix.length ? {
    name: '合计',
    today: matrix.reduce((s, r) => s + (r.today || 0), 0),
    week: matrix.reduce((s, r) => s + (r.week || 0), 0),
    month: matrix.reduce((s, r) => s + (r.month || 0), 0),
    quarter: matrix.reduce((s, r) => s + (r.quarter || 0), 0),
    year: matrix.reduce((s, r) => s + (r.year || 0), 0),
  } : null;

  return (
    <Spin spinning={loading}>
      <PeriodSelector value={period} onChange={setPeriod} />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card title={`研究员完成件数 (${PERIOD_ITEMS.find(p => p.value === period)?.label})`} size="small">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={barData} margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="完成件数" fill="#1890ff" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col span={12}>
          <Card title="研究员任务状态分布" size="small">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={hoursData} margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="已完成" fill="#52c41a" stackId="s" />
                <Bar dataKey="处理中" fill="#1890ff" stackId="s" />
                <Bar dataKey="待处理" fill="#faad14" stackId="s" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      {/* 需求类型 + 客户类型分布 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}><RPie data={charts?.type_distribution || []} title="需求类型分布" height={240} /></Col>
        <Col span={12}><RPie data={charts?.org_type_distribution || []} title="客户类型分布" height={240} /></Col>
      </Row>

      <ProTable
        headerTitle="研究员完成数矩阵 (按时间维度)"
        columns={matrixCols}
        dataSource={summary ? [...matrix, summary] : matrix}
        rowKey="name"
        search={false} pagination={false} options={false} size="middle"
        rowClassName={(r) => r.name === '合计' ? 'ant-table-row-summary' : ''}
      />
    </Spin>
  );
};

// ─────────────────────────────────────────────────────────
// Tab 3: 需求类型视角
// ─────────────────────────────────────────────────────────

const TypeTab: React.FC = () => {
  const { message } = App.useApp();
  const [matrix, setMatrix] = useState<any[]>([]);
  const [charts, setCharts] = useState<any>(null);
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([getTypeMatrix(), getCharts(period)])
      .then(([m, c]) => { setMatrix(m); setCharts(c); })
      .catch(() => message.error('加载失败'))
      .finally(() => setLoading(false));
  }, [period]);

  const periodKey = period;
  const barData = matrix.map(r => ({ name: r.name, 完成件数: r[periodKey] || 0 })).filter(d => d.完成件数 > 0);

  const matrixCols: ProColumns<any>[] = [
    { title: '需求类型', dataIndex: 'name', fixed: 'left', width: 120 },
    { title: '今日', dataIndex: 'today', sorter: (a: any, b: any) => a.today - b.today },
    { title: '本周', dataIndex: 'week', sorter: (a: any, b: any) => a.week - b.week },
    { title: '本月', dataIndex: 'month', sorter: (a: any, b: any) => a.month - b.month },
    { title: '当季', dataIndex: 'quarter', sorter: (a: any, b: any) => a.quarter - b.quarter },
    { title: '今年', dataIndex: 'year', sorter: (a: any, b: any) => a.year - b.year },
  ];

  const summary = matrix.length ? {
    name: '合计',
    ...['today', 'week', 'month', 'quarter', 'year'].reduce((acc: any, k) => {
      acc[k] = matrix.reduce((s, r) => s + (r[k] || 0), 0); return acc;
    }, {}),
  } : null;

  return (
    <Spin spinning={loading}>
      <PeriodSelector value={period} onChange={setPeriod} />
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card title={`需求类型件数 (${PERIOD_ITEMS.find(p => p.value === period)?.label})`} size="small">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="完成件数" fill="#1890ff">
                  {barData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col span={12}>
          <RPie data={charts?.type_distribution || []} title="需求类型占比" height={260} />
        </Col>
      </Row>
      <ProTable
        headerTitle="需求类型完成数矩阵"
        columns={matrixCols}
        dataSource={summary ? [...matrix, summary] : matrix}
        rowKey="name"
        search={false} pagination={false} options={false} size="middle"
        rowClassName={(r) => r.name === '合计' ? 'ant-table-row-summary' : ''}
      />
    </Spin>
  );
};

// ─────────────────────────────────────────────────────────
// Tab 4: 客户视角
// ─────────────────────────────────────────────────────────

const OrgTab: React.FC = () => {
  const { message } = App.useApp();
  const [data, setData] = useState<any[]>([]);
  const [charts, setCharts] = useState<any>(null);
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([getOrgMatrix(), getCharts(period)])
      .then(([d, c]) => { setData(d); setCharts(c); })
      .catch(() => message.error('加载失败'))
      .finally(() => setLoading(false));
  }, [period]);

  // Top 10 机构
  const top10 = [...data].sort((a, b) => b.count - a.count).slice(0, 10);
  const pieData = top10.map(d => ({ name: d.name, value: d.count }));

  const cols: ProColumns<any>[] = [
    { title: '机构名称', dataIndex: 'name', fixed: 'left', width: 150 },
    { title: '需求数', dataIndex: 'count', sorter: (a: any, b: any) => a.count - b.count },
    { title: '总工时(h)', dataIndex: 'hours', render: (v: any) => (v ?? 0).toFixed(1), sorter: (a: any, b: any) => a.hours - b.hours },
  ];

  const summary = data.length ? {
    name: '合计',
    count: data.reduce((s, r) => s + (r.count || 0), 0),
    hours: Math.round(data.reduce((s, r) => s + (r.hours || 0), 0) * 10) / 10,
  } : null;

  return (
    <Spin spinning={loading}>
      <PeriodSelector value={period} onChange={setPeriod} />
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card title="Top 10 机构需求量" size="small">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={top10} layout="vertical" margin={{ left: 80, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={80} />
                <Tooltip />
                <Bar dataKey="count" name="需求数" fill="#1890ff" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col span={12}>
          <RPie data={charts?.org_type_distribution || []} title="客户类型占比" height={280} />
        </Col>
      </Row>
      <ProTable
        headerTitle="全部机构统计"
        columns={cols}
        dataSource={summary ? [...data, summary] : data}
        rowKey="name"
        search={false} pagination={{ pageSize: 15 }} options={false} size="middle"
        rowClassName={(r) => r.name === '合计' ? 'ant-table-row-summary' : ''}
      />
    </Spin>
  );
};

// ─────────────────────────────────────────────────────────
// Tab 5: 销售视角
// ─────────────────────────────────────────────────────────

const SalesTab: React.FC = () => {
  const { message } = App.useApp();
  const [matrix, setMatrix] = useState<any[]>([]);
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getSalesMatrix().then(setMatrix).catch(() => message.error('加载失败')).finally(() => setLoading(false));
  }, []);

  const periodKey = period;
  const barData = matrix.map(r => ({ name: r.name, 完成件数: r[periodKey] || 0 })).filter(d => d.完成件数 > 0);

  const matrixCols: ProColumns<any>[] = [
    { title: '销售', dataIndex: 'name', fixed: 'left', width: 100 },
    { title: '今日', dataIndex: 'today', sorter: (a: any, b: any) => a.today - b.today },
    { title: '本周', dataIndex: 'week', sorter: (a: any, b: any) => a.week - b.week },
    { title: '本月', dataIndex: 'month', sorter: (a: any, b: any) => a.month - b.month },
    { title: '当季', dataIndex: 'quarter', sorter: (a: any, b: any) => a.quarter - b.quarter },
    { title: '今年', dataIndex: 'year', sorter: (a: any, b: any) => a.year - b.year },
  ];

  const summary = matrix.length ? {
    name: '合计',
    ...['today', 'week', 'month', 'quarter', 'year'].reduce((acc: any, k) => {
      acc[k] = matrix.reduce((s, r) => s + (r[k] || 0), 0); return acc;
    }, {}),
  } : null;

  return (
    <Spin spinning={loading}>
      <PeriodSelector value={period} onChange={setPeriod} />
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card title={`销售提交完成件数 (${PERIOD_ITEMS.find(p => p.value === period)?.label})`} size="small">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="完成件数" fill="#1890ff">
                  {barData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col span={12}>
          <RPie
            data={barData.map(d => ({ name: d.name, value: d.完成件数 }))}
            title="销售占比"
            height={260}
          />
        </Col>
      </Row>
      <ProTable
        headerTitle="销售提交完成数矩阵"
        columns={matrixCols}
        dataSource={summary ? [...matrix, summary] : matrix}
        rowKey="name"
        search={false} pagination={false} options={false} size="middle"
        rowClassName={(r) => r.name === '合计' ? 'ant-table-row-summary' : ''}
      />
    </Spin>
  );
};

// ─────────────────────────────────────────────────────────
// Tab 6: 下载统计 (带筛选 + 图表)
// ─────────────────────────────────────────────────────────

const DownloadsTab: React.FC = () => {
  const { message } = App.useApp();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [userFilter, setUserFilter] = useState<string>('');
  const [orgFilter, setOrgFilter] = useState<string>('');

  useEffect(() => {
    setLoading(true);
    getDownloadStats().then(setData).catch(() => message.error('获取下载统计失败')).finally(() => setLoading(false));
  }, []);

  // 过滤近期记录
  const filteredLogs = useMemo(() => {
    if (!data?.recent_logs) return [];
    return data.recent_logs.filter((log: any) => {
      if (userFilter && !log.user_name?.includes(userFilter)) return false;
      if (orgFilter && orgFilter !== '__none__' && log.org_name !== orgFilter) return false;
      if (orgFilter === '__none__' && log.org_name) return false;
      return true;
    });
  }, [data, userFilter, orgFilter]);

  // 机构下载分布图 (从近期记录聚合)
  const orgDistribution = useMemo(() => {
    if (!data?.recent_logs) return [];
    const map: Record<string, number> = {};
    data.recent_logs.forEach((log: any) => {
      const key = log.org_name || '(无关联机构)';
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [data]);

  // 唯一用户 & 机构列表 (for filter options)
  const userOptions = useMemo(() => {
    if (!data?.recent_logs) return [];
    return [...new Set(data.recent_logs.map((l: any) => l.user_name).filter(Boolean))];
  }, [data]);

  const orgOptions = useMemo(() => {
    if (!data?.recent_logs) return [];
    return [...new Set(data.recent_logs.map((l: any) => l.org_name).filter(Boolean))];
  }, [data]);

  const topColumns: ProColumns<any>[] = [
    { title: '排名', valueType: 'index', width: 60 },
    { title: '需求标题', dataIndex: 'title', ellipsis: true },
    { title: '下载次数', dataIndex: 'total_count', sorter: (a: any, b: any) => a.total_count - b.total_count },
    { title: '独立用户数', dataIndex: 'unique_users' },
  ];

  const logColumns: ProColumns<any>[] = [
    { title: '需求标题', dataIndex: 'request_title', ellipsis: true },
    { title: '下载人', dataIndex: 'user_name' },
    { title: '关联机构', dataIndex: 'org_name', render: (v: any) => v || '-' },
    { title: '下载时间', dataIndex: 'downloaded_at', valueType: 'dateTime' },
  ];

  return (
    <Spin spinning={loading}>
      {/* Top 10 + 机构分布图 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={14}>
          <Card title="Top 10 热门下载" size="small">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data?.top_downloads?.slice(0, 10) || []} layout="vertical" margin={{ left: 100, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis dataKey="title" type="category" tick={{ fontSize: 11 }} width={100} />
                <Tooltip />
                <Bar dataKey="total_count" name="下载次数" fill="#1890ff" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col span={10}>
          <RPie data={orgDistribution} title="关联机构下载分布" height={280} />
        </Col>
      </Row>

      {/* Top 10 表格 */}
      <ProTable
        headerTitle="Top 10 下载排行"
        columns={topColumns}
        dataSource={data?.top_downloads || []}
        rowKey="request_id"
        search={false} pagination={false} options={false} size="middle"
        style={{ marginBottom: 24 }}
      />

      {/* 筛选条 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <span>筛选：</span>
          <Select
            allowClear placeholder="按下载人筛选" style={{ width: 200 }}
            showSearch optionFilterProp="label"
            options={userOptions.map((u: string) => ({ label: u, value: u }))}
            onChange={(v) => setUserFilter(v || '')}
          />
          <Select
            allowClear placeholder="按关联机构筛选" style={{ width: 200 }}
            showSearch optionFilterProp="label"
            options={[
              { label: '(无关联机构)', value: '__none__' },
              ...orgOptions.map((o: string) => ({ label: o, value: o })),
            ]}
            onChange={(v) => setOrgFilter(v || '')}
          />
        </Space>
      </Card>

      <ProTable
        headerTitle={`近期下载记录 (${filteredLogs.length} 条)`}
        columns={logColumns}
        dataSource={filteredLogs}
        rowKey={(_, i) => `log-${i}`}
        search={false}
        pagination={{ pageSize: 15 }}
        options={false}
        size="middle"
      />
    </Spin>
  );
};

// ─────────────────────────────────────────────────────────
// 主页面
// ─────────────────────────────────────────────────────────

const Analytics: React.FC = () => {
  const items = [
    { key: 'charts', label: '统计看板', children: <ChartsTab /> },
    { key: 'researcher', label: '研究员视角', children: <ResearcherTab /> },
    { key: 'type', label: '需求类型视角', children: <TypeTab /> },
    { key: 'org', label: '客户视角', children: <OrgTab /> },
    { key: 'sales', label: '销售视角', children: <SalesTab /> },
    { key: 'downloads', label: '下载统计', children: <DownloadsTab /> },
  ];

  return (
    <PageContainer>
      <Card><Tabs items={items} destroyInactiveTabPane /></Card>
    </PageContainer>
  );
};

export default Analytics;
