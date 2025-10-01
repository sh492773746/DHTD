import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Loader2, 
  Clipboard, 
  CheckCircle2,
  Search,
  TrendingUp,
  FileText,
  Share2,
  AlertCircle,
  Sparkles,
  Eye,
  BarChart3,
  Globe,
  Target,
  Zap,
  Check,
  X,
} from 'lucide-react';
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
  const { isSuperAdmin, userTenantId, isInitialized, session, refreshSiteSettings, siteSettings } = useAuth();
  const { activeTenantId } = useTenant();
  const token = session?.access_token || null;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const prefilledRef = useRef(false);

  const managedTenantId = useMemo(() => {
    if (isSuperAdmin) return activeTenantId != null ? activeTenantId : 0;
    return userTenantId ?? activeTenantId ?? null;
  }, [isSuperAdmin, userTenantId, activeTenantId]);

  // 狀態管理
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [keywords, setKeywords] = useState('');
  const [ogTitle, setOgTitle] = useState('');
  const [ogDescription, setOgDescription] = useState('');
  const [ogImage, setOgImage] = useState('');
  const [canonicalUrl, setCanonicalUrl] = useState('');
  const [robots, setRobots] = useState('index, follow');
  const [saving, setSaving] = useState(false);

  // 獲取 SEO 建議
  const { data, isLoading } = useQuery({
    queryKey: ['seoSuggestions', managedTenantId],
    queryFn: () => bffJson(`/api/admin/seo/suggestions?tenantId=${managedTenantId}`, { token }),
    enabled: isInitialized && !!token && managedTenantId != null,
  });

  // 獲取已保存的設置
  const { data: settingsRows } = useQuery({
    queryKey: ['seoSettings', managedTenantId],
    queryFn: () => bffJson(`/api/admin/settings?tenantId=${managedTenantId}`, { token }),
    enabled: isInitialized && !!token && managedTenantId != null,
  });

  // 預填充已保存的設置
  useEffect(() => {
    if (prefilledRef.current) return;
    if (settingsRows) {
      const map = rowsToMap(settingsRows);
      setTitle(map.seo_title || map.site_name || '');
      setDescription(map.site_description || '');
      setKeywords(map.seo_keywords || '');
      setOgTitle(map.og_title || map.site_name || '');
      setOgDescription(map.og_description || map.site_description || '');
      setOgImage(map.og_image || map.site_logo || '');
      setCanonicalUrl(map.canonical_url || '');
      setRobots(map.robots || 'index, follow');
      prefilledRef.current = true;
    }
  }, [settingsRows]);

  // 計算 SEO 分數
  const seoScore = useMemo(() => {
    let score = 0;
    let checks = [];

    const titleLen = title.length;
    if (titleLen >= 30 && titleLen <= 60) {
      score += 15;
      checks.push({ name: 'Title 長度', status: 'pass', message: `${titleLen} 字符（最佳範圍 30-60）` });
    } else {
      checks.push({ name: 'Title 長度', status: 'fail', message: `${titleLen} 字符（建議 30-60）` });
    }

    const descLen = description.length;
    if (descLen >= 120 && descLen <= 160) {
      score += 15;
      checks.push({ name: 'Description 長度', status: 'pass', message: `${descLen} 字符（最佳範圍 120-160）` });
    } else {
      checks.push({ name: 'Description 長度', status: 'fail', message: `${descLen} 字符（建議 120-160）` });
    }

    const keywordsArr = keywords.split(',').filter(k => k.trim());
    if (keywordsArr.length >= 4 && keywordsArr.length <= 12) {
      score += 10;
      checks.push({ name: 'Keywords 數量', status: 'pass', message: `${keywordsArr.length} 個（最佳範圍 4-12）` });
    } else {
      checks.push({ name: 'Keywords 數量', status: 'fail', message: `${keywordsArr.length} 個（建議 4-12）` });
    }

    if (ogTitle && ogDescription && ogImage) {
      score += 20;
      checks.push({ name: 'Open Graph', status: 'pass', message: '社交媒體優化完整' });
    } else {
      checks.push({ name: 'Open Graph', status: 'warn', message: '建議完善社交媒體標籤' });
    }

    if (canonicalUrl && canonicalUrl.startsWith('http')) {
      score += 10;
      checks.push({ name: 'Canonical URL', status: 'pass', message: '規範 URL 已設置' });
    } else {
      checks.push({ name: 'Canonical URL', status: 'warn', message: '建議設置規範 URL' });
    }

    if (robots.includes('index')) {
      score += 10;
      checks.push({ name: 'Robots Meta', status: 'pass', message: '允許搜索引擎索引' });
    } else {
      checks.push({ name: 'Robots Meta', status: 'warn', message: '當前禁止索引' });
    }

    if (siteSettings?.site_logo) {
      score += 10;
      checks.push({ name: '站點 Logo', status: 'pass', message: 'Logo 已設置' });
    } else {
      checks.push({ name: '站點 Logo', status: 'warn', message: '建議上傳 Logo' });
    }

    if (siteSettings?.site_name) {
      score += 10;
      checks.push({ name: '站點名稱', status: 'pass', message: '站點名稱已設置' });
    } else {
      checks.push({ name: '站點名稱', status: 'warn', message: '建議設置站點名稱' });
    }

    return { score, checks, maxScore: 100 };
  }, [title, description, keywords, ogTitle, ogDescription, ogImage, canonicalUrl, robots, siteSettings]);

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text || '');
      toast({ title: '已複製', description: `${label}已複製到剪貼板` });
    } catch (e) {
      toast({ title: '複製失敗', description: e.message, variant: 'destructive' });
    }
  };

  const applySuggestions = () => {
    if (!data?.suggestions) return;
    setTitle(data.suggestions.title || '');
    setDescription(data.suggestions.description || '');
    setKeywords(data.suggestions.keywords || '');
    setOgTitle(data.suggestions.title || '');
    setOgDescription(data.suggestions.description || '');
    toast({ title: '已填充', description: '已自動填充 SEO 建議' });
  };

  const saveToSettings = async () => {
    setSaving(true);
    try {
      const updates = [
        { key: 'seo_title', value: title },
        { key: 'site_description', value: description },
        { key: 'seo_keywords', value: keywords },
        { key: 'og_title', value: ogTitle },
        { key: 'og_description', value: ogDescription },
        { key: 'og_image', value: ogImage },
        { key: 'canonical_url', value: canonicalUrl },
        { key: 'robots', value: robots },
      ];
      await bffJson('/api/admin/settings', { token, method: 'POST', body: { tenantId: managedTenantId, updates } });
      queryClient.invalidateQueries({ queryKey: ['adminTenantSettings', managedTenantId] });
      queryClient.invalidateQueries({ queryKey: ['seoSettings', managedTenantId] });
      try { refreshSiteSettings && refreshSiteSettings(); } catch {}
      toast({ title: '保存成功', description: 'SEO 設置已更新，可能需要幾分鐘生效。' });
    } catch (e) {
      toast({ title: '保存失敗', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const GooglePreview = () => {
    const previewTitle = title || siteSettings?.site_name || '您的網站標題';
    const previewUrl = canonicalUrl || 'https://dhtd.vercel.app';
    const previewDesc = description || '您的網站描述...';

    return (
      <div className="border rounded-lg p-4 bg-white">
        <div className="text-xs text-gray-500 mb-2">Google 搜索結果預覽</div>
        <div className="max-w-2xl">
          <div className="text-sm text-green-700 mb-1">{previewUrl}</div>
          <div className="text-xl text-blue-600 hover:underline cursor-pointer mb-1">
            {previewTitle}
          </div>
          <div className="text-sm text-gray-600 line-clamp-2">
            {previewDesc}
          </div>
        </div>
      </div>
    );
  };

  const OGPreview = () => {
    const previewTitle = ogTitle || title || siteSettings?.site_name || '您的網站標題';
    const previewDesc = ogDescription || description || '您的網站描述...';
    const previewImage = ogImage || siteSettings?.site_logo || 'https://via.placeholder.com/600x315?text=OG+Image';

    return (
      <div className="border rounded-lg p-4 bg-gray-50">
        <div className="text-xs text-gray-500 mb-2">社交媒體分享預覽</div>
        <div className="max-w-lg border rounded-lg overflow-hidden bg-white shadow-sm">
          <img src={previewImage} alt="OG" className="w-full h-48 object-cover bg-gray-200" />
          <div className="p-3">
            <div className="font-semibold text-gray-900 mb-1 line-clamp-1">
              {previewTitle}
            </div>
            <div className="text-sm text-gray-600 line-clamp-2">
              {previewDesc}
            </div>
            <div className="text-xs text-gray-400 mt-2">
              {canonicalUrl || 'dhtd.vercel.app'}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const SEOChecklist = ({ checks }) => {
    return (
      <div className="space-y-2">
        {checks.map((check, idx) => (
          <div 
            key={idx} 
            className={`flex items-start gap-3 p-3 rounded-lg ${
              check.status === 'pass' ? 'bg-green-50' : 
              check.status === 'warn' ? 'bg-yellow-50' : 'bg-red-50'
            }`}
          >
            <div className={`mt-0.5 ${
              check.status === 'pass' ? 'text-green-600' : 
              check.status === 'warn' ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {check.status === 'pass' ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : check.status === 'warn' ? (
                <AlertCircle className="h-5 w-5" />
              ) : (
                <X className="h-5 w-5" />
              )}
            </div>
            <div className="flex-1">
              <div className="font-medium text-sm">{check.name}</div>
              <div className="text-xs text-gray-600 mt-0.5">{check.message}</div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <Helmet><title>SEO 優化設置 - 管理後台</title></Helmet>
      
      <div className="space-y-6">
        {/* 頂部標題和分數 */}
        <div className="flex flex-col md:flex-row items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <Search className="h-8 w-8 text-blue-600" />
              SEO 優化設置
            </h1>
            <p className="text-gray-600 mt-1">
              優化您的網站在搜索引擎中的表現，提升曝光率和點擊率
            </p>
          </div>
          
          {/* SEO 分數卡片 */}
          <Card className="w-full md:w-56">
            <CardContent className="p-4">
              <div className="text-center">
                <div className={`text-4xl font-bold mb-2 ${
                  seoScore.score >= 80 ? 'text-green-600' :
                  seoScore.score >= 60 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {seoScore.score}
                </div>
                <div className="text-xs text-gray-500 mb-2">SEO 分數</div>
                <Progress 
                  value={seoScore.score} 
                  className={`h-2 ${
                    seoScore.score >= 80 ? '[&>div]:bg-green-600' :
                    seoScore.score >= 60 ? '[&>div]:bg-yellow-600' : '[&>div]:bg-red-600'
                  }`}
                />
                <div className="text-xs text-gray-500 mt-2">
                  {seoScore.score >= 80 ? '優秀 🎉' :
                   seoScore.score >= 60 ? '良好 👍' : '需改進 ⚠️'}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 主要內容 */}
        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="basic">
              <FileText className="h-4 w-4 mr-2" />
              基礎設置
            </TabsTrigger>
            <TabsTrigger value="social">
              <Share2 className="h-4 w-4 mr-2" />
              社交媒體
            </TabsTrigger>
            <TabsTrigger value="preview">
              <Eye className="h-4 w-4 mr-2" />
              預覽效果
            </TabsTrigger>
            <TabsTrigger value="analysis">
              <BarChart3 className="h-4 w-4 mr-2" />
              SEO 分析
            </TabsTrigger>
            <TabsTrigger value="tips">
              <Sparkles className="h-4 w-4 mr-2" />
              優化建議
            </TabsTrigger>
          </TabsList>

          {/* 基礎設置標籤頁 */}
          <TabsContent value="basic" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>基礎 SEO 設置</CardTitle>
                <CardDescription>
                  設置網站的基本 SEO 元數據，這些信息將影響搜索引擎的索引和排名
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Title */}
                <div>
                  <label className="block text-sm font-semibold mb-2 flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    網站標題 (Title Tag)
                    <Badge variant="outline" className="text-xs">重要</Badge>
                  </label>
                  <Input 
                    value={title} 
                    onChange={e => setTitle(e.target.value)} 
                    placeholder={data?.suggestions?.title || '輸入網站標題...'}
                    maxLength={60}
                  />
                  <div className="flex items-center justify-between mt-2">
                    <div className={`text-xs ${
                      title.length >= 30 && title.length <= 60 ? 'text-green-600 font-medium' : 'text-gray-500'
                    }`}>
                      {title.length} / 60 字符 
                      {title.length >= 30 && title.length <= 60 && ' ✓ 最佳長度'}
                    </div>
                    {data?.suggestions?.title && (
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => setTitle(data.suggestions.title)}
                      >
                        <Zap className="h-3 w-3 mr-1" />
                        使用建議
                      </Button>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-1 bg-blue-50 p-2 rounded">
                    💡 建議：30-60 字符，包含核心關鍵詞，吸引用戶點擊
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-semibold mb-2 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    網站描述 (Meta Description)
                    <Badge variant="outline" className="text-xs">重要</Badge>
                  </label>
                  <Textarea 
                    value={description} 
                    onChange={e => setDescription(e.target.value)} 
                    placeholder={data?.suggestions?.description || '輸入網站描述...'}
                    rows={4}
                    maxLength={160}
                  />
                  <div className="flex items-center justify-between mt-2">
                    <div className={`text-xs ${
                      description.length >= 120 && description.length <= 160 ? 'text-green-600 font-medium' : 'text-gray-500'
                    }`}>
                      {description.length} / 160 字符
                      {description.length >= 120 && description.length <= 160 && ' ✓ 最佳長度'}
                    </div>
                    {data?.suggestions?.description && (
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => setDescription(data.suggestions.description)}
                      >
                        <Zap className="h-3 w-3 mr-1" />
                        使用建議
                      </Button>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-1 bg-blue-50 p-2 rounded">
                    💡 建議：120-160 字符，簡潔描述網站特色，吸引點擊
                  </div>
                </div>

                {/* Keywords */}
                <div>
                  <label className="block text-sm font-semibold mb-2 flex items-center gap-2">
                    <Search className="h-4 w-4" />
                    關鍵詞 (Keywords)
                  </label>
                  <Input 
                    value={keywords} 
                    onChange={e => setKeywords(e.target.value)} 
                    placeholder={data?.suggestions?.keywords || '關鍵詞1, 關鍵詞2, 關鍵詞3'}
                  />
                  <div className="flex items-center justify-between mt-2">
                    <div className="text-xs text-gray-500">
                      {keywords.split(',').filter(k => k.trim()).length} 個關鍵詞
                      {keywords.split(',').filter(k => k.trim()).length >= 4 && 
                       keywords.split(',').filter(k => k.trim()).length <= 12 && 
                       ' ✓ 最佳數量'}
                    </div>
                    {data?.suggestions?.keywords && (
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => setKeywords(data.suggestions.keywords)}
                      >
                        <Zap className="h-3 w-3 mr-1" />
                        使用建議
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {keywords.split(',').filter(k => k.trim()).map((kw, idx) => (
                      <Badge key={idx} variant="secondary">{kw.trim()}</Badge>
                    ))}
                  </div>
                  <div className="text-xs text-gray-500 mt-2 bg-blue-50 p-2 rounded">
                    💡 建議：4-12 個關鍵詞，用逗號分隔，選擇與網站內容相關的詞
                  </div>
                </div>

                {/* Canonical URL */}
                <div>
                  <label className="block text-sm font-semibold mb-2 flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    規範 URL (Canonical URL)
                  </label>
                  <Input 
                    value={canonicalUrl} 
                    onChange={e => setCanonicalUrl(e.target.value)} 
                    placeholder="https://dhtd.vercel.app"
                  />
                  <div className="text-xs text-gray-500 mt-1 bg-blue-50 p-2 rounded">
                    💡 建議：設置網站的主域名，避免重複內容問題
                  </div>
                </div>

                {/* Robots */}
                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Robots Meta Tag
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {['index, follow', 'index, nofollow', 'noindex, follow', 'noindex, nofollow'].map(option => (
                      <Button
                        key={option}
                        variant={robots === option ? 'default' : 'outline'}
                        onClick={() => setRobots(option)}
                        className="justify-start"
                      >
                        {robots === option && <Check className="h-4 w-4 mr-2" />}
                        {option}
                      </Button>
                    ))}
                  </div>
                  <div className="text-xs text-gray-500 mt-2 bg-blue-50 p-2 rounded">
                    💡 建議：通常使用 "index, follow" 允許搜索引擎索引和跟蹤鏈接
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 社交媒體設置標籤頁 */}
          <TabsContent value="social" className="space-y-4">
      <Card>
              <CardHeader>
                <CardTitle>Open Graph 設置</CardTitle>
                <CardDescription>
                  優化在 Facebook、Twitter、LinkedIn 等社交平台分享時的顯示效果
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold mb-2">
                    OG 標題 (og:title)
                  </label>
                  <Input 
                    value={ogTitle} 
                    onChange={e => setOgTitle(e.target.value)} 
                    placeholder={title || '社交媒體標題...'}
                    maxLength={60}
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    {ogTitle.length} / 60 字符 · 建議與網站標題一致或略有不同
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">
                    OG 描述 (og:description)
                  </label>
                  <Textarea 
                    value={ogDescription} 
                    onChange={e => setOgDescription(e.target.value)} 
                    placeholder={description || '社交媒體描述...'}
                    rows={3}
                    maxLength={200}
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    {ogDescription.length} / 200 字符 · 可比 meta description 稍長
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">
                    OG 圖片 (og:image)
                  </label>
                  <Input 
                    value={ogImage} 
                    onChange={e => setOgImage(e.target.value)} 
                    placeholder="https://your-site.com/og-image.jpg"
                  />
                  <div className="text-xs text-gray-500 mt-1 bg-blue-50 p-2 rounded">
                    💡 建議：1200x630 像素，小於 5MB，使用 JPG 或 PNG 格式
                  </div>
                  {ogImage && (
                    <div className="mt-3 border rounded-lg overflow-hidden max-w-xs">
                      <img 
                        src={ogImage} 
                        alt="OG Preview" 
                        className="w-full h-40 object-cover bg-gray-100"
                        onError={(e) => {
                          e.target.src = 'https://via.placeholder.com/600x315?text=圖片載入失敗';
                        }}
                      />
                    </div>
                  )}
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-2">Twitter Card 設置</h3>
                  <div className="bg-blue-50 p-3 rounded-lg text-sm text-gray-700">
                    <p>Twitter 會自動使用 Open Graph 標籤。</p>
                    <p className="mt-1">建議額外設置：</p>
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>twitter:card = summary_large_image</li>
                      <li>twitter:site = @your_twitter_handle</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 預覽效果標籤頁 */}
          <TabsContent value="preview" className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Google 搜索預覽</CardTitle>
                  <CardDescription>
                    您的網站在 Google 搜索結果中的顯示效果
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <GooglePreview />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">社交媒體預覽</CardTitle>
                  <CardDescription>
                    在 Facebook、Twitter 等平台分享時的顯示效果
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <OGPreview />
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">生成的 Meta Tags</CardTitle>
                <CardDescription>
                  將以下代碼添加到網站的 &lt;head&gt; 標籤中（系統已自動處理）
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
{`<!-- Basic SEO -->
<title>${title || '網站標題'}</title>
<meta name="description" content="${description || '網站描述'}" />
<meta name="keywords" content="${keywords || '關鍵詞'}" />
<meta name="robots" content="${robots}" />
<link rel="canonical" href="${canonicalUrl || 'https://dhtd.vercel.app'}" />

<!-- Open Graph / Facebook -->
<meta property="og:type" content="website" />
<meta property="og:url" content="${canonicalUrl || 'https://dhtd.vercel.app'}" />
<meta property="og:title" content="${ogTitle || title || '網站標題'}" />
<meta property="og:description" content="${ogDescription || description || '網站描述'}" />
<meta property="og:image" content="${ogImage || 'https://...'}" />

<!-- Twitter -->
<meta property="twitter:card" content="summary_large_image" />
<meta property="twitter:url" content="${canonicalUrl || 'https://dhtd.vercel.app'}" />
<meta property="twitter:title" content="${ogTitle || title || '網站標題'}" />
<meta property="twitter:description" content="${ogDescription || description || '網站描述'}" />
<meta property="twitter:image" content="${ogImage || 'https://...'}" />`}
                  </pre>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="absolute top-2 right-2"
                    onClick={() => copy(
                      `<title>${title || '網站標題'}</title>\n<meta name="description" content="${description || '網站描述'}" />`,
                      'Meta Tags'
                    )}
                  >
                    <Clipboard className="h-3 w-3 mr-1" />
                    複製全部
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SEO 分析標籤頁 */}
          <TabsContent value="analysis" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>SEO 健康檢查</CardTitle>
                <CardDescription>
                  當前 SEO 設置的詳細分析和評分
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold">整體評分</span>
                    <span className={`text-2xl font-bold ${
                      seoScore.score >= 80 ? 'text-green-600' :
                      seoScore.score >= 60 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {seoScore.score} / {seoScore.maxScore}
                    </span>
                  </div>
                  <Progress 
                    value={seoScore.score} 
                    className={`h-3 ${
                      seoScore.score >= 80 ? '[&>div]:bg-green-600' :
                      seoScore.score >= 60 ? '[&>div]:bg-yellow-600' : '[&>div]:bg-red-600'
                    }`}
                  />
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3">檢查項目</h3>
                  <SEOChecklist checks={seoScore.checks} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>關鍵詞分析</CardTitle>
                <CardDescription>
                  您設置的關鍵詞列表和分佈
                </CardDescription>
              </CardHeader>
              <CardContent>
                {keywords ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {keywords.split(',').filter(k => k.trim()).map((kw, idx) => (
                        <Badge key={idx} variant="outline" className="text-sm py-1 px-3">
                          <Search className="h-3 w-3 mr-1" />
                          {kw.trim()}
                        </Badge>
                      ))}
                    </div>
                    <div className="bg-gray-50 p-3 rounded text-sm">
                      <div className="font-medium mb-1">關鍵詞建議：</div>
                      <ul className="space-y-1 text-gray-700">
                        <li>• 確保這些詞在網站內容中自然出現</li>
                        <li>• 考慮添加長尾關鍵詞（更具體的短語）</li>
                        <li>• 定期檢查關鍵詞的搜索量和競爭度</li>
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Search className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                    <p>尚未設置關鍵詞</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 優化建議標籤頁 */}
          <TabsContent value="tips" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>SEO 優化建議</CardTitle>
                <CardDescription>
                  提升網站搜索引擎排名的最佳實踐和建議
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <div className="space-y-6">
                    {/* Title 建議 */}
                    <div className="border-l-4 border-blue-500 pl-4">
                      <h3 className="font-semibold mb-2 flex items-center gap-2">
                        <Target className="h-4 w-4 text-blue-600" />
                        Title 優化建議
                      </h3>
                      <ul className="text-sm space-y-2 text-gray-700">
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>保持在 30-60 字符之間</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>將最重要的關鍵詞放在前面</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>包含品牌名稱（通常在末尾）</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>使用分隔符如 | 或 - 提高可讀性</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>確保每個頁面的 Title 都是唯一的</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>避免關鍵詞堆砌</span>
                        </li>
                      </ul>
                      {data?.suggestions?.title && (
                        <div className="mt-3 p-3 bg-blue-50 rounded text-sm">
                          <div className="font-medium mb-1">AI 生成建議：</div>
                          <div className="text-gray-700">{data.suggestions.title}</div>
                        </div>
                      )}
                    </div>

                    {/* Description 建議 */}
                    <div className="border-l-4 border-green-500 pl-4">
                      <h3 className="font-semibold mb-2 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-green-600" />
                        Description 優化建議
                      </h3>
                      <ul className="text-sm space-y-2 text-gray-700">
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>保持在 120-160 字符之間</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>包含 1-2 個主要關鍵詞</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>清晰描述頁面內容的價值</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>使用行動號召（CTA）吸引點擊</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>避免重複 Title 的內容</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>保持語句通順，易於理解</span>
                        </li>
                      </ul>
                    </div>

                    {/* Keywords 建議 */}
                    <div className="border-l-4 border-purple-500 pl-4">
                      <h3 className="font-semibold mb-2 flex items-center gap-2">
                        <Search className="h-4 w-4 text-purple-600" />
                        Keywords 選擇建議
                      </h3>
                      <ul className="text-sm space-y-2 text-gray-700">
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>選擇 4-12 個相關關鍵詞</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>包含長尾關鍵詞（3-5 個詞的短語）</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>混合使用通用詞和專業詞</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>考慮用戶的搜索意圖</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>研究競爭對手使用的關鍵詞</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>定期更新關鍵詞策略</span>
                        </li>
                      </ul>
                    </div>

                    {/* 技術 SEO */}
                    <div className="border-l-4 border-orange-500 pl-4">
                      <h3 className="font-semibold mb-2 flex items-center gap-2">
                        <Zap className="h-4 w-4 text-orange-600" />
                        技術 SEO 檢查清單
                      </h3>
                      <ul className="text-sm space-y-2 text-gray-700">
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>設置 HTTPS（已完成 ✅）</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                          <span>創建並提交 XML Sitemap</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                          <span>優化網站加載速度（目標 &lt; 3 秒）</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>確保移動端友好（響應式設計 ✅）</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                          <span>使用結構化數據（Schema.org）</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                          <span>修復 404 錯誤頁面</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                          <span>設置正確的 301 重定向</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                          <span>優化圖片 alt 屬性</span>
                        </li>
                      </ul>
                    </div>

                    {/* 內容 SEO */}
                    <div className="border-l-4 border-pink-500 pl-4">
                      <h3 className="font-semibold mb-2 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-pink-600" />
                        內容優化建議
                      </h3>
                      <ul className="text-sm space-y-2 text-gray-700">
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>使用 H1, H2, H3 標題層級</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>在標題中包含關鍵詞</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>保持內容原創性和價值</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>內容長度建議 &gt; 300 詞</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>使用內部鏈接建立網站結構</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>定期更新內容保持新鮮度</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>優化圖片文件大小和格式</span>
                        </li>
                      </ul>
                    </div>

                    {/* 工具推薦 */}
                    <div className="border-l-4 border-cyan-500 pl-4">
                      <h3 className="font-semibold mb-3 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-cyan-600" />
                        推薦的 SEO 工具
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded hover:bg-gray-100 transition">
                          <div>
                            <div className="font-medium">Google Search Console</div>
                            <div className="text-xs text-gray-500">監控網站在 Google 的表現</div>
                          </div>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => window.open('https://search.google.com/search-console', '_blank')}
                          >
                            訪問 →
                          </Button>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded hover:bg-gray-100 transition">
                          <div>
                            <div className="font-medium">Google PageSpeed Insights</div>
                            <div className="text-xs text-gray-500">分析網站性能和優化建議</div>
                          </div>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => window.open('https://pagespeed.web.dev/', '_blank')}
                          >
                            訪問 →
                          </Button>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded hover:bg-gray-100 transition">
                          <div>
                            <div className="font-medium">Google Analytics</div>
                            <div className="text-xs text-gray-500">追蹤網站流量和用戶行為</div>
                          </div>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => window.open('https://analytics.google.com/', '_blank')}
                          >
                            訪問 →
                          </Button>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded hover:bg-gray-100 transition">
                          <div>
                            <div className="font-medium">Ahrefs</div>
                            <div className="text-xs text-gray-500">關鍵詞研究和競爭分析</div>
                          </div>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => window.open('https://ahrefs.com/', '_blank')}
                          >
                            訪問 →
                          </Button>
              </div>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded hover:bg-gray-100 transition">
              <div>
                            <div className="font-medium">SEMrush</div>
                            <div className="text-xs text-gray-500">綜合 SEO 分析工具</div>
                          </div>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => window.open('https://www.semrush.com/', '_blank')}
                          >
                            訪問 →
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* 快速提示 */}
                    <div className="border-l-4 border-indigo-500 pl-4">
                      <h3 className="font-semibold mb-3 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-indigo-600" />
                        快速優化提示
                      </h3>
                      <div className="grid md:grid-cols-2 gap-3">
                        <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-3 rounded-lg">
                          <div className="font-medium text-sm mb-1">📈 提升排名</div>
                          <div className="text-xs text-gray-700">定期發佈高質量原創內容</div>
                        </div>
                        <div className="bg-gradient-to-br from-green-50 to-green-100 p-3 rounded-lg">
                          <div className="font-medium text-sm mb-1">⚡ 提升速度</div>
                          <div className="text-xs text-gray-700">壓縮圖片，使用 CDN</div>
                        </div>
                        <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-3 rounded-lg">
                          <div className="font-medium text-sm mb-1">🔗 建立鏈接</div>
                          <div className="text-xs text-gray-700">獲取高質量外部鏈接</div>
                        </div>
                        <div className="bg-gradient-to-br from-pink-50 to-pink-100 p-3 rounded-lg">
                          <div className="font-medium text-sm mb-1">📱 移動優化</div>
                          <div className="text-xs text-gray-700">確保移動端體驗良好</div>
                        </div>
                      </div>
                    </div>
              </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* 底部操作按鈕 */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3 justify-between items-center">
              <div className="flex flex-wrap gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => copy(title, 'Title')}
                  disabled={!title}
                >
                  <Clipboard className="h-4 w-4 mr-1" />
                  複製 Title
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => copy(description, 'Description')}
                  disabled={!description}
                >
                  <Clipboard className="h-4 w-4 mr-1" />
                  複製 Description
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => copy(keywords, 'Keywords')}
                  disabled={!keywords}
                >
                  <Clipboard className="h-4 w-4 mr-1" />
                  複製 Keywords
                </Button>
                {data?.suggestions && (
                  <Button 
                    variant="secondary" 
                    size="sm"
                    onClick={applySuggestions}
                  >
                    <Sparkles className="h-4 w-4 mr-1" />
                    一鍵填充建議
                  </Button>
                )}
              </div>
              
              <Button 
                onClick={saveToSettings} 
                disabled={saving}
                size="lg"
                className="w-full sm:w-auto"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    保存 SEO 設置
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* SEO 提示卡片 */}
        {isLoading && (
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                <div className="text-sm text-blue-900">
                  正在分析您的網站 SEO 狀態...
                </div>
              </div>
        </CardContent>
      </Card>
        )}
      </div>
    </>
  );
};

export default AdminSEO; 

