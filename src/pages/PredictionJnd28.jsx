import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, TrendingUp, Award, ArrowLeft, MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useAllAlgorithmPredictions, useAlgorithmCompare } from '@/hooks/usePredictionAPI';

function PredictionJnd28() {
  const { siteSettings } = useAuth();
  const navigate = useNavigate();
  const [selectedAlgorithm, setSelectedAlgorithm] = useState(null);
  
  // 使用新的hook，每个算法获取20条数据
  const { data: algorithmPredictions, loading: predictionsLoading, refetch: refetchPredictions } = useAllAlgorithmPredictions('jnd28', 20);
  const { data: algorithms, loading: algorithmsLoading, refetch: refetchAlgorithms } = useAlgorithmCompare('jnd28');

  // 计算每个算法的准确率（基于已验证的数据）
  const getAlgorithmStats = (algorithmName, algorithmId) => {
    const predictions = algorithmPredictions[algorithmId] || [];
    if (predictions.length === 0) return { total: 0, correct: 0, accuracy: 0 };
    
    const verified = predictions.filter(p => p.status === 'verified');
    const total = verified.length;
    const correct = verified.filter(p => p.result === '对').length;
    const accuracy = total > 0 ? (correct / total * 100).toFixed(2) : 0;
    
    return { total, correct, accuracy };
  };

  const handleRefresh = () => {
    refetchPredictions();
    refetchAlgorithms();
  };

  // 获取选中算法的预测记录（每个算法20条）
  const filteredPredictions = selectedAlgorithm && algorithms
    ? (() => {
        const algo = algorithms.find(a => a.algorithm === selectedAlgorithm);
        return algo ? algorithmPredictions[algo.algorithm_id] || [] : [];
      })()
    : [];

  return (
    <>
      <Helmet>
        <title>{String('加拿大28预测 - ' + (siteSettings?.site_name ?? '大海团队'))}</title>
        <meta name="description" content="加拿大28算法预测与准确率统计" />
      </Helmet>
      
      <div className="min-h-screen bg-white p-4 pb-24">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* 返回按钮 */}
          <Button 
            onClick={() => navigate('/prediction')} 
            variant="ghost" 
            size="sm"
            className="mb-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回预测中心
          </Button>

          {/* 顶部标题 */}
          <div className="border-b border-gray-200 pb-6">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-2xl shadow-lg">
                    🍁
                  </div>
                  <div>
                    <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">
                      加拿大28预测
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Canada 28 Prediction</p>
                  </div>
                </div>
                <p className="text-gray-600 text-sm">基于最新20条数据的智能算法分析与准确率统计</p>
              </div>
              <Button 
                onClick={handleRefresh} 
                variant="outline" 
                size="sm"
                className="hidden sm:flex border-gray-300 hover:border-gray-400"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                刷新数据
              </Button>
            </div>
          </div>

          {/* 移动端刷新按钮 */}
          <Button 
            onClick={handleRefresh} 
            variant="outline" 
            size="sm"
            className="w-full sm:hidden border-gray-300"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            刷新数据
          </Button>

          {/* 算法卡片 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {algorithmsLoading ? (
              Array(4).fill(0).map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="pt-6">
                    <div className="h-4 bg-gray-200 rounded mb-4"></div>
                    <div className="h-8 bg-gray-300 rounded"></div>
                  </CardContent>
                </Card>
              ))
            ) : algorithms && algorithms.length > 0 ? (
              algorithms.slice(0, 4).map((algo, index) => {
                const stats = getAlgorithmStats(algo.algorithm, algo.algorithm_id);
                const isSelected = selectedAlgorithm === algo.algorithm;
                
                // Vercel风格配色 - 简洁的灰度 + 点缀色
                const medalColors = ['text-yellow-500', 'text-gray-400', 'text-orange-500', 'text-blue-500'];
                const medalIcons = ['🥇', '🥈', '🥉', '🎖️'];

                return (
                  <Card
                    key={algo.algorithm_id}
                    className={`cursor-pointer transition-all duration-200 ${
                      isSelected 
                        ? 'shadow-2xl border-2 border-black scale-105' 
                        : 'shadow-md hover:shadow-xl border border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedAlgorithm(isSelected ? null : algo.algorithm)}
                  >
                    <CardContent className="pt-4 sm:pt-6">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{medalIcons[index]}</span>
                          <h3 className="font-bold text-sm sm:text-base text-gray-900">
                            {algo.algorithm}
                          </h3>
                        </div>
                        {isSelected && (
                          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        )}
                      </div>
                      
                      <div className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
                        {stats.accuracy}%
                      </div>
                      
                      <div className="space-y-1 text-xs sm:text-sm text-gray-600">
                        <div className="flex justify-between">
                          <span>最新20条</span>
                          <span className="font-semibold">{(algorithmPredictions[algo.algorithm_id] || []).length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>正确</span>
                          <span className="text-green-600 font-semibold">{stats.correct}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>错误</span>
                          <span className="text-red-600 font-semibold">{stats.total - stats.correct}</span>
                        </div>
                      </div>
                      
                      {isSelected && (
                        <Badge className="mt-3 w-full justify-center" variant="default">
                          已选中
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            ) : (
              <div className="col-span-4 text-center py-8 text-gray-500">暂无算法数据</div>
            )}
          </div>

          {/* 预测记录 */}
          {selectedAlgorithm && (
            <Card className="border border-gray-200 shadow-lg bg-white">
              <CardHeader className="border-b border-gray-200">
                <CardTitle className="flex items-center justify-between text-base sm:text-lg">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-6 bg-black rounded-full"></div>
                    <span className="font-bold text-gray-900">{selectedAlgorithm} - 最近20条预测记录</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="text-gray-600 hover:text-gray-900"
                    onClick={() => setSelectedAlgorithm(null)}
                  >
                    关闭
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {predictionsLoading ? (
                  <div className="text-center py-8 text-gray-500">加载中...</div>
                ) : filteredPredictions.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-gray-200">
                          <th className="text-left py-3 px-2 sm:px-4 text-gray-600 font-semibold">期号</th>
                          <th className="text-left py-3 px-2 sm:px-4 text-gray-600 font-semibold">预测</th>
                          <th className="text-left py-3 px-2 sm:px-4 text-gray-600 font-semibold">实际</th>
                          <th className="text-left py-3 px-2 sm:px-4 text-gray-600 font-semibold">结果</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPredictions.map((pred) => (
                          <tr key={pred.id} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-3 px-2 sm:px-4 font-mono text-xs">{pred.issue}</td>
                            <td className="py-3 px-2 sm:px-4">
                              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                                {pred.prediction}
                              </Badge>
                            </td>
                            <td className="py-3 px-2 sm:px-4">
                              {pred.actual_result ? (
                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                  {pred.actual_result}
                                </Badge>
                              ) : (
                                <span className="text-gray-400">待开奖</span>
                              )}
                            </td>
                            <td className="py-3 px-2 sm:px-4">
                              {pred.result === '对' ? (
                                <span className="text-green-600 font-bold">✓ 对</span>
                              ) : pred.result === '错' ? (
                                <span className="text-red-600 font-bold">✗ 错</span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">暂无预测记录</div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

export default PredictionJnd28;

