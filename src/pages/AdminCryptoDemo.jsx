import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Clipboard, Loader2, AlertTriangle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const AdminCryptoDemo = () => {
  const { toast } = useToast();
  const [embedCode, setEmbedCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchEmbedCode = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'iframe_embed_code')
        .single();
      
      if (fetchError || !data || !data.value) {
        throw new Error('未能获取嵌入代码。请前往“系统设置”页面，检查密钥并保存一次设置以生成代码。');
      }
      
      setEmbedCode(data.value);
    } catch (err) {
      setError(err.message);
      toast({
        variant: 'destructive',
        title: '加载失败',
        description: err.message,
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchEmbedCode();
  }, [fetchEmbedCode]);

  const copyToClipboard = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      toast({
        title: '复制成功',
        description: '嵌入代码已复制到剪贴板。',
      });
    }, () => {
      toast({
        variant: 'destructive',
        title: '复制失败',
        description: '无法将代码复制到剪贴板。',
      });
    });
  };

  return (
    <>
      <Helmet>
        <title>iFrame嵌入工具 - 管理后台</title>
        <meta name="description" content="获取用于在其他网站中嵌入当前应用的iFrame代码。" />
      </Helmet>
      <div className="p-0 sm:p-2 lg:p-4">
        <div className="max-w-4xl mx-auto">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <h1 className="text-3xl font-bold text-gray-800">iFrame 嵌入工具</h1>
            <p className="text-lg text-gray-600 mt-2">
              嵌入代码是基于您在 <a href="/admin/site-settings" className="text-blue-600 underline">系统设置</a> 中配置的密钥自动生成的。
            </p>
          </motion.div>
          
          <Alert className="mb-8">
            <Info className="h-4 w-4" />
            <AlertTitle>重要提示</AlertTitle>
            <AlertDescription>
              此页面不再提供实时预览以防止无限刷新问题。如需测试，请将代码嵌入到一个独立的HTML文件中进行。
            </AlertDescription>
          </Alert>
          
          {loading && (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="mr-2 h-8 w-8 animate-spin" />
              <p>正在从数据库中获取嵌入代码...</p>
            </div>
          )}

          {error && (
            <Card className="shadow-lg mb-8 bg-red-50 border-red-200">
              <CardHeader>
                  <CardTitle className="flex items-center text-red-700"><AlertTriangle className="mr-2" /> 加载错误</CardTitle>
              </CardHeader>
              <CardContent>
                  <p className="text-red-600">{error}</p>
                  <Button variant="outline" className="mt-4" onClick={fetchEmbedCode}>重试</Button>
              </CardContent>
            </Card>
          )}

          {!loading && !error && (
            <>
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
                <Card className="shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center"><Clipboard className="mr-2" /> 复制嵌入代码</CardTitle>
                    <CardDescription>
                      将以下代码片段粘贴到您网站的HTML中。当您在“系统设置”中更新密钥后，这里的代码会自动更新。
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="relative">
                      <Textarea value={embedCode} readOnly rows={15} className="font-mono bg-gray-900 text-green-400 text-sm p-4 pr-12" />
                      <Button variant="ghost" size="icon" className="absolute top-2 right-2 text-gray-400 hover:text-white" onClick={() => copyToClipboard(embedCode)}>
                        <Clipboard className="h-5 w-5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default AdminCryptoDemo;