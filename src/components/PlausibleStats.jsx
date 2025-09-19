import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Eye, Activity, TrendingDown, Timer, BarChart2, AlertCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const Kpi = ({ title, value, icon: Icon, loading }) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      {loading ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-bold">{value}</div>}
    </CardContent>
  </Card>
);

function formatDuration(sec) {
  const s = Number(sec || 0);
  if (s <= 0) return '0s';
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

const UmamiOverviewCard = ({ period: externalPeriod }) => {
  const [summary, setSummary] = useState(null);
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [internalPeriod, setInternalPeriod] = useState('30d');
  const activePeriod = externalPeriod || internalPeriod;
  const { toast } = useToast();

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/umami/overview?period=${encodeURIComponent(activePeriod)}`);
      if (!res.ok) throw new Error(`请求失败(${res.status})`);
      const data = await res.json();
      if (!data || typeof data !== 'object') throw new Error('返回数据格式不正确');
      setSummary(data.summary || null);
      setSeries(Array.isArray(data.series) ? data.series : []);
    } catch (e) {
      const msg = e.message || '网络错误';
      setError(msg);
      toast({ variant: 'destructive', title: '获取统计失败', description: msg });
    } finally {
      setLoading(false);
    }
  }, [activePeriod, toast]);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  const totalVisitors = summary?.visitors || 0;
  const totalPageviews = summary?.pageviews || 0;
  const totalSessions = summary?.sessions || 0;
  const bounceRate = summary?.bounce_rate || 0;
  const avgDuration = summary?.avg_session_duration_s || 0;
  const pagesPerSession = summary?.pages_per_session || 0;

  const periodOptions = { today: '今天', '3d': '过去 3 天', '7d': '过去 7 天', '30d': '过去 30 天' };

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

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Kpi title="独立访客" value={totalVisitors.toLocaleString()} icon={Users} loading={loading} />
        <Kpi title="总浏览量" value={totalPageviews.toLocaleString()} icon={Eye} loading={loading} />
        <Kpi title="会话数" value={totalSessions.toLocaleString()} icon={Activity} loading={loading} />
        <Kpi title="跳出率" value={`${bounceRate}%`} icon={TrendingDown} loading={loading} />
        <Kpi title="平均会话时长" value={formatDuration(avgDuration)} icon={Timer} loading={loading} />
        <Kpi title="每会话页数" value={pagesPerSession.toString()} icon={BarChart2} loading={loading} />
      </div>

      <div style={{ fontSize: '14px', paddingTop: '14px', textAlign: 'center' }}>
        Stats powered by <a target="_blank" rel="noopener noreferrer" style={{ color: '#0EA5E9', textDecoration: 'underline' }} href="https://umami.is">Umami Analytics</a>
      </div>
    </div>
  );
};

export default UmamiOverviewCard;