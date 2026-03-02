import React, { useMemo } from 'react';
import { Card, Col, Row, Statistic } from 'antd';
import type { RequestItem } from '@/services/typings';

interface StatsCardsProps {
  dataSource: RequestItem[];
}

const StatsCards: React.FC<StatsCardsProps> = ({ dataSource }) => {
  const stats = useMemo(() => {
    let pending = 0, in_progress = 0, completed = 0;
    dataSource.forEach((item) => {
      if (item.status === 'pending') pending++;
      if (item.status === 'in_progress') in_progress++;
      if (item.status === 'completed') completed++;
    });
    return { total: dataSource.length, pending, in_progress, completed };
  }, [dataSource]);

  return (
    <Row gutter={16} style={{ marginBottom: 24 }}>
      <Col span={6}>
        <Card bordered={false}><Statistic title="总需求数" value={stats.total} /></Card>
      </Col>
      <Col span={6}>
        <Card bordered={false}><Statistic title="待处理" value={stats.pending} valueStyle={{ color: '#faad14' }} /></Card>
      </Col>
      <Col span={6}>
        <Card bordered={false}><Statistic title="处理中" value={stats.in_progress} valueStyle={{ color: '#1677ff' }} /></Card>
      </Col>
      <Col span={6}>
        <Card bordered={false}><Statistic title="已完成" value={stats.completed} valueStyle={{ color: '#52c41a' }} /></Card>
      </Col>
    </Row>
  );
};

export default StatsCards;
