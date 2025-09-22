import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Image, XCircle, Loader2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const POST_MAX_LENGTH = 300;

const EditPostDialog = ({ isOpen, setIsOpen, post, onPostUpdated }) => {
    const [content, setContent] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [imageFiles, setImageFiles] = useState([]);
    const [imagePreviews, setImagePreviews] = useState([]);
    const [existingImageUrls, setExistingImageUrls] = useState([]);
    const fileInputRef = useRef(null);
    const { session } = useAuth();

    useEffect(() => {
        if (post) {
            setContent(post.content);
            setExistingImageUrls(post.image_urls || []);
            setImageFiles([]);
            setImagePreviews([]);
        }
    }, [post]);

    const handleFileSelect = (e) => {
        toast({ title: "暂不支持图片编辑", description: "当前版本仅允许编辑文字内容。", variant: "destructive" });
    };

    const removeNewImage = (index) => {
        // 图片编辑暂不支持
    };

    const removeExistingImage = (index) => {
        setExistingImageUrls(prev => prev.filter((_, i) => i !== index));
    };

    const handleSave = async () => {
        if (!session?.access_token) {
            toast({ variant: 'destructive', title: '请先登录' });
            return;
        }
        if (!post?.id) return;
        if (!content.trim()) {
            toast({ variant: 'destructive', title: '内容不能为空' });
            return;
        }
        setIsSaving(true);
        try {
            const url = `/api/shared/posts/${post.id}`;
            const res = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({ content }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (data?.error === 'already-edited') {
                    toast({ variant: 'destructive', title: '编辑次数已用完', description: '每个帖子只能编辑一次。' });
                    setIsOpen(false);
                    return;
                }
                throw new Error(data?.error || `status ${res.status}`);
            }
            const updated = {
                ...post,
                content: data.content ?? content,
                updated_at: data.updated_at || data.updatedAt || new Date().toISOString(),
                image_urls: Array.isArray(data.images) ? data.images : (() => { try { return JSON.parse(data.images || '[]'); } catch { return post.image_urls || []; } })(),
            };
            toast({ title: '保存成功' });
            onPostUpdated && onPostUpdated(updated);
            setIsOpen(false);
        } catch (e) {
            toast({ variant: 'destructive', title: '保存失败', description: e.message });
        } finally {
            setIsSaving(false);
        }
    };

    const allImages = [...existingImageUrls, ...imagePreviews];

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>编辑帖子</DialogTitle>
                    <DialogDescription>
                        修改你的帖子内容（每条帖子仅可编辑一次）。
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <Textarea
                        placeholder="修改后的内容"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        maxLength={POST_MAX_LENGTH}
                        className="min-h-[100px] bg-gray-50 border-gray-200 text-gray-800 placeholder:text-gray-400 resize-none"
                    />
                    <div className="text-right text-xs text-gray-400 mt-1">
                        {content.length} / {POST_MAX_LENGTH}
                    </div>

                    {allImages.length > 0 && (
                        <div className="grid grid-cols-3 gap-2">
                            {allImages.map((src, index) => (
                                <div key={index} className="relative aspect-square">
                                    <img src={src} alt={`Preview ${index + 1}`} className="rounded-lg object-cover w-full h-full" />
                                    <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 bg-black/50 text-white hover:bg-black/70 hover:text-white h-6 w-6 rounded-full" onClick={() => removeExistingImage(index)} disabled>
                                        <XCircle className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                     <div className="flex items-center">
                        <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/png, image/jpeg, image/gif" className="hidden" multiple />
                        <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current.click()} disabled>
                            <Image className="w-4 h-4 mr-2" />
                            编辑图片（暂不支持）
                        </Button>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setIsOpen(false)}>取消</Button>
                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 保存中...</>) : '保存更改'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default EditPostDialog;