import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout as AntLayout, Menu, Typography } from 'antd';
import {
  DashboardOutlined, BankOutlined, FileTextOutlined,
  ApartmentOutlined, ExperimentOutlined, OrderedListOutlined,
  FileSearchOutlined, RobotOutlined,
} from '@ant-design/icons';

const { Sider, Content, Header } = AntLayout;

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/providers', icon: <BankOutlined />, label: 'Providers' },
  { key: '/templates', icon: <FileTextOutlined />, label: 'Templates' },
  { key: '/flows', icon: <ApartmentOutlined />, label: 'Flows' },
  { key: '/mock', icon: <ExperimentOutlined />, label: 'Mock Rules' },
  { key: '/enums', icon: <OrderedListOutlined />, label: 'Enum Mapping' },
  { key: '/logs', icon: <FileSearchOutlined />, label: 'Logs' },
  { key: '/ai/copilot', icon: <RobotOutlined />, label: 'AI Copilot' },
];

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const pathParts = location.pathname.split('/');
  const selectedKey = pathParts[1] === 'ai' ? '/ai/copilot' : '/' + pathParts[1];

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        style={{
          background: '#fff',
          borderRight: '1px solid #f0f0f0',
        }}
      >
        <div style={{
          height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderBottom: '1px solid #f0f0f0', marginBottom: 8,
        }}>
          <Typography.Title level={4} style={{ margin: 0, color: '#4f46e5', letterSpacing: -0.5 }}>
            ⚡ FundLink
          </Typography.Title>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderInlineEnd: 'none' }}
        />
      </Sider>
      <AntLayout>
        <Header style={{
          background: '#fff', padding: '0 24px',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex', alignItems: 'center',
        }}>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            Credit Fund Matching System
          </Typography.Text>
        </Header>
        <Content style={{ margin: 24, flex: 1, overflow: 'auto' }}>
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  );
}
