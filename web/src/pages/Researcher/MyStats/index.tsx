import React, { useEffect, useState } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import { Card, Col, Row, Segmented, Statistic, Spin, Empty } from 'antd';
import {
  LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { getMyOverview, getMyDetail } from '@/services/api';

type Period = 'today' | 'week' | 'month' | 'quarter' | 'year';

const PERIOD_OPTIONS = [
  { label: '今日', value: 'today' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '当季', value: 'quarter' },
  { label: '今年', value: 'year' },
];

const TYPE_COLORS = ['#1677ff', '#52c41a', '#fa8c16', '#722ed1', '#eb2f96'];

const MyStats: React.FC = () => {
  const [period, setPeriod] = useState<Period>('month');
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const [overview, setOverview] = useState<{
    total: number; pending: number; in_progress: number; completed: number; total_hours: number;
  } | null>(null);
  const [detail, setDetail] = useState<{
    summary: { completed: number; in_progress: number; pending: number; total_hours: number; collab_count: number; collab_hours: number };
    weekly_trend: { week: string; count: number }[];
    type_distribution: { name: string; value: number }[];
  } | null>(null);

  const fetchOverview = async (p: Period) => {
    setOverviewLoading(true);
    try {
      const data = await getMyOverview(p);
      setOverview(data);
    } catch { /* ignore */ } finally {
      setOverviewLoading(false);
    }
  };

  const fetchDetail = async () => {
    setDetailLoading(true);
    try {
      const data = await getMyDetail();
      setDetail(data);
    } catch { /* ignore */ } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => { fetchOverview(period); }, [period]);
  useEffect(() => { fetchDetail(); }, []);

  const cardStyle = {
    borderRadius: 12,
    border: '1px solid #f0f0f0',
    boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
  };

  return (
    <PageContainer title="数据统计">
      <Segmented
        options={PERIOD_OPTIONS}
        value={period}
        onChange={(v) => setPeriod(v as Period)}
        style={{ marginBottom: 16 }}
      />

      {/* 概览统计卡片 */}
      <Spin spinning={overviewLoading}>
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          {[
            { title: '创建需求', value: overview?.total ?? '-', color: '#1677ff' },
            { title: '已完成', value: overview?.completed ?? '-', color: '#52c41a' },
            { title: '处理中', value: overview?.in_progress ?? '-', color: '#fa8c16' },
            { title: '待处理', value: overview?.pending ?? '-', color: '#722ed1' },
            { title: '总工时(h)', value: overview?.total_hours ?? '-', color: '#13c2c2' },
          ].map((item) => (
            <Col key={item.title} xs={12} sm={8} md={6} lg={4}>
              <Card style={{ ...cardStyle, textAlign: 'center' }}>
                <Statistic
                  title={item.title}
                  value={item.value}
                  valueStyle={{ color: item.color, fontWeight: 600 }}
                />
              </Card>
            </Col>
          ))}
          {detail?.summary && (
            <Col xs={12} sm={8} md={6} lg={4}>
              <Card style={{ ...cardStyle, textAlign: 'center' }}>
                <Statistic
                  title="协作完成"
                  value={detail.summary.collab_count}
                  valueStyle={{ color: '#eb2f96', fontWeight: 600 }}
                  suffix={<span style={{ fontSize: 13, color: '#8c8c8c' }}>件</span>}
                />
              </Card>
            </Col>
          )}
        </Row>
      </Spin>

      {/* 图表区域 */}
      <Spin spinning={detailLoading}>
        <Row gutter={[16, 16]}>
          {/* 周完成趋势 */}
          <Col xs={24} lg={14}>
            <Card title={<span style={{ fontWeight: 600 }}>近 12 周完成趋势</span>} style={cardStyle}>
              {detail?.weekly_trend?.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={detail.weekly_trend} margin={{ top: 8, right: 16, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="week" fontSize={11} tickLine={false} axisLine={{ stroke: '#f0f0f0' }} tick={{ fill: '#8c8c8c' }} tickMargin={8} />
                    <YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} tick={{ fill: '#8c8c8c' }} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Line type="monotone" dataKey="count" stroke="#1677ff" strokeWidth={2} dot={{ r: 3 }} name="完成件数" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <Empty description="暂无趋势数据" style={{ padding: '40px 0' }} />
              )}
            </Card>
          </Col>

          {/* 需求类型分布 */}
          <Col xs={24} lg={10}>
            <Card title={<span style={{ fontWeight: 600 }}>需求类型分布（历史）</span>} style={cardStyle}>
              {detail?.type_distribution?.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={detail.type_distribution}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {detail.type_distribution.map((_, i) => (
                        <Cell key={i} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Empty description="暂无类型分布数据" style={{ padding: '40px 0' }} />
              )}
            </Card>
          </Col>
        </Row>
      </Spin>
    </PageContainer>
  );
};

export default MyStats;
