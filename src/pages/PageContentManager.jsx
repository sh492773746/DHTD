import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft } from 'lucide-react';
import ContentItemForm from '@/components/ContentItemForm';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { pageConfig as basePageConfig } from '@/config/pageContentConfig';
import ContentSection from '@/components/admin/ContentSection';
import { useAuth } from '@/contexts/SupabaseAuthContext';

import { useTenant } from '@/contexts/TenantContext';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';

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
    return res.json();
};

async function fetchSectionItems(token, tenantId, page, sectionId) {
    const rows = await bffJson(`/api/admin/page-content?page=${encodeURIComponent(page)}&section=${encodeURIComponent(sectionId)}${tenantId !== undefined ? `&tenantId=${tenantId}` : ''}`, { token });
    return (rows || []).map(item => {
        let parsed;
        try { parsed = typeof item.content === 'string' ? JSON.parse(item.content) : (item.content || {}); } catch { parsed = {}; }
        return {
            id: item.id,
            page: item.page,
            section: item.section || sectionId,
            position: item.position,
            is_active: true,
            content: parsed,
        };
    });
    }

const fetchPageContent = async (token, tenantId, page, sectionIds) => {
    if (tenantId === undefined || !page || !Array.isArray(sectionIds) || sectionIds.length === 0) return {};
    const results = await Promise.all(sectionIds.map(sec => fetchSectionItems(token, tenantId, page, sec).catch(() => [])));
    const contentMap = {};
    sectionIds.forEach((sec, idx) => {
        const list = results[idx] || [];
        list.sort((a, b) => a.position - b.position);
        contentMap[sec] = list;
    });
    return contentMap;
};

const fetchGameCategories = async (token) => {
    const res = await fetch('/api/page-content?page=games&section=game_categories');
    if (!res.ok) return [];
    const arr = await res.json();
    return (arr || []).map(c => ({ value: c.slug || c.content?.slug, label: c.name || c.content?.name })).filter(x => x.value && x.label);
};

const fetchTenantInfo = async (_token, _tenantId) => {
        return null;
};

const PageContentManager = () => {
    const navigate = useNavigate();
    const { tenantId: tenantIdFromUrl } = useParams();
    const { isInitialized, isSuperAdmin, isTenantAdmin, userTenantId, session } = useAuth();
    const token = session?.access_token || null;
    const { activeTenantId: tenantIdFromContext } = useTenant();
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const [pageConfig, setPageConfig] = useState({});
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [activePage, setActivePage] = useState('');
    const [activeSection, setActiveSection] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const managedTenantId = useMemo(() => {
        if(tenantIdFromUrl) return parseInt(tenantIdFromUrl, 10);
        if (isSuperAdmin) {
            return tenantIdFromContext !== null ? tenantIdFromContext : 0;
        }
        return userTenantId;
    }, [tenantIdFromUrl, tenantIdFromContext, isSuperAdmin, userTenantId]);

    useEffect(() => {
        let config = {};
        if (isSuperAdmin || isTenantAdmin) {
            Object.entries(basePageConfig).forEach(([pageKey, pageData]) => {
                const editableSections = pageData.sections.filter(s => isSuperAdmin || s.tenantEditable);
                if (editableSections.length > 0) {
                    config[pageKey] = { ...pageData, sections: editableSections };
                }
            });
        }
        setPageConfig(config);
        const firstPageKey = Object.keys(config)[0];
        if (firstPageKey && !activePage) {
            setActivePage(firstPageKey);
        }
    }, [isSuperAdmin, isTenantAdmin, activePage]);

    const sectionIds = useMemo(() => (pageConfig[activePage]?.sections || []).map(s => s.id), [pageConfig, activePage]);
    const sectionsKey = sectionIds.join(',');

    const { data: pageContent, isLoading: isContentLoading } = useQuery({
        queryKey: ['pageContent', managedTenantId, activePage, sectionsKey, !!token],
        queryFn: () => fetchPageContent(token, managedTenantId, activePage, sectionIds),
        enabled: isInitialized && managedTenantId !== undefined && !!activePage && sectionIds.length > 0 && !!token,
    });

    const { data: categoryOptions } = useQuery({
        queryKey: ['gameCategories', managedTenantId],
        queryFn: () => fetchGameCategories(token),
        enabled: isInitialized,
        staleTime: 5 * 60 * 1000, // 5分钟后重新获取
    });

    const { data: managedTenantInfo } = useQuery({
        queryKey: ['tenantInfo', managedTenantId],
        queryFn: () => fetchTenantInfo(token, managedTenantId),
        enabled: isInitialized && !!managedTenantId && managedTenantId !== 0,
    });

    const invalidateContentQueries = useCallback(() => {
        // 刷新后台管理页面的缓存
        queryClient.invalidateQueries({ queryKey: ['pageContent', managedTenantId, activePage, sectionsKey, !!token] });
        queryClient.invalidateQueries({ queryKey: ['dashboardContent', managedTenantId] });
        queryClient.invalidateQueries({ queryKey: ['gamesData', managedTenantId] });
        // 刷新游戏分类（当分类更新时，卡片的下拉选项需要同步更新）
        queryClient.invalidateQueries({ queryKey: ['gameCategories', managedTenantId] });
        // ensure social pinned ads refresh on Social page
        queryClient.invalidateQueries({ queryKey: ['pageContent', 'social', 'pinned_ads'] });
        
        // 🔥 关键修复：刷新前台页面的缓存
        // 前台页面使用 ['pageContent', page, section] 格式
        // 使用 queryKey 前缀匹配来刷新所有相关的前台页面缓存
        queryClient.invalidateQueries({ 
            predicate: (query) => {
                // 匹配所有以 'pageContent' 开头的查询
                // 这会刷新前台的 ['pageContent', 'home', 'carousel'] 等缓存
                return query.queryKey[0] === 'pageContent';
            }
        });
    }, [queryClient, managedTenantId, activePage, sectionsKey, token]);

    const handleFormSubmit = async (values, itemId) => {
        setIsSubmitting(true);
        const currentItems = pageContent?.[activeSection] || [];
        const position = itemId ? currentItems.find(item => item.id === itemId)?.position : currentItems.length;

        const contentData = {
            page: activePage,
            section: activeSection,
            content: values,
            position: position,
            tenant_id: managedTenantId
        };

        try {
            if (itemId) {
                await bffJson(`/api/admin/page-content/${itemId}`, { token, method: 'PUT', body: { ...contentData, id: itemId } });
        } else {
                await bffJson('/api/admin/page-content', { token, method: 'POST', body: contentData });
            }
            toast({ title: '保存成功', description: '内容已更新' });
            setIsFormOpen(false);
            setEditingItem(null);
            invalidateContentQueries();
        } catch (e) {
            toast({ title: '保存失败', description: e.message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            await bffJson(`/api/admin/page-content/${id}?tenantId=${managedTenantId}`, { token, method: 'DELETE' });
            toast({ title: '删除成功' });
            invalidateContentQueries();
        } catch (e) {
            toast({ title: '删除失败', description: e.message, variant: 'destructive' });
        }
    };

    const handleBatchImport = async (importedData, page, section) => {
        if (!Array.isArray(importedData) || importedData.length === 0) {
            toast({ title: '导入失败', description: 'JSON文件必须是一个非空数组。', variant: 'destructive' });
            return;
        }
        setIsSubmitting(true);
        const currentItems = pageContent?.[section] || [];
        let currentMaxPosition = currentItems.length > 0 ? Math.max(...currentItems.map(i => i.position)) : -1;

        try {
            for (const itemContent of importedData) {
                currentMaxPosition += 1;
                const body = {
            page,
            section,
            content: itemContent,
                    position: currentMaxPosition,
                    tenant_id: managedTenantId,
                };
                await bffJson('/api/admin/page-content', { token, method: 'POST', body });
            }
            toast({ title: '批量导入成功', description: `${importedData.length}个项目已添加。` });
            invalidateContentQueries();
        } catch (e) {
            toast({ title: '批量导入失败', description: e.message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEdit = (item) => {
        setActiveSection(item.section);
        setEditingItem(item);
        setIsFormOpen(true);
    };

    const handleAddNew = (sectionId) => {
        setActiveSection(sectionId);
        setEditingItem(null);
        setIsFormOpen(true);
    };

    const handleRemoveDuplicates = async (page, section) => {
        const items = pageContent?.[section] || [];
        if (items.length === 0) {
            toast({ title: '提示', description: '没有数据可以去重' });
            return;
        }

        // 找出重复的游戏名称
        const titleMap = new Map();
        const duplicates = [];
        
        items.forEach(item => {
            const title = item.content?.title;
            if (title) {
                if (!titleMap.has(title)) {
                    titleMap.set(title, item);
                } else {
                    // 发现重复，保留ID更小的（更早的）
                    const existing = titleMap.get(title);
                    if (item.id > existing.id) {
                        duplicates.push(item.id);
                    } else {
                        duplicates.push(existing.id);
                        titleMap.set(title, item);
                    }
                }
            }
        });

        if (duplicates.length === 0) {
            toast({ title: '提示', description: '没有发现重复的游戏名称' });
            return;
        }

        if (!confirm(`发现 ${duplicates.length} 个重复项，确定删除吗？\n将保留每个游戏名称的第一条记录。`)) {
            return;
        }

        setIsSubmitting(true);
        try {
            // 批量删除重复项
            for (const id of duplicates) {
                await bffJson(`/api/admin/page-content/${id}?tenantId=${managedTenantId}`, { token, method: 'DELETE' });
            }
            toast({ 
                title: '去重成功', 
                description: `已删除 ${duplicates.length} 个重复的游戏卡片` 
            });
            invalidateContentQueries();
        } catch (e) {
            toast({ title: '去重失败', description: e.message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBatchUpdateCategory = async (itemIds, categorySlug) => {
        if (itemIds.length === 0) {
            toast({ title: '提示', description: '没有选中的项目' });
            return;
        }

        if (!confirm(`确定要将 ${itemIds.length} 个游戏卡片的分类修改为 "${categoryOptions.find(c => c.value === categorySlug)?.label}"？`)) {
            return;
        }

        setIsSubmitting(true);
        try {
            // 批量更新每个项目的分类
            for (const itemId of itemIds) {
                const item = pageContent?.['game_cards']?.find(i => i.id === itemId);
                if (!item) continue;

                const updatedContent = {
                    ...item.content,
                    category: categorySlug
                };

                await bffJson(`/api/admin/page-content/${itemId}?tenantId=${managedTenantId}`, {
                    token,
                    method: 'PUT',
                    body: {
                        ...item,
                        content: updatedContent
                    }
                });
            }

            toast({ 
                title: '批量更新成功', 
                description: `已更新 ${itemIds.length} 个游戏卡片的分类` 
            });
            invalidateContentQueries();
        } catch (e) {
            toast({ title: '批量更新失败', description: e.message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const isManagingSubTenant = isSuperAdmin && managedTenantId !== 0;

    const getTitle = () => {
        if (isManagingSubTenant) return "管辖分站内容";
        if (isSuperAdmin) return "主站内容管理";
        return "页面内容管理";
    };

    const getSubtitle = () => {
        if (isManagingSubTenant) {
            return `正在编辑 ${managedTenantInfo?.desired_domain || ''} (站长: ${managedTenantInfo?.profile?.username || 'N/A'})`;
        }
        if (isSuperAdmin) return "配置主站的动态内容。";
        return "编辑您网站的轮播图、公告、游戏等内容。";
    };

    if (!isInitialized || managedTenantId === undefined) {
        return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-muted-foreground" /></div>;
    }

    const activePageConfig = pageConfig[activePage] || { sections: [] };
    const activeSectionConfig = activePageConfig.sections.find(s => s.id === activeSection) || {};

    return (
        <div className="overflow-x-auto">
            <Helmet>
                <title>{getTitle()} - 管理后台</title>
            </Helmet>
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                <div className="flex items-center gap-4">
                    {isManagingSubTenant && (
                        <Button variant="outline" size="icon" onClick={() => navigate('/admin/saas')}>
                            <ArrowLeft className="h-4 w-4 text-foreground" />
                        </Button>
                    )}
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-foreground">{getTitle()}</h1>
                        <p className="mt-1 text-sm text-muted-foreground">{getSubtitle()}</p>
                    </div>
                </div>
            </motion.div>

            {activePage && (
                <Tabs value={activePage} onValueChange={setActivePage} className="w-full">
                    <TabsList className="overflow-x-auto whitespace-nowrap">
                        {Object.entries(pageConfig).map(([pageId, config]) => (
                            <TabsTrigger key={pageId} value={pageId}>{config.name}</TabsTrigger>
                        ))}
                    </TabsList>
                    
                    {Object.entries(pageConfig).map(([pageId, config]) => (
                        <TabsContent key={pageId} value={pageId} className="mt-4">
                            {isContentLoading && activePage === pageId ? (
                                <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-muted-foreground" /></div>
                            ) : (
                                <div className="space-y-6">
                                    {config.sections.map(section => (
                                        <ContentSection
                                            key={section.id}
                                            sectionConfig={{ ...section, pageId: pageId }}
                                            sectionContent={pageContent?.[section.id] || []}
                                            onEdit={handleEdit}
                                            onDelete={handleDelete}
                                            onReorder={() => {}}
                                            onAddNew={() => handleAddNew(section.id)}
                                            onBatchImport={(data) => handleBatchImport(data, pageId, section.id)}
                                            onRemoveDuplicates={() => handleRemoveDuplicates(pageId, section.id)}
                                            onBatchUpdateCategory={handleBatchUpdateCategory}
                                            categoryOptions={categoryOptions}
                                        />
                                    ))}
                                </div>
                            )}
                        </TabsContent>
                    ))}
                </Tabs>
            )}
            
            {isFormOpen && activeSectionConfig?.fields && (
                <ContentItemForm
                    isOpen={isFormOpen}
                    onClose={() => { setIsFormOpen(false); setEditingItem(null); }}
                    onSubmit={handleFormSubmit}
                    initialData={editingItem}
                    fields={activeSectionConfig.fields || []}
                    title={`${editingItem ? '编辑' : '添加'}“${activeSectionConfig.name}”内容`}
                    loading={isSubmitting}
                    categoryOptions={categoryOptions || []}
                    imageUploaderBucket={activeSection === 'game_cards' ? 'site-assets' : 'page-content-images'}
                />
            )}
        </div>
    );
};

export default PageContentManager;