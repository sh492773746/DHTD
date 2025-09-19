import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Search, Edit } from 'lucide-react';
import EditUserDialog from '@/components/EditUserDialog';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUser, setEditingUser] = useState(null);
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
      String(user.uid || '').includes(searchTerm)
    );
  }, [users, searchTerm]);

  const handleSave = (updatedUser) => {
    setUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u));
    setEditingUser(null);
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
                <p className="mt-1 text-sm text-gray-500">搜索、查看和编辑用户资料。</p>
            </div>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                    type="text"
                    placeholder="按用户名或UID搜索..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-full md:w-64 bg-white"
                />
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
                      <TableCell className="font-mono">{user.uid}</TableCell>
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
                        <Button variant="ghost" size="sm" onClick={() => setEditingUser(user)}>
                          <Edit className="h-4 w-4 mr-2" />
                          编辑
                        </Button>
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
                      <Button variant="ghost" size="icon" onClick={() => setEditingUser(user)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div className="text-gray-500">UID</div>
                    <div className="font-mono">{user.uid}</div>

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
      {editingUser && (
        <EditUserDialog
          user={editingUser}
          isOpen={!!editingUser}
          onClose={() => setEditingUser(null)}
          onSave={handleSave}
        />
      )}
    </>
  );
};

export default UserManagement;