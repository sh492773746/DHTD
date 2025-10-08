import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Edit, Trash2, Image as ImageIcon, ArrowUp, ArrowDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import ImageUploader from '@/components/ImageUploader';

const AdminPopupManagement = () => {
  const [popups, setPopups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingPopup, setEditingPopup] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { session } = useAuth();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    backgroundImage: '',
    buttonText: '',
    buttonUrl: '',
    enabled: false,
    order: 0
  });

  useEffect(() => {
    fetchPopups();
  }, []);

  const fetchPopups = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/popups', {
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`
        }
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to fetch');
      }
      
      const data = await res.json();
      setPopups(data);
    } catch (e) {
      toast({
        variant: 'destructive',
        title: '加载失败',
        description: e.message
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      
      const url = editingPopup
        ? `/api/admin/popups/${editingPopup.id}`
        : '/api/admin/popups';
      
      const method = editingPopup ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify(formData)
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save');
      }
      
      toast({
        title: '保存成功',
        description: editingPopup ? '弹窗已更新' : '弹窗已创建'
      });
      
      setIsDialogOpen(false);
      resetForm();
      fetchPopups();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: '保存失败',
        description: e.message
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('确定要删除这个弹窗吗？')) return;
    
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/popups/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`
        }
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete');
      }
      
      toast({
        title: '删除成功',
        description: '弹窗已删除'
      });
      
      fetchPopups();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: '删除失败',
        description: e.message
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (popup) => {
    setEditingPopup(popup);
    setFormData({
      title: popup.title || '',
      content: popup.content || '',
      backgroundImage: popup.backgroundImage || '',
      buttonText: popup.buttonText || '',
      buttonUrl: popup.buttonUrl || '',
      enabled: popup.enabled === 1,
      order: popup.order || 0
    });
    setIsDialogOpen(true);
  };

  const handleCreate = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setEditingPopup(null);
    setFormData({
      title: '',
      content: '',
      backgroundImage: '',
      buttonText: '',
      buttonUrl: '',
      enabled: false,
      order: 0
    });
  };

  const handleMoveOrder = async (popup, direction) => {
    const newOrder = popup.order + (direction === 'up' ? -1 : 1);
    
    try {
      const res = await fetch(`/api/admin/popups/${popup.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({ order: newOrder })
      });
      
      if (!res.ok) throw new Error('Failed to update order');
      
      fetchPopups();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: '排序失败',
        description: e.message
      });
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">应用弹窗管理</h1>
          <p className="text-muted-foreground mt-1">
            管理应用启动时显示的弹窗 · 仅超级管理员可见
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleCreate} size="lg">
              <Plus className="w-4 h-4 mr-2" />
              创建弹窗
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingPopup ? '编辑弹窗' : '创建弹窗'}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">标题</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="弹窗标题"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="content">内容</Label>
                <Textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="弹窗内容（支持换行）"
                  rows={5}
                />
              </div>

              <div className="space-y-2">
                <Label>背景图片</Label>
                <ImageUploader
                  initialUrl={formData.backgroundImage}
                  onUrlChange={(url) => setFormData({ ...formData, backgroundImage: url })}
                  hint="弹窗背景图片（可选）· 将以 100% 透明度完全覆盖背景"
                  bucketName="post-images"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="buttonText">按钮文字</Label>
                <Input
                  id="buttonText"
                  value={formData.buttonText}
                  onChange={(e) => setFormData({ ...formData, buttonText: e.target.value })}
                  placeholder="点击复制的文字（如客服ID、旺旺号等）"
                />
                <p className="text-xs text-muted-foreground">
                  用户点击按钮时会自动复制此文字
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="buttonUrl">跳转链接</Label>
                <Input
                  id="buttonUrl"
                  value={formData.buttonUrl}
                  onChange={(e) => setFormData({ ...formData, buttonUrl: e.target.value })}
                  placeholder="wangwang:// 或 https://"
                />
                <p className="text-xs text-muted-foreground">
                  支持旺旺协议（wangwang://）、网址（https://）等
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="order">显示顺序</Label>
                <Input
                  id="order"
                  type="number"
                  value={formData.order}
                  onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 0 })}
                  placeholder="数字越小越靠前"
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label htmlFor="enabled" className="cursor-pointer">启用弹窗</Label>
                  <p className="text-sm text-muted-foreground">
                    启用后用户打开应用时会看到此弹窗
                  </p>
                </div>
                <Switch
                  id="enabled"
                  checked={formData.enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  取消
                </Button>
                <Button onClick={handleSave} disabled={loading}>
                  {loading ? '保存中...' : '保存'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading && popups.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">加载中...</p>
        </div>
      ) : popups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">暂无弹窗</p>
            <p className="text-sm text-muted-foreground mt-2">
              点击"创建弹窗"按钮开始
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {popups.map((popup, index) => (
            <Card key={popup.id} className={popup.enabled === 1 ? '' : 'opacity-60'}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <CardTitle className="text-xl">
                      {popup.title || '(无标题)'}
                    </CardTitle>
                    {popup.enabled === 1 ? (
                      <Badge variant="default">已启用</Badge>
                    ) : (
                      <Badge variant="secondary">未启用</Badge>
                    )}
                    <Badge variant="outline">#{popup.order}</Badge>
                  </div>
                  {popup.content && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {popup.content}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleMoveOrder(popup, 'up')}
                    disabled={index === 0}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleMoveOrder(popup, 'down')}
                    disabled={index === popups.length - 1}
                  >
                    <ArrowDown className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(popup)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(popup.id)}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {popup.backgroundImage && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ImageIcon className="w-4 h-4" />
                    <span>背景图片已设置</span>
                  </div>
                )}
                {popup.buttonText && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">按钮:</span>
                    <code className="px-2 py-1 bg-secondary rounded text-sm">
                      {popup.buttonText}
                    </code>
                  </div>
                )}
                {popup.buttonUrl && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">链接:</span>
                    <code className="px-2 py-1 bg-secondary rounded text-sm truncate max-w-md">
                      {popup.buttonUrl}
                    </code>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminPopupManagement;

