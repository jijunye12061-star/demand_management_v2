import React, { useEffect, useState } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import { Card, Col, Row, Segmented, Statistic, Spin, Empty, Tag, List, Tooltip } from 'antd';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { getMyOverview, getMyDetail } from '@/services/api';
import { STATUS_ENUM } from '@/utils/constants';

type Period = 'today' | 'week' | 'last_week' | 'month' | 'last_month' | 'year';

const PERIOD_OPTIONS = [
  { label: '今日', value: 'today' },
  { label: '本周', value: 'week' },
  { label: '上周', value: 'last_week' },
  { label: '本月', value: 'month' },
  { label: '上月', value: 'last_month' },
  { label: '今年', value: 'year' },
];

const TYPE_COLORS = ['#1677ff', '#52c41a', '#fa8c16', '#722ed1', '#eb2f96'];

const cardStyle = {
  borderRadius: 12,
  border: '1px solid #f0f0f0',
  boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
};

type Overview = {
  total: number; pending: number; in_progress: number; completed: number;
  completed_hours: number; collab_hours: number; update_hours: number;
};

type Detail = {
  summary: {
    completed: number; in_progress: number; pending: number; total_hours: number;
    collab_count: number; collab_hours: number; update_hours: number;
  };
  daily_trend: { day: string; count: number }[];
  type_distribution: { name: string; value: number }[];
  today_requests: {
    id: number; title: string; request_type: string; status: string;
    work_hours?: number; completed_at?: string; created_at?: string;
  }[];
};

const MyStats: React.FC = () => {
  const [period, setPeriod] = useState<Period>('month');
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);

  const fetchOverview = async (p: Period) => {
    setOverviewLoading(true);
    try { setOverview(await getMyOverview(p)); } catch { /* ignore */ } finally { setOverviewLoading(false); }
  };

  const fetchDetail = async (p: Period) => {
    setDetailLoading(true);
    try { setDetail(await getMyDetail(p)); } catch { /* ignore */ } finally { setDetailLoading(false); }
  };

  useEffect(() => {
    fetchOverview(period);
    fetchDetail(period);
  }, [period]);

  const isToday = period === 'today';

  return (
    <PageContainer title="数据统计">
      <Segmented
        options={PERIOD_OPTIONS}
        value={period}
        onChange={(v) => setPeriod(v as Period)}
        style={{ marginBottom: 16 }}
      />

      {/* 统计卡片（随 period 变化） */}
      <Spin spinning={overviewLoading}>
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          {/* 需求件数 */}
          {[
            { title: '创建需求', value: overview?.total ?? '-', color: '#1677ff', tip: undefined },
            { title: '已完成', value: overview?.completed ?? '-', color: '#52c41a', tip: undefined },
            { title: '处理中', value: overview?.in_progress ?? '-', color: '#fa8c16', tip: undefined },
            { title: '待处理', value: overview?.pending ?? '-', color: '#722ed1', tip: undefined },
          ].map((item) => (
            <Col key={item.title} xs={12} sm={6} md={5} lg={4}>
              <Card style={{ ...cardStyle, textAlign: 'center' }}>
                <Statistic
                  title={item.title}
                  value={item.value}
                  valueStyle={{ color: item.color, fontWeight: 600, fontSize: 22 }}
                />
              </Card>
            </Col>
          ))}

          {/* 总工时 = 完成 + 协同 + 进行中，小字标注协同来源 */}
          <Col xs={12} sm={6} md={5} lg={4}>
            <Card style={{ ...cardStyle, textAlign: 'center' }}>
              <Tooltip title="包含：已完成的需求工时 + 协同参与的工时 + 进行中需求已记录的工时">
                <Statistic
                  title="总工时 (h)"
                  value={overview != null
                    ? Math.round((overview.completed_hours + overview.collab_hours + overview.update_hours) * 10) / 10
                    : '-'}
                  valueStyle={{ color: '#13c2c2', fontWeight: 600, fontSize: 22 }}
                />
              </Tooltip>
              {overview != null && overview.collab_hours > 0 && (
                <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 4 }}>
                  含协同 {overview.collab_hours}h
                </div>
              )}
            </Card>
          </Col>

          {/* 进行中工时：hover 提示说明 */}
          <Col xs={12} sm={6} md={5} lg={4}>
            <Card style={{ ...cardStyle, textAlign: 'center' }}>
              <Tooltip title="还没完成的需求里已记录的工时，完成后会并入总工时">
                <Statistic
                  title="其中，进行中 (h)"
                  value={overview?.update_hours ?? '-'}
                  valueStyle={{ color: '#eb2f96', fontWeight: 600, fontSize: 22 }}
                />
              </Tooltip>
            </Card>
          </Col>
        </Row>
      </Spin>

      {/* 图表区域 */}
      <Spin spinning={detailLoading}>
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          {/* 近 15 天完成趋势（固定，不随 period 变化） */}
          <Col xs={24} lg={14}>
            <Card title={<span style={{ fontWeight: 600 }}>近 15 天完成趋势</span>} style={cardStyle}>
              {detail?.daily_trend?.length ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={detail.daily_trend} margin={{ top: 8, right: 16, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis
                      dataKey="day"
                      fontSize={10}
                      tickLine={false}
                      axisLine={{ stroke: '#f0f0f0' }}
                      tick={{ fill: '#8c8c8c' }}
                      tickFormatter={(v) => v.slice(5)}
                    />
                    <YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} tick={{ fill: '#8c8c8c' }} />
                    <RTooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="count" fill="#1677ff" name="完成件数" radius={[3, 3, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Empty description="暂无趋势数据" style={{ padding: '40px 0' }} />
              )}
            </Card>
          </Col>

          {/* 需求类型分布（随 period 变化） */}
          <Col xs={24} lg={10}>
            <Card
              title={<span style={{ fontWeight: 600 }}>需求类型分布</span>}
              extra={<span style={{ color: '#8c8c8c', fontSize: 12 }}>{PERIOD_OPTIONS.find(o => o.value === period)?.label}</span>}
              style={cardStyle}
            >
              {detail?.type_distribution?.length ? (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={detail.type_distribution}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {detail.type_distribution.map((_, i) => (
                        <Cell key={i} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />
                      ))}
                    </Pie>
                    <RTooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Empty description="暂无类型分布数据" style={{ padding: '40px 0' }} />
              )}
            </Card>
          </Col>
        </Row>

        {/* 今日相关需求列表（仅今日模式显示） */}
        {isToday && (
          <Card
            title={<span style={{ fontWeight: 600 }}>今日相关需求</span>}
            extra={<span style={{ color: '#8c8c8c', fontSize: 13 }}>今日创建/完成/有进度更新的需求</span>}
            style={cardStyle}
          >
            {detail?.today_requests?.length ? (
              <List
                dataSource={detail.today_requests}
                size="small"
                renderItem={(item) => {
                  const statusCfg = STATUS_ENUM[item.status];
                  return (
                    <List.Item
                      extra={
                        item.work_hours != null && item.work_hours > 0
                          ? <span style={{ color: '#8c8c8c', fontSize: 12 }}>{item.work_hours}h</span>
                          : null
                      }
                    >
                      <List.Item.Meta
                        title={
                          <span>
                            <span style={{ marginRight: 8 }}>{item.title}</span>
                            <Tag color="blue" style={{ fontSize: 11 }}>{item.request_type}</Tag>
                            <Tag color={statusCfg?.status?.toLowerCase()} style={{ fontSize: 11 }}>
                              {statusCfg?.text || item.status}
                            </Tag>
                          </span>
                        }
                        description={
                          <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                            {item.completed_at
                              ? `完成: ${item.completed_at.slice(0, 16)}`
                              : `创建: ${item.created_at?.slice(0, 16) ?? ''}`}
                          </span>
                        }
                      />
                    </List.Item>
                  );
                }}
              />
            ) : (
              <Empty description="今日暂无相关需求" style={{ padding: '24px 0' }} />
            )}
          </Card>
        )}
      </Spin>
    </PageContainer>
  );
};

export default MyStats;
