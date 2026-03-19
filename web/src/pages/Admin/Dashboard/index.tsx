import React, { useState, useEffect } from 'react';
import { PageContainer, ProTable, StatisticCard } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { Segmented, Card, Row, Col, Tag, App } from 'antd';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { getStatsOverview, getResearcherRanking, getCharts, getResearcherAllRequests } from '@/services/admin';
import type { RequestItem } from '@/services/typings';
import { STATUS_ENUM } from '@/utils/constants';

const PERIOD_OPTIONS = [
  { label: '今日', value: 'today' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '当季', value: 'quarter' },
  { label: '今年', value: 'year' },
];

const COLORS = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16'];

const Dashboard: React.FC = () => {
  const { message } = App.useApp();
  const [period, setPeriod] = useState('month');
  const [overview, setOverview] = useState<any>({});
  const [ranking, setRanking] = useState<any[]>([]);
  const [charts, setCharts] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = async (p: string) => {
    setLoading(true);
    try {
      const [ov, rk, ch] = await Promise.all([
        getStatsOverview(p), getResearcherRanking(p), getCharts(p),
      ]);
      setOverview(ov);
      setRanking(rk);
      setCharts(ch);
    } catch {
      message.error('获取看板数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(period); }, [period]);

  const statsItems = [
    { title: '总需求数', value: overview.total ?? 0 },
    { title: '待处理', value: overview.pending ?? 0, color: '#faad14' },
    { title: '处理中', value: overview.in_progress ?? 0, color: '#1890ff' },
    { title: '已完成', value: overview.completed ?? 0, color: '#52c41a' },
    { title: '总工时(h)', value: overview.total_hours ?? 0, color: '#722ed1' },
  ];

  // ── 研究员排行表列 ──
  const rankColumns: ProColumns<any>[] = [
    { title: '排名', valueType: 'index', width: 60, render: (_, __, i) => <strong>{i + 1}</strong> },
    { title: '姓名', dataIndex: 'display_name' },
    {
      title: '已完成(含协作)',
      dataIndex: 'total_completed',
      sorter: (a: any, b: any) => (a.total_completed ?? 0) - (b.total_completed ?? 0),
      render: (v: any, r: any) => (
        <span>
          {v ?? 0}
          {r.collab_count > 0 && (
            <span style={{ color: '#8c8c8c', fontSize: 12, marginLeft: 4 }}>
              (含协作{r.collab_count}件)
            </span>
          )}
        </span>
      ),
    },
    { title: '处理中', dataIndex: 'in_progress_count' },
    { title: '待处理', dataIndex: 'pending_count' },
    {
      title: '自动化建设工时(h)',
      dataIndex: 'automation_hours',
      render: (v: any) => v > 0 ? <span style={{ color: '#1890ff' }}>{v?.toFixed(1)}</span> : '-',
    },
    {
      title: '总工时(h)',
      dataIndex: 'total_hours',
      sorter: (a: any, b: any) => (a.total_hours ?? 0) - (b.total_hours ?? 0),
      render: (v: any, r: any) => (
        <span>
          {v?.toFixed(1) ?? '0.0'}
          {r.collab_hours > 0 && (
            <span style={{ color: '#8c8c8c', fontSize: 12, marginLeft: 4 }}>
              (含协作{r.collab_hours.toFixed(1)}h)
            </span>
          )}
        </span>
      ),
    },
  ];

  const detailColumns: ProColumns<RequestItem>[] = [
    { title: '标题', dataIndex: 'title', ellipsis: true },
    { title: '需求类型', dataIndex: 'request_type' },
    { title: '机构', dataIndex: 'org_name' },
    {
      title: '状态', dataIndex: 'status',
      render: (_, r) => { const c = STATUS_ENUM[r.status]; return <Tag color={c?.status?.toLowerCase()}>{c?.text || r.status}</Tag>; },
    },
    {
      title: '工时(h)',
      render: (_: any, r: RequestItem) => {
        const total = (r.work_hours || 0) + (r.automation_hours || 0);
        return total > 0 ? total.toFixed(1) : '-';
      },
    },
    { title: '创建时间', dataIndex: 'created_at', valueType: 'dateTime' },
  ];

  // ── 图表数据 ──
  // 研究员工作量: 柱状图 (件数 + 工时)，已完成和工时均含协作贡献
  const workloadBarData = [...ranking]
    .sort((a, b) => (b.total_hours ?? 0) - (a.total_hours ?? 0))
    .map((r) => ({
      name: r.display_name,
      已完成: (r.completed_count ?? 0) + (r.collab_count ?? 0),
      处理中: r.in_progress_count ?? 0,
      待处理: r.pending_count ?? 0,
      工时: r.total_hours ?? 0,
    }));

  // 需求类型: 饼图
  const typeData = charts?.type_distribution || [];

  return (
    <PageContainer>
      <div style={{ marginBottom: 16 }}>
        <Segmented options={PERIOD_OPTIONS} value={period} onChange={(v) => setPeriod(v as string)} />
      </div>

      {/* 统计卡片 */}
      <StatisticCard.Group direction="row" style={{ marginBottom: 24 }} loading={loading}>
        {statsItems.map((item) => (
          <StatisticCard key={item.title} statistic={{
            title: item.title, value: item.value, layout: 'vertical',
            ...(item.color ? { valueStyle: { color: item.color } } : {}),
          }} />
        ))}
      </StatisticCard.Group>

      {/* 图表区 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={16}>
          <Card title="研究员工作量 (件数)" size="small" loading={loading}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={workloadBarData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="已完成" fill="#52c41a" />
                <Bar dataKey="处理中" fill="#1890ff" />
                <Bar dataKey="待处理" fill="#faad14" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col span={8}>
          <Card title="需求类型分布" size="small" loading={loading}>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={typeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                  {typeData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      {/* 研究员工时横向柱状图 */}
      <Card title="研究员工时排行" size="small" style={{ marginBottom: 24 }} loading={loading}>
        <ResponsiveContainer width="100%" height={Math.max(200, ranking.length * 40)}>
          <BarChart data={workloadBarData} layout="vertical" margin={{ top: 5, right: 30, bottom: 5, left: 60 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={80} />
            <Tooltip />
            <Bar dataKey="工时" fill="#722ed1" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* 研究员排行表 (可展开) */}
      <ProTable
        headerTitle="研究员工作量明细"
        columns={rankColumns}
        dataSource={ranking}
        rowKey="user_id"
        loading={loading}
        search={false}
        pagination={false}
        options={false}
        expandable={{
          expandedRowRender: (record) => (
            <ProTable<RequestItem>
              columns={detailColumns}
              headerTitle={false}
              search={false}
              options={false}
              pagination={{ pageSize: 10, size: 'small' }}
              request={async (params) => {
                const res = await getResearcherAllRequests(record.user_id, params.current ?? 1, params.pageSize ?? 10);
                return { data: res.items, total: res.total, success: true };
              }}
              rowKey="id"
              size="small"
            />
          ),
        }}
      />
    </PageContainer>
  );
};

export default Dashboard;
