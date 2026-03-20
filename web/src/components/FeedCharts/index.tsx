import React, { useEffect, useState } from 'react';
import { Card, Col, Empty, Row, Spin } from 'antd';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { getFeedStats } from '@/services/api';

// 需求类型配色（与 constants.ts REQUEST_TYPE_OPTIONS 保持一致）
const RT_COLORS: Record<string, string> = {
  '基金筛选': '#1890ff',
  '报告定制': '#52c41a',
  '定期报告': '#faad14',
  '调研': '#722ed1',
  '量化策略开发': '#f04864',
  '工具/系统开发': '#13c2c2',
  '其他': '#bfbfbf',
};

// 研究范畴配色（与 constants.ts RESEARCH_SCOPE_OPTIONS 保持一致）
const RS_COLORS: Record<string, string> = {
  '纯债': '#1890ff',
  '固收+': '#2fc25b',
  '权益': '#facc14',
  '量化': '#f04864',
  '资产配置': '#8543e0',
  '综合/行业': '#13c2c2',
  '不涉及': '#bfbfbf',
};

const FALLBACK_COLOR = '#bfbfbf';

interface FeedChartsProps {
  /** 与 ProTable 筛选同步的参数 */
  filterParams?: Record<string, any>;
}

/** 将 [{org_type, dimension, count}] 转为 recharts 需要的 [{org_type, dim1: n, dim2: n, ...}] */
function pivot(
  data: { org_type: string; [key: string]: any }[],
  dimKey: string,
): { chartData: Record<string, any>[]; dimensions: string[] } {
  const dimSet = new Set<string>();
  const grouped: Record<string, Record<string, number>> = {};

  for (const row of data) {
    const ot = row.org_type;
    const dim = row[dimKey] as string;
    if (!dim) continue; // 兜底防止空值
    dimSet.add(dim);
    if (!grouped[ot]) grouped[ot] = {};
    grouped[ot][dim] = (grouped[ot][dim] || 0) + row.count;
  }

  const dimensions = [...dimSet].sort();
  const chartData = Object.entries(grouped)
    // 【修复 TS 警告】: 显式声明 map 的返回值类型
    .map(([ot, dims]): Record<string, any> => ({ org_type: ot, ...dims }))
    .sort((a, b) => {
      // 按总量降序
      const sumA = dimensions.reduce((s, d) => s + (Number(a[d]) || 0), 0);
      const sumB = dimensions.reduce((s, d) => s + (Number(b[d]) || 0), 0);
      return sumB - sumA;
    });

  return { chartData, dimensions };
}

const FeedCharts: React.FC<FeedChartsProps> = ({ filterParams }) => {
  const [loading, setLoading] = useState(false);
  const [orgReq, setOrgReq] = useState<{ chartData: any[]; dimensions: string[] }>({
    chartData: [], dimensions: [],
  });
  const [orgScope, setOrgScope] = useState<{ chartData: any[]; dimensions: string[] }>({
    chartData: [], dimensions: [],
  });
  const [total, setTotal] = useState(0);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await getFeedStats(filterParams);
      setTotal(res.total);
      setOrgReq(pivot(res.by_org_request, 'request_type'));
      setOrgScope(pivot(res.by_org_scope, 'research_scope'));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [JSON.stringify(filterParams)]);

  if (loading) {
    return (
      <Card style={{ marginBottom: 16, textAlign: 'center', padding: 48, borderRadius: 12, border: 'none' }}>
        <Spin tip="正在加载数据看板..." size="large" />
      </Card>
    );
  }

  if (total === 0) return null;

  // 统一的卡片样式
  const cardStyle = {
    borderRadius: 12,
    border: '1px solid #f0f0f0',
    boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
  };

  return (
    <Row gutter={16} style={{ marginBottom: 16 }}>
      <Col xs={24} lg={12}>
        <Card
          title={<span style={{ fontWeight: 600 }}>各机构类型的需求类型分布</span>}
          extra={
            <span style={{
              color: '#595959', fontSize: 13, backgroundColor: '#f5f5f5',
              padding: '4px 12px', borderRadius: 16, fontWeight: 500
            }}>
              共 <span style={{ color: '#1890ff' }}>{total}</span> 条公开需求
            </span>
          }
          style={cardStyle}
        >
          {orgReq.chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={orgReq.chartData} margin={{ top: 8, right: 16, left: -20, bottom: 0 }}>
                {/* 移除垂直网格线，弱化水平网格线 */}
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                {/* 去掉轴线和刻度线，改变文字颜色 */}
                <XAxis dataKey="org_type" fontSize={12} tickLine={false} axisLine={{ stroke: '#f0f0f0' }} tick={{ fill: '#8c8c8c' }} tickMargin={10} />
                <YAxis allowDecimals={false} fontSize={12} tickLine={false} axisLine={false} tick={{ fill: '#8c8c8c' }} />
                {/* 美化 Tooltip */}
                <Tooltip
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                  contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 16 }} />
                {orgReq.dimensions.map((dim) => (
                  <Bar
                    key={dim}
                    dataKey={dim}
                    stackId="a"
                    fill={RT_COLORS[dim] || FALLBACK_COLOR}
                    name={dim}
                    maxBarSize={48} // 防止数据量少时柱子过宽
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty description="暂无需求类型数据" style={{ padding: '40px 0' }} />
          )}
        </Card>
      </Col>
      <Col xs={24} lg={12}>
        <Card
          title={<span style={{ fontWeight: 600 }}>各机构类型的研究范畴分布</span>}
          style={cardStyle}
        >
          {orgScope.chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={orgScope.chartData} margin={{ top: 8, right: 16, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="org_type" fontSize={12} tickLine={false} axisLine={{ stroke: '#f0f0f0' }} tick={{ fill: '#8c8c8c' }} tickMargin={10} />
                <YAxis allowDecimals={false} fontSize={12} tickLine={false} axisLine={false} tick={{ fill: '#8c8c8c' }} />
                <Tooltip
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                  contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 16 }} />
                {orgScope.dimensions.map((dim) => (
                  <Bar
                    key={dim}
                    dataKey={dim}
                    stackId="a"
                    fill={RS_COLORS[dim] || FALLBACK_COLOR}
                    name={dim}
                    maxBarSize={48}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty description="暂无研究范畴数据" style={{ padding: '40px 0' }} />
          )}
        </Card>
      </Col>
    </Row>
  );
};

export default FeedCharts;
