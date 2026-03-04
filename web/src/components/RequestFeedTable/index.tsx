import React, { useRef, useState } from 'react';
import { ProTable, ActionType, ProColumns, ProFormInstance } from '@ant-design/pro-components';
import { Button, message } from 'antd';
import { ExportOutlined } from '@ant-design/icons';
import { getRequests, exportRequestsExcel } from '@/services/api';
import type { RequestItem } from '@/services/typings';
import { REQUEST_TYPE_OPTIONS, RESEARCH_SCOPE_OPTIONS } from '@/utils/constants';
import RequestDetailDrawer from '@/components/RequestDetailDrawer';
import FileDownloadButton from '@/components/FileDownloadButton';

interface RequestFeedTableProps {
  /** 控制下载按钮模式：销售用 feed (弹窗选机构)，研究员用 researcher-feed (固定内部学习) */
  downloadMode?: 'feed' | 'researcher-feed';
}

const RequestFeedTable: React.FC<RequestFeedTableProps> = ({ downloadMode = 'feed' }) => {
  const actionRef = useRef<ActionType>(null);
  const formRef = useRef<ProFormInstance>(undefined);

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
    } catch {
      message.error('导出失败，请重试');
    } finally {
      setExporting(false);
    }
  };

  const columns: ProColumns<RequestItem>[] = [
    {
      title: '需求标题',
      dataIndex: 'title',
      ellipsis: true,
      render: (dom, entity) => (
        <a onClick={() => { setCurrentRow(entity); setDrawerVisible(true); }}>{dom}</a>
      ),
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
      title: '机构名称',
      dataIndex: 'org_name',
      hideInSearch: true,
    },
    {
      title: '研究员',
      dataIndex: 'researcher_name',
      hideInSearch: true,
    },
    {
      title: '完成时间',
      dataIndex: 'completed_at',
      valueType: 'dateRange',
      hideInTable: true,
      search: {
        transform: (value) => ({ date_from: value[0], date_to: value[1] }),
      },
    },
    {
      title: '完成时间',
      dataIndex: 'completed_at',
      valueType: 'dateTime',
      hideInSearch: true,
    },
    {
      title: '操作',
      valueType: 'option',
      key: 'option',
      width: 120,
      render: (_, entity) => [
        entity.status === 'completed' && entity.attachment_path && (
          <FileDownloadButton
            key="download"
            mode={downloadMode}
            requestId={entity.id}
            fileName={`${entity.title}-附件`}
            size="small"
          />
        ),
      ],
    },
  ];

  return (
    <>
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
              const exportParams = { ...currentParams };
              if (currentParams.completed_at?.length === 2) {
                exportParams.date_from = currentParams.completed_at[0].format('YYYY-MM-DD');
                exportParams.date_to = currentParams.completed_at[1].format('YYYY-MM-DD');
                delete exportParams.completed_at;
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
        downloadMode={downloadMode}
      />
    </>
  );
};

export default RequestFeedTable;
