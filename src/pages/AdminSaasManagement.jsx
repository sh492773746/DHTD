import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, PlusCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fetchWithRetry } from '@/lib/api';
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

const AdminSaasManagement = () => {
    const { supabase: supabaseClient, user } = useAuth();
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
        if (!supabaseClient) return;
        setLoading(true);
        const { data, error } = await fetchWithRetry(() => 
            supabaseClient
                .from('tenant_requests')
                .select(`
                    *,
                    profile:profiles!tenant_requests_user_id_fkey(
                        username,
                        uid,
                        avatar_url
                    )
                `)
                .order('created_at', { ascending: false })
        );
        if (error) {
            console.error("Fetch requests error: ", error)
            toast({ title: '获取分站请求失败', description: error.message, variant: 'destructive' });
        } else {
            setRequests(data || []);
        }
        setLoading(false);
    }, [supabaseClient, toast]);

    useEffect(() => {
        fetchRequests();
    }, [fetchRequests]);

    const handleApprove = async (request) => {
        setIsSubmitting(request.id);
        try {
            const { data, error } = await supabaseClient.functions.invoke('provision-tenant', {
                body: JSON.stringify({ tenantRequest: request, callerUserId: user.id }),
            });
    
            if (error) throw error;

            if (data.success) {
                await supabaseClient
                    .from('tenant_requests')
                    .update({ 
                        status: 'active',
                        vercel_project_id: data.projectId,
                        vercel_assigned_domain: data.assignedDomain,
                        vercel_deployment_status: data.deploymentStatus,
                    })
                    .eq('id', request.id);
                toast({ title: '分站部署成功', description: `域名 ${request.desired_domain} 已成功部署。` });
            } else {
                throw new Error(data.error || '部署失败，未知错误。');
            }
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
            if (request.vercel_project_id) {
                const { data, error } = await supabaseClient.functions.invoke('deprovision-tenant', {
                    body: JSON.stringify({ vercelProjectId: request.vercel_project_id, callerUserId: user.id })
                });
                if (error) throw error;
                if (!data.success) throw new Error(data.error || '停用失败，未知错误。');
            }
            
            const { error: dbError } = await supabaseClient
                .from('tenant_requests')
                .delete()
                .eq('id', request.id);

            if (dbError) throw dbError;

            toast({ title: '分站已删除', description: `分站 ${request.desired_domain} 的记录和部署已成功删除。` });
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
            const { error } = await supabaseClient.rpc('reject_tenant_request', {
                p_request_id: request.id,
                p_rejection_reason: dialogState.rejectionReason
            });
            if(error) throw error;
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
                            />
                        </TabsContent>
                        <TabsContent value="active">
                             <RequestTable 
                                requests={filterRequestsByStatus('active')} 
                                isSubmitting={isSubmitting}
                                onDelete={openDeleteDialog}
                                onPreview={handlePreview}
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
                            此操作不可逆。如果分站已部署，将会同时从Vercel删除项目。
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