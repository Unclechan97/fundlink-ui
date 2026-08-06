import { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Typography } from 'antd';
import { BankOutlined, FileTextOutlined, ApartmentOutlined, ExperimentOutlined } from '@ant-design/icons';
import { getProviders, getTemplates, getFlows, getMockRules } from '../api';

const cards = [
  { title: 'Providers', icon: <BankOutlined />, color: '#4f46e5', bg: '#eef2ff', fn: getProviders },
  { title: 'Templates', icon: <FileTextOutlined />, color: '#0891b2', bg: '#ecfeff', fn: getTemplates },
  { title: 'Flows', icon: <ApartmentOutlined />, color: '#7c3aed', bg: '#f5f3ff', fn: getFlows },
  { title: 'Mock Rules', icon: <ExperimentOutlined />, color: '#ea580c', bg: '#fff7ed', fn: getMockRules },
];

export default function Dashboard() {
  const [counts, setCounts] = useState({});

  useEffect(() => {
    Promise.all(cards.map((c) => c.fn(1, 1))).then((results) => {
      const map = {};
      cards.forEach((c, i) => (map[c.title] = results[i]?.data?.total ?? 0));
      setCounts(map);
    });
  }, []);

  return (
    <>
      <Typography.Title level={4} style={{ marginBottom: 24 }}>Overview</Typography.Title>
      <Row gutter={[16, 16]}>
        {cards.map((c) => (
          <Col xs={24} sm={12} lg={6} key={c.title}>
            <Card hoverable style={{ borderRadius: 12, border: '1px solid #f0f0f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12, background: c.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, color: c.color,
                }}>
                  {c.icon}
                </div>
                <Statistic title={c.title} value={counts[c.title] ?? '—'} />
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </>
  );
}
