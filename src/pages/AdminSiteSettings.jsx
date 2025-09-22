import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import SettingsHeader from '@/components/admin/settings/SettingsHeader';
import SettingsForm from '@/components/admin/settings/SettingsForm';
import BulkImportDialog from '@/components/admin/settings/BulkImportDialog';

const bffJson = async (path, { token, method = 'GET', body } = {}) => {
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
    try { return await res.json(); } catch { return {}; }
};

const fetchTenantSettingsBff = async (token, tenantId) => {
    if (tenantId === undefined || tenantId === null) return [];
    const rows = await bffJson(`/api/admin/settings${tenantId !== undefined ? `?tenantId=${tenantId}` : ''}`, { token });
    return rows || [];
};

const fetchTenantInfoBff = async (token, tenantId) => {
    // We can reuse /api/admin/tenants listing if needed, but keep current UI simple
    return null;
};

const AdminSiteSettings = () => {
    const { toast } = useToast();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { isSuperAdmin, userTenantId, isInitialized, isTenantAdmin, session, refreshSiteSettings } = useAuth();
    const token = session?.access_token || null;
    const { activeTenantId: tenantIdFromContext } = useTenant();

    const [settings, setSettings] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [isBulkImportOpen, setBulkImportOpen] = useState(false);
    const [bulkJson, setBulkJson] = useState('');

    const managedTenantId = useMemo(() => {
        if (isSuperAdmin) {
            return tenantIdFromContext != null ? tenantIdFromContext : 0;
        }
        // tenant admin: prefer assigned tenant id, fallback to context-resolved id
        return (userTenantId ?? tenantIdFromContext ?? null);
    }, [tenantIdFromContext, isSuperAdmin, userTenantId]);

    const { data: allSettings, isLoading } = useQuery({
        queryKey: ['adminTenantSettings', managedTenantId, !!token],
        queryFn: () => fetchTenantSettingsBff(token, managedTenantId),
        enabled: isInitialized && managedTenantId != null && !!token,
    });

    const { data: managedTenantInfo } = useQuery({
        queryKey: ['tenantInfo', managedTenantId, !!token],
        queryFn: () => fetchTenantInfoBff(token, managedTenantId),
        enabled: isInitialized && !!managedTenantId && managedTenantId !== 0 && !!token,
    });
    
    const tenantEditableKeys = ['site_name', 'site_logo'];

    useEffect(() => {
        if (allSettings) {
            const settingsMap = (allSettings || []).reduce((acc, setting) => {
                // normalize is_custom flag for UI
                acc[setting.key] = { ...setting, is_custom: Number(setting.tenant_id ?? setting.tenantId) !== 0 };
                return acc;
            }, {});
            setSettings(settingsMap);
        }
    }, [allSettings]);

    const handleInputChange = (key, value) => {
        setSettings(prev => ({
            ...prev,
            [key]: { ...prev[key], value: value, isCustom: true }
        }));
    };
    
    const handleRevertToDefault = async (key) => {
        setIsSaving(true);
        try {
            await bffJson(`/api/admin/settings/${encodeURIComponent(key)}?tenantId=${managedTenantId}`, { token, method: 'DELETE' });
            toast({ title: '恢复默认成功', description: '设置已恢复为默认值。' });
            queryClient.invalidateQueries({ queryKey: ['adminTenantSettings', managedTenantId, !!token] });
        } catch (e) {
            toast({ title: '恢复默认失败', description: e.message, variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveChanges = async () => {
        setIsSaving(true);
        const updates = Object.entries(settings)
            .filter(([_, setting]) => setting.isCustom)
            .map(([key, setting]) => ({
                key,
                value: String(setting.value ?? ''),
                name: setting.name,
                description: setting.description,
                type: setting.type,
            }));

        try {
            if (updates.length > 0) {
                await bffJson('/api/admin/settings', { token, method: 'POST', body: { tenantId: managedTenantId, updates } });
                toast({ title: '保存成功', description: '站点设置已更新。' });
            } else {
                toast({ title: '无需保存', description: '没有检测到任何更改。' });
            }
        } catch (e) {
            toast({ title: '保存失败', description: e.message, variant: 'destructive' });
        } finally {
            queryClient.invalidateQueries({ queryKey: ['adminTenantSettings', managedTenantId, !!token] });
            queryClient.invalidateQueries({ queryKey: ['siteSettings', managedTenantId] });
            queryClient.invalidateQueries({ queryKey: ['siteSettings', 0]});
            try { refreshSiteSettings && refreshSiteSettings(); } catch {}
            setIsSaving(false);
        }
    };

    const handleBulkImport = async () => {
        try {
            const parsedJson = JSON.parse(bulkJson);
            if (typeof parsedJson !== 'object' || parsedJson === null || Array.isArray(parsedJson)) {
                throw new Error("JSON必须是一个对象。");
            }
            const updatedSettings = { ...settings };
            let updatedCount = 0;
            for (const key in parsedJson) {
                if (updatedSettings[key]) {
                    if (isSuperAdmin || tenantEditableKeys.includes(key)) {
                        updatedSettings[key] = {
                            ...updatedSettings[key],
                            value: String(parsedJson[key]),
                            isCustom: true
                        };
                        updatedCount++;
                    }
                }
            }
            setSettings(updatedSettings);
            toast({ title: "导入成功", description: `已从JSON更新 ${updatedCount} 个设置项。请点击保存以生效。`});
            setBulkImportOpen(false);
            setBulkJson('');
        } catch (error) {
            toast({ title: "JSON导入失败", description: error.message, variant: "destructive" });
        }
    };
    
    const exportSettings = () => {
        const customSettings = Object.entries(settings)
            .filter(([key, setting]) => setting.isCustom && (isSuperAdmin || tenantEditableKeys.includes(key)))
            .reduce((acc, [key, setting]) => {
                acc[key] = setting.value;
                return acc;
            }, {});
        const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
            JSON.stringify(customSettings, null, 2)
        )}`;
        const link = document.createElement("a");
        link.href = jsonString;
        link.download = `settings_tenant_${managedTenantId}.json`;
        link.click();
    };
    
    const isManagingSubTenant = (isSuperAdmin && managedTenantId !== 0) || isTenantAdmin;

    const getTitle = () => {
        if (isSuperAdmin && managedTenantId !== 0) return "管辖分站设置";
        if (isSuperAdmin) return "主站站点设置";
        return "站点设置";
    };

    const getSubtitle = () => {
        if (isSuperAdmin && managedTenantId !== 0) {
            return `正在编辑 ${managedTenantInfo?.desired_domain || ''} (站长: ${managedTenantInfo?.profile?.username || 'N/A'}) 的站点设置`;
        }
        if (isSuperAdmin) return "配置主站的核心参数和默认模板。";
        return "个性化您的站点名称、描述和Logo。";
    };
    
    if (isLoading) {
        return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-muted-foreground" /></div>;
    }

    return (
        <>
            <Helmet>
                <title>{getTitle()} - 管理后台</title>
            </Helmet>
            <SettingsHeader 
                title={getTitle()}
                subtitle={getSubtitle()}
                isManagingSubTenant={isSuperAdmin && managedTenantId !== 0}
                onBack={() => navigate('/admin/saas')}
                showActions={isSuperAdmin}
                onBulkImportClick={() => setBulkImportOpen(true)}
                onExportClick={exportSettings}
            />

            <SettingsForm
                settings={settings}
                onInputChange={handleInputChange}
                onRevertToDefault={handleRevertToDefault}
                isSuperAdmin={isSuperAdmin}
                isManagingSubTenant={isManagingSubTenant}
                tenantEditableKeys={tenantEditableKeys}
            />

            {isSuperAdmin && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-6 flex flex-col md:flex-row gap-3 justify-between items-center">
                  <div className="text-sm text-muted-foreground">
                      友情提示：共享模式会从共享论坛展示帖子；置顶广告为主站全局数据，分站自动展示。
                  </div>
                  <div className="flex gap-3">
                      <Button
                          variant="secondary"
                          onClick={async () => {
                              try {
                                  await bffJson('/api/admin/seed-shared', { token, method: 'POST' });
                                  toast({ title: '共享论坛演示已写入', description: '已写入示例帖子到共享论坛。' });
                              } catch (e) {
                                  toast({ title: '写入失败', description: e.message, variant: 'destructive' });
                              }
                          }}
                      >
                          一键写入共享论坛演示
                      </Button>
                      <Button
                          variant="outline"
                          onClick={async () => {
                              try {
                                  await bffJson('/api/admin/seed-homepage', { token, method: 'POST' });
                                  toast({ title: '主站置顶广告演示已写入', description: '已写入社交页置顶广告（主站）。' });
                              } catch (e) {
                                  toast({ title: '写入失败', description: e.message, variant: 'destructive' });
                              }
                          }}
                      >
                          预置社交置顶广告（主站）
                      </Button>
                  </div>
              </motion.div>
            )}

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-6 flex justify-end">
                <Button onClick={handleSaveChanges} disabled={isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    保存更改
                </Button>
            </motion.div>
            
            <BulkImportDialog
              isOpen={isBulkImportOpen}
              onOpenChange={setBulkImportOpen}
              json={bulkJson}
              onJsonChange={setBulkJson}
              onImport={handleBulkImport}
            />
        </>
    );
};

export default AdminSiteSettings;