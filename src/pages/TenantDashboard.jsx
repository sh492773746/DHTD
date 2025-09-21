import React from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LayoutTemplate, Brush, Eye } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useNavigate } from 'react-router-dom';
import TenantInfo from '@/components/TenantInfo';
import { useToast } from '@/components/ui/use-toast';
import { useState, useCallback, useEffect } from 'react';

const TenantDashboard = () => {
    const { profile, siteSettings, tenantId, session } = useAuth();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [tenantInfo, setTenantInfo] = useState(null);
    useEffect(() => {
        const load = async () => {
            if (!tenantId) return;
            try {
                const res = await fetch(`/api/tenants/${tenantId}`, { headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {} });
                if (!res.ok) return;
                const j = await res.json();
                setTenantInfo(j || null);
            } catch {}
        };
        load();
    }, [tenantId, session]);
    const getPreviewDomain = () => {
        return tenantInfo?.fallback_domain || tenantInfo?.vercel_assigned_domain || tenantInfo?.desired_domain || null;
    };
    
    return (
        <>
            <Helmet>
                <title>{siteSettings?.site_name ?? '分站仪表盘'}</title>
            </Helmet>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                 <div className="space-y-8">
                    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
                        <h1 className="text-3xl font-bold text-foreground">分站仪表盘</h1>
                        <p className="mt-1 text-muted-foreground">欢迎回来, {profile?.username}! 这是您的分站运营中心。</p>
                    </motion.div>

                    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
                             <Card className="shadow-lg h-full">
                                <CardHeader>
                                    <CardTitle>快捷操作</CardTitle>
                                    <CardDescription>快速访问常用功能</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <Button className="w-full justify-between" size="lg" onClick={() => navigate('/tenant-admin/page-content')}>
                                        <span>管理页面内容</span>
                                        <LayoutTemplate className="h-5 w-5" />
                                    </Button>
                                    <Button className="w-full justify-between" size="lg" variant="outline" onClick={() => navigate('/tenant-admin/site-settings')}>
                                        <span>编辑站点设置</span>
                                        <Brush className="h-5 w-5" />
                                    </Button>
                                     <Button className="w-full justify-between" size="lg" variant="secondary" onClick={() => {
                                        const d = getPreviewDomain();
                                        if (d) window.open(`https://${d}`, '_blank');
                                        else window.open(`/tenant/${tenantId}/home`, '_blank');
                                     }}>
                                        <span>预览我的站点</span>
                                        <Eye className="h-5 w-5" />
                                    </Button>
                                </CardContent>
                            </Card>
                        </motion.div>
                         <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="lg:col-span-2">
                           <TenantInfo tenantId={tenantId} />
                        </motion.div>
                    </div>
                </div>
           </div>
        </>
    );
};

export default TenantDashboard;