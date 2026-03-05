import React, { useRef, useState } from 'react';
import { PageContainer, ProTable, ModalForm, ProFormText } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { Button, Popconfirm, Modal, Transfer, Typography, App } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import {
  getTeams, createTeam, deleteTeam,
  getTeamOrganizations, updateTeamOrganizations, updateTeamMembers,
  getAllOrganizations, getUsers,
} from '@/services/admin';

const { Text } = Typography;

const Teams: React.FC = () => {
  const { message } = App.useApp();
  const actionRef = useRef<ActionType>(null);
  const [createVisible, setCreateVisible] = useState(false);

  const [orgModalVisible, setOrgModalVisible] = useState(false);
  const [memberModalVisible, setMemberModalVisible] = useState(false);
  const [currentTeam, setCurrentTeam] = useState<any>(null);

  const [allOrgs, setAllOrgs] = useState<{ key: string; title: string }[]>([]);
  const [selectedOrgKeys, setSelectedOrgKeys] = useState<string[]>([]);
  const [allMembers, setAllMembers] = useState<{ key: string; title: string }[]>([]);
  const [selectedMemberKeys, setSelectedMemberKeys] = useState<string[]>([]);
  const [transferLoading, setTransferLoading] = useState(false);

  const openOrgTransfer = async (team: any) => {
    setCurrentTeam(team);
    setTransferLoading(true);
    setOrgModalVisible(true);
    try {
      const [orgs, teamOrgs] = await Promise.all([getAllOrganizations(), getTeamOrganizations(team.id)]);
      setAllOrgs(orgs.map((o: any) => ({ key: String(o.id), title: `${o.name} (${o.org_type || '-'})` })));
      setSelectedOrgKeys(teamOrgs.map((o: any) => String(o.id)));
    } catch { message.error('加载数据失败'); }
    finally { setTransferLoading(false); }
  };

  const saveOrgs = async () => {
    if (!currentTeam) return;
    try {
      await updateTeamOrganizations(currentTeam.id, selectedOrgKeys.map(Number));
      message.success('机构分配已更新');
      setOrgModalVisible(false);
      actionRef.current?.reload();
    } catch { message.error('保存失败'); }
  };

  const openMemberTransfer = async (team: any) => {
    setCurrentTeam(team);
    setTransferLoading(true);
    setMemberModalVisible(true);
    try {
      const users = await getUsers('sales');
      setAllMembers(users.map((u: any) => ({ key: String(u.id), title: `${u.display_name} (${u.username})` })));
      setSelectedMemberKeys(users.filter((u: any) => u.team_id === team.id).map((u: any) => String(u.id)));
    } catch { message.error('加载数据失败'); }
    finally { setTransferLoading(false); }
  };

  const saveMembers = async () => {
    if (!currentTeam) return;
    try {
      await updateTeamMembers(currentTeam.id, selectedMemberKeys.map(Number));
      message.success('成员分配已更新');
      setMemberModalVisible(false);
      actionRef.current?.reload();
    } catch { message.error('保存失败'); }
  };

  const columns: ProColumns<any>[] = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '团队名称', dataIndex: 'name' },
    { title: '机构数', dataIndex: 'org_count', width: 80, search: false },
    { title: '成员数', dataIndex: 'member_count', width: 80, search: false },
    {
      title: '操作', valueType: 'option', width: 260,
      render: (_, record) => [
        <a key="orgs" onClick={() => openOrgTransfer(record)}>管理机构</a>,
        <a key="members" onClick={() => openMemberTransfer(record)}>管理成员</a>,
        <Popconfirm key="del" title="确定删除该团队？" onConfirm={async () => {
          try { await deleteTeam(record.id); message.success('已删除'); actionRef.current?.reload(); }
          catch { message.error('删除失败'); }
        }}>
          <a style={{ color: '#ff4d4f' }}>删除</a>
        </Popconfirm>,
      ],
    },
  ];

  return (
    <PageContainer>
      <ProTable
        actionRef={actionRef}
        columns={columns}
        rowKey="id"
        search={false}
        request={async () => {
          const data = await getTeams();
          return { data, total: data.length, success: true };
        }}
        toolBarRender={() => [
          <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => setCreateVisible(true)}>
            新建团队
          </Button>,
        ]}
        pagination={false}
      />

      {/* 新建团队 */}
      <ModalForm
        title="新建团队"
        open={createVisible}
        onOpenChange={setCreateVisible}
        modalProps={{ destroyOnClose: true }}
        onFinish={async (values) => {
          try {
            await createTeam(values);
            message.success('创建成功');
            actionRef.current?.reload();
            return true;
          } catch (e: any) { message.error(e?.message || '创建失败'); return false; }
        }}
      >
        <ProFormText name="name" label="团队名称" rules={[{ required: true }]} />
      </ModalForm>

      {/* 机构 Transfer */}
      <Modal
        title={`管理机构 — ${currentTeam?.name || ''}`}
        open={orgModalVisible}
        onCancel={() => setOrgModalVisible(false)}
        onOk={saveOrgs}
        width={700}
        okText="保存分配"
        destroyOnClose
      >
        <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f6f8fa', borderRadius: 4 }}>
          <Text type="secondary">
            将左侧「可选机构」选中后点击 <Text strong>{'>'}</Text> 添加到右侧「已分配机构」；
            选中右侧机构点击 <Text strong>{'<'}</Text> 可移除分配。保存后生效。
          </Text>
        </div>
        <Transfer
          dataSource={allOrgs}
          titles={['可选机构 (未分配)', `已分配给「${currentTeam?.name || ''}」`]}
          targetKeys={selectedOrgKeys}
          onChange={setSelectedOrgKeys}
          render={(item) => item.title}
          showSearch
          filterOption={(input, item) => item.title.toLowerCase().includes(input.toLowerCase())}
          listStyle={{ width: 290, height: 380 }}
          disabled={transferLoading}
          locale={{
            itemUnit: '个', itemsUnit: '个',
            searchPlaceholder: '搜索机构名称...',
            notFoundContent: '无匹配机构',
          }}
        />
      </Modal>

      {/* 成员 Transfer */}
      <Modal
        title={`管理成员 — ${currentTeam?.name || ''}`}
        open={memberModalVisible}
        onCancel={() => setMemberModalVisible(false)}
        onOk={saveMembers}
        width={700}
        okText="保存分配"
        destroyOnClose
      >
        <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f6f8fa', borderRadius: 4 }}>
          <Text type="secondary">
            将左侧「可选销售」选中后点击 <Text strong>{'>'}</Text> 添加到右侧「已分配成员」；
            选中右侧成员点击 <Text strong>{'<'}</Text> 可从团队移除。保存后生效。
          </Text>
        </div>
        <Transfer
          dataSource={allMembers}
          titles={['可选销售 (未分配)', `已分配给「${currentTeam?.name || ''}」`]}
          targetKeys={selectedMemberKeys}
          onChange={setSelectedMemberKeys}
          render={(item) => item.title}
          showSearch
          filterOption={(input, item) => item.title.toLowerCase().includes(input.toLowerCase())}
          listStyle={{ width: 290, height: 380 }}
          disabled={transferLoading}
          locale={{
            itemUnit: '人', itemsUnit: '人',
            searchPlaceholder: '搜索用户名称...',
            notFoundContent: '无匹配用户',
          }}
        />
      </Modal>
    </PageContainer>
  );
};

export default Teams;
