import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './pages/Layout';
import Dashboard from './pages/Dashboard';
import Providers from './pages/Providers';
import Templates from './pages/Templates';
import TemplateEdit from './pages/TemplateEdit';
import Flows from './pages/Flows';
import FlowEdit from './pages/FlowEdit';
import MockRules from './pages/MockRules';
import EnumMappings from './pages/EnumMappings';
import Logs from './pages/Logs';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="providers" element={<Providers />} />
        <Route path="templates" element={<Templates />} />
        <Route path="templates/new" element={<TemplateEdit />} />
        <Route path="templates/:id" element={<TemplateEdit />} />
        <Route path="flows" element={<Flows />} />
        <Route path="flows/new" element={<FlowEdit />} />
        <Route path="flows/:id" element={<FlowEdit />} />
        <Route path="mock" element={<MockRules />} />
        <Route path="enums" element={<EnumMappings />} />
        <Route path="logs" element={<Logs />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Route>
    </Routes>
  );
}
