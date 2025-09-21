import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Image, XCircle, Loader2, Sparkles } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Progress } from '@/components/ui/progress';

const POST_MAX_LENGTH = 300;
const MAX_IMAGE_SIZE_MB = 5;
const MAX_IMAGE_COUNT = 9;

const CreatePost = ({ isOpen, setIsOpen, onPostCreated, tenantId }) => {
    const { user, profile, siteSettings, refreshProfile, session } = useAuth();
    const { toast } = useToast();
    const [content, setContent] = useState('');
    const [isAd, setIsAd] = useState(false);
    const [useFreePost, setUseFreePost] = useState(true);
    const [isPosting, setIsPosting] = useState(false);
    const [imageFiles, setImageFiles] = useState([]);
    const [imagePreviews, setImagePreviews] = useState([]);
    const [uploadProgress, setUploadProgress] = useState({});

    const costs = {
      social: parseInt(siteSettings?.social_post_cost || '100', 10),
      ad: parseInt(siteSettings?.ad_post_cost || '200', 10),
    };
    
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (!isOpen) {
            resetForm();
        }
    }, [isOpen]);

    const handleFileSelect = (e) => {
        const files = Array.from(e.target.files);
        const currentTotal = imageFiles.length + files.length;
        
        if (currentTotal > MAX_IMAGE_COUNT) {
            toast({
                variant: 'destructive',
                title: '图片数量超出限制',
                description: `最多只能上传 ${MAX_IMAGE_COUNT} 张图片。`
            });
            return;
        }

        const validFiles = files.filter(file => {
            if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
                toast({ variant: 'destructive', title: `图片太大: ${file.name}`, description: `单张图片不能超过 ${MAX_IMAGE_SIZE_MB}MB。` });
                return false;
            }
            return true;
        });

        setImageFiles(prev => [...prev, ...validFiles]);
        const newPreviews = validFiles.map(file => URL.createObjectURL(file));
        setImagePreviews(prev => [...prev, ...newPreviews]);
    };

    const removeImage = (index) => {
        const newImageFiles = [...imageFiles];
        const newImagePreviews = [...imagePreviews];
        newImageFiles.splice(index, 1);
        newImagePreviews.splice(index, 1);
        setImageFiles(newImageFiles);
        setImagePreviews(newImagePreviews);
    };

    const resetForm = () => {
        setContent('');
        setIsAd(false);
        setUseFreePost(true);
        setIsPosting(false);
        setImageFiles([]);
        setImagePreviews([]);
        setUploadProgress({});
    };

    // Resumable upload helpers
    const CHUNK_SIZE = 1024 * 1024; // 1MB
    const initResumable = async (filename) => {
        const res = await fetch('/api/uploads/resumable/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
            body: JSON.stringify({ filename })
        });
        if (!res.ok) throw new Error('初始化上传会话失败');
        const j = await res.json();
        return j.uploadId;
    };
    const uploadChunk = async (uploadId, index, total, blob) => {
        const fd = new FormData();
        fd.append('uploadId', uploadId);
        fd.append('index', String(index));
        fd.append('total', String(total));
        fd.append('chunk', new File([blob], `chunk_${index}`));
        const res = await fetch('/api/uploads/resumable/chunk', {
            method: 'POST',
            headers: { Authorization: `Bearer ${session?.access_token || ''}` },
            body: fd
        });
        if (!res.ok) throw new Error('分片上传失败');
        return res.json();
    };
    const uploadChunkWithRetry = async (uploadId, index, total, blob, attempt = 0) => {
        try {
            return await uploadChunk(uploadId, index, total, blob);
        } catch (e) {
            if (attempt < 3) {
                const backoff = 500 * Math.pow(2, attempt);
                await new Promise(r => setTimeout(r, backoff));
                return uploadChunkWithRetry(uploadId, index, total, blob, attempt + 1);
            }
            throw e;
        }
    };
    const finishResumable = async (uploadId, filename, contentType) => {
        const res = await fetch('/api/uploads/resumable/finish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
            body: JSON.stringify({ uploadId, filename, contentType, bucket: 'post-images' })
        });
        if (!res.ok) throw new Error('合并分片失败');
        const j = await res.json();
        return j.url;
    };

    const uploadSingleFileResumable = async (file, fileIndex) => {
        const uploadId = await initResumable(file.name);
        const total = Math.ceil(file.size / CHUNK_SIZE) || 1;
        for (let i = 0; i < total; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const blob = file.slice(start, end);
            await uploadChunkWithRetry(uploadId, i, total, blob);
            setUploadProgress(prev => ({ ...prev, [fileIndex]: Math.round(((i + 1) / total) * 100) }));
        }
        const url = await finishResumable(uploadId, file.name, file.type);
        return url;
    };

    const uploadImagesViaBff = async () => {
        if (imageFiles.length === 0) return [];
        const urls = [];
        // 顺序上传以简化进度处理（如需并行可做有界并发）
        for (let i = 0; i < imageFiles.length; i++) {
            setUploadProgress(prev => ({ ...prev, [i]: 0 }));
            const url = await uploadSingleFileResumable(imageFiles[i], i);
            urls.push(url);
        }
        return urls;
    };

    const handleSubmit = async () => {
        if (!user) {
            toast({ variant: "destructive", title: "请先登录" });
            return;
        }
        if (!content.trim() && imageFiles.length === 0) {
            toast({ variant: "destructive", title: "内容不能为空", description: "请写点什么或上传图片。" });
            return;
        }
        if (content.length > POST_MAX_LENGTH) {
            toast({ variant: "destructive", title: "内容太长", description: `帖子内容不能超过 ${POST_MAX_LENGTH} 个字符。` });
            return;
        }
        
        setIsPosting(true);

        try {
            // 1) upload images via resumable BFF
            const imageUrls = await uploadImagesViaBff();

            // 2) choose endpoint by forum mode
            const mode = String(siteSettings?.social_forum_mode || '').toLowerCase();
            const isShared = mode === 'shared';
            const endpoint = isShared ? '/api/shared/posts' : '/api/posts';
            const body = isShared
              ? { content: content.trim(), images: imageUrls }
              : { content: content.trim(), images: imageUrls, isAd, useFreePost };

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (data?.error === 'insufficient-points') {
                    toast({ variant: 'destructive', title: '积分不足', description: '积分不足，无法发布。' });
                } else {
                    toast({ variant: 'destructive', title: '发布失败', description: data?.error || `status ${res.status}` });
                }
                setIsPosting(false);
                return;
            }

            toast({ title: "发布成功！", description: "您的帖子已发布。" });
            onPostCreated && onPostCreated(data);
            refreshProfile && refreshProfile();
            setIsOpen(false);
        } catch (error) {
            toast({ variant: "destructive", title: "发布失败", description: error.message || "发生未知错误，请稍后重试。" });
        } finally {
            setIsPosting(false);
        }
    };
    
    const canUseFreePost = () => profile?.free_posts_count > 0;

    const getPostCost = useCallback(() => {
        if (canUseFreePost() && useFreePost) {
            return { amount: 0, text: "使用 1 次免费额度", isFree: true };
        }
        const amount = isAd ? costs.ad : costs.social;
        return { amount, text: `消耗 ${amount} 积分`, isFree: false };
    }, [isAd, useFreePost, profile?.free_posts_count, costs]);

    const finalCost = getPostCost();
    
    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>创建新帖子</DialogTitle>
                    <DialogDescription>
                        分享你的想法，图片，或发布一条广告。
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <Textarea
                        placeholder="有什么新鲜事想分享吗？"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        maxLength={POST_MAX_LENGTH}
                        className="min-h-[100px] bg-background text-foreground placeholder:text-muted-foreground resize-none"
                        disabled={isPosting}
                    />
                    <div className="text-right text-xs text-muted-foreground mt-1">
                        {content.length} / {POST_MAX_LENGTH}
                    </div>

                    {imagePreviews.length > 0 && (
                        <div className="grid grid-cols-3 gap-2">
                            {imagePreviews.map((src, index) => (
                                <div key={index} className="relative aspect-square">
                                    <img src={src} alt={`Preview ${index + 1}`} className="rounded-lg object-cover w-full h-full" />
                                    {isPosting && uploadProgress[index] !== undefined && (
                                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                            <Progress value={uploadProgress[index]} className="w-10/12 h-2" />
                                        </div>
                                    )}
                                    {!isPosting && <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 bg-black/50 text-white hover:bg-black/70 hover:text-white h-6 w-6 rounded-full" onClick={() => removeImage(index)}>
                                        <XCircle className="h-4 w-4" />
                                    </Button>}
                                </div>
                            ))}
                        </div>
                    )}
                     <div className="flex items-center justify-between">
                        <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/png, image/jpeg, image/gif, image/webp" className="hidden" multiple disabled={isPosting} />
                        <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current.click()} disabled={isPosting || imagePreviews.length >= MAX_IMAGE_COUNT}>
                            <Image className="w-4 h-4 mr-2" />
                            添加图片 ({imagePreviews.length}/{MAX_IMAGE_COUNT})
                        </Button>
                        <div className="flex items-center space-x-2">
                          <Label htmlFor="is-ad-switch">{isAd ? "白菜区" : "朋友圈"}</Label>
                          <Switch id="is-ad-switch" checked={isAd} onCheckedChange={setIsAd} disabled={isPosting} />
                        </div>
                    </div>
                     {canUseFreePost() && (
                        <div className="flex items-center space-x-2 bg-primary/10 p-2 rounded-md">
                            <Checkbox id="use-free-post" checked={useFreePost} onCheckedChange={setUseFreePost} disabled={isPosting} />
                            <Label htmlFor="use-free-post" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                使用免费发布次数 (剩余 {profile?.free_posts_count || 0} 次)
                            </Label>
                        </div>
                    )}
                    <p className="text-sm text-muted-foreground text-center">本次发布: <span className="font-bold text-primary">{finalCost.text}</span></p>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setIsOpen(false)} disabled={isPosting}>取消</Button>
                    <Button onClick={handleSubmit} disabled={isPosting || (!content.trim() && imageFiles.length === 0)} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                        {isPosting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 发布中...</>) : (<><Sparkles className="mr-2 h-4 w-4" /> 发布</>)}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default CreatePost;