import React, { useMemo } from 'react';
import { StatisticCard } from '@ant-design/pro-components';
import type { RequestItem } from '@/services/typings';

interface StatsCardsProps {
  items: RequestItem[];
  loading?: boolean;
}

const StatsCards: React.FC<StatsCardsProps> = ({ items, loading = false }) => {
  // 利用 useMemo 在前端进行高效聚合计算
  const stats = useMemo(() => {
    return {
      total: items.length,
      pending: items.filter((i) => i.status === 'pending').length,
      inProgress: items.filter((i) => i.status === 'in_progress').length,
      completed: items.filter((i) => i.status === 'completed').length,
    };
  }, [items]);

  return (
    <StatisticCard.Group
      direction="row"
      style={{ marginBottom: 16 }}
      loading={loading}
    >
      <StatisticCard
        statistic={{
          title: '总需求数',
          value: stats.total,
          layout: 'vertical', // 让标题和数值垂直排列，间距更标准
        }}
      />

      {/* 默认带分割线，如果觉得太密可以加上 divider={false} */}
      <StatisticCard
        statistic={{
          title: '待处理',
          value: stats.pending,
          valueStyle: { color: '#faad14' }, // 橙色 Warning
          layout: 'vertical',
        }}
      />

      <StatisticCard
        statistic={{
          title: '处理中',
          value: stats.inProgress,
          valueStyle: { color: '#1890ff' }, // 蓝色 Processing
          layout: 'vertical',
        }}
      />

      <StatisticCard
        statistic={{
          title: '已完成',
          value: stats.completed,
          valueStyle: { color: '#52c41a' }, // 绿色 Success
          layout: 'vertical',
        }}
      />
    </StatisticCard.Group>
  );
};

export default StatsCards;
