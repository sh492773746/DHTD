import React, { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { PlusCircle, Edit, Trash2, Loader2, Package, PackageCheck, PackageX, Gem } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import ImageUploader from '@/components/ImageUploader';
import { ScrollArea } from '@/components/ui/scroll-area';

async function bffJson(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${method} ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

const fetchProducts = async (token) => {
  return await bffJson('/api/shop/products', { token });
};

const fetchRedemptions = async (token) => {
  const data = await bffJson('/api/shop/redemptions?scope=all', { token });
  // endpoint returns { data, nextPage, total } or [] depending on branch
  if (Array.isArray(data)) return data;
  return data?.data || [];
};

const ProductDialog = ({ isOpen, setIsOpen, product, tenantId, token }) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [formData, setFormData] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [isInfiniteStock, setIsInfiniteStock] = useState(true);

  React.useEffect(() => {
    if (product) {
      setFormData(product);
      setIsInfiniteStock(product.stock === -1 || product.stock === -1);
    } else {
      setFormData({
        name: '',
        description: '',
        image_url: '',
        price: 0,
        stock: -1,
        is_active: true,
        tenant_id: tenantId,
      });
      setIsInfiniteStock(true);
    }
  }, [product, isOpen, tenantId]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleStockChange = (e) => {
    const value = e.target.value;
    setFormData(prev => ({ ...prev, stock: isInfiniteStock ? -1 : (value === '' ? 0 : parseInt(value, 10)) }));
  };

  const handleInfiniteStockToggle = (checked) => {
    setIsInfiniteStock(checked);
    setFormData(prev => ({ ...prev, stock: checked ? -1 : (prev.stock === -1 ? 100 : prev.stock) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    const upsertData = { ...formData, price: parseInt(formData.price, 10) };
    if (!isInfiniteStock) {
      upsertData.stock = parseInt(formData.stock, 10);
    } else {
      upsertData.stock = -1;
    }

    try {
      await bffJson('/api/shop/products', { token, method: 'POST', body: upsertData });
      toast({ title: '保存成功', description: `商品 "${formData.name}" 已保存。` });
      queryClient.invalidateQueries({ queryKey: ['shop_products'] });
      setIsOpen(false);
    } catch (error) {
      toast({ variant: 'destructive', title: '保存失败', description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{product ? '编辑商品' : '添加新商品'}</DialogTitle>
          <DialogDescription>填写商品信息，点击保存以上架。</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto pr-6 -mr-6">
          <ScrollArea className="h-full">
            <form id="product-form" onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">商品名称</Label>
                <Input id="name" name="name" value={formData.name || ''} onChange={handleChange} required />
              </div>
              <div>
                <Label htmlFor="description">商品描述</Label>
                <Textarea id="description" name="description" value={formData.description || ''} onChange={handleChange} />
              </div>
              <div>
                <Label>商品图片</Label>
                <ImageUploader
                  filePath={`shop-products/${Date.now()}`}
                  onUpload={(url) => setFormData(prev => ({ ...prev, image_url: url }))}
                  currentImage={formData.image_url}
                />
              </div>
              <div>
                <Label htmlFor="price">价格 (积分)</Label>
                <Input id="price" name="price" type="number" value={formData.price || 0} onChange={handleChange} required min="0" />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="stock">库存</Label>
                  <div className="flex items-center space-x-2">
                    <Label htmlFor="infinite-stock">无限库存</Label>
                    <Switch id="infinite-stock" checked={isInfiniteStock} onCheckedChange={handleInfiniteStockToggle} />
                  </div>
                </div>
                <Input id="stock" name="stock" type="number" value={isInfiniteStock ? '' : formData.stock || 0} onChange={handleStockChange} disabled={isInfiniteStock} min="0" />
              </div>
              <div className="flex items-center space-x-2">
                <Label htmlFor="is_active">上架</Label>
                <Switch id="is_active" name="is_active" checked={formData.is_active || false} onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))} />
              </div>
            </form>
          </ScrollArea>
        </div>
        <DialogFooter className="pt-4 flex-shrink-0">
          <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>取消</Button>
          <Button type="submit" form="product-form" disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const RedemptionDialog = ({ isOpen, setIsOpen, redemption, token }) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [status, setStatus] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  React.useEffect(() => {
    if (redemption) {
      setStatus(redemption.status);
      setNotes(redemption.notes || '');
    }
  }, [redemption]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await bffJson(`/api/shop/redemptions/${redemption.id}/status`, { token, method: 'POST', body: { status, notes } });
      toast({ title: '更新成功', description: '兑换记录已更新。' });
      queryClient.invalidateQueries({ queryKey: ['shop_redemptions'] });
      setIsOpen(false);
    } catch (error) {
      toast({ variant: 'destructive', title: '更新失败', description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  if (!redemption) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>处理兑换请求</DialogTitle>
          <DialogDescription>
            用户 {redemption.user?.username} (UID: {redemption.user?.uid}) 兑换了 {redemption.product?.name || redemption.product_name}。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="status">订单状态</Label>
            <select id="status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-full p-2 border rounded-md">
              <option value="pending">待处理</option>
              <option value="completed">已完成</option>
              <option value="rejected">已拒绝</option>
            </select>
          </div>
          <div>
            <Label htmlFor="notes">备注 (发货信息/拒绝原因)</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="例如：卡密已发送至用户私信" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>取消</Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              更新
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const AdminShopManagement = () => {
  const { tenantId, session } = useAuth();
  const token = session?.access_token || null;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [isRedemptionDialogOpen, setIsRedemptionDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedRedemption, setSelectedRedemption] = useState(null);

  const { data: products, isLoading: isLoadingProducts, error: productsError } = useQuery({
    queryKey: ['shop_products'],
    queryFn: () => fetchProducts(token),
    enabled: !!token,
  });

  const { data: redemptions, isLoading: isLoadingRedemptions, error: redemptionsError } = useQuery({
    queryKey: ['shop_redemptions'],
    queryFn: () => fetchRedemptions(token),
    enabled: !!token,
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (productId) => {
      await bffJson(`/api/shop/products/${productId}`, { token, method: 'DELETE' });
    },
    onSuccess: () => {
      toast({ title: '删除成功' });
      queryClient.invalidateQueries({ queryKey: ['shop_products'] });
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: '删除失败', description: error.message });
    },
  });

  const handleAddProduct = () => {
    setSelectedProduct(null);
    setIsProductDialogOpen(true);
  };

  const handleEditProduct = (product) => {
    setSelectedProduct(product);
    setIsProductDialogOpen(true);
  };

  const handleDeleteProduct = async (productId) => {
    if (!window.confirm('确定要删除这个商品吗？此操作不可撤销。')) return;
    deleteProductMutation.mutate(productId);
  };

  const handleProcessRedemption = (redemption) => {
    setSelectedRedemption(redemption);
    setIsRedemptionDialogOpen(true);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800"><Package className="mr-1 h-3 w-3" />待处理</Badge>;
      case 'completed':
        return <Badge variant="secondary" className="bg-green-100 text-green-800"><PackageCheck className="mr-1 h-3 w-3" />已完成</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><PackageX className="mr-1 h-3 w-3" />已拒绝</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">商城管理</h1>
      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">商品管理</TabsTrigger>
          <TabsTrigger value="redemptions">兑换管理</TabsTrigger>
        </TabsList>
        <TabsContent value="products">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>商品列表</CardTitle>
              <Button onClick={handleAddProduct}><PlusCircle className="mr-2 h-4 w-4" />添加商品</Button>
            </CardHeader>
            <CardContent>
              {isLoadingProducts ? <Loader2 className="animate-spin" /> : productsError ? (
                <div className="text-sm text-red-500">加载商品失败：{productsError.message}</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>商品</TableHead>
                      <TableHead>价格 (积分)</TableHead>
                      <TableHead>库存</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products?.map(product => (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell>{product.price}</TableCell>
                        <TableCell>{product.stock === -1 ? '无限' : product.stock}</TableCell>
                        <TableCell>
                          <Badge variant={product.isActive || product.is_active ? 'default' : 'outline'}>
                            {(product.isActive || product.is_active) ? '已上架' : '已下架'}
                          </Badge>
                        </TableCell>
                        <TableCell className="space-x-2">
                          <Button variant="outline" size="sm" onClick={() => handleEditProduct(product)}><Edit className="h-4 w-4" /></Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDeleteProduct(product.id)} disabled={deleteProductMutation.isPending}><Trash2 className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="redemptions">
          <Card>
            <CardHeader>
              <CardTitle>兑换记录</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingRedemptions ? <Loader2 className="animate-spin" /> : redemptionsError ? (
                <div className="text-sm text-red-500">加载兑换记录失败：{redemptionsError.message}</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>用户</TableHead>
                      <TableHead>商品</TableHead>
                      <TableHead>花费积分</TableHead>
                      <TableHead>时间</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {redemptions?.map(redemption => (
                      <TableRow key={redemption.id}>
                        <TableCell>{redemption.user?.username} (UID: {redemption.user?.uid})</TableCell>
                        <TableCell>{redemption.product?.name || redemption.product_name}</TableCell>
                        <TableCell className="flex items-center"><Gem className="h-3 w-3 mr-1 text-primary" />{redemption.points_spent}</TableCell>
                        <TableCell>{format(new Date(redemption.created_at), 'yyyy-MM-dd HH:mm', { locale: zhCN })}</TableCell>
                        <TableCell>{getStatusBadge(redemption.status)}</TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" onClick={() => handleProcessRedemption(redemption)}>处理</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <ProductDialog isOpen={isProductDialogOpen} setIsOpen={setIsProductDialogOpen} product={selectedProduct} tenantId={tenantId} token={token} />
      <RedemptionDialog isOpen={isRedemptionDialogOpen} setIsOpen={setIsRedemptionDialogOpen} redemption={selectedRedemption} token={token} />
    </div>
  );
};

export default AdminShopManagement;