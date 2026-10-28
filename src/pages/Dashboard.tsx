import { useState } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import PublicViewBanner from '../components/PublicViewBanner';
import StatsCards from '../components/StatsCards';
import FilterTabs from '../components/FilterTabs';
import UpcomingTasks from '../components/UpcomingTasks';

interface DashboardProps {
  isAuthenticated: boolean;
}

export default function Dashboard({ isAuthenticated }: DashboardProps) {
  const [activeFilter, setActiveFilter] = useState('all');

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header isAuthenticated={isAuthenticated} />
      
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!isAuthenticated && <PublicViewBanner />}
        
        <StatsCards />
        
        <FilterTabs activeFilter={activeFilter} setActiveFilter={setActiveFilter} />
        
        <UpcomingTasks />
      </main>
      
      <Footer />
    </div>
  );
}
