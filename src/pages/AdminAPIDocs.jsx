import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  BookOpen, 
  Search, 
  Copy, 
  CheckCircle,
  Lock,
  Unlock,
  Code,
  FileJson,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const AdminAPIDocs = () => {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // API 端點文檔數據
  const apiEndpoints = [
    // 認證相關
    {
      category: '認證',
      name: '驗證 Token',
      method: 'POST',
      path: '/api/auth/verify',
      requireAuth: true,
      description: '驗證 JWT Token 的有效性',
      requestBody: null,
      response: {
        valid: true,
        userId: 'uuid-string',
        email: 'user@example.com'
      },
      example: `curl -X POST https://dhtd.onrender.com/api/auth/verify \\
  -H "Authorization: Bearer YOUR_TOKEN"`,
    },
    {
      category: '認證',
      name: '檢查超級管理員',
      method: 'GET',
      path: '/api/admin/is-super-admin',
      requireAuth: true,
      description: '檢查當前用戶是否為超級管理員',
      response: { isSuperAdmin: true },
      example: `curl https://dhtd.onrender.com/api/admin/is-super-admin \\
  -H "Authorization: Bearer YOUR_TOKEN"`,
    },
    
    // 用戶相關
    {
      category: '用戶',
      name: '獲取用戶資料',
      method: 'GET',
      path: '/api/profile',
      requireAuth: true,
      description: '獲取指定用戶的資料信息',
      queryParams: [
        { name: 'userId', type: 'string', required: true, description: '用戶 ID' },
        { name: 'ensure', type: '0|1', required: false, description: '是否自動創建不存在的 profile' },
      ],
      response: {
        id: 'uuid',
        username: '用戶名',
        avatarUrl: 'https://...',
        points: 1000,
        virtualCurrency: 500,
        inviteCode: 'ABC123'
      },
      example: `curl "https://dhtd.onrender.com/api/profile?userId=USER_ID&ensure=1" \\
  -H "Authorization: Bearer YOUR_TOKEN"`,
    },
    {
      category: '用戶',
      name: '更新用戶資料',
      method: 'PUT',
      path: '/api/profile',
      requireAuth: true,
      description: '更新當前用戶的資料',
      requestBody: {
        username: '新用戶名',
        avatarUrl: 'https://...'
      },
      response: {
        success: true,
        profile: { id: 'uuid', username: '新用戶名' }
      },
      example: `curl -X PUT https://dhtd.onrender.com/api/profile \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"username":"新用戶名"}'`,
    },
    {
      category: '用戶',
      name: '上傳頭像',
      method: 'POST',
      path: '/api/upload-avatar',
      requireAuth: true,
      description: '上傳用戶頭像（最大 5MB）',
      requestBody: 'multipart/form-data: avatar (file)',
      response: {
        avatarUrl: 'https://...'
      },
      example: `curl -X POST https://dhtd.onrender.com/api/upload-avatar \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -F "avatar=@avatar.jpg"`,
    },
    
    // 帖子相關
    {
      category: '內容',
      name: '獲取帖子列表',
      method: 'GET',
      path: '/api/posts',
      requireAuth: false,
      description: '獲取帖子列表（支持分頁）',
      queryParams: [
        { name: 'page', type: 'number', required: false, description: '頁碼（默認 1）' },
        { name: 'limit', type: 'number', required: false, description: '每頁數量（默認 10）' },
        { name: 'tenantId', type: 'number', required: false, description: '租戶 ID（默認 0）' },
        { name: 'scope', type: 'tenant|shared', required: false, description: '數據範圍' },
      ],
      response: {
        posts: [
          {
            id: 1,
            content: '帖子內容',
            images: 'url1,url2',
            likesCount: 10,
            commentsCount: 5
          }
        ],
        total: 100,
        hasMore: true
      },
      example: `curl "https://dhtd.onrender.com/api/posts?page=1&limit=10"`,
    },
    {
      category: '內容',
      name: '創建帖子',
      method: 'POST',
      path: '/api/posts',
      requireAuth: true,
      description: '創建新帖子',
      requestBody: {
        content: '帖子內容',
        images: ['https://image1.jpg'],
        scope: 'tenant'
      },
      response: {
        success: true,
        post: { id: 1, content: '帖子內容', status: 'approved' }
      },
      example: `curl -X POST https://dhtd.onrender.com/api/posts \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"content":"帖子內容","images":[]}'`,
    },
    {
      category: '內容',
      name: '刪除帖子',
      method: 'DELETE',
      path: '/api/posts/:id',
      requireAuth: true,
      description: '刪除指定的帖子',
      response: { success: true },
      example: `curl -X DELETE https://dhtd.onrender.com/api/posts/1 \\
  -H "Authorization: Bearer YOUR_TOKEN"`,
    },
    {
      category: '內容',
      name: '點讚/取消點讚',
      method: 'POST',
      path: '/api/posts/:id/like',
      requireAuth: true,
      description: '對帖子進行點讚或取消點讚',
      response: {
        liked: true,
        likesCount: 11
      },
      example: `curl -X POST https://dhtd.onrender.com/api/posts/1/like \\
  -H "Authorization: Bearer YOUR_TOKEN"`,
    },
    
    // 評論相關
    {
      category: '評論',
      name: '獲取評論列表',
      method: 'GET',
      path: '/api/comments/:postId',
      requireAuth: false,
      description: '獲取指定帖子的評論列表',
      queryParams: [
        { name: 'scope', type: 'tenant|shared', required: false, description: '數據範圍' },
      ],
      response: {
        comments: [
          {
            id: 1,
            postId: 1,
            content: '評論內容',
            author: { username: '用戶', avatarUrl: 'https://...' }
          }
        ]
      },
      example: `curl https://dhtd.onrender.com/api/comments/1`,
    },
    {
      category: '評論',
      name: '創建評論',
      method: 'POST',
      path: '/api/comments',
      requireAuth: true,
      description: '創建新評論（會扣除積分）',
      requestBody: {
        postId: 1,
        content: '評論內容',
        scope: 'tenant'
      },
      response: {
        success: true,
        comment: { id: 1, content: '評論內容' }
      },
      example: `curl -X POST https://dhtd.onrender.com/api/comments \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"postId":1,"content":"評論內容"}'`,
    },
    
    // 積分相關
    {
      category: '積分',
      name: '獲取積分歷史',
      method: 'GET',
      path: '/api/points-history',
      requireAuth: true,
      description: '獲取用戶的積分變動歷史',
      response: [
        {
          id: 1,
          user_id: 'uuid',
          change_amount: 100,
          reason: '每日簽到',
          created_at: '2025-01-01T00:00:00Z'
        }
      ],
      example: `curl https://dhtd.onrender.com/api/points-history \\
  -H "Authorization: Bearer YOUR_TOKEN"`,
    },
    {
      category: '積分',
      name: '每日簽到',
      method: 'POST',
      path: '/api/points/checkin',
      requireAuth: true,
      description: '每日簽到獲取積分獎勵',
      response: {
        ok: true,
        reward: 10
      },
      example: `curl -X POST https://dhtd.onrender.com/api/points/checkin \\
  -H "Authorization: Bearer YOUR_TOKEN"`,
    },
    {
      category: '積分',
      name: '積分兌換',
      method: 'POST',
      path: '/api/points/exchange',
      requireAuth: true,
      description: '積分和虛擬貨幣互相兌換',
      requestBody: {
        mode: 'pointsToCurrency',
        pointsAmount: 100,
        currencyAmount: 10
      },
      response: {
        ok: true,
        profile: { points: 900, virtualCurrency: 10 }
      },
      example: `curl -X POST https://dhtd.onrender.com/api/points/exchange \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"mode":"pointsToCurrency","pointsAmount":100,"currencyAmount":10}'`,
    },
    
    // 商城相關
    {
      category: '商城',
      name: '獲取商品列表',
      method: 'GET',
      path: '/api/shop/products',
      requireAuth: false,
      description: '獲取商城商品列表',
      queryParams: [
        { name: 'tenantId', type: 'number', required: false, description: '租戶 ID' },
      ],
      response: {
        products: [
          {
            id: 1,
            name: '商品名稱',
            price: 1000,
            stock: 100,
            enabled: 1
          }
        ]
      },
      example: `curl https://dhtd.onrender.com/api/shop/products`,
    },
    {
      category: '商城',
      name: '兌換商品',
      method: 'POST',
      path: '/api/shop/redeem',
      requireAuth: true,
      description: '使用積分兌換商品',
      requestBody: {
        productId: 1,
        quantity: 1
      },
      response: {
        ok: true
      },
      example: `curl -X POST https://dhtd.onrender.com/api/shop/redeem \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"productId":1,"quantity":1}'`,
    },
    
    // 租戶相關
    {
      category: '租戶',
      name: '解析租戶 ID',
      method: 'GET',
      path: '/api/tenant/resolve',
      requireAuth: false,
      description: '根據域名解析租戶 ID',
      headers: [
        { name: 'X-Horizons-Resolve-Host', type: 'string', required: true, description: '域名' },
      ],
      response: { tenantId: 1 },
      example: `curl https://dhtd.onrender.com/api/tenant/resolve \\
  -H "X-Horizons-Resolve-Host: tenant1.example.com"`,
    },
    {
      category: '租戶',
      name: '獲取站點設置',
      method: 'GET',
      path: '/api/settings',
      requireAuth: false,
      description: '獲取站點配置信息',
      queryParams: [
        { name: 'scope', type: 'main|tenant', required: false, description: '設置範圍' },
      ],
      response: {
        site_name: '站點名稱',
        site_logo: 'https://...',
        primary_color: '#3b82f6'
      },
      example: `curl "https://dhtd.onrender.com/api/settings?scope=main"`,
    },
    
    // 通知相關
    {
      category: '通知',
      name: '獲取通知列表',
      method: 'GET',
      path: '/api/notifications',
      requireAuth: true,
      description: '獲取用戶的通知列表',
      queryParams: [
        { name: 'limit', type: 'number', required: false, description: '返回數量（默認 50）' },
      ],
      response: {
        notifications: [
          { id: 1, content: '通知內容', isRead: 0, createdAt: '2025-01-01T00:00:00Z' }
        ],
        unreadCount: 5
      },
      example: `curl https://dhtd.onrender.com/api/notifications \\
  -H "Authorization: Bearer YOUR_TOKEN"`,
    },
    
    // 系統相關
    {
      category: '系統',
      name: '健康檢查',
      method: 'GET',
      path: '/health',
      requireAuth: false,
      description: '檢查服務器健康狀態',
      response: {
        ok: true,
        status: 'healthy',
        timestamp: '2025-01-01T00:00:00Z'
      },
      example: `curl https://dhtd.onrender.com/health`,
    },
    {
      category: '系統',
      name: 'API 健康檢查',
      method: 'GET',
      path: '/api/health',
      requireAuth: false,
      description: 'API 服務健康檢查',
      response: {
        ok: true,
        status: 'healthy',
        timestamp: '2025-01-01T00:00:00Z'
      },
      example: `curl https://dhtd.onrender.com/api/health`,
    },
  ];

  // 分類列表
  const categories = ['all', ...new Set(apiEndpoints.map(ep => ep.category))];

  // 過濾端點
  const filteredEndpoints = apiEndpoints.filter(ep => {
    const matchSearch = searchTerm === '' || 
      ep.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ep.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ep.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchCategory = selectedCategory === 'all' || ep.category === selectedCategory;
    
    return matchSearch && matchCategory;
  });

  // 複製到剪貼板
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast({
      title: '已複製',
      description: '內容已複製到剪貼板',
      duration: 2000,
    });
  };

  // HTTP 方法顏色
  const getMethodColor = (method) => {
    const colors = {
      GET: 'bg-blue-100 text-blue-700',
      POST: 'bg-green-100 text-green-700',
      PUT: 'bg-yellow-100 text-yellow-700',
      DELETE: 'bg-red-100 text-red-700',
    };
    return colors[method] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* 頂部標題 */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <BookOpen className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900">API 使用文檔</h1>
        </div>
        <p className="text-gray-600">
          完整的 API 端點參考文檔，包含請求示例和響應格式
        </p>
      </div>

      {/* 搜索和過濾 */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="搜索 API 端點、路徑或描述..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {categories.map(cat => (
                <Button
                  key={cat}
                  variant={selectedCategory === cat ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat === 'all' ? '全部' : cat}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* API 文檔內容 */}
      <div className="space-y-4">
        {filteredEndpoints.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Search className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500">沒有找到匹配的 API 端點</p>
            </CardContent>
          </Card>
        ) : (
          filteredEndpoints.map((endpoint, idx) => (
            <Card key={idx} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={getMethodColor(endpoint.method)}>
                        {endpoint.method}
                      </Badge>
                      <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
                        {endpoint.path}
                      </code>
                      {endpoint.requireAuth ? (
                        <Badge variant="outline" className="text-orange-600">
                          <Lock className="h-3 w-3 mr-1" />
                          需認證
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-green-600">
                          <Unlock className="h-3 w-3 mr-1" />
                          公開
                        </Badge>
                      )}
                      <Badge variant="secondary">{endpoint.category}</Badge>
                    </div>
                    <CardTitle className="text-xl">{endpoint.name}</CardTitle>
                    <CardDescription className="mt-1">
                      {endpoint.description}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="example" className="w-full">
                  <TabsList>
                    <TabsTrigger value="example">
                      <Code className="h-4 w-4 mr-2" />
                      請求示例
                    </TabsTrigger>
                    {endpoint.queryParams && (
                      <TabsTrigger value="params">
                        Query 參數
                      </TabsTrigger>
                    )}
                    {endpoint.headers && (
                      <TabsTrigger value="headers">
                        Headers
                      </TabsTrigger>
                    )}
                    {endpoint.requestBody && (
                      <TabsTrigger value="request">
                        請求體
                      </TabsTrigger>
                    )}
                    <TabsTrigger value="response">
                      <FileJson className="h-4 w-4 mr-2" />
                      響應
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="example">
                    <div className="relative">
                      <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
                        {endpoint.example}
                      </pre>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="absolute top-2 right-2"
                        onClick={() => copyToClipboard(endpoint.example)}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        複製
                      </Button>
                    </div>
                  </TabsContent>

                  {endpoint.queryParams && (
                    <TabsContent value="params">
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-sm font-medium">參數名</th>
                              <th className="px-4 py-2 text-left text-sm font-medium">類型</th>
                              <th className="px-4 py-2 text-left text-sm font-medium">必填</th>
                              <th className="px-4 py-2 text-left text-sm font-medium">說明</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {endpoint.queryParams.map((param, i) => (
                              <tr key={i}>
                                <td className="px-4 py-2 font-mono text-sm">{param.name}</td>
                                <td className="px-4 py-2 text-sm text-gray-600">{param.type}</td>
                                <td className="px-4 py-2">
                                  {param.required ? (
                                    <Badge variant="destructive" className="text-xs">必填</Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-xs">可選</Badge>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-sm">{param.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </TabsContent>
                  )}

                  {endpoint.headers && (
                    <TabsContent value="headers">
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-sm font-medium">Header 名</th>
                              <th className="px-4 py-2 text-left text-sm font-medium">類型</th>
                              <th className="px-4 py-2 text-left text-sm font-medium">必填</th>
                              <th className="px-4 py-2 text-left text-sm font-medium">說明</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {endpoint.headers.map((header, i) => (
                              <tr key={i}>
                                <td className="px-4 py-2 font-mono text-sm">{header.name}</td>
                                <td className="px-4 py-2 text-sm text-gray-600">{header.type}</td>
                                <td className="px-4 py-2">
                                  {header.required ? (
                                    <Badge variant="destructive" className="text-xs">必填</Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-xs">可選</Badge>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-sm">{header.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </TabsContent>
                  )}

                  {endpoint.requestBody && (
                    <TabsContent value="request">
                      <div className="relative">
                        <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
                          {typeof endpoint.requestBody === 'object' 
                            ? JSON.stringify(endpoint.requestBody, null, 2)
                            : endpoint.requestBody
                          }
                        </pre>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="absolute top-2 right-2"
                          onClick={() => copyToClipboard(
                            typeof endpoint.requestBody === 'object' 
                              ? JSON.stringify(endpoint.requestBody, null, 2)
                              : endpoint.requestBody
                          )}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          複製
                        </Button>
                      </div>
                    </TabsContent>
                  )}

                  <TabsContent value="response">
                    <div className="relative">
                      <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
                        {JSON.stringify(endpoint.response, null, 2)}
                      </pre>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="absolute top-2 right-2"
                        onClick={() => copyToClipboard(JSON.stringify(endpoint.response, null, 2))}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        複製
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* 底部統計 */}
      <div className="mt-6 text-center text-sm text-gray-500">
        顯示 {filteredEndpoints.length} / {apiEndpoints.length} 個 API 端點
      </div>
    </div>
  );
};

export default AdminAPIDocs;

