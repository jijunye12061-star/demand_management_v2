// src/pages/Sales/RequestFeed/index.tsx
import React, { useRef, useState } from 'react';
import { PageContainer, ProTable, ActionType, ProColumns } from '@ant-design/pro-components';
import { getRequests } from '@/services/api';
import type { RequestItem } from '@/services/typings';
import { STATUS_ENUM } from '@/utils/constants';
import FileDownloadButton from '@/components/FileDownloadButton';
import RequestDetailDrawer from '@/components/RequestDetailDrawer';

const RequestFeed: React.FC = () => {
  const actionRef = useRef<ActionType>(null);
  const [searchParams, setSearchParams] = useState<any>({});
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [currentRow, setCurrentRow] = useState<RequestItem>();

  const columns: ProColumns<RequestItem>[] = [
    { title: '标题', dataIndex: 'title', ellipsis: true },
    { title: '销售', dataIndex: 'sales_name' }, // Feed视角能看到是谁提的
    { title: '机构', dataIndex: 'org_name' },
    { title: '需求类型', dataIndex: 'request_type' },
    { title: '研究员', dataIndex: 'researcher_name' },
    { title: '状态', dataIndex: 'status', valueEnum: STATUS_ENUM },
    { title: '创建时间', dataIndex: 'created_at', valueType: 'dateTime', hideInSearch: true },
    {
      title: '操作',
      valueType: 'option',
      render: (_, record) => (
        <a onClick={() => {
          setCurrentRow(record);
          setDrawerVisible(true);
        }}>查看详情</a>
      ),
    },
  ];

  return (
    <PageContainer>
      <ProTable<RequestItem>
        headerTitle="全局需求动态"
        actionRef={actionRef}
        rowKey="id"
        request={async (params) => {
          setSearchParams(params); // 保存当前搜索条件供导出使用
          return getRequests({ ...params, scope: 'feed' });
        }}
        columns={columns}
        toolBarRender={() => [
          <FileDownloadButton
            key="export"
            type="excel"
            params={{ ...searchParams, scope: 'feed' }}
            fileName="需求动态导出.xlsx"
            buttonText="导出 Excel"
            buttonType="primary"
          />
        ]}
      />
      <RequestDetailDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        data={currentRow}
      />
    </PageContainer>
  );
};

export default RequestFeed;
