import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import PublicViewBanner from '../components/PublicViewBanner';
import StatsCards from '../components/StatsCards';
import FilterTabs from '../components/FilterTabs';
import UpcomingTasks from '../components/UpcomingTasks';
import { useAuth } from '../lib/useAuth';

/**
 * Public Viewing Dashboard — read-only, for unauthenticated visitors.
 * Logged-in users are redirected to their private dashboard (/app/dashboard).
 */
export default function Dashboard() {
  const [activeFilter, setActiveFilter] = useState('all');
  const { profile, loading } = useAuth();
  const navigate = useNavigate();

  if (!loading && profile) {
    navigate('/app/dashboard', { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header isAuthenticated={false} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PublicViewBanner />

        <StatsCards />

        <FilterTabs activeFilter={activeFilter} setActiveFilter={setActiveFilter} />

        <UpcomingTasks />
      </main>

      <Footer />
    </div>
  );
}
