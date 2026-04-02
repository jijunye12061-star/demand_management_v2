import React, { useEffect, useState } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import { Card, Col, Row, Segmented, Statistic, Spin, Empty, Tag, List, Tooltip, DatePicker } from 'antd';
import type { Dayjs } from 'dayjs';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { getMyOverview, getMyDetail } from '@/services/api';
import { STATUS_ENUM } from '@/utils/constants';

type Period = 'today' | 'week' | 'last_week' | 'month' | 'last_month' | 'year' | 'custom';

const PERIOD_OPTIONS = [
  { label: '今日', value: 'today' },
  { label: '本周', value: 'week' },
  { label: '上周', value: 'last_week' },
  { label: '本月', value: 'month' },
  { label: '上月', value: 'last_month' },
  { label: '今年', value: 'year' },
  { label: '自定义', value: 'custom' },
];

const TYPE_COLORS = ['#1677ff', '#52c41a', '#fa8c16', '#722ed1', '#eb2f96'];
const ORG_TYPE_COLORS = ['#13c2c2', '#faad14', '#f5222d', '#2f54eb', '#8c8c8c', '#a0d911'];

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
  daily_trend: { day: string; count: number; hours: number }[];
  type_distribution: { name: string; value: number }[];
  org_type_distribution: { name: string; value: number }[];
  today_requests: {
    id: number; title: string; request_type: string; status: string;
    work_hours?: number; completed_at?: string; created_at?: string;
  }[];
};

const MyStats: React.FC = () => {
  const [period, setPeriod] = useState<Period>('month');
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);

  const getDateParams = () => {
    if (period === 'custom' && customRange) {
      return { dateFrom: customRange[0].format('YYYY-MM-DD'), dateTo: customRange[1].format('YYYY-MM-DD') };
    }
    return {};
  };

  const fetchOverview = async (p: Period, dateFrom?: string, dateTo?: string) => {
    setOverviewLoading(true);
    try { setOverview(await getMyOverview(p, dateFrom, dateTo)); } catch { /* ignore */ } finally { setOverviewLoading(false); }
  };

  const fetchDetail = async (p: Period, dateFrom?: string, dateTo?: string) => {
    setDetailLoading(true);
    try { setDetail(await getMyDetail(p, dateFrom, dateTo)); } catch { /* ignore */ } finally { setDetailLoading(false); }
  };

  useEffect(() => {
    if (period === 'custom') {
      if (!customRange) return;
      const { dateFrom, dateTo } = getDateParams();
      fetchOverview(period, dateFrom, dateTo);
      fetchDetail(period, dateFrom, dateTo);
    } else {
      fetchOverview(period);
      fetchDetail(period);
    }
  }, [period, customRange]);

  const isToday = period === 'today';
  const periodLabel = PERIOD_OPTIONS.find(o => o.value === period)?.label ?? '';

  return (
    <PageContainer title="数据统计">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <Segmented
          options={PERIOD_OPTIONS}
          value={period}
          onChange={(v) => setPeriod(v as Period)}
        />
        {period === 'custom' && (
          <DatePicker.RangePicker
            value={customRange}
            onChange={(v) => setCustomRange(v as [Dayjs, Dayjs] | null)}
            style={{ width: 240 }}
          />
        )}
      </div>

      {/* 统计卡片（随 period 变化） */}
      <Spin spinning={overviewLoading}>
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          {[
            { title: '创建需求', value: overview?.total ?? '-', color: '#1677ff' },
            { title: '已完成', value: overview?.completed ?? '-', color: '#52c41a' },
            { title: '处理中', value: overview?.in_progress ?? '-', color: '#fa8c16' },
            { title: '待处理', value: overview?.pending ?? '-', color: '#722ed1' },
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
        {/* 近 15 天完成趋势：件数 + 工时各一张 */}
        <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
          <Col xs={24} lg={12}>
            <Card title={<span style={{ fontWeight: 600 }}>近 15 天完成趋势（件数）</span>} style={cardStyle}>
              {detail?.daily_trend?.length ? (
                <ResponsiveContainer width="100%" height={220}>
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

          <Col xs={24} lg={12}>
            <Card title={<span style={{ fontWeight: 600 }}>近 15 天完成趋势（工时）</span>} style={cardStyle}>
              {detail?.daily_trend?.length ? (
                <ResponsiveContainer width="100%" height={220}>
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
                    <Bar dataKey="hours" fill="#13c2c2" name="工时 (h)" radius={[3, 3, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Empty description="暂无趋势数据" style={{ padding: '40px 0' }} />
              )}
            </Card>
          </Col>
        </Row>

        {/* 需求类型分布 + 机构类型分布 */}
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={24} lg={12}>
            <Card
              title={<span style={{ fontWeight: 600 }}>需求类型分布</span>}
              extra={<span style={{ color: '#8c8c8c', fontSize: 12 }}>{periodLabel}</span>}
              style={cardStyle}
            >
              {detail?.type_distribution?.length ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={detail.type_distribution}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={75}
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

          <Col xs={24} lg={12}>
            <Card
              title={<span style={{ fontWeight: 600 }}>机构类型分布</span>}
              extra={<span style={{ color: '#8c8c8c', fontSize: 12 }}>{periodLabel}</span>}
              style={cardStyle}
            >
              {detail?.org_type_distribution?.length ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={detail.org_type_distribution}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={75}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {detail.org_type_distribution.map((_, i) => (
                        <Cell key={i} fill={ORG_TYPE_COLORS[i % ORG_TYPE_COLORS.length]} />
                      ))}
                    </Pie>
                    <RTooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Empty description="暂无机构类型数据" style={{ padding: '40px 0' }} />
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
