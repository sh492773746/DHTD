import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { UploadCloud, X, Link, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const ImageUploader = ({ initialUrl, onUrlChange, hint, allowUrl = true, uploaderHeight = "h-48", bucketName = 'post-images' }) => {
  const [imageUrl, setImageUrl] = useState(initialUrl || '');
  const [uploading, setUploading] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const { toast } = useToast();
  const { supabase } = useAuth();
  const localUrlRef = useRef(null);

  useEffect(() => {
    setImageUrl(initialUrl || '');
  }, [initialUrl]);

  useEffect(() => {
    return () => {
      if (localUrlRef.current) {
        URL.revokeObjectURL(localUrlRef.current);
      }
    };
  }, []);

  const handleUpload = useCallback(async (file) => {
    if (!supabase) {
      toast({ title: '错误', description: '数据库客户端未初始化。', variant: 'destructive' });
      return;
    }
    
    setUploading(true);
    const localImageUrl = URL.createObjectURL(file);
    localUrlRef.current = localImageUrl;
    setImageUrl(localImageUrl);

    const fileName = `${Date.now()}_${file.name}`;

    try {
      const { data, error } = await supabase
        .storage
        .from(bucketName)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) {
        // Try server-side upload fallback to bypass RLS
        const form = new FormData();
        form.append('file', file);
        let jwt = null;
        try {
          const { data: s } = await supabase.auth.getSession();
          jwt = s?.session?.access_token || null;
        } catch {}
        const res = await fetch(`/api/uploads/avatar?bucket=${encodeURIComponent(bucketName)}`, { method: 'POST', body: form, headers: jwt ? { Authorization: `Bearer ${jwt}` } : {} });
        if (!res.ok) {
          const text = await res.text().catch(()=> '');
          throw new Error(text || error.message || 'upload failed');
        }
        const j = await res.json();
        const publicUrl = j?.url;
        const finalUrl = `${publicUrl}?t=${new Date().getTime()}`;
        setImageUrl(finalUrl);
        onUrlChange(publicUrl);
        toast({ title: '上传成功', description: '已使用服务端上传。' });
        return;
      }
      
      const { data: { publicUrl } } = supabase
        .storage
        .from(bucketName)
        .getPublicUrl(data.path);
      
      const finalUrl = `${publicUrl}?t=${new Date().getTime()}`;
      setImageUrl(finalUrl);
      onUrlChange(publicUrl); // Pass the raw URL without timestamp to be saved
      toast({ title: '上传成功', description: '图片已成功上传并保存。' });
    } catch (error) {
      console.error('Upload error:', error);
      toast({ title: '上传失败', description: error.message, variant: 'destructive' });
      setImageUrl(initialUrl || ''); // Revert to initial URL on failure
    } finally {
      setUploading(false);
      if (localUrlRef.current) {
        URL.revokeObjectURL(localUrlRef.current);
        localUrlRef.current = null;
      }
    }
  }, [supabase, toast, initialUrl, onUrlChange, bucketName]);

  const onDrop = useCallback((acceptedFiles) => {
    const file = acceptedFiles[0];
    if (file) {
      handleUpload(file);
    }
  }, [handleUpload]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: false,
    noClick: true,
    noKeyboard: true,
  });

  const handleRemoveImage = () => {
    setImageUrl('');
    onUrlChange('');
  };

  const handleUrlSubmit = () => {
      if (urlInput && (urlInput.startsWith('http://') || urlInput.startsWith('https://'))) {
          setImageUrl(urlInput);
          onUrlChange(urlInput);
          toast({ title: '图片链接已设置' });
      } else {
          toast({ title: '链接无效', description: '请输入有效的图片URL', variant: 'destructive' });
      }
  };

  const displayUrl = imageUrl.includes('?') ? imageUrl : `${imageUrl}?t=${new Date().getTime()}`;

  return (
    <div className="space-y-2">
      {imageUrl && !uploading ? (
        <div className={`relative group w-full ${uploaderHeight} border rounded-md overflow-hidden`}>
          <img src={displayUrl} alt="Uploaded preview" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Button
              type="button"
              variant="destructive"
              size="icon"
              onClick={handleRemoveImage}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
      ) : (
        <div 
          {...getRootProps()} 
          className={`relative w-full ${uploaderHeight} border-2 border-dashed rounded-md flex flex-col items-center justify-center text-center p-4 transition-colors ${isDragActive ? 'border-primary bg-primary/10' : ''}`}
        >
          <input {...getInputProps()} />
          {uploading ? (
            <>
              {imageUrl.startsWith('blob:') && (
                <img src={imageUrl} alt="Preview" className="absolute inset-0 w-full h-full object-cover rounded-md opacity-50" />
              )}
              <div className="z-10 flex flex-col items-center justify-center bg-background/70 p-4 rounded-lg">
                <Loader2 className="h-10 w-10 text-primary animate-spin mb-2" />
                <p className="text-sm text-muted-foreground">正在处理和上传...</p>
              </div>
            </>
          ) : (
            <>
              <UploadCloud className="h-10 w-10 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground mb-2">{isDragActive ? "松开即可上传" : (allowUrl ? "拖拽文件到此处，或点击按钮" : "拖拽文件到此处，或点击按钮")}</p>
              {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
              <div className="flex items-center space-x-2 mt-2">
                 <Button type="button" variant="outline" size="sm" onClick={open}>
                    选择图片
                  </Button>
                  {allowUrl && (
                    <Popover>
                      <PopoverTrigger asChild>
                         <Button type="button" variant="outline" size="sm" onClick={(e) => e.stopPropagation()}><Link className="mr-1 h-4 w-4" /> 使用链接</Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80" onPointerDownOutside={(e) => e.preventDefault()}>
                          <div className="grid gap-4" onClick={(e) => e.stopPropagation()}>
                              <div className="space-y-2">
                                  <h4 className="font-medium leading-none">图片链接</h4>
                                  <p className="text-sm text-muted-foreground">
                                      在此处粘贴图片的URL。
                                  </p>
                              </div>
                              <div className="grid gap-2">
                                 <div className="grid grid-cols-3 items-center gap-4">
                                      <Label htmlFor="url-input">URL</Label>
                                      <Input id="url-input" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} className="col-span-2 h-8" />
                                 </div>
                                 <Button size="sm" onClick={handleUrlSubmit}>设置</Button>
                              </div>
                          </div>
                      </PopoverContent>
                    </Popover>
                  )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ImageUploader;