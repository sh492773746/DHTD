import React from 'react';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Clock } from 'lucide-react';

const StatusBadge = ({ status }) => {
  const s = String(status || 'pending').toLowerCase();
  switch (s) {
    case 'active':
    case 'approved':
      return <Badge className="text-xs bg-green-100 text-green-800 border-green-200"><CheckCircle className="mr-1 h-3 w-3" />已激活</Badge>;
    case 'rejected':
      return <Badge variant="destructive" className="text-xs"><XCircle className="mr-1 h-3 w-3" />已驳回</Badge>;
    case 'deleted':
      return <Badge variant="secondary" className="text-xs"><XCircle className="mr-1 h-3 w-3" />已删除</Badge>;
    case 'pending':
    default:
      return <Badge variant="secondary" className="text-xs"><Clock className="mr-1 h-3 w-3" />待审核</Badge>;
  }
};

export default StatusBadge;