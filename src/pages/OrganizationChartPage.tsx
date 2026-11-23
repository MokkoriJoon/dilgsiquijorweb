import { useOutletContext } from 'react-router-dom';
import type { Profile } from '../lib/types';
import OrganizationChart from '../components/OrganizationChart';

export default function OrganizationChartPage() {
  const { profile } = useOutletContext<{ profile: Profile }>();
  return <OrganizationChart canManage={profile.role === 'SUPER_ADMIN'} />;
}
