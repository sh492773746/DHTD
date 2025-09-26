import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
// Use BFF instead of direct Supabase queries
import { useToast } from '@/components/ui/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Trash2, Check, X, Loader2, AlertTriangle, MessageSquare, FileText } from 'lucide-react';
import { format } from 'date-fns';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTenant } from '@/contexts/TenantContext';

const statusConfig = {
    pending: { label: '未审核', color: 'bg-yellow-400' },
    approved: { label: '已通过', color: 'bg-green-500' },
    rejected: { label: '未通过', color: 'bg-red-500' },
};

const UserContent = ({ posts, comments, onUpdateStatus, onDelete, toast }) => {
    const { adPosts, socialPosts } = useMemo(() => {
        const adPosts = posts.filter(p => p.is_ad);
        const socialPosts = posts.filter(p => !p.is_ad);
        return { adPosts, socialPosts };
    }, [posts]);

    return (
        <div className="px-6 py-4 bg-gray-50/50 overflow-x-auto">
            <Tabs defaultValue="social" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="social">朋友圈 ({socialPosts.length})</TabsTrigger>
                    <TabsTrigger value="ads">广告区 ({adPosts.length})</TabsTrigger>
                    <TabsTrigger value="comments">评论 ({comments.length})</TabsTrigger>
                </TabsList>
                <TabsContent value="social" className="mt-4">
                    {socialPosts.length > 0 ? (
                        <ContentTable type="post" data={socialPosts} onUpdateStatus={onUpdateStatus} onDelete={onDelete} toast={toast} />
                    ) : (
                        <p className="text-sm text-gray-500 py-4 text-center">该用户没有朋友圈帖子。</p>
                    )}
                </TabsContent>
                <TabsContent value="ads" className="mt-4">
                    {adPosts.length > 0 ? (
                        <ContentTable type="post" data={adPosts} onUpdateStatus={onUpdateStatus} onDelete={onDelete} toast={toast} />
                    ) : (
                        <p className="text-sm text-gray-500 py-4 text-center">该用户没有广告区帖子。</p>
                    )}
                </TabsContent>
                <TabsContent value="comments" className="mt-4">
                    {comments.length > 0 ? (
                        <ContentTable type="comment" data={comments} onUpdateStatus={onUpdateStatus} onDelete={onDelete} toast={toast} />
                    ) : (
                        <p className="text-sm text-gray-500 py-4 text-center">该用户没有评论。</p>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
};


const ContentModeration = () => {
    const [contentByUser, setContentByUser] = useState({});
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
    const { isInitialized, isSuperAdmin, session } = useAuth();
    const { activeTenantId } = useTenant();

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const headers = { Authorization: `Bearer ${session?.access_token || ''}` };
            const [postsRes, commentsRes] = await Promise.all([
                fetch('/api/admin/posts', { headers }),
                fetch('/api/admin/comments', { headers }),
            ]);
            if (!postsRes.ok) throw new Error(`帖子获取失败(${postsRes.status})`);
            if (!commentsRes.ok) throw new Error(`评论获取失败(${commentsRes.status})`);
            const postsData = await postsRes.json();
            const commentsData = await commentsRes.json();

            // Normalize fields to created_at etc.
            const posts = (postsData || []).map(p => ({
                ...p,
                created_at: p.created_at || p.createdAt,
                is_ad: p.is_ad ?? p.isAd ?? 0,
                author: p.author || null,
            }));
            const comments = (commentsData || []).map(c => ({
                ...c,
                created_at: c.created_at || c.createdAt,
                author: c.author || null,
                post: c.post || null,
            }));

        const groupedContent = {};
            for (const post of posts) {
                const uid = post.author?.id;
                if (!uid) continue;
                if (!groupedContent[uid]) groupedContent[uid] = { profile: post.author, posts: [], comments: [] };
                groupedContent[uid].posts.push(post);
            }
            for (const c of comments) {
                const uid = c.author?.id;
                if (!uid) continue;
                if (!groupedContent[uid]) groupedContent[uid] = { profile: c.author, posts: [], comments: [] };
                groupedContent[uid].comments.push(c);
            }
        setContentByUser(groupedContent);
        } catch (err) {
            toast({ title: '加载失败', description: err.message || '网络错误', variant: 'destructive' });
            setContentByUser({});
        } finally {
        setLoading(false);
        }
    }, [toast, session?.access_token]);

    useEffect(() => {
        if (isInitialized) {
            fetchData();
        }
    }, [fetchData, isInitialized, activeTenantId]);

    const handleUpdateStatus = async (type, id, status, reason = null) => {
        try {
            if (type !== 'post') {
                toast({ title: '提示', description: '评论暂不支持状态更新，请使用删除。' });
                return;
        }
            const res = await fetch(`/api/admin/posts/${id}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
                body: JSON.stringify({ status, reason })
            });
            if (!res.ok) throw new Error(`更新失败(${res.status})`);
            toast({ title: '状态更新成功' });
            fetchData();
        } catch (e) {
            toast({ title: '更新状态失败', description: e.message, variant: 'destructive' });
        }
    };
    
    const handleDelete = async (type, id) => {
        try {
            let url = type === 'post' ? `/api/posts/${id}` : `/api/comments/${id}`;
            const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${session?.access_token || ''}` } });
            if (!res.ok) throw new Error(`删除失败(${res.status})`);
            toast({ title: '删除成功' });
            fetchData();
        } catch (error) {
            toast({ title: '删除失败', description: error.message, variant: 'destructive' });
        }
    };

    const sortedUsers = useMemo(() => {
        return Object.values(contentByUser).sort((a, b) => {
            const aContent = [...a.posts, ...a.comments].sort((c, d) => new Date(d.created_at) - new Date(c.created_at));
            const bContent = [...b.posts, ...b.comments].sort((c, d) => new Date(d.created_at) - new Date(c.created_at));
            const aDate = aContent[0]?.created_at;
            const bDate = bContent[0] && bContent[0].created_at;
            if (!aDate) return 1;
            if (!bDate) return -1;
            return new Date(bDate) - new Date(aDate);
        });
    }, [contentByUser]);

    if (loading) {
        return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-gray-400" /></div>;
    }

    return (
        <>
            <Helmet>
                <title>{String('内容审核 - 管理后台')}</title>
                <meta name="description" content="按作者审核用户发布的帖子和评论" />
            </Helmet>
            <div className="overflow-x-auto">
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900">内容审核</h1>
                    <p className="mt-1 text-sm text-gray-500">按作者聚合管理平台上的所有用户生成内容。</p>
                </motion.div>

                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mt-8 bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <Accordion type="single" collapsible className="w-full">
                        {sortedUsers.map(({ profile, posts, comments }) => (
                            <AccordionItem value={profile.id} key={profile.id}>
                                <AccordionTrigger className="px-6 hover:bg-gray-50">
                                    <div className="flex items-center space-x-4">
                                        <Avatar>
                                            <AvatarImage src={profile.avatar_url} />
                                            <AvatarFallback>{profile.username?.[0]}</AvatarFallback>
                                        </Avatar>
                                        <div className="text-left">
                                            <p className="font-semibold">{profile.username}</p>
                                            <div className="flex items-center space-x-4 text-xs text-gray-500">
                                                <span className="flex items-center"><FileText className="w-3 h-3 mr-1" /> {posts.length} 帖子</span>
                                                <span className="flex items-center"><MessageSquare className="w-3 h-3 mr-1" /> {comments.length} 评论</span>
                                            </div>
                                        </div>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent>
                                    <UserContent
                                        posts={posts}
                                        comments={comments}
                                        onUpdateStatus={handleUpdateStatus}
                                        onDelete={handleDelete}
                                        toast={toast}
                                    />
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </motion.div>
            </div>
        </>
    );
};

const ContentTable = ({ type, data, onUpdateStatus, onDelete, toast }) => {
    const [rejectionItem, setRejectionItem] = useState(null);
    const [rejectionReason, setRejectionReason] = useState('');

    const handleRejectConfirm = () => {
        if (!rejectionReason.trim()) {
            toast({ title: '请输入拒绝理由', variant: 'destructive' });
            return;
        }
        onUpdateStatus(rejectionItem.type, rejectionItem.id, 'rejected', rejectionReason);
        setRejectionItem(null);
        setRejectionReason('');
    };
    
    return (
        <div className="bg-white rounded-md border border-gray-200 overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>内容</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>发布时间</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map(item => (
                        <TableRow key={item.id}>
                            <TableCell className="max-w-xs">
                                <p className="truncate font-medium">{item.content}</p>
                                {type === 'comment' && item.post && (
                                    <p className="text-xs text-gray-500 truncate mt-1">回复帖子: "{item.post.content}"</p>
                                )}
                            </TableCell>
                            <TableCell>
                                <Badge variant="secondary" className="capitalize">
                                     <div className={`w-2 h-2 rounded-full mr-2 ${statusConfig[item.status]?.color || 'bg-gray-400'}`}></div>
                                     {statusConfig[item.status]?.label || item.status}
                                </Badge>
                            </TableCell>
                            <TableCell>{format(new Date(item.created_at), 'yyyy-MM-dd HH:mm')}</TableCell>
                            <TableCell className="text-right">
                               <ActionMenu 
                                    item={item} 
                                    type={type} 
                                    onUpdateStatus={onUpdateStatus} 
                                    onDelete={onDelete}
                                    onReject={() => setRejectionItem({type, id: item.id})} 
                                />
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            <Dialog open={!!rejectionItem} onOpenChange={() => setRejectionItem(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>拒绝内容</DialogTitle>
                        <DialogDescription>
                            请输入拒绝此内容的原因。此原因可能会向用户显示。
                        </DialogDescription>
                    </DialogHeader>
                    <Input 
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="例如：内容包含不当言论。"
                    />
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setRejectionItem(null)}>取消</Button>
                        <Button variant="destructive" onClick={handleRejectConfirm}>确认拒绝</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

const ActionMenu = ({ item, type, onUpdateStatus, onDelete, onReject }) => {
    const [isAlertOpen, setIsAlertOpen] = useState(false);
    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onUpdateStatus(type, item.id, 'approved')}>
                        <Check className="mr-2 h-4 w-4 text-green-500" />
                        <span>通过</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onReject}>
                        <X className="mr-2 h-4 w-4 text-red-500" />
                        <span>拒绝</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onUpdateStatus(type, item.id, 'pending')}>
                        <AlertTriangle className="mr-2 h-4 w-4 text-yellow-500" />
                        <span>设为未审核</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setIsAlertOpen(true)} className="text-red-600">
                        <Trash2 className="mr-2 h-4 w-4" />
                        <span>删除</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>确定要删除吗？</AlertDialogTitle>
                        <AlertDialogDescription>
                            此操作无法撤销。这将永久删除该内容。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onDelete(type, item.id)} className="bg-red-600 hover:bg-red-700">删除</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};

export default ContentModeration;