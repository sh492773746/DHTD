import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Users, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useQuery } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from '@/components/ui/skeleton';
import PlausibleStats from '@/components/PlausibleStats';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend);

const StatCard = ({ title, value, icon: Icon, loading }) => {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-gray-500">{title}</CardTitle>
        <Icon className="h-4 w-4 text-gray-400" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="text-2xl font-bold">{value}</div>
        )}
      </CardContent>
    </Card>
  );
};

const RecentActivityItem = ({ avatar, name, email }) => (
  <div className="flex items-center">
    <Avatar className="h-9 w-9">
      <AvatarImage src={avatar} alt={name} />
      <AvatarFallback>{name?.[0]}</AvatarFallback>
    </Avatar>
    <div className="ml-4 space-y-1">
      <p className="text-sm font-medium leading-none">{name}</p>
      <p className="text-sm text-gray-500">{email}</p>
    </div>
  </div>
);

async function fetchStats() {
  const res = await fetch('/api/stats');
  if (!res.ok) throw new Error('failed');
  return res.json();
}

const AdminDashboard = () => {
  const [period, setPeriod] = useState('30d');
  const { session } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboardData'],
    queryFn: () => fetchStats(),
  });

  const { data: recentUsers, isLoading: isLoadingRecent } = useQuery({
    queryKey: ['recentUsers', session?.access_token],
    queryFn: async () => {
      const res = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${session?.access_token || ''}` } });
      if (!res.ok) throw new Error('failed');
      const list = await res.json();
      const sorted = Array.isArray(list) ? list.slice().sort((a, b) => new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt)) : [];
      return sorted.slice(0, 5);
    },
    enabled: !!session?.access_token,
  });

  const chartData = useMemo(() => {
    if (!data?.dailyData) return { labels: [], datasets: [] };
    const labels = Object.keys(data.dailyData).map(date => format(new Date(date), 'M/d'));
    return {
      labels,
      datasets: [
        {
          type: 'bar',
          label: '新增用户',
          data: Object.values(data.dailyData).map(d => d.users),
          backgroundColor: 'rgba(59, 130, 246, 0.7)',
          borderColor: 'rgba(59, 130, 246, 1)',
          yAxisID: 'y',
        },
        {
          type: 'line',
          label: '新增帖子',
          data: Object.values(data.dailyData).map(d => d.posts),
          backgroundColor: 'rgba(239, 68, 68, 0.7)',
          borderColor: 'rgba(239, 68, 68, 1)',
          yAxisID: 'y1',
          tension: 0.3,
        },
      ],
    };
  }, [data]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { position: 'top' } },
    scales: {
      x: { grid: { display: false } },
      y: { type: 'linear', position: 'left', title: { display: true, text: '新增用户数' }, grid: { drawOnChartArea: false } },
      y1: { type: 'linear', position: 'right', title: { display: true, text: '新增帖子数' }, grid: { drawOnChartArea: false } },
    },
  };

  return (
    <>
      <Helmet>
        <title>仪表盘 - 管理后台</title>
        <meta name="description" content="管理后台仪表盘" />
      </Helmet>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-8 overflow-x-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">仪表盘</h1>
            <p className="text-sm text-gray-500 mt-1">查看您网站的核心指标和近期活动。</p>
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="选择时间范围" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">今天</SelectItem>
              <SelectItem value="3d">过去 3 天</SelectItem>
              <SelectItem value="7d">过去 7 天</SelectItem>
              <SelectItem value="30d">过去 30 天</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
          <StatCard title="总用户数" value={isLoading ? '...' : data?.totalUsers?.toLocaleString() || '0'} icon={Users} loading={isLoading} />
          <StatCard title="总发帖数" value={isLoading ? '...' : data?.totalPosts?.toLocaleString() || '0'} icon={FileText} loading={isLoading} />
        </div>

        <PlausibleStats period={period} />

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-7">
          <Card className="lg:col-span-4">
            <CardHeader>
              <CardTitle>数据概述</CardTitle>
              <CardDescription>新增用户与帖子趋势图</CardDescription>
            </CardHeader>
            <CardContent className="pl-2">
              <div style={{ height: '350px' }}>
                {isLoading ? <Skeleton className="w-full h-full" /> : <Bar options={chartOptions} data={chartData} />}
              </div>
            </CardContent>
          </Card>
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>近期注册</CardTitle>
              <CardDescription>最新加入的 5 位用户。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoadingRecent ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <div className="ml-4 space-y-2">
                      <Skeleton className="h-4 w-[100px]" />
                      <Skeleton className="h-4 w-[150px]" />
                    </div>
                  </div>
                ))
              ) : (
                (recentUsers || []).map(u => (
                  <RecentActivityItem
                    key={u.id}
                    avatar={u.avatar_url}
                    name={u.username}
                    email={`注册于 ${u.created_at ? format(new Date(u.created_at), 'PPP', { locale: zhCN }) : '-'}`}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </motion.div>
    </>
  );
};

export default AdminDashboard;