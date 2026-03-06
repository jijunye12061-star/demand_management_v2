import React, { useState, useEffect } from 'react';
import { PageContainer, ProTable, StatisticCard } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { Tabs, Segmented, Card, Row, Col, Spin, Select, Space, App, Tag } from 'antd';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';
import {
  getCharts, getResearcherMatrix, getResearcherRanking, getTypeMatrix,
  getOrgMatrix, getSalesMatrix, getDownloadStats,
  getResearcherDetail, getTypeDetail, getOrgDetail, getSalesDetail,
} from '@/services/admin';
import { getRequests } from '@/services/api';
import type { RequestItem } from '@/services/typings';
import { STATUS_ENUM } from '@/utils/constants';

const COLORS = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16', '#2f54eb', '#a0d911'];

const PERIOD_ITEMS = [
  { label: '今日', value: 'today' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '当季', value: 'quarter' },
  { label: '今年', value: 'year' },
];

// ─── 通用组件 ─────────────────────────────────────────────

const PeriodSelector: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <div style={{ marginBottom: 16 }}>
    <Segmented options={PERIOD_ITEMS} value={value} onChange={(v) => onChange(v as string)} />
  </div>
);

const RPie: React.FC<{ data: { name: string; value: number }[]; title: string; height?: number }> = ({ data, title, height = 280 }) => {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <Card title={title} size="small"><div style={{ textAlign: 'center', color: '#999', padding: 40 }}>暂无数据</div></Card>;
  // @ts-ignore
  return (
    <Card title={title} size="small">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
            label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v: any) => [`${v} 件`, '数量']} />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  );
};

/** 周趋势折线图 */
const WeeklyTrend: React.FC<{ data: { week: string; count: number }[]; title: string }> = ({ data, title }) => (
  <Card title={title} size="small">
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ left: 0, right: 20 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="week" tick={{ fontSize: 10 }} />
        <YAxis allowDecimals={false} />
        <Tooltip />
        <Line type="monotone" dataKey="count" name="完成件数" stroke="#1890ff" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  </Card>
);

/** Top N 横向柱状图 */
const TopBar: React.FC<{ data: { name: string; value: number }[]; title: string; color?: string }> = ({ data, title, color = '#1890ff' }) => (
  <Card title={title} size="small">
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 36)}>
      <BarChart data={data} layout="vertical" margin={{ left: 80, right: 20 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" allowDecimals={false} />
        <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={80} />
        <Tooltip />
        <Bar dataKey="value" name="件数" fill={color} />
      </BarChart>
    </ResponsiveContainer>
  </Card>
);

/** 需求明细表（通用） */
const requestDetailCols: ProColumns<RequestItem>[] = [
  { title: '标题', dataIndex: 'title', ellipsis: true, width: 200 },
  { title: '需求类型', dataIndex: 'request_type', width: 100 },
  { title: '机构', dataIndex: 'org_name', ellipsis: true, width: 120 },
  { title: '研究员', dataIndex: 'researcher_name', width: 80 },
  {
    title: '状态', dataIndex: 'status', width: 80,
    render: (_, r) => { const c = STATUS_ENUM[r.status]; return <Tag color={c?.status?.toLowerCase()}>{c?.text || r.status}</Tag>; },
  },
  { title: '工时', dataIndex: 'work_hours', width: 60 },
  { title: '创建时间', dataIndex: 'created_at', valueType: 'dateTime', width: 160 },
];

/** 矩阵表通用列 */
const matrixCols = (label: string): ProColumns<any>[] => [
  { title: label, dataIndex: 'name', fixed: 'left', width: 120 },
  { title: '今日', dataIndex: 'today', sorter: (a: any, b: any) => a.today - b.today },
  { title: '本周', dataIndex: 'week', sorter: (a: any, b: any) => a.week - b.week },
  { title: '本月', dataIndex: 'month', sorter: (a: any, b: any) => a.month - b.month },
  { title: '当季', dataIndex: 'quarter', sorter: (a: any, b: any) => a.quarter - b.quarter },
  { title: '今年', dataIndex: 'year', sorter: (a: any, b: any) => a.year - b.year },
];

/** 矩阵合计行 */
const calcSummary = (matrix: any[]) => matrix.length ? {
  name: '合计',
  ...['today', 'week', 'month', 'quarter', 'year'].reduce((acc: any, k) => {
    acc[k] = matrix.reduce((s, r) => s + (r[k] || 0), 0); return acc;
  }, {}),
} : null;

// ═════════════════════════════════════════════════════════
// Tab 1: 研究员视角
// ═════════════════════════════════════════════════════════

const ResearcherTab: React.FC = () => {
  const { message } = App.useApp();
  const [matrix, setMatrix] = useState<any[]>([]);
  const [charts, setCharts] = useState<any>(null);
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | undefined>();
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 加载总览
  useEffect(() => {
    setLoading(true);
    Promise.all([getResearcherMatrix(), getCharts(period)])
      .then(([m, c]) => { setMatrix(m); setCharts(c); })
      .catch(() => message.error('加载失败'))
      .finally(() => setLoading(false));
  }, [period]);

  // 加载个人详情
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    setDetailLoading(true);
    getResearcherDetail(selectedId)
      .then(setDetail)
      .catch(() => message.error('获取研究员详情失败'))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  // 下拉选项：从 matrix 提取（matrix 已含 name，但无 user_id；用 ranking 数据更好）
  // 但 matrix 没有 user_id。需从 charts.researcher_workload 也没有。
  // 改用 researcher-ranking 获取 user_id → 但不想多发请求
  // 方案：从 matrix 用 name 做临时 key，detail 接口改用 name 查？不行，需 user_id。
  // 最好的做法：在 matrix 也返回 user_id。但改动大。
  // 折中：用 researcher-ranking 获取选项列表（已有 user_id + display_name）
  const [researchers, setResearchers] = useState<{ user_id: number; display_name: string }[]>([]);
  useEffect(() => {
    getResearcherRanking('year').then(setResearchers).catch(() => {});
  }, []);

  const periodKey = period;
  const barData = matrix.map(r => ({ name: r.name, 完成件数: r[periodKey] || 0 })).filter(d => d.完成件数 > 0);
  const workload = charts?.researcher_workload || [];
  const hoursData = workload.map((r: any) => ({ name: r.name, 已完成: r.completed, 处理中: r.in_progress, 待处理: r.pending }));
  const summary = calcSummary(matrix);

  return (
    <Spin spinning={loading || detailLoading}>
      <Space style={{ marginBottom: 16 }} wrap>
        <PeriodSelector value={period} onChange={setPeriod} />
        <Select
          allowClear placeholder="选择研究员查看个人详情"
          style={{ width: 240 }}
          showSearch optionFilterProp="label"
          options={researchers.map(r => ({ label: r.display_name, value: r.user_id }))}
          value={selectedId}
          onChange={(v) => setSelectedId(v)}
        />
      </Space>

      {/* ── 个人详情模式 ── */}
      {selectedId && detail ? (
        <>
          <StatisticCard.Group direction="row" style={{ marginBottom: 16 }}>
            <StatisticCard statistic={{ title: '已完成', value: detail.summary.completed, valueStyle: { color: '#52c41a' } }} />
            <StatisticCard statistic={{ title: '处理中', value: detail.summary.in_progress, valueStyle: { color: '#1890ff' } }} />
            <StatisticCard statistic={{ title: '待处理', value: detail.summary.pending, valueStyle: { color: '#faad14' } }} />
            <StatisticCard statistic={{ title: '总工时(h)', value: detail.summary.total_hours, valueStyle: { color: '#722ed1' } }} />
          </StatisticCard.Group>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={12}><WeeklyTrend data={detail.weekly_trend} title="近12周完成趋势" /></Col>
            <Col span={12}><RPie data={detail.type_distribution} title="需求类型分布" height={240} /></Col>
          </Row>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={24}><TopBar data={detail.org_distribution} title="服务机构 Top 10" color="#722ed1" /></Col>
          </Row>
          <ProTable<RequestItem>
            headerTitle="需求明细"
            columns={requestDetailCols}
            request={async (params) => getRequests({ researcher_id: selectedId, current: params.current, pageSize: params.pageSize })}
            rowKey="id" search={false} pagination={{ pageSize: 10 }} options={false} size="small"
          />
        </>
      ) : (
        /* ── 总览模式 ── */
        <>
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
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={12}><RPie data={charts?.type_distribution || []} title="需求类型分布" height={240} /></Col>
            <Col span={12}><RPie data={charts?.org_type_distribution || []} title="客户类型分布" height={240} /></Col>
          </Row>
          <ProTable
            headerTitle="研究员完成数矩阵 (按时间维度)"
            columns={matrixCols('研究员')}
            dataSource={summary ? [...matrix, summary] : matrix}
            rowKey="name" search={false} pagination={false} options={false} size="middle"
            rowClassName={(r) => r.name === '合计' ? 'ant-table-row-summary' : ''}
          />
        </>
      )}
    </Spin>
  );
};

// ═════════════════════════════════════════════════════════
// Tab 2: 需求类型视角
// ═════════════════════════════════════════════════════════

const TypeTab: React.FC = () => {
  const { message } = App.useApp();
  const [matrix, setMatrix] = useState<any[]>([]);
  const [charts, setCharts] = useState<any>(null);
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(false);
  const [selectedType, setSelectedType] = useState<string | undefined>();
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([getTypeMatrix(), getCharts(period)])
      .then(([m, c]) => { setMatrix(m); setCharts(c); })
      .catch(() => message.error('加载失败'))
      .finally(() => setLoading(false));
  }, [period]);

  useEffect(() => {
    if (!selectedType) { setDetail(null); return; }
    setDetailLoading(true);
    getTypeDetail(selectedType)
      .then(setDetail)
      .catch(() => message.error('获取类型详情失败'))
      .finally(() => setDetailLoading(false));
  }, [selectedType]);

  const periodKey = period;
  const barData = matrix.map(r => ({ name: r.name, 完成件数: r[periodKey] || 0 })).filter(d => d.完成件数 > 0);
  const summary = calcSummary(matrix);

  // 类型选项
  const typeOptions = matrix.map(r => ({ label: r.name, value: r.name }));

  return (
    <Spin spinning={loading || detailLoading}>
      <Space style={{ marginBottom: 16 }} wrap>
        <PeriodSelector value={period} onChange={setPeriod} />
        <Select
          allowClear placeholder="选择需求类型查看详情"
          style={{ width: 240 }}
          showSearch optionFilterProp="label"
          options={typeOptions}
          value={selectedType}
          onChange={(v) => setSelectedType(v)}
        />
      </Space>

      {selectedType && detail ? (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={12}><WeeklyTrend data={detail.weekly_trend} title={`${selectedType} 近12周完成趋势`} /></Col>
            <Col span={12}><RPie data={detail.researcher_distribution} title="研究员完成分布" height={240} /></Col>
          </Row>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={24}><TopBar data={detail.org_distribution} title="机构分布 Top 10" color="#13c2c2" /></Col>
          </Row>
          <ProTable<RequestItem>
            headerTitle={`${selectedType} 需求明细`}
            columns={requestDetailCols}
            request={async (params) => getRequests({ request_type: selectedType, status: 'completed', current: params.current, pageSize: params.pageSize })}
            rowKey="id" search={false} pagination={{ pageSize: 10 }} options={false} size="small"
          />
        </>
      ) : (
        <>
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
            columns={matrixCols('需求类型')}
            dataSource={summary ? [...matrix, summary] : matrix}
            rowKey="name" search={false} pagination={false} options={false} size="middle"
            rowClassName={(r) => r.name === '合计' ? 'ant-table-row-summary' : ''}
          />
        </>
      )}
    </Spin>
  );
};

// ═════════════════════════════════════════════════════════
// Tab 3: 客户视角
// ═════════════════════════════════════════════════════════

const OrgTab: React.FC = () => {
  const { message } = App.useApp();
  const [data, setData] = useState<any[]>([]);
  const [charts, setCharts] = useState<any>(null);
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<string | undefined>();
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([getOrgMatrix(period), getCharts(period)])
      .then(([d, c]) => { setData(d); setCharts(c); })
      .catch(() => message.error('加载失败'))
      .finally(() => setLoading(false));
  }, [period]);

  useEffect(() => {
    if (!selectedOrg) { setDetail(null); return; }
    setDetailLoading(true);
    getOrgDetail(selectedOrg)
      .then(setDetail)
      .catch(() => message.error('获取机构详情失败'))
      .finally(() => setDetailLoading(false));
  }, [selectedOrg]);

  const top10 = [...data].sort((a, b) => b.count - a.count).slice(0, 10);
  const orgOptions = data.map(d => ({ label: d.name, value: d.name }));

  const cols: ProColumns<any>[] = [
    { title: '机构名称', dataIndex: 'name', fixed: 'left', width: 150 },
    { title: '需求数', dataIndex: 'count', sorter: (a: any, b: any) => a.count - b.count },
    { title: '总工时(h)', dataIndex: 'hours', render: (v: any) => (v ?? 0).toFixed(1), sorter: (a: any, b: any) => a.hours - b.hours },
  ];
  const summaryRow = data.length ? {
    name: '合计',
    count: data.reduce((s, r) => s + (r.count || 0), 0),
    hours: Math.round(data.reduce((s, r) => s + (r.hours || 0), 0) * 10) / 10,
  } : null;

  return (
    <Spin spinning={loading || detailLoading}>
      <Space style={{ marginBottom: 16 }} wrap>
        <PeriodSelector value={period} onChange={setPeriod} />
        <Select
          allowClear placeholder="选择机构查看详情"
          style={{ width: 280 }}
          showSearch optionFilterProp="label"
          options={orgOptions}
          value={selectedOrg}
          onChange={(v) => setSelectedOrg(v)}
        />
      </Space>

      {selectedOrg && detail ? (
        <>
          <StatisticCard.Group direction="row" style={{ marginBottom: 16 }}>
            <StatisticCard statistic={{ title: '总需求数', value: detail.summary.total }} />
            <StatisticCard statistic={{ title: '已完成', value: detail.summary.completed, valueStyle: { color: '#52c41a' } }} />
            <StatisticCard statistic={{ title: '处理中', value: detail.summary.in_progress, valueStyle: { color: '#1890ff' } }} />
            <StatisticCard statistic={{ title: '总工时(h)', value: detail.summary.total_hours, valueStyle: { color: '#722ed1' } }} />
          </StatisticCard.Group>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={12}><WeeklyTrend data={detail.weekly_trend} title={`${selectedOrg} 近12周完成趋势`} /></Col>
            <Col span={12}><RPie data={detail.type_distribution} title="需求类型分布" height={240} /></Col>
          </Row>
          <ProTable<RequestItem>
            headerTitle={`${selectedOrg} 需求明细`}
            columns={requestDetailCols}
            request={async (params) => getRequests({ org_name: selectedOrg, current: params.current, pageSize: params.pageSize })}
            rowKey="id" search={false} pagination={{ pageSize: 10 }} options={false} size="small"
          />
        </>
      ) : (
        <>
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
            dataSource={summaryRow ? [...data, summaryRow] : data}
            rowKey="name" search={false} pagination={{ pageSize: 15 }} options={false} size="middle"
            rowClassName={(r) => r.name === '合计' ? 'ant-table-row-summary' : ''}
          />
        </>
      )}
    </Spin>
  );
};

// ═════════════════════════════════════════════════════════
// Tab 4: 销售视角
// ═════════════════════════════════════════════════════════

const SalesTab: React.FC = () => {
  const { message } = App.useApp();
  const [matrix, setMatrix] = useState<any[]>([]);
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | undefined>();
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getSalesMatrix()
      .then(setMatrix)
      .catch(() => message.error('加载失败'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    setDetailLoading(true);
    getSalesDetail(selectedId)
      .then(setDetail)
      .catch(() => message.error('获取销售详情失败'))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  const periodKey = period;
  const barData = matrix.map(r => ({ name: r.name, 完成件数: r[periodKey] || 0 })).filter(d => d.完成件数 > 0);
  const summary = calcSummary(matrix);

  // 销售选项（matrix_v2 已含 user_id）
  const salesOptions = matrix.map(r => ({ label: r.name, value: r.user_id }));

  return (
    <Spin spinning={loading || detailLoading}>
      <Space style={{ marginBottom: 16 }} wrap>
        <PeriodSelector value={period} onChange={setPeriod} />
        <Select
          allowClear placeholder="选择销售查看个人详情"
          style={{ width: 240 }}
          showSearch optionFilterProp="label"
          options={salesOptions}
          value={selectedId}
          onChange={(v) => setSelectedId(v)}
        />
      </Space>

      {selectedId && detail ? (
        <>
          <StatisticCard.Group direction="row" style={{ marginBottom: 16 }}>
            <StatisticCard statistic={{ title: '总提交数', value: detail.summary.total }} />
            <StatisticCard statistic={{ title: '已完成', value: detail.summary.completed, valueStyle: { color: '#52c41a' } }} />
            <StatisticCard statistic={{ title: '待处理', value: detail.summary.pending, valueStyle: { color: '#faad14' } }} />
            <StatisticCard statistic={{ title: '退回数', value: detail.summary.withdrawn, valueStyle: { color: '#f5222d' } }} />
          </StatisticCard.Group>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={12}><WeeklyTrend data={detail.weekly_trend} title="近12周提交完成趋势" /></Col>
            <Col span={12}><RPie data={detail.type_distribution} title="需求类型分布" height={240} /></Col>
          </Row>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={24}><TopBar data={detail.org_distribution} title="客户（机构）Top 10" color="#eb2f96" /></Col>
          </Row>
          <ProTable<RequestItem>
            headerTitle="需求明细"
            columns={requestDetailCols}
            request={async (params) => getRequests({ sales_id: selectedId, current: params.current, pageSize: params.pageSize })}
            rowKey="id" search={false} pagination={{ pageSize: 10 }} options={false} size="small"
          />
        </>
      ) : (
        <>
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
            columns={matrixCols('销售')}
            dataSource={summary ? [...matrix, summary] : matrix}
            rowKey="name" search={false} pagination={false} options={false} size="middle"
            rowClassName={(r) => r.name === '合计' ? 'ant-table-row-summary' : ''}
          />
        </>
      )}
    </Spin>
  );
};

// ═════════════════════════════════════════════════════════
// Tab 5: 下载统计（保持不变）
// ═════════════════════════════════════════════════════════

const DownloadsTab: React.FC = () => {
  const { message } = App.useApp();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [userFilter, setUserFilter] = useState('');
  const [orgFilter, setOrgFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    getDownloadStats().then(setStats).catch(() => message.error('加载失败')).finally(() => setLoading(false));
  }, []);

  const topCols: ProColumns<any>[] = [
    { title: '排名', valueType: 'index', width: 60, render: (_, __, i) => <strong>{i + 1}</strong> },
    { title: '标题', dataIndex: 'title', ellipsis: true },
    { title: '下载次数', dataIndex: 'total_count', sorter: (a: any, b: any) => a.total_count - b.total_count },
    { title: '独立用户', dataIndex: 'unique_users' },
  ];
  const logColumns: ProColumns<any>[] = [
    { title: '需求标题', dataIndex: 'request_title', ellipsis: true },
    { title: '下载人', dataIndex: 'user_name' },
    { title: '关联机构', dataIndex: 'org_name', render: (v: any) => v || '-' },
    { title: '下载时间', dataIndex: 'downloaded_at', valueType: 'dateTime' },
  ];

  const logs = stats?.recent_logs || [];
  const userOptions = [...new Set<string>(logs.map((l: any) => l.user_name).filter(Boolean))];
  const orgOptions = [...new Set<string>(logs.map((l: any) => l.org_name).filter(Boolean))];

  const filteredLogs = logs.filter((l: any) => {
    if (userFilter && l.user_name !== userFilter) return false;
    if (orgFilter === '__none__' && l.org_name) return false;
    if (orgFilter && orgFilter !== '__none__' && l.org_name !== orgFilter) return false;
    return true;
  });

  return (
    <Spin spinning={loading}>
      <ProTable
        headerTitle="Top 10 下载排行"
        columns={topCols}
        dataSource={stats?.top_downloads || []}
        rowKey="request_id" search={false} pagination={false} options={false} size="middle"
        style={{ marginBottom: 24 }}
      />
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
        search={false} pagination={{ pageSize: 15 }} options={false} size="middle"
      />
    </Spin>
  );
};

// ═════════════════════════════════════════════════════════
// 主页面 — 删除了统计看板 Tab，4+1 结构
// ═════════════════════════════════════════════════════════

const Analytics: React.FC = () => {
  const items = [
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
