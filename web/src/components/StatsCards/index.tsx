import React, { useMemo } from 'react';
import { ProCard, StatisticCard } from '@ant-design/pro-components';
import type { RequestItem } from '@/services/typings';

const { Statistic } = StatisticCard;

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
    <ProCard gutter={16} ghost style={{ marginBottom: 16 }}>
      <ProCard colSpan={6} loading={loading}>
        <Statistic title="总需求数" value={stats.total} />
      </ProCard>
      <ProCard colSpan={6} loading={loading}>
        <Statistic
          title="待处理"
          value={stats.pending}
          valueStyle={{ color: '#faad14' }} // 橙色 Warning
        />
      </ProCard>
      <ProCard colSpan={6} loading={loading}>
        <Statistic
          title="处理中"
          value={stats.inProgress}
          valueStyle={{ color: '#1890ff' }} // 蓝色 Processing
        />
      </ProCard>
      <ProCard colSpan={6} loading={loading}>
        <Statistic
          title="已完成"
          value={stats.completed}
          valueStyle={{ color: '#52c41a' }} // 绿色 Success
        />
      </ProCard>
    </ProCard>
  );
};

export default StatsCards;
