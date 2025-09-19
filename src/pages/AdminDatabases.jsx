import React from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Database as DatabaseIcon, RefreshCcw, Trash2, ChevronDown, ChevronRight, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

async function bffJson(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${method} ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

const HealthRow = ({ name, token }) => {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['db_health', name],
    queryFn: async () => await bffJson(`/api/admin/databases/${encodeURIComponent(name)}/health`, { token }),
  });
  if (isLoading) return <div className="p-3 text-sm text-gray-500"><Loader2 className="inline h-4 w-4 animate-spin mr-2" /> 正在检查...</div>;
  if (error) return <div className="p-3 text-sm text-red-600">检查失败：{error.message}</div>;
  return (
    <div className="p-3 border-t bg-gray-50">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {data?.pass ? <ShieldCheck className="h-4 w-4 text-green-600" /> : <ShieldAlert className="h-4 w-4 text-red-600" />}
          <span className="text-sm">{data?.pass ? '表完整' : '存在缺失/异常表'}</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching && <Loader2 className="mr-2 h-3 w-3 animate-spin" />} 重新检查
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <div>
          <div className="font-medium mb-1">已存在的表</div>
          <div className="flex flex-wrap gap-2">
            {data?.tables?.map(t => <Badge key={t} variant="outline">{t}</Badge>)}
          </div>
        </div>
        <div>
          <div className="font-medium mb-1">缺失的表</div>
          <div className="flex flex-wrap gap-2">
            {(data?.missing || []).length === 0 ? <span className="text-gray-500">无</span> : data.missing.map(t => <Badge key={t} variant="destructive">{t}</Badge>)}
          </div>
        </div>
        <div>
          <div className="font-medium mb-1">额外的表</div>
          <div className="flex flex-wrap gap-2">
            {(data?.extra || []).length === 0 ? <span className="text-gray-500">无</span> : data.extra.map(t => <Badge key={t} variant="secondary">{t}</Badge>)}
          </div>
        </div>
      </div>
    </div>
  );
};

const AdminDatabases = () => {
  const { session } = useAuth();
  const token = session?.access_token || null;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = React.useState({});

  const { data: dbs, isLoading, isFetching, error } = useQuery({
    queryKey: ['admin_databases'],
    queryFn: async () => await bffJson('/api/admin/databases', { token }),
    enabled: !!token,
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ name, tenantId, mapped }) => {
      await bffJson(`/api/admin/databases/${encodeURIComponent(name)}/delete`, { token, method: 'POST' });
      if (mapped && tenantId != null) {
        try { await fetch(`/api/admin/branches/${tenantId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }); } catch {}
      }
    },
    onSuccess: () => {
      toast({ title: '删除成功', description: '分支数据库已删除。' });
      queryClient.invalidateQueries({ queryKey: ['admin_databases'] });
    },
    onError: (e) => {
      toast({ variant: 'destructive', title: '删除失败', description: e.message });
    },
  });

  const handleDelete = (row) => {
    const confirm = window.confirm(`确定删除分支数据库 “${row.name}” 吗？此操作不可恢复。`);
    if (!confirm) return;
    deleteMutation.mutate({ name: row.name, tenantId: row.tenantId, mapped: row.mapped });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DatabaseIcon className="h-6 w-6" />
          <h1 className="text-2xl md:text-3xl font-bold">数据库管理</h1>
        </div>
        <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ['admin_databases'] })} disabled={isFetching}>
          {isFetching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}<RefreshCcw className="mr-2 h-4 w-4" /> 刷新
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><DatabaseIcon className="h-5 w-5" /> 分支列表</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : error ? (
            <div className="text-sm text-red-500">加载失败：{error.message}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead></TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead>Hostname</TableHead>
                  <TableHead>Tenant ID</TableHead>
                  <TableHead>自定义域名</TableHead>
                  <TableHead>Vercel域名</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>映射</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dbs?.map((row) => {
                  const isOpen = !!open[row.name];
                  return (
                    <React.Fragment key={row.name}>
                      <TableRow>
                        <TableCell className="w-8">
                          <Button variant="ghost" size="sm" onClick={() => setOpen(prev => ({ ...prev, [row.name]: !isOpen }))}>
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                        </TableCell>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell><a href={`https://${row.hostname}`} className="text-blue-600 hover:underline" target="_blank" rel="noreferrer">{row.hostname}</a></TableCell>
                        <TableCell>{row.tenantId ?? '-'}</TableCell>
                        <TableCell>
                          {row.customDomain ? (
                            <a href={`https://${row.customDomain}`} className="text-blue-600 hover:underline" target="_blank" rel="noreferrer">{row.customDomain}</a>
                          ) : '-' }
                        </TableCell>
                        <TableCell>
                          {row.vercelDomain ? (
                            <a href={`https://${row.vercelDomain}`} className="text-gray-600 hover:underline" target="_blank" rel="noreferrer">{row.vercelDomain}</a>
                          ) : 'N/A'}
                        </TableCell>
                        <TableCell>
                          {row.ownerProfile ? (
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={row.ownerProfile.avatar_url || undefined} />
                                <AvatarFallback>{(row.ownerProfile.username || '?').charAt(0)}</AvatarFallback>
                              </Avatar>
                              <span className="text-sm">{row.ownerProfile.username || '-'}</span>
                            </div>
                          ) : (
                            (typeof row.owner === 'string' ? row.owner : '-')
                          )}
                        </TableCell>
                        <TableCell>{row.mapped ? <Badge>已映射</Badge> : <Badge variant="outline">未映射</Badge>}</TableCell>
                        <TableCell className="space-x-2">
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(row)} disabled={deleteMutation.isPending}>
                            {deleteMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />} 删除分支
                          </Button>
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow>
                          <TableCell colSpan={9} className="p-0">
                            <HealthRow name={row.name} token={token} />
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDatabases; 