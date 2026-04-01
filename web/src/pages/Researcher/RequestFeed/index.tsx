import React, { useRef, useState } from 'react';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { Button, App } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { getRequests, exportRequestsExcel } from '@/services/api';
import type { RequestItem } from '@/services/typings';
import { REQUEST_TYPE_OPTIONS, RESEARCH_SCOPE_OPTIONS } from '@/utils/constants';
import RequestDetailDrawer from '@/components/RequestDetailDrawer';
import FileDownloadButton from '@/components/FileDownloadButton';
import FeedCharts from '@/components/FeedCharts';

/**
 * 研究员需求动态 — 与销售端共享 scope=feed 数据源
 * 区别: 研究员下载附件直接下载 (org_name=null), 不弹机构弹窗
 */
const ResearcherRequestFeed: React.FC = () => {
  const { message } = App.useApp();
  const actionRef = useRef<ActionType>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [currentRow, setCurrentRow] = useState<RequestItem | null>(null);
  const [exporting, setExporting] = useState(false);
  const [chartFilter, setChartFilter] = useState<Record<string, any>>({});

  const handleExport = async () => {
    try {
      setExporting(true);
      const blob = await exportRequestsExcel({ scope: 'feed' });
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', '需求动态导出.xlsx');
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch {
      message.error('导出失败');
    } finally {
      setExporting(false);
    }
  };

  // feed 模式表格列 — 隐藏 org_name, department, work_hours, sales_name
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
      title: '关键字搜索',
      dataIndex: 'keyword',
      hideInTable: true,
      fieldProps: { placeholder: '支持标题/描述模糊搜索' },
    },
    { title: '需求描述', dataIndex: 'description', ellipsis: true, hideInSearch: true },
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
      fieldProps: {
        options: ['银行', '券商', '保险', '理财', 'FOF'].map((t) => ({ label: t, value: t })),
      },
    },
    { title: '研究员', dataIndex: 'researcher_name', hideInSearch: true },
    { title: '完成时间', dataIndex: 'completed_at', valueType: 'dateTime', hideInSearch: true, sorter: true, defaultSortOrder: 'descend' },
    {
      title: '创建日期',
      dataIndex: 'dateRange',
      valueType: 'dateRange',
      hideInTable: true,
      search: { transform: (value) => ({ date_from: value[0], date_to: value[1] }) },
    },
    {
      title: '完成日期',
      dataIndex: 'completedRange',
      valueType: 'dateRange',
      hideInTable: true,
      search: {
        transform: (value) => ({ completed_at_from: value[0], completed_at_to: value[1] }),
      },
    },
    {
      title: '操作',
      valueType: 'option',
      key: 'option',
      width: 120,
      render: (_, entity) => [
        <a key="view" onClick={() => { setCurrentRow(entity); setDrawerVisible(true); }}>详情</a>,
        entity.attachment_path && (
          <FileDownloadButton
            key="download"
            mode="mine"
            requestId={entity.id}
            fileName={`${entity.title}-附件`}
            size="small"
          />
        ),
      ],
    },
  ];

return (
    <PageContainer title="需求动态">
      <FeedCharts filterParams={chartFilter} />

      <ProTable<RequestItem>
        headerTitle="已完成的公开需求"
        actionRef={actionRef}
        rowKey="id"
        search={{ labelWidth: 100 }}
        request={async (params, sort) => {
          const sortField = Object.keys(sort || {})[0];
          const sortOrder = sortField && sort[sortField] ? (sort[sortField] === 'ascend' ? 'asc' : 'desc') : 'desc';
          return getRequests({
            ...params,
            scope: 'feed',
            sort_by: sortField || 'completed_at',
            sort_order: sortOrder,
          });
        }}
        columns={columns}
        onSubmit={(params) => {
          const p: Record<string, any> = { ...params };
          if (params.dateRange?.length === 2) {
            p.date_from = params.dateRange[0];
            p.date_to = params.dateRange[1];
          }
          if (params.completedRange?.length === 2) {
            p.completed_at_from = params.completedRange[0];
            p.completed_at_to = params.completedRange[1];
          }
          delete p.dateRange;
          delete p.completedRange;
          Object.keys(p).forEach((k) => { if (!p[k]) delete p[k]; });
          setChartFilter(p);
        }}
        onReset={() => setChartFilter({})}
        toolBarRender={() => [
          <Button
            key="export"
            icon={<DownloadOutlined />}
            loading={exporting}
            onClick={handleExport}
          >
            导出 Excel
          </Button>,
        ]}
      />

      <RequestDetailDrawer
        open={drawerVisible}
        onClose={() => { setDrawerVisible(false); setCurrentRow(null); }}
        request={currentRow}
        downloadMode="feed"
      />
    </PageContainer>
  );
};

export default ResearcherRequestFeed;
