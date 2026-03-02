import React, { useRef, useState } from 'react';
import { PageContainer, ProTable, ActionType, ProColumns, ProFormInstance } from '@ant-design/pro-components';
import { Button, Tag, message } from 'antd';
import { ExportOutlined } from '@ant-design/icons';
import { getRequests, exportRequestsExcel } from '@/services/api';
import type { RequestItem } from '@/services/typings';
import { STATUS_ENUM, REQUEST_TYPE_OPTIONS, RESEARCH_SCOPE_OPTIONS } from '@/utils/constants';
import RequestDetailDrawer from '@/components/RequestDetailDrawer';
import FileDownloadButton from '@/components/FileDownloadButton';

const RequestFeed: React.FC = () => {
  const actionRef = useRef<ActionType>(null);
  // 完美修复 TS 报错
  const formRef = useRef<ProFormInstance>(null);

  const [drawerVisible, setDrawerVisible] = useState(false);
  const [currentRow, setCurrentRow] = useState<RequestItem | null>(null);
  const [exporting, setExporting] = useState(false);

  const handleExport = async (params: any) => {
    try {
      setExporting(true);
      const blob = await exportRequestsExcel({ ...params, scope: 'feed' });

      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `需求动态导出_${new Date().getTime()}.xlsx`);
      document.body.appendChild(link);
      link.click();

      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch (error) {
      message.error('导出失败，请重试');
    } finally {
      setExporting(false);
    }
  };

  const columns: ProColumns<RequestItem>[] = [
    {
      title: '需求标题',
      dataIndex: 'title',
      copyable: true,
      ellipsis: true,
      render: (dom, entity) => (
        <a onClick={() => { setCurrentRow(entity); setDrawerVisible(true); }}>
          {dom}
        </a>
      ),
    },
    {
      title: '需求描述',
      dataIndex: 'description',
      ellipsis: true,
      hideInSearch: true,
    },
    {
      title: '机构类型',
      dataIndex: 'org_type',
      valueType: 'select',
      valueEnum: {
        '银行': { text: '银行' },
        '券商': { text: '券商' },
        '保险': { text: '保险' },
        '私募': { text: '私募' },
        '外资': { text: '外资' },
        '其他': { text: '其他' },
      },
    },
    {
      title: '需求类型',
      dataIndex: 'request_type',
      valueType: 'select',
      fieldProps: { options: REQUEST_TYPE_OPTIONS },
    },
    {
      title: '研究范围',
      dataIndex: 'research_scope',
      valueType: 'select',
      fieldProps: { options: RESEARCH_SCOPE_OPTIONS },
    },
    {
      title: '对接研究员',
      dataIndex: 'researcher_name',
      hideInSearch: true,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      valueType: 'dateRange',
      hideInTable: true,
      search: {
        transform: (value) => ({ date_from: value[0], date_to: value[1] }),
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      valueType: 'dateTime',
      hideInSearch: true,
    },
    {
      title: '操作',
      valueType: 'option',
      key: 'option',
      render: (_, entity) => [
        <a key="view" onClick={() => { setCurrentRow(entity); setDrawerVisible(true); }}>
          详情
        </a>,
        // 使用 mode="feed" 触发选择机构弹窗
        entity.status === 'completed' && entity.attachment_path && (
          <FileDownloadButton
            key="download"
            mode="feed"
            requestId={entity.id}
            fileName={`${entity.title}-附件`}
            size="small"
          />
        ),
      ],
    },
  ];

  return (
    <PageContainer title="需求动态大厅">
      <ProTable<RequestItem>
        formRef={formRef}
        headerTitle="公开需求列表"
        actionRef={actionRef}
        rowKey="id"
        search={{ labelWidth: 80 }}
        request={async (params) => getRequests({ ...params, scope: 'feed' })}
        columns={columns}
        toolBarRender={() => [
          <Button
            key="export"
            type="primary"
            icon={<ExportOutlined />}
            loading={exporting}
            onClick={() => {
              const currentParams = formRef.current?.getFieldsValue() || {};
              let exportParams = { ...currentParams };
              if (currentParams.created_at && currentParams.created_at.length === 2) {
                exportParams.date_from = currentParams.created_at[0].format('YYYY-MM-DD');
                exportParams.date_to = currentParams.created_at[1].format('YYYY-MM-DD');
                delete exportParams.created_at;
              }
              handleExport(exportParams);
            }}
          >
            导出 Excel
          </Button>,
        ]}
      />
      <RequestDetailDrawer
        open={drawerVisible}
        onClose={() => { setDrawerVisible(false); setCurrentRow(null); }}
        request={currentRow}
      />
    </PageContainer>
  );
};

export default RequestFeed;
