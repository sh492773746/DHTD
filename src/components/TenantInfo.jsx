import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Globe, Link as LinkIcon, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const TenantInfo = ({ tenantId }) => {
  const { session } = useAuth();
  const token = session?.access_token || null;
  const [tenantInfo, setTenantInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchTenantInfo = async () => {
      if (!tenantId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/tenants/${tenantId}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || `HTTP ${res.status}`);
        }
        const data = await res.json();
        setTenantInfo(data);
      } catch (error) {
        console.error('Error fetching tenant info:', error);
        toast({ title: '获取站点信息失败', description: error.message || '未知错误', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    fetchTenantInfo();
  }, [tenantId, token, toast]);

  const handleCopy = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast({ title: '已复制到剪贴板', description: text });
  };

  const InfoRow = ({ icon, label, value }) => (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center text-gray-600">
        {icon}
        {label}
      </span>
      {value ? (
        <div className="flex items-center gap-2">
          <a href={`https://${value}`} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline">
            {value}
          </a>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleCopy(value)}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <span className="text-gray-400">未设置</span>
      )}
    </div>
  );

  const SkeletonRow = () => (
    <div className="flex items-center justify-between py-2">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-5 w-40" />
    </div>
  );

  return (
    <Card className="mt-6 shadow-md border-none bg-white">
      <CardHeader>
        <CardTitle className="text-lg">我的站点信息</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : tenantInfo ? (
          <>
            <InfoRow
              icon={<Globe className="w-4 h-4 mr-2 text-blue-500" />}
              label="自定义域名"
              value={tenantInfo.desired_domain}
            />
            <InfoRow
              icon={<LinkIcon className="w-4 h-4 mr-2 text-purple-500" />}
              label="兜底域名"
              value={tenantInfo.fallback_domain || tenantInfo.vercel_assigned_domain}
            />
          </>
        ) : (
          <p className="text-center text-gray-500">无法加载站点信息。</p>
        )}
      </CardContent>
    </Card>
  );
};

export default TenantInfo;