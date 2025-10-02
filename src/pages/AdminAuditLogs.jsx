import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { 
  FileText, 
  RefreshCw, 
  Search,
  CheckCircle,
  XCircle,
  AlertCircle,
  User,
  Calendar,
} from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

const AdminAuditLogs = () => {
  const { session } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAction, setFilterAction] = useState('all');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: '100',
      });
      
      if (filterAction !== 'all') {
        params.append('action', filterAction);
      }
      
      const res = await fetch(`/api/admin/audit-logs?${params}`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
        },
      });
      
      if (res.ok) {
        const data = await res.json();
        setLogs(data.data?.logs || []);
      }
    } catch (error) {
      console.error('獲取審計日誌失敗:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.access_token) {
      fetchLogs();
    }
  }, [session, filterAction]);

  const formatTime = (timestamp) => {
    try {
      return format(new Date(timestamp), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN });
    } catch {
      return timestamp;
    }
  };

  const getActionColor = (action) => {
    if (action?.includes('delete')) return 'destructive';
    if (action?.includes('create')) return 'default';
    if (action?.includes('update')) return 'secondary';
    if (action?.includes('admin')) return 'outline';
    return 'secondary';
  };

  const getStatusIcon = (status) => {
    if (status === 'success') return <CheckCircle className="h-4 w-4 text-green-600" />;
    if (status === 'failed') return <XCircle className="h-4 w-4 text-red-600" />;
    return <AlertCircle className="h-4 w-4 text-yellow-600" />;
  };

  const filteredLogs = logs.filter(log => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      log.action?.toLowerCase().includes(search) ||
      log.user_id?.toLowerCase().includes(search) ||
      log.resource_id?.toLowerCase().includes(search)
    );
  });

  const actions = ['all', ...new Set(logs.map(log => log.action).filter(Boolean))];

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <FileText className="h-8 w-8 text-blue-600" />
              審計日誌
            </h1>
            <p className="text-gray-600 mt-1">
              記錄所有敏感操作，用於安全審計和問題追溯
            </p>
          </div>
          <Button onClick={fetchLogs} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
      </div>

      {/* 統計卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">總記錄數</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{logs.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600">成功操作</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {logs.filter(l => l.status === 'success').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600">失敗操作</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {logs.filter(l => l.status === 'failed').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">操作類型</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(logs.map(l => l.action)).size}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 搜索和過濾 */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="搜索用戶 ID、操作類型或資源 ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="border rounded-md px-3 py-2"
            >
              {actions.map(action => (
                <option key={action} value={action}>
                  {action === 'all' ? '全部操作' : action}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* 日誌列表 */}
      <Card>
        <CardHeader>
          <CardTitle>操作記錄</CardTitle>
          <CardDescription>
            顯示最近 100 條審計日誌記錄
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-gray-400" />
              <p className="mt-2 text-gray-500">載入中...</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-2 text-gray-300" />
              <p>暫無審計日誌記錄</p>
            </div>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="space-y-2">
                {filteredLogs.map((log) => (
                  <Card key={log.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1">
                          <div className="mt-1">
                            {getStatusIcon(log.status)}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant={getActionColor(log.action)}>
                                {log.action}
                              </Badge>
                              {log.resource_type && (
                                <Badge variant="outline" className="text-xs">
                                  {log.resource_type}:{log.resource_id}
                                </Badge>
                              )}
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                <span className="font-mono text-xs">{log.user_id}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                <span className="text-xs">{formatTime(log.created_at)}</span>
                              </div>
                            </div>
                            
                            {log.details && (
                              <details className="mt-2 text-xs">
                                <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                                  詳細信息
                                </summary>
                                <pre className="mt-1 p-2 bg-gray-50 rounded text-xs overflow-x-auto">
                                  {JSON.stringify(JSON.parse(log.details), null, 2)}
                                </pre>
                              </details>
                            )}
                            
                            {log.error_message && (
                              <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">
                                錯誤：{log.error_message}
                              </div>
                            )}
                            
                            {log.ip_address && (
                              <div className="mt-1 text-xs text-gray-500">
                                IP: {log.ip_address} | {log.user_agent?.substring(0, 50)}...
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminAuditLogs;

