import React from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Pin } from 'lucide-react';
import StatusBadge from './StatusBadge';
import PostActions from './PostActions';

const PostAuthor = ({ author }) => {
  const authorUsername = author?.username || '已注销用户';
  const authorAvatarUrl = author?.avatar_url || author?.avatarUrl || null;
  const authorProfileId = author?.id;

  const AuthorAvatar = () => (
    <Avatar className="w-10 h-10 border-2 border-transparent hover:border-blue-500 transition-all cursor-pointer">
      <AvatarImage src={authorAvatarUrl} alt={authorUsername} />
      <AvatarFallback>{authorUsername?.[0]?.toUpperCase()}</AvatarFallback>
    </Avatar>
  );

  return authorProfileId ? (
    <Link to={`/profile/${authorProfileId}`}>
      <AuthorAvatar />
    </Link>
  ) : (
    <AuthorAvatar />
  );
};

function parseDateSafe(input) {
  if (!input) return null;
  try {
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}

const PostHeader = ({ post, isAuthor, isAdmin, onEdit, onTogglePin, onDelete }) => {
  const authorUsername = post.author?.username || '已注销用户';
  const authorProfileId = post.author?.id;

  const createdRaw = post.created_at || post.createdAt;
  const updatedRaw = post.updated_at || post.updatedAt;
  const createdDate = parseDateSafe(createdRaw);
  const updatedDate = parseDateSafe(updatedRaw);
  const isPinned = !!(post.is_pinned || post.isPinned);

  return (
    <div className="flex items-start space-x-3 mb-4">
      <PostAuthor author={post.author} />
      <div className="flex-1">
        <div className="flex items-center space-x-2">
          {authorProfileId ? (
            <Link to={`/profile/${authorProfileId}`} className="font-semibold text-gray-800 hover:text-blue-600 transition-colors cursor-pointer">
              {authorUsername}
            </Link>
          ) : (
            <span className="font-semibold text-gray-800">{authorUsername}</span>
          )}
          {isPinned && (
            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200">
              <Pin className="w-3 h-3 mr-1"/>置顶
            </Badge>
          )}
          {post.status && isAuthor && <StatusBadge status={post.status} rejectionReason={post.rejection_reason || post.rejectionReason} />}
        </div>
        <p className="text-xs text-gray-500">
          {createdDate ? format(createdDate, 'yyyy年MM月dd日 HH:mm', { locale: zhCN }) : '时间未知'}
          {createdDate && updatedDate && updatedDate > createdDate && <span className="text-gray-400"> (已编辑)</span>}
        </p>
      </div>
      {(isAuthor || isAdmin) && (
        <PostActions isAuthor={isAuthor} isAdmin={isAdmin} isPinned={isPinned} onEdit={onEdit} onTogglePin={onTogglePin} onDelete={onDelete} />
      )}
    </div>
  );
};

export default PostHeader;