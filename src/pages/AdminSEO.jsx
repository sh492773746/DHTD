import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Clipboard, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const bffJson = async (path, { token, method = 'GET', body } = {}) => {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${method} ${path} failed: ${res.status} ${text}`);
  }
  return await res.json();
};

const rowsToMap = (rows) => {
  try {
    if (!Array.isArray(rows)) return {};
    return rows.reduce((acc, r) => { acc[r.key] = r.value; return acc; }, {});
  } catch { return {}; }
};

const AdminSEO = () => {
  const { isSuperAdmin, userTenantId, isInitialized, session, refreshSiteSettings } = useAuth();
  const { activeTenantId } = useTenant();
  const token = session?.access_token || null;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const prefilledRef = useRef(false);

  const managedTenantId = useMemo(() => {
    if (isSuperAdmin) return activeTenantId != null ? activeTenantId : 0;
    return userTenantId ?? activeTenantId ?? null;
  }, [isSuperAdmin, userTenantId, activeTenantId]);

  const { data, isLoading } = useQuery({
    queryKey: ['seoSuggestions', managedTenantId],
    queryFn: () => bffJson(`/api/admin/seo/suggestions?tenantId=${managedTenantId}`, { token }),
    enabled: isInitialized && !!token && managedTenantId != null,
  });

  // Saved settings for prefill
  const { data: settingsRows } = useQuery({
    queryKey: ['seoSettings', managedTenantId],
    queryFn: () => bffJson(`/api/admin/settings?tenantId=${managedTenantId}`, { token }),
    enabled: isInitialized && !!token && managedTenantId != null,
  });

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [keywords, setKeywords] = useState('');
  const [saving, setSaving] = useState(false);

  // Prefill once from saved settings
  useEffect(() => {
    if (prefilledRef.current) return;
    if (settingsRows) {
      const map = rowsToMap(settingsRows);
      setDescription(map.site_description || '');
      setKeywords(map.seo_keywords || '');
      prefilledRef.current = true;
    }
  }, [settingsRows]);

  const applySuggestions = () => {
    if (!data?.suggestions) return;
    if (!title) setTitle(data.suggestions.title || '');
    if (!description) setDescription(data.suggestions.description || '');
    if (!keywords) setKeywords(data.suggestions.keywords || '');
  };

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text || ''); } catch {}
  };

  const saveToSettings = async () => {
    setSaving(true);
    try {
      const updates = [
        { key: 'seo_title_suffix', value: '' }, // 不强制后缀，由站点名控制
        { key: 'site_description', value: description },
        { key: 'seo_keywords', value: keywords },
      ];
      await bffJson('/api/admin/settings', { token, method: 'POST', body: { tenantId: managedTenantId, updates } });
      queryClient.invalidateQueries({ queryKey: ['adminTenantSettings', managedTenantId] });
      queryClient.invalidateQueries({ queryKey: ['seoSettings', managedTenantId] });
      try { refreshSiteSettings && refreshSiteSettings(); } catch {}
      toast({ title: '保存成功', description: 'SEO 设置已更新。' });
    } catch (e) {
      toast({ title: '保存失败', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Helmet><title>SEO 建议 - 管理后台</title></Helmet>
      <Card>
        <CardContent className="space-y-6 pt-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : !data ? (
            <div className="text-muted-foreground">暂无数据</div>
          ) : (
            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold mb-2">Title 建议（50-60字）</label>
                  <Input value={title} onChange={e=>setTitle(e.target.value)} placeholder={data.suggestions?.title || ''} />
                  <div className="text-xs text-muted-foreground mt-1">长度：{(title||data.suggestions?.title||'').length}（{data.checks?.title?.ok ? '合格' : '建议 50-60'}）</div>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Description 建议（120-160字）</label>
                  <Textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder={data.suggestions?.description || ''} />
                  <div className="text-xs text-muted-foreground mt-1">长度：{(description||data.suggestions?.description||'').length}（{data.checks?.description?.ok ? '合格' : '建议 120-160'}）</div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Keywords 建议（4-12个，逗号分隔）</label>
                <Input value={keywords} onChange={e=>setKeywords(e.target.value)} placeholder={data.suggestions?.keywords || ''} />
                <div className="text-xs text-muted-foreground mt-1">数量：{(keywords||data.suggestions?.keywords||'').split(',').filter(Boolean).length}（{data.checks?.keywords?.ok ? '合格' : '建议 4-12'}）</div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={applySuggestions}><CheckCircle2 className="h-4 w-4 mr-1" /> 一键填充建议</Button>
                <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={()=>copy(`${title||data.suggestions?.title}`)}><Clipboard className="h-4 w-4 mr-1" /> 复制Title</Button>
                <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={()=>copy(`${description||data.suggestions?.description}`)}><Clipboard className="h-4 w-4 mr-1" /> 复制Description</Button>
                <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={()=>copy(`${keywords||data.suggestions?.keywords}`)}><Clipboard className="h-4 w-4 mr-1" /> 复制Keywords</Button>
                <Button type="button" className="w-full sm:w-auto" onClick={saveToSettings} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : '保存到站点设置'}</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
};

export default AdminSEO; 