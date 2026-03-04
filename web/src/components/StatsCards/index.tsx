import React, { useMemo } from 'react';
import { StatisticCard } from '@ant-design/pro-components';
import type { RequestItem } from '@/services/typings';

interface StatsCardsProps {
  items: RequestItem[];
  loading?: boolean;
}

const StatsCards: React.FC<StatsCardsProps> = ({ items, loading = false }) => {
  const stats = useMemo(() => ({
    total: items.length,
    pending: items.filter((i) => i.status === 'pending').length,
    inProgress: items.filter((i) => i.status === 'in_progress').length,
    completed: items.filter((i) => i.status === 'completed').length,
    withdrawn: items.filter((i) => i.status === 'withdrawn').length,
  }), [items]);

  return (
    <StatisticCard.Group direction="row" style={{ marginBottom: 16 }} loading={loading}>
      <StatisticCard
        statistic={{ title: '总需求数', value: stats.total, layout: 'vertical' }}
      />
      <StatisticCard
        statistic={{
          title: '待处理', value: stats.pending,
          valueStyle: { color: '#faad14' }, layout: 'vertical',
        }}
      />
      <StatisticCard
        statistic={{
          title: '处理中', value: stats.inProgress,
          valueStyle: { color: '#1890ff' }, layout: 'vertical',
        }}
      />
      <StatisticCard
        statistic={{
          title: '已完成', value: stats.completed,
          valueStyle: { color: '#52c41a' }, layout: 'vertical',
        }}
      />
      <StatisticCard
        statistic={{
          title: '已退回', value: stats.withdrawn,
          valueStyle: { color: '#ff4d4f' }, layout: 'vertical',
        }}
      />
    </StatisticCard.Group>
  );
};

export default StatsCards;
