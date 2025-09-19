import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, PlusCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import RequestTable from '@/components/admin/saas/RequestTable';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger
} from "@/components/ui/sheet";
import TenantRequestForm from '@/pages/TenantRequestForm';
import { ScrollArea } from '@/components/ui/scroll-area';

// Local helper to call BFF with Bearer
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

const AdminSaasManagement = () => {
  const { session } = useAuth();
  const token = session?.access_token || null;
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(null);
  const { toast } = useToast();
  const [isFormOpen, setIsFormOpen] = useState(false);
  
  const [dialogState, setDialogState] = useState({
    isRejectOpen: false,
    isDeleteOpen: false,
    rejectionReason: '',
    requestToProcess: null,
  });

  const fetchRequests = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await bffJson('/api/admin/tenants', { token });
      setRequests(Array.isArray(data) ? data : (data?.data || []));
    } catch (error) {
      console.error('Fetch requests error: ', error);
      toast({ title: '获取分站请求失败', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleApprove = async (request) => {
    setIsSubmitting(request.id);
    try {
      await bffJson(`/api/admin/tenant-requests/${request.id}/approve`, { token, method: 'POST' });
      toast({ title: '分站部署成功', description: `域名 ${request.desired_domain} 已成功部署。` });
    } catch (error) {
      toast({ title: '分站部署失败', description: error.message, variant: 'destructive' });
    } finally {
      fetchRequests();
      setIsSubmitting(null);
    }
  };
  
  const handleDelete = async () => {
    const request = dialogState.requestToProcess;
    if (!request) return;

    setIsSubmitting(request.id);
    setDialogState({ ...dialogState, isDeleteOpen: false });

    try {
      await bffJson(`/api/admin/tenant-requests/${request.id}`, { token, method: 'DELETE' });
      toast({ title: '分站已删除', description: `分站 ${request.desired_domain} 的记录和部署已删除（如有）。` });
    } catch (error) {
      toast({ title: '分站删除失败', description: error.message, variant: 'destructive' });
    } finally {
      fetchRequests();
      setIsSubmitting(null);
    }
  };

  const handleReject = async () => {
    const request = dialogState.requestToProcess;
    if (!request || !dialogState.rejectionReason) {
      toast({ title: '请输入驳回理由', variant: 'destructive' });
      return;
    }
    
    setIsSubmitting(request.id);
    setDialogState({ ...dialogState, isRejectOpen: false });

    try {
      await bffJson(`/api/admin/tenant-requests/${request.id}/reject`, { token, method: 'POST', body: { reason: dialogState.rejectionReason } });
      toast({ title: '请求已驳回' });
    } catch (error) {
      toast({ title: '驳回失败', description: error.message, variant: 'destructive' });
    } finally {
      fetchRequests();
      setIsSubmitting(null);
    }
  };
  
  const handlePreview = (request) => {
    if (request.vercel_assigned_domain) {
      window.open(`https://${request.vercel_assigned_domain}`, '_blank');
    } else {
      toast({
        title: '无法预览',
        description: '该分站没有可用的 Vercel 域名。',
        variant: 'destructive',
      });
    }
  };

  const handleBindDomain = async (request) => {
    const domain = window.prompt('输入要绑定的自定义域名（如 example.com 或 shop.example.com）', request.desired_domain || '');
    if (!domain) return;
    setIsSubmitting(request.id);
    try {
      const res = await bffJson(`/api/admin/tenants/${request.id}/domain/bind`, { token, method: 'POST', body: { domain } });
      if (res?.ok) {
        toast({ title: '绑定成功', description: `已提交绑定：${domain}` });
      } else {
        toast({ variant: 'destructive', title: '绑定失败', description: res?.error || JSON.stringify(res?.data || res) });
      }
    } catch (e) {
      toast({ variant: 'destructive', title: '绑定失败', description: e.message });
    } finally {
      setIsSubmitting(null);
      fetchRequests();
    }
  };

  const handleVerifyDomain = async (request) => {
    setIsSubmitting(request.id);
    try {
      const res = await bffJson(`/api/admin/tenants/${request.id}/domain/verify`, { token, method: 'POST' });
      if (res?.ok) {
        toast({ title: '校验成功', description: '域名解析已生效。' });
      } else {
        const msg = res?.data?.code || res?.data?.error || res?.error || `status ${res?.status}`;
        toast({ variant: 'destructive', title: '校验失败', description: String(msg) });
      }
    } catch (e) {
      toast({ variant: 'destructive', title: '校验失败', description: e.message });
    } finally {
      setIsSubmitting(null);
      fetchRequests();
    }
  };

  const handleConnectivity = async (request) => {
    setIsSubmitting(request.id);
    try {
      const res = await bffJson(`/api/admin/tenants/${request.id}/connectivity`, { token });
      if (res?.ok) {
        const c = res.custom; const v = res.vercel;
        toast({ title: '连通性结果', description: `自定义域: ${(c?.url||'-')} → ${c?.ok?'OK':'FAIL'}(${c?.status||0}); Vercel域: ${(v?.url||'-')} → ${v?.ok?'OK':'FAIL'}(${v?.status||0})` });
      } else {
        toast({ variant: 'destructive', title: '连通性检查失败', description: res?.error || '未知错误' });
      }
    } catch (e) {
      toast({ variant: 'destructive', title: '连通性检查失败', description: e.message });
    } finally {
      setIsSubmitting(null);
    }
  };

  const openRejectDialog = (request) => {
    setDialogState({ ...dialogState, isRejectOpen: true, requestToProcess: request, rejectionReason: '' });
  };

  const openDeleteDialog = (request) => {
    setDialogState({ ...dialogState, isDeleteOpen: true, requestToProcess: request });
  };

  const filterRequestsByStatus = (status) => requests.filter(r => r.status === status);

  return (
    <>
      <Helmet>
        <title>{String('分站管理 - 管理后台')}</title>
        <meta name="description" content="管理和审批SaaS分站请求。" />
      </Helmet>
      <div className="space-y-6 overflow-x-auto">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">SaaS 分站管理</h1>
            <p className="mt-1 text-sm text-gray-500">审批和管理所有分站的生命周期。</p>
          </div>
           <Sheet open={isFormOpen} onOpenChange={setIsFormOpen}>
            <SheetTrigger asChild>
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" />
                创建分站请求
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-lg">
              <SheetHeader>
                <SheetTitle>创建新的分站请求</SheetTitle>
                <SheetDescription>
                  为新用户或现有用户手动创建一个分站。域名可用性将被检查。
                </SheetDescription>
              </SheetHeader>
              <ScrollArea className="h-[calc(100vh-8rem)]">
                <div className="p-4">
                  <TenantRequestForm 
                    onSuccess={() => {
                      setIsFormOpen(false);
                      fetchRequests();
                    }}
                    isAdminCreation={true}
                  />
                </div>
              </ScrollArea>
            </SheetContent>
          </Sheet>
        </motion.div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-12 w-12 animate-spin text-gray-400" />
          </div>
        ) : (
          <Tabs defaultValue="pending" className="w-full">
            <TabsList className="overflow-x-auto scrollbar-hide">
              <TabsTrigger value="pending">待审批 ({filterRequestsByStatus('pending').length})</TabsTrigger>
              <TabsTrigger value="active">已激活 ({filterRequestsByStatus('active').length})</TabsTrigger>
              <TabsTrigger value="rejected">已驳回 ({filterRequestsByStatus('rejected').length})</TabsTrigger>
            </TabsList>
            <TabsContent value="pending">
              <RequestTable 
                requests={filterRequestsByStatus('pending')} 
                isSubmitting={isSubmitting}
                onApprove={handleApprove} 
                onReject={openRejectDialog} 
                onDelete={openDeleteDialog}
                onBindDomain={handleBindDomain}
                onVerifyDomain={handleVerifyDomain}
                onCheckConnectivity={handleConnectivity}
              />
            </TabsContent>
            <TabsContent value="active">
               <RequestTable 
                requests={filterRequestsByStatus('active')} 
                isSubmitting={isSubmitting}
                onDelete={openDeleteDialog}
                onPreview={handlePreview}
                onBindDomain={handleBindDomain}
                onVerifyDomain={handleVerifyDomain}
                onCheckConnectivity={handleConnectivity}
              />
            </TabsContent>
            <TabsContent value="rejected">
               <RequestTable requests={filterRequestsByStatus('rejected')} isSubmitting={isSubmitting} onDelete={openDeleteDialog} />
            </TabsContent>
          </Tabs>
        )}
      </div>

      <AlertDialog open={dialogState.isRejectOpen} onOpenChange={(isOpen) => setDialogState({...dialogState, isRejectOpen: isOpen})}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确定要驳回此请求吗？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作将驳回分站申请，请提供驳回理由，用户将会收到通知。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="rejection-reason">驳回理由</Label>
            <Input 
              id="rejection-reason"
              value={dialogState.rejectionReason}
              onChange={(e) => setDialogState({...dialogState, rejectionReason: e.target.value})}
              placeholder="例如：域名不合规"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleReject} disabled={!dialogState.rejectionReason}>确认驳回</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialogState.isDeleteOpen} onOpenChange={(isOpen) => setDialogState({...dialogState, isDeleteOpen: isOpen})}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确定要删除此分站吗？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作不可逆。如果分站已部署，将会同时尝试删除关联的数据库分支。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">确认删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default AdminSaasManagement;