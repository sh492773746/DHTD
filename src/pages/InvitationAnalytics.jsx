import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Search, ChevronDown, ChevronRight, User, Users } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useTenant } from '@/contexts/TenantContext';

const InvitationAnalytics = () => {
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedRows, setExpandedRows] = useState({});
  const { toast } = useToast();
  const { isInitialized, session } = useAuth();
  const { activeTenantId } = useTenant();
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  const fetchInvitationStats = useCallback(async (searchUid) => {
    setLoading(true);
    try {
      const qs = searchUid ? `?uid=${encodeURIComponent(searchUid)}` : '';
      const res = await fetch(`/api/admin/invitations/stats${qs}`, { headers: { Authorization: `Bearer ${session?.access_token || ''}` } });
      if (!res.ok) throw new Error(`加载失败(${res.status})`);
      const data = await res.json();
      setStats(Array.isArray(data) ? data : []);
    } catch (e) {
      toast({ variant: 'destructive', title: '获取邀请统计失败', description: e.message || '网络错误' });
      setStats([]);
    } finally {
      setLoading(false);
    }
  }, [toast, session?.access_token]);

  useEffect(() => {
    if (isInitialized) {
      fetchInvitationStats(debouncedSearchTerm);
    }
  }, [debouncedSearchTerm, fetchInvitationStats, isInitialized, activeTenantId]);

  const toggleRow = (inviterId) => {
    setExpandedRows(prev => ({ ...prev, [inviterId]: !prev[inviterId] }));
  };

  const totalInvitedUsers = useMemo(() => stats.reduce((acc, curr) => acc + (curr.invited_users_count || 0), 0), [stats]);
  const totalInviters = useMemo(() => stats.length, [stats]);

  return (
    <>
      <Helmet>
        <title>{String('邀请统计 - 管理后台')}</title>
        <meta name="description" content="查看和分析用户邀请数据" />
      </Helmet>
      <div>
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row justify-between md:items-center pb-6 border-b border-gray-200 gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">邀请统计</h1>
            <p className="mt-1 text-sm text-gray-500">分析用户邀请关系和奖励情况。</p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input type="text" placeholder="按邀请者或被邀请者UID搜索..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 w-full md:w-72 bg-white" />
          </div>
        </motion.div>
        
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 my-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">总邀请人数</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? <Skeleton className="h-8 w-24" /> : totalInviters}</div>
              <p className="text-xs text-muted-foreground">有邀请记录的用户总数</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">总被邀请用户</CardTitle>
              <User className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? <Skeleton className="h-8 w-24" /> : totalInvitedUsers}</div>
              <p className="text-xs text-muted-foreground">通过邀请链接注册的用户总数</p>
            </CardContent>
          </Card>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-96">
            <Loader2 className="h-12 w-12 animate-spin text-gray-400" />
          </div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mt-8 bg-white rounded-lg border border-gray-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]"></TableHead>
                  <TableHead>邀请者 UID</TableHead>
                  <TableHead>邀请者用户名</TableHead>
                  <TableHead className="text-right">邀请总数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.length > 0 ? stats.map(stat => (
                  <React.Fragment key={stat.inviter_id}>
                    <TableRow>
                      <TableCell>
                        {stat.invited_users && stat.invited_users.length > 0 && (
                          <Button variant="ghost" size="icon" onClick={() => toggleRow(stat.inviter_id)}>
                            {expandedRows[stat.inviter_id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="font-mono">{stat.inviter_uid}</TableCell>
                      <TableCell className="font-medium">{stat.inviter_username}</TableCell>
                      <TableCell className="text-right font-mono">{stat.invited_users_count}</TableCell>
                    </TableRow>
                    {expandedRows[stat.inviter_id] && stat.invited_users && (
                      <TableRow className="bg-gray-50">
                        <TableCell colSpan={4} className="p-0">
                          <div className="p-4">
                            <h4 className="font-semibold mb-2 text-gray-700">被邀请用户列表 ({stat.invited_users.length}人)</h4>
                            <ul className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 text-sm">
                              {stat.invited_users.map(invited => (
                                <li key={invited.uid} className="bg-white p-2 border rounded-md">
                                  <p className="font-mono text-gray-800">{invited.uid}</p>
                                  <p className="text-xs text-gray-500 truncate">{invited.username}</p>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                )) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      {searchTerm ? '未找到匹配的邀请记录。' : '暂无邀请数据。'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </motion.div>
        )}
      </div>
    </>
  );
};

export default InvitationAnalytics;