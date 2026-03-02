import React from 'react';
import { Drawer } from 'antd';
import { ProDescriptions } from '@ant-design/pro-components';
import type { RequestItem } from '@/services/typings';
import { STATUS_ENUM } from '@/utils/constants'; // 建议将常量提出去，这里为简便我们在底部定义

interface Props {
  visible: boolean;
  onClose: () => void;
  data?: RequestItem;
}

const RequestDetailDrawer: React.FC<Props> = ({ visible, onClose, data }) => {
  return (
    <Drawer width={600} open={visible} onClose={onClose} title="需求详情" destroyOnClose>
      <ProDescriptions<RequestItem>
        dataSource={data}
        column={1}
        columns={[
          { title: '标题', dataIndex: 'title' },
          { title: '状态', dataIndex: 'status', valueEnum: STATUS_ENUM },
          { title: '机构名称', dataIndex: 'org_name' },
          { title: '机构类型', dataIndex: 'org_type' },
          { title: '部门', dataIndex: 'department' },
          { title: '需求类型', dataIndex: 'request_type' },
          { title: '研究范围', dataIndex: 'research_scope' },
          { title: '研究员', dataIndex: 'researcher_name' },
          { title: '销售', dataIndex: 'sales_name' },
          { title: '描述', dataIndex: 'description', valueType: 'textarea' },
          { title: '处理结果反馈', dataIndex: 'result_note', valueType: 'textarea' },
          { title: '工时', dataIndex: 'work_hours' },
          { title: '创建时间', dataIndex: 'created_at', valueType: 'dateTime' },
          { title: '完成时间', dataIndex: 'completed_at', valueType: 'dateTime' },
        ]}
      />
    </Drawer>
  );
};

export default RequestDetailDrawer;
