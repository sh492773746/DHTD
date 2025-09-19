import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Eye, TrendingDown, AlertCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const StatCard = ({ title, value, icon: Icon, loading }) => {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
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

const PlausibleStats = ({ period: externalPeriod }) => {
  const [stats, setStats] = useState({ visitors: 0, pageviews: 0, bounce_rate: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [internalPeriod, setInternalPeriod] = useState('30d');
  const activePeriod = externalPeriod || internalPeriod;
  const { toast } = useToast();
  
  const periodOptions = {
    'today': '今天',
    '7d': '过去 7 天',
    '30d': '过去 30 天',
  };

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/plausible/stats?period=${encodeURIComponent(activePeriod)}`);
      if (!res.ok) throw new Error(`请求失败(${res.status})`);
      const data = await res.json();

      if (Array.isArray(data)) {
        const aggregated = data.reduce((acc, day) => {
          acc.visitors += Number(day.visitors || 0);
          acc.pageviews += Number(day.pageviews || 0);
          acc.bounceWeighted += Number(day.bounce_rate || 0) * Number(day.visitors || 0);
              return acc;
        }, { visitors: 0, pageviews: 0, bounceWeighted: 0 });

        const avgBounce = aggregated.visitors > 0 ? Math.round(aggregated.bounceWeighted / aggregated.visitors) : 0;
        setStats({ visitors: aggregated.visitors, pageviews: aggregated.pageviews, bounce_rate: avgBounce });
        } else {
        throw new Error('返回数据格式不正确');
        }
    } catch (err) {
      const msg = err.message || '网络错误';
      setError(msg);
      toast({ variant: 'destructive', title: '获取统计失败', description: msg });
    } finally {
        setLoading(false);
    }
  }, [toast, activePeriod]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (error) {
    return (
      <div className="my-8 flex items-center justify-center rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-destructive">
        <AlertCircle className="h-6 w-6 mr-3" />
        <span className="text-sm font-medium">{error}</span>
      </div>
    );
  }

  return (
    <div className="my-8">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-800">网站统计</h2>
        {!externalPeriod && (
          <Select value={internalPeriod} onValueChange={setInternalPeriod}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="选择时间范围" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(periodOptions).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard 
          title="独立访客" 
          value={stats.visitors.toLocaleString()} 
          icon={Users} 
          loading={loading}
        />
        <StatCard 
          title="总浏览量" 
          value={stats.pageviews.toLocaleString()} 
          icon={Eye} 
          loading={loading}
        />
        <StatCard 
          title="平均跳出率" 
          value={`${stats.bounce_rate}%`} 
          icon={TrendingDown} 
          loading={loading}
        />
      </div>
       <div style={{ fontSize: '14px', paddingTop: '14px', textAlign: 'center' }}>
        Stats powered by <a target="_blank" rel="noopener noreferrer" style={{ color: '#4F46E5', textDecoration: 'underline' }} href="https://plausible.io">Plausible Analytics</a>
      </div>
    </div>
  );
};

export default PlausibleStats;