import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { 
  Activity, 
  AlertCircle, 
  CheckCircle, 
  Info, 
  RefreshCw,
  XCircle,
  Clock,
  Server,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

const AdminAPIMonitor = () => {
  const { session } = useAuth();
  const [logs, setLogs] = useState([]);
  const [errorLogs, setErrorLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    errors: 0,
    warnings: 0,
    info: 0,
  });
  const [lastUpdate, setLastUpdate] = useState(null);
  const [apiHealth, setApiHealth] = useState({
    summary: { total: 0, healthy: 0, unhealthy: 0, avgResponseTime: 0 },
    endpoints: [],
  });
  const [healthLoading, setHealthLoading] = useState(false);

  // 獲取日誌
  const fetchLogs = async (level = null) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: '100',
      });
      if (level) {
        params.append('level', level);
      }
      
      const res = await fetch(`/api/admin/logs?${params}`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
        },
      });
      
      if (res.ok) {
        const data = await res.json();
        if (level === 'error') {
          setErrorLogs(data.logs || []);
        } else {
          setLogs(data.logs || []);
        }
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error('獲取日誌失敗:', error);
    } finally {
      setLoading(false);
    }
  };

  // 獲取統計信息
  const fetchStats = async () => {
    try {
      const res = await fetch('/api/admin/logs/stats', {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
        },
      });
      
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error('獲取統計失敗:', error);
    }
  };

  // 獲取 API 健康狀態
  const fetchApiHealth = async () => {
    setHealthLoading(true);
    try {
      const res = await fetch('/api/admin/api-health', {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
        },
      });
      
      if (res.ok) {
        const data = await res.json();
        setApiHealth(data);
      }
    } catch (error) {
      console.error('獲取 API 健康狀態失敗:', error);
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    fetchLogs('error');
    fetchStats();
    fetchApiHealth();
    
    // 每 30 秒自動刷新
    const interval = setInterval(() => {
      fetchLogs();
      fetchLogs('error');
      fetchStats();
      fetchApiHealth();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [session]);

  // 日誌級別圖標和顏色
  const getLevelConfig = (level) => {
    const configs = {
      error: { icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-50', label: '錯誤' },
      warn: { icon: AlertTriangle, color: 'text-yellow-500', bgColor: 'bg-yellow-50', label: '警告' },
      info: { icon: Info, color: 'text-blue-500', bgColor: 'bg-blue-50', label: '信息' },
      default: { icon: CheckCircle, color: 'text-green-500', bgColor: 'bg-green-50', label: '正常' },
    };
    return configs[level?.toLowerCase()] || configs.default;
  };

  // 格式化時間
  const formatTime = (timestamp) => {
    try {
      return format(new Date(timestamp), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN });
    } catch {
      return timestamp;
    }
  };

  // 日誌卡片組件
  const LogCard = ({ log }) => {
    const config = getLevelConfig(log.labels?.find(l => l.name === 'level')?.value);
    const Icon = config.icon;

    return (
      <Card className="mb-2 hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-full ${config.bgColor}`}>
              <Icon className={`h-4 w-4 ${config.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <Badge variant="outline" className={config.color}>
                  {config.label}
                </Badge>
                <span className="text-xs text-gray-500">
                  <Clock className="h-3 w-3 inline mr-1" />
                  {formatTime(log.timestamp)}
                </span>
              </div>
              <p className="text-sm text-gray-700 font-mono break-all whitespace-pre-wrap">
                {log.message}
              </p>
              {log.labels && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {log.labels
                    .filter(l => l.name !== 'level')
                    .map((label, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">
                        {label.name}: {label.value}
                      </Badge>
                    ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* 頂部標題和操作 */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <Activity className="h-8 w-8 text-blue-600" />
              API 監控中心
            </h1>
            <p className="text-gray-600 mt-1">實時監控服務器日誌和 API 狀態</p>
          </div>
          <div className="flex gap-2">
            {lastUpdate && (
              <span className="text-sm text-gray-500 self-center">
                最後更新: {formatTime(lastUpdate)}
              </span>
            )}
            <Button 
              onClick={() => {
                fetchLogs();
                fetchLogs('error');
                fetchStats();
                fetchApiHealth();
              }}
              disabled={loading || healthLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${(loading || healthLoading) ? 'animate-spin' : ''}`} />
              刷新
            </Button>
          </div>
        </div>
      </div>

      {/* 統計卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">總日誌數</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold">{stats.total}</span>
              <Server className="h-8 w-8 text-gray-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600">錯誤</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-red-600">{stats.errors}</span>
              <XCircle className="h-8 w-8 text-red-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-600">警告</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-yellow-600">{stats.warnings}</span>
              <AlertTriangle className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600">服務狀態</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-green-600">運行中</span>
              <CheckCircle className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 日誌內容 */}
      <Tabs defaultValue="api-health" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="api-health">
            API 健康 ({apiHealth.summary.healthy}/{apiHealth.summary.total})
          </TabsTrigger>
          <TabsTrigger value="all">
            所有日誌 ({logs.length})
          </TabsTrigger>
          <TabsTrigger value="errors">
            錯誤日誌 ({errorLogs.length})
          </TabsTrigger>
          <TabsTrigger value="info">
            系統信息
          </TabsTrigger>
        </TabsList>

        <TabsContent value="api-health" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-blue-600" />
                API 端點健康檢查
              </CardTitle>
              <CardDescription>
                監控所有關鍵 API 端點的健康狀態和響應時間
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* API 健康統計 */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">總端點</div>
                  <div className="text-2xl font-bold text-blue-600">{apiHealth.summary.total}</div>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">健康</div>
                  <div className="text-2xl font-bold text-green-600">{apiHealth.summary.healthy}</div>
                </div>
                <div className="p-4 bg-red-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">異常</div>
                  <div className="text-2xl font-bold text-red-600">{apiHealth.summary.unhealthy}</div>
                </div>
                <div className="p-4 bg-purple-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">平均響應時間</div>
                  <div className="text-2xl font-bold text-purple-600">{apiHealth.summary.avgResponseTime}ms</div>
                </div>
              </div>

              {healthLoading ? (
                <div className="text-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto text-gray-400" />
                  <p className="mt-2 text-gray-500">檢查中...</p>
                </div>
              ) : apiHealth.endpoints.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <AlertCircle className="h-12 w-12 mx-auto mb-2" />
                  <p>暫無 API 端點數據</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2">
                    {apiHealth.endpoints.map((endpoint, idx) => (
                      <Card key={idx} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 flex-1">
                              <div className={`p-2 rounded-full ${
                                endpoint.status === 'healthy' ? 'bg-green-50' : 
                                endpoint.status === 'error' ? 'bg-red-50' : 'bg-gray-50'
                              }`}>
                                {endpoint.status === 'healthy' ? (
                                  <CheckCircle className="h-5 w-5 text-green-500" />
                                ) : endpoint.status === 'error' ? (
                                  <XCircle className="h-5 w-5 text-red-500" />
                                ) : (
                                  <AlertCircle className="h-5 w-5 text-gray-500" />
                                )}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium">{endpoint.name}</span>
                                  <Badge variant="outline" className="text-xs">
                                    {endpoint.method}
                                  </Badge>
                                  <Badge variant="secondary" className="text-xs">
                                    {endpoint.category}
                                  </Badge>
                                  {endpoint.requireAuth && (
                                    <Badge variant="outline" className="text-xs text-orange-600">
                                      需認證
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-sm text-gray-500 font-mono">
                                  {endpoint.path}
                                </div>
                                {endpoint.error && (
                                  <div className="text-sm text-red-600 mt-1">
                                    錯誤: {endpoint.error}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={`text-lg font-bold ${
                                endpoint.responseTime < 100 ? 'text-green-600' :
                                endpoint.responseTime < 300 ? 'text-yellow-600' : 'text-red-600'
                              }`}>
                                {endpoint.responseTime}ms
                              </div>
                              <div className="text-xs text-gray-500">
                                {endpoint.statusCode || '-'}
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
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>所有日誌</CardTitle>
              <CardDescription>
                顯示最近 100 條日誌記錄，自動每 30 秒刷新
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading && logs.length === 0 ? (
                <div className="text-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto text-gray-400" />
                  <p className="mt-2 text-gray-500">加載中...</p>
                </div>
              ) : logs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <AlertCircle className="h-12 w-12 mx-auto mb-2" />
                  <p>暫無日誌記錄</p>
                </div>
              ) : (
                <ScrollArea className="h-[600px]">
                  {logs.map((log) => (
                    <LogCard key={log.id} log={log} />
                  ))}
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="errors" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <XCircle className="h-5 w-5" />
                錯誤日誌
              </CardTitle>
              <CardDescription>
                僅顯示錯誤級別的日誌，幫助快速定位問題
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading && errorLogs.length === 0 ? (
                <div className="text-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto text-gray-400" />
                  <p className="mt-2 text-gray-500">加載中...</p>
                </div>
              ) : errorLogs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
                  <p className="font-medium text-green-600">太好了！沒有錯誤日誌</p>
                  <p className="text-sm mt-1">系統運行正常</p>
                </div>
              ) : (
                <ScrollArea className="h-[600px]">
                  {errorLogs.map((log) => (
                    <LogCard key={log.id} log={log} />
                  ))}
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="info" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>系統信息</CardTitle>
              <CardDescription>
                服務器和環境配置信息
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium">部署平台</p>
                    <p className="text-sm text-gray-500">Render (Singapore)</p>
                  </div>
                  <Server className="h-8 w-8 text-gray-400" />
                </div>
                
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium">服務狀態</p>
                    <p className="text-sm text-green-600">運行中 🟢</p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-green-400" />
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium">API 端點</p>
                    <p className="text-sm text-gray-500">https://dhtd.onrender.com</p>
                  </div>
                  <Activity className="h-8 w-8 text-blue-400" />
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium">自動刷新</p>
                    <p className="text-sm text-gray-500">每 30 秒</p>
                  </div>
                  <RefreshCw className="h-8 w-8 text-gray-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminAPIMonitor;

