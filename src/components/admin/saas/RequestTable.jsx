import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from '@/components/ui/button';
import { MoreHorizontal, ExternalLink, Edit, CheckCircle, XCircle, Trash2, Eye } from 'lucide-react';
import StatusBadge from '@/components/admin/saas/StatusBadge';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

const RequestTable = ({ requests, isSubmitting, onApprove, onReject, onDelete, onPreview, onBindDomain, onVerifyDomain, onCheckConnectivity }) => {
  const navigate = useNavigate();

  const handleManageContent = (tenantId) => {
    navigate(`/admin/saas/content/${tenantId}`);
  };

  return (
    <div className="bg-white shadow-lg rounded-lg overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">用户</TableHead>
            <TableHead className="whitespace-nowrap">旺旺联系</TableHead>
            <TableHead className="whitespace-nowrap">自定义域名</TableHead>
            <TableHead className="whitespace-nowrap">Vercel域名</TableHead>
            <TableHead className="whitespace-nowrap">申请时间</TableHead>
            <TableHead className="whitespace-nowrap">状态</TableHead>
            <TableHead className="text-right whitespace-nowrap">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((request) => (
            <TableRow key={request.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Avatar>
                    <AvatarImage src={request.profile?.avatar_url} />
                    <AvatarFallback>{request.profile?.username?.charAt(0) || 'U'}</AvatarFallback>
                  </Avatar>
                  <span className="font-medium">{request.profile?.username}</span>
                </div>
              </TableCell>
              <TableCell>{request.contact_wangwang || request.contactWangWang || request.contactwangwang || '-'}</TableCell>
              <TableCell>
                <a 
                  href={`https://${request.desired_domain}`} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-blue-600 hover:underline flex items-center gap-1"
                >
                  {request.desired_domain} <ExternalLink className="h-4 w-4" />
                </a>
              </TableCell>
              <TableCell>
                {request.vercel_assigned_domain ? (
                  <a 
                    href={`https://${request.vercel_assigned_domain}`} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-gray-500 hover:underline flex items-center gap-1"
                  >
                    {request.vercel_assigned_domain} <ExternalLink className="h-4 w-4" />
                  </a>
                ) : 'N/A'}
              </TableCell>
              <TableCell>{format(new Date(request.created_at), 'yyyy-MM-dd HH:mm')}</TableCell>
              <TableCell>
                <StatusBadge status={request.status} />
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <span className="sr-only">Open menu</span>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {request.status === 'pending' && onApprove && onReject && (
                      <>
                        <DropdownMenuItem
                          onClick={() => onApprove(request)}
                          disabled={isSubmitting === request.id}
                        >
                          <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                          {isSubmitting === request.id ? '处理中...' : '批准'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onReject(request)}>
                          <XCircle className="mr-2 h-4 w-4 text-orange-500" />
                          驳回
                        </DropdownMenuItem>
                      </>
                    )}
                    {request.status === 'active' && (
                      <>
                        <DropdownMenuItem onClick={() => handleManageContent(request.id)}>
                          <Edit className="mr-2 h-4 w-4" />
                          管理内容
                        </DropdownMenuItem>
                        {onBindDomain && (
                          <DropdownMenuItem onClick={() => onBindDomain(request)}>
                            <Edit className="mr-2 h-4 w-4" />
                            绑定自定义域
                          </DropdownMenuItem>
                        )}
                        {onVerifyDomain && (
                          <DropdownMenuItem onClick={() => onVerifyDomain(request)}>
                            <Edit className="mr-2 h-4 w-4" />
                            校验域名
                          </DropdownMenuItem>
                        )}
                        {onCheckConnectivity && (
                          <DropdownMenuItem onClick={() => onCheckConnectivity(request)}>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            连通性自测
                          </DropdownMenuItem>
                        )}
                         {onPreview && request.vercel_assigned_domain && (
                            <DropdownMenuItem onClick={() => onPreview(request)}>
                                <Eye className="mr-2 h-4 w-4" />
                                预览
                            </DropdownMenuItem>
                        )}
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      className="text-red-600 focus:text-red-600 focus:bg-red-50"
                      onClick={() => onDelete(request)}
                      disabled={isSubmitting === request.id}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {isSubmitting === request.id ? '删除中...' : '删除'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default RequestTable;