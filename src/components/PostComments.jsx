import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';

const COMMENT_MAX_LENGTH = 200;
const INITIAL_VISIBLE_COMMENTS = 2;

const CommentItem = ({ comment, user, onDelete }) => {
    const authorUsername = comment.author?.username || '已注销用户';

    return (
        <motion.div
            key={comment.id}
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -10 }}
            layout
            className="flex items-start space-x-1.5 text-sm group"
        >
            <p className="flex-shrink-0 font-semibold text-blue-600">{authorUsername}:</p>
            <p className="flex-1 text-gray-800 break-all">{comment.content}</p>
            {user?.id === comment.user_id && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => onDelete(comment.id)}
                >
                    <Trash2 className="h-3 w-3 text-red-500" />
                </Button>
            )}
        </motion.div>
    );
}

const StandardCommentItem = ({ comment, user, onDelete }) => {
    const authorUsername = comment.author?.username || '已注销用户';
    const authorAvatarUrl = comment.author?.avatar_url;

    return (
        <motion.div
            key={comment.id}
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -10 }}
            layout
            className="flex items-start space-x-2 group"
        >
            <Avatar className="w-7 h-7">
                <AvatarImage src={authorAvatarUrl} alt={authorUsername} onError={(e) => { e.currentTarget.src = '/avatar-fallback.png'; }} />
                <AvatarFallback>{authorUsername?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
                <div className="bg-gray-100 rounded-md px-2 py-1">
                    <p className="font-semibold text-xs text-gray-800">{authorUsername}</p>
                    <p className="text-xs text-gray-700">{comment.content}</p>
                </div>
                <div className="flex items-center">
                    <p className="text-[10px] text-gray-500 mt-0.5">{formatDistanceToNow(new Date(comment.created_at), { locale: zhCN })}前</p>
                    {user?.id === comment.user_id && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                            onClick={() => onDelete(comment.id)}
                        >
                            <Trash2 className="h-3 w-3 text-red-500" />
                        </Button>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

const PostComments = ({ postId, initialComments = [], onCommentCreated, isWeChatStyle = false, onCommentDeleted }) => {
    const { user, profile, siteSettings, tenantId } = useAuth();
    const queryClient = useQueryClient();
    const [newComment, setNewComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    
    const commentCost = parseInt(siteSettings?.comment_cost || '1', 10);
    const [comments, setComments] = useState(initialComments);
    const sharedMode = true;

    useEffect(() => {
        setComments(initialComments);
    }, [initialComments]);

    const handleSubmitComment = async (e) => {
        e.preventDefault();
        if (!user || !newComment.trim()) return;

        setIsSubmitting(true);
        try {
            const commentEndpoint = '/api/shared/comments';
            const res = await fetch(commentEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('sb-access-token') || ''}` },
                body: JSON.stringify({ postId, content: newComment.trim() })
            });
            if (!res.ok) throw new Error('failed');
            const data = await res.json();
            const newCommentWithAuthor = data;
            onCommentCreated(newCommentWithAuthor);
            setComments(prev => [newCommentWithAuthor, ...prev]);
            setNewComment('');
            toast({ title: '评论成功' });
            queryClient.invalidateQueries({ queryKey: ['socialFeed', tenantId, user?.id] });
            queryClient.invalidateQueries({ queryKey: ['userPosts', user.id] });
        } catch (error) {
            toast({ variant: 'destructive', title: '评论失败', description: error.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteComment = async (commentId) => {
        try {
            const deleteEndpoint = `/api/shared/comments/${commentId}`;
            const res = await fetch(deleteEndpoint, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('sb-access-token') || ''}` } });
            if (!res.ok) throw new Error('failed');
            onCommentDeleted(commentId);
            setComments(prev => prev.filter(c => c.id !== commentId));
            toast({ title: '评论已删除' });
            queryClient.invalidateQueries({ queryKey: ['socialFeed', tenantId, user?.id] });
            queryClient.invalidateQueries({ queryKey: ['userPosts', user.id] });
        } catch (error) {
            toast({ variant: 'destructive', title: '删除失败', description: error.message });
        }
    };

    const visibleComments = useMemo(() => {
        return isExpanded ? comments : comments.slice(0, INITIAL_VISIBLE_COMMENTS);
    }, [comments, isExpanded]);

    const shouldVirtualize = isExpanded && visibleComments.length > 50;
    const containerRef = React.useRef(null);
    const rowVirtualizer = useVirtualizer({
        count: shouldVirtualize ? visibleComments.length : 0,
        getScrollElement: () => containerRef.current,
        estimateSize: () => 44,
        overscan: 8,
    });

    const handleToggleExpand = () => {
        setIsExpanded(prev => !prev);
    };

    if (isWeChatStyle) {
        return (
             <div className="pt-2">
                <AnimatePresence>
                    {!shouldVirtualize && visibleComments.map((comment) => (
                         <CommentItem key={comment.id} comment={comment} user={user} onDelete={handleDeleteComment} />
                    ))}
                </AnimatePresence>
                {shouldVirtualize && (
                    <div ref={containerRef} className="max-h-96 overflow-auto">
                        <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
                            {rowVirtualizer.getVirtualItems().map((v) => {
                                const comment = visibleComments[v.index];
                                if (!comment) return null;
                                return (
                                    <div
                                        key={comment.id ?? v.key}
                                        ref={rowVirtualizer.measureElement}
                                        data-index={v.index}
                                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${v.start}px)` }}
                                    >
                                        <CommentItem comment={comment} user={user} onDelete={handleDeleteComment} />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                {comments.length > INITIAL_VISIBLE_COMMENTS && (
                    <Button
                        variant="link"
                        size="sm"
                        className="text-xs text-blue-600 p-0 h-auto mt-1"
                        onClick={handleToggleExpand}
                    >
                        {isExpanded ? '收起评论' : `展开剩余 ${comments.length - INITIAL_VISIBLE_COMMENTS} 条评论`}
                        {isExpanded ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
                    </Button>
                )}
                {user && (
                    <form onSubmit={handleSubmitComment} className="flex items-center space-x-2 mt-2">
                        <Input
                            id={`comment-input-${postId}`}
                            type="text"
                            placeholder={`评论 (消耗${commentCost}积分)`}
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            maxLength={COMMENT_MAX_LENGTH}
                            className="flex-grow bg-gray-100 border-none rounded-md h-8 text-sm focus:bg-white"
                        />
                         <Button type="submit" size="sm" variant="ghost" disabled={isSubmitting || !newComment.trim()} className="h-8">
                            发送
                        </Button>
                    </form>
                )}
            </div>
        )
    }

    return (
        <div className="pt-2 mt-2 border-t border-gray-100">
            {user && (
                <form onSubmit={handleSubmitComment} className="flex items-center space-x-2 mb-2">
                    <Avatar className="w-7 h-7">
                        <AvatarImage src={profile?.avatar_url} alt={profile?.username} onError={(e) => { e.currentTarget.src = '/avatar-fallback.png'; }} />
                        <AvatarFallback>{profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <Input
                        type="text"
                        placeholder={`添加评论 (消耗${commentCost}积分)`}
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        maxLength={COMMENT_MAX_LENGTH}
                        className="flex-grow bg-gray-100 border-none rounded-full h-8 text-sm"
                    />
                    <Button type="submit" size="icon" variant="ghost" disabled={isSubmitting || !newComment.trim()} className="h-8 w-8">
                        <Send className="w-4 h-4" />
                    </Button>
                </form>
            )}
            <div className="space-y-2">
                <AnimatePresence>
                    {!shouldVirtualize && visibleComments.map((comment) => (
                        <StandardCommentItem key={comment.id} comment={comment} user={user} onDelete={handleDeleteComment} />
                    ))}
                </AnimatePresence>
                {shouldVirtualize && (
                    <div ref={containerRef} className="max-h-96 overflow-auto">
                        <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
                            {rowVirtualizer.getVirtualItems().map((v) => {
                                const comment = visibleComments[v.index];
                                if (!comment) return null;
                                return (
                                    <div
                                        key={comment.id ?? v.key}
                                        ref={rowVirtualizer.measureElement}
                                        data-index={v.index}
                                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${v.start}px)` }}
                                    >
                                        <StandardCommentItem comment={comment} user={user} onDelete={handleDeleteComment} />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                 {comments.length > INITIAL_VISIBLE_COMMENTS && (
                    <Button
                        variant="link"
                        size="sm"
                        className="text-xs text-blue-600 p-0 h-auto mt-1 w-full"
                        onClick={handleToggleExpand}
                    >
                        {isExpanded ? '收起' : `展开剩余 ${comments.length - INITIAL_VISIBLE_COMMENTS} 条评论`}
                    </Button>
                )}
            </div>
        </div>
    );
};

export default PostComments;