// src/pages/Sales/MyRequests/index.tsx
import React, { useRef, useState } from 'react';
import { Popconfirm, message } from 'antd';
import { PageContainer, ProTable, ActionType, ProColumns } from '@ant-design/pro-components';
import { getRequests, cancelRequest } from '@/services/api';
import type { RequestItem } from '@/services/typings';
import { STATUS_ENUM } from '@/utils/constants';
import StatsCards from '@/components/StatsCards';
import FileDownloadButton from '@/components/FileDownloadButton';
import RequestDetailDrawer from '@/components/RequestDetailDrawer';

const MyRequests: React.FC = () => {
  const actionRef = useRef<ActionType>(null);
  const [currentData, setCurrentData] = useState<RequestItem[]>([]);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [currentRow, setCurrentRow] = useState<RequestItem>();

  // 🔴 新增：列表里的撤回逻辑
  const handleRecallFromList = async (id: number) => {
    try {
      await cancelRequest(id);
      message.success('需求已撤回');
      actionRef.current?.reload(); // 刷新表格
    } catch (error) {
      // 错误由全局拦截处理
    }
  };
  const columns: ProColumns<RequestItem>[] = [
    { title: '标题', dataIndex: 'title', ellipsis: true },
    { title: '机构', dataIndex: 'org_name' },
    { title: '需求类型', dataIndex: 'request_type' },
    { title: '研究员', dataIndex: 'researcher_name', hideInSearch: true },
    { title: '状态', dataIndex: 'status', valueEnum: STATUS_ENUM },
    { title: '创建时间', dataIndex: 'created_at', valueType: 'dateTime', hideInSearch: true },
    {
      title: '操作',
      valueType: 'option',
      render: (_, record) => [
        <a key="view" onClick={() => {
          setCurrentRow(record);
          setDrawerVisible(true);
        }}>查看详情</a>,
        // 🔴 新增：仅在待处理(pending)状态下显示撤回按钮
        record.status === 'pending' && (
          <Popconfirm
            key="recall"
            title="确定要撤回此需求吗？撤回后将被删除。"
            onConfirm={() => handleRecallFromList(record.id)}
          >
            <a style={{ color: '#ff4d4f' }}>撤回</a>
          </Popconfirm>
        ),

        (record.status === 'completed' && record.attachment_path) && (
          <FileDownloadButton
            key="download"
            type="attachment"
            requestId={record.id}
            fileName={`附件_${record.id}.zip`}
            buttonText="下载附件"
          />
        )
      ],
    },
  ];

  return (
    <PageContainer>
      <StatsCards dataSource={currentData} />
      <ProTable<RequestItem>
        headerTitle="我的需求列表"
        actionRef={actionRef}
        rowKey="id"
        request={async (params) => getRequests({ ...params, scope: 'mine' })}
        onLoad={(dataSource) => setCurrentData(dataSource)} // 拿到当前页数据用于统计
        columns={columns}
      />
      <RequestDetailDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        data={currentRow}
      />
    </PageContainer>
  );
};

export default MyRequests;
