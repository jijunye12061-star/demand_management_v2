import React from 'react';
import { PageContainer } from '@ant-design/pro-components';
import RequestFeedTable from '@/components/RequestFeedTable';

const RequestFeed: React.FC = () => {
  return (
    <PageContainer title="需求动态大厅">
      <RequestFeedTable downloadMode="feed" />
    </PageContainer>
  );
};

export default RequestFeed;
