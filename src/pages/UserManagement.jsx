import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Search, Edit, Trash2, CheckCircle2, AlertCircle, Trash } from 'lucide-react';
import EditUserDialog from '@/components/EditUserDialog';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);
  const [verifyingUser, setVerifyingUser] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const { toast } = useToast();
  const { session } = useAuth();

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users?scope=global', {
        headers: { Authorization: `Bearer ${session?.access_token || ''}` }
      });
      if (!res.ok) throw new Error(`加载失败 (${res.status})`);
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      toast({ variant: 'destructive', title: '获取用户列表失败', description: error.message || '网络错误' });
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [session?.access_token]);

  const filteredUsers = useMemo(() => {
    if (!searchTerm) return users;
    return users.filter(user =>
      String(user.username || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(user.uid || '').includes(searchTerm) ||
      String(user.email || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [users, searchTerm]);

  const handleSave = (updatedUser) => {
    setUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u));
    setEditingUser(null);
  };

  const handleVerifyUser = async (user) => {
    setVerifyingUser(user);
    setVerifyResult(null);
    
    try {
      const res = await fetch(`/api/admin/users/${user.id}/verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
      });
      
      if (!res.ok) {
        throw new Error('核实失败');
      }
      
      const result = await res.json();
      setVerifyResult(result);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '核实用户失败',
        description: error.message,
      });
      setVerifyingUser(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    
    try {
      const res = await fetch(`/api/admin/users/${deletingUser.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
      });
      
      const data = await res.json();
      
      if (data.ok) {
        toast({
          title: "删除成功",
          description: `已删除用户 ${deletingUser.username || deletingUser.email}`,
        });
        
        // 刷新用户列表
        setUsers(users.filter(u => u.id !== deletingUser.id));
        setDeletingUser(null);
      } else {
        toast({
          variant: "destructive",
          title: "删除失败",
          description: data.message || data.error,
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "删除失败",
        description: error.message,
      });
    }
  };

  const handleCleanupOrphaned = async (shouldDelete = false) => {
    setCleanupLoading(true);
    
    try {
      const url = shouldDelete 
        ? '/api/admin/users/cleanup-orphaned?delete=true'
        : '/api/admin/users/cleanup-orphaned';
      
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
      });
      
      if (!res.ok) {
        throw new Error('清理失败');
      }
      
      const data = await res.json();
      
      if (shouldDelete) {
        const deletedCount = data.deleted_count || 0;
        const totalOrphaned = data.orphaned_profiles || 0;
        const errors = data.deletion_errors || [];
        
        if (deletedCount === totalOrphaned) {
          toast({
            title: "清理完成",
            description: `✅ 已成功删除 ${deletedCount} 个孤立 profile`,
            duration: 5000,
          });
        } else if (deletedCount > 0) {
          toast({
            variant: "destructive",
            title: "部分清理成功",
            description: `已删除 ${deletedCount}/${totalOrphaned} 个孤立 profile。${errors.length > 0 ? `失败原因：${errors[0].error}` : ''}`,
            duration: 8000,
          });
        } else {
          toast({
            variant: "destructive",
            title: "清理失败",
            description: errors.length > 0 ? errors[0].error : '未知错误',
            duration: 8000,
          });
        }
        
        // 刷新用户列表
        fetchUsers();
      } else {
        const orphanedCount = data.orphaned_profiles || 0;
        
        if (orphanedCount > 0) {
          const confirmDelete = window.confirm(
            `发现 ${orphanedCount} 个孤立 profile（在 Supabase 中已删除但 Turso 仍有数据）。\n\n` +
            `这些数据可能是在 Supabase 删除用户后残留的。\n\n` +
            `是否删除这些孤立数据？`
          );
          
          if (confirmDelete) {
            handleCleanupOrphaned(true);
            return;
          }
        }
        
        toast({
          title: "检查完成",
          description: orphanedCount > 0 
            ? `发现 ${orphanedCount} 个孤立 profile`
            : '未发现孤立 profile',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '清理失败',
        description: error.message,
      });
    } finally {
      setCleanupLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>{String('用户管理 - 管理后台')}</title>
        <meta name="description" content="管理所有应用用户" />
      </Helmet>
      <div>
        <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col md:flex-row justify-between md:items-center pb-6 border-b border-gray-200 gap-4"
        >
            <div>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900">用户管理</h1>
                <p className="mt-1 text-sm text-gray-500">搜索、查看、编辑和删除用户资料。</p>
            </div>
            <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => handleCleanupOrphaned(false)}
                  disabled={cleanupLoading}
                >
                  {cleanupLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      检查中...
                    </>
                  ) : (
                    <>
                      <Trash className="h-4 w-4 mr-2" />
                      清理孤立数据
                    </>
                  )}
                </Button>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                        type="text"
                        placeholder="按用户名/UID/邮箱搜索..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 w-full md:w-64 bg-white"
                    />
                </div>
            </div>
        </motion.div>

        {loading ? (
          <div className="flex justify-center items-center h-96">
            <Loader2 className="h-12 w-12 animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mt-8 bg-white rounded-lg border border-gray-200 overflow-hidden hidden md:block"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>UID</TableHead>
                    <TableHead>用户名</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead className="text-right">积分</TableHead>
                    <TableHead className="text-right">虚拟币</TableHead>
                    <TableHead>加入时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map(user => (
                    <TableRow key={user.id}>
                      <TableCell className="font-mono text-xs">{user.uid || '-'}</TableCell>
                      <TableCell className="font-medium">{user.username}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full capitalize ${user.role === 'super-admin' ? 'bg-red-100 text-red-800' : user.role === 'tenant-admin' ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-800'}`}>
                          {user.role}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono">{user.points}</TableCell>
                      <TableCell className="text-right font-mono">{user.virtual_currency}</TableCell>
                      <TableCell>{user.created_at ? format(new Date(user.created_at), 'yyyy-MM-dd') : '-'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleVerifyUser(user)}
                            title="核实用户信息"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setEditingUser(user)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => setDeletingUser(user)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </motion.div>

            {/* Mobile Card View */}
            <div className="mt-6 md:hidden space-y-4">
              {filteredUsers.map(user => (
                <Card key={user.id} className="bg-white">
                  <CardHeader>
                    <CardTitle className="flex justify-between items-center">
                      <span>{user.username}</span>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleVerifyUser(user)}>
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setEditingUser(user)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => setDeletingUser(user)}
                          className="text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div className="text-gray-500">UID</div>
                    <div className="font-mono text-xs">{user.uid || '-'}</div>

                    <div className="text-gray-500">角色</div>
                    <div><span className={`px-2 py-1 text-xs font-semibold rounded-full capitalize ${user.role === 'super-admin' ? 'bg-red-100 text-red-800' : user.role === 'tenant-admin' ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-800'}`}>{user.role}</span></div>
                    
                    <div className="text-gray-500">积分</div>
                    <div className="font-mono">{user.points}</div>

                    <div className="text-gray-500">虚拟币</div>
                    <div className="font-mono">{user.virtual_currency}</div>
                    
                    <div className="text-gray-500">加入时间</div>
                    <div>{user.created_at ? format(new Date(user.created_at), 'yyyy-MM-dd') : '-'}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        {filteredUsers.length === 0 && !loading && (
            <div className="text-center py-16 text-gray-500">
                <p>未找到匹配的用户。</p>
            </div>
        )}
      </div>

      {/* Edit User Dialog */}
      {editingUser && (
        <EditUserDialog
          user={editingUser}
          isOpen={!!editingUser}
          onClose={() => setEditingUser(null)}
          onSave={handleSave}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingUser} onOpenChange={(open) => !open && setDeletingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除用户</AlertDialogTitle>
            <AlertDialogDescription>
              您确定要删除用户 <strong>{deletingUser?.username || deletingUser?.email}</strong> 吗？
              <br /><br />
              <strong className="text-red-600">此操作将：</strong>
              <ul className="mt-2 space-y-1 list-disc list-inside text-sm">
                <li>删除 Supabase 认证账号</li>
                <li>删除所有帖子和评论</li>
                <li>删除邀请记录</li>
                <li>删除积分历史</li>
                <li>删除用户资料</li>
              </ul>
              <br />
              <strong className="text-red-600">此操作不可恢复！</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Verify Result Dialog */}
      <Dialog open={!!verifyingUser} onOpenChange={(open) => !open && setVerifyingUser(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>用户信息核实</DialogTitle>
            <DialogDescription>
              用户: {verifyingUser?.username} ({verifyingUser?.id})
            </DialogDescription>
          </DialogHeader>
          
          {!verifyResult ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Status */}
              <div className={`p-4 rounded-lg ${verifyResult.consistent ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
                <div className="flex items-center gap-2">
                  {verifyResult.consistent ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                  )}
                  <span className={`font-semibold ${verifyResult.consistent ? 'text-green-900' : 'text-yellow-900'}`}>
                    {verifyResult.message}
                  </span>
                </div>
                {verifyResult.recommendation && (
                  <p className="mt-2 text-sm text-gray-700">
                    💡 建议: {verifyResult.recommendation}
                  </p>
                )}
              </div>

              {/* Supabase Data */}
              <div>
                <h3 className="font-semibold mb-2">Supabase Authentication</h3>
                {verifyResult.supabase?.exists ? (
                  <div className="bg-gray-50 p-4 rounded-lg space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">邮箱:</span>
                      <span className="font-mono">{verifyResult.supabase.email}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">邮箱已验证:</span>
                      <span>{verifyResult.supabase.email_confirmed_at ? '是' : '否'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">创建时间:</span>
                      <span>{verifyResult.supabase.created_at ? format(new Date(verifyResult.supabase.created_at), 'yyyy-MM-dd HH:mm:ss') : '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">最后登录:</span>
                      <span>{verifyResult.supabase.last_sign_in_at ? format(new Date(verifyResult.supabase.last_sign_in_at), 'yyyy-MM-dd HH:mm:ss') : '-'}</span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-red-50 p-4 rounded-lg text-red-700 text-sm">
                    用户在 Supabase 中不存在
                  </div>
                )}
              </div>

              {/* Turso Data */}
              <div>
                <h3 className="font-semibold mb-2">Turso 业务数据</h3>
                {verifyResult.turso?.exists ? (
                  <div className="bg-gray-50 p-4 rounded-lg space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">用户名:</span>
                      <span className="font-mono">{verifyResult.turso.username}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">积分:</span>
                      <span className="font-mono">{verifyResult.turso.points}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">虚拟货币:</span>
                      <span className="font-mono">{verifyResult.turso.virtual_currency}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">创建时间:</span>
                      <span>{verifyResult.turso.created_at ? format(new Date(verifyResult.turso.created_at), 'yyyy-MM-dd HH:mm:ss') : '-'}</span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-yellow-50 p-4 rounded-lg text-yellow-700 text-sm">
                    用户在 Turso 中不存在（可能尚未登录）
                  </div>
                )}
              </div>

              {/* Issues */}
              {verifyResult.issues && verifyResult.issues.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2 text-red-700">发现的问题</h3>
                  <ul className="space-y-1">
                    {verifyResult.issues.map((issue, index) => (
                      <li key={index} className="text-sm text-red-600 flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>{issue}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex justify-end pt-4">
                <Button onClick={() => setVerifyingUser(null)}>
                  关闭
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default UserManagement;
