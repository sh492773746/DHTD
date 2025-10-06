import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, TrendingUp, Award, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePredictions, useAlgorithmCompare } from '@/hooks/usePredictionAPI';

function PredictionFf28() {
  const { siteSettings } = useAuth();
  const navigate = useNavigate();
  const [selectedAlgorithm, setSelectedAlgorithm] = useState(null);
  
  const { data: predictions, loading: predictionsLoading, refetch: refetchPredictions } = usePredictions('ff28');
  const { data: algorithms, loading: algorithmsLoading, refetch: refetchAlgorithms } = useAlgorithmCompare('ff28');

  // 计算每个算法最新100条的准确率
  const getAlgorithmStats = (algorithmName) => {
    if (!predictions || predictions.length === 0) return { total: 0, correct: 0, accuracy: 0 };
    
    const algorithmPredictions = predictions
      .filter(p => p.algorithm === algorithmName && p.status === 'verified')
      .slice(0, 100);
    
    const total = algorithmPredictions.length;
    const correct = algorithmPredictions.filter(p => p.result === '对').length;
    const accuracy = total > 0 ? (correct / total * 100).toFixed(2) : 0;
    
    return { total, correct, accuracy };
  };

  const handleRefresh = () => {
    refetchPredictions();
    refetchAlgorithms();
  };

  const filteredPredictions = selectedAlgorithm 
    ? predictions.filter(p => p.algorithm === selectedAlgorithm).slice(0, 20)
    : [];

  return (
    <>
      <Helmet>
        <title>{String('分分28预测 - ' + (siteSettings?.site_name ?? '大海团队'))}</title>
        <meta name="description" content="分分28算法预测与准确率统计" />
      </Helmet>
      
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 p-4 pb-24">
        <div className="max-w-6xl mx-auto space-y-4">
          {/* 返回按钮 */}
          <Button 
            onClick={() => navigate('/prediction')} 
            variant="ghost" 
            size="sm"
            className="mb-2 text-blue-600 hover:text-blue-700 hover:bg-blue-100"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回预测中心
          </Button>

          {/* 顶部标题横幅 */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-600 p-6 text-white shadow-xl">
            <div className="absolute top-0 right-0 w-40 h-40 bg-white opacity-10 rounded-full -mr-20 -mt-20"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-4xl">⚡</span>
                    <h1 className="text-2xl sm:text-3xl font-bold">
                      分分28预测
                    </h1>
                  </div>
                  <p className="text-blue-100 text-sm">基于最新100条已验证数据的算法准确率统计</p>
                </div>
                <Button 
                  onClick={handleRefresh} 
                  variant="secondary" 
                  size="sm"
                  className="hidden sm:flex"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  刷新
                </Button>
              </div>
            </div>
          </div>

          {/* 移动端刷新按钮 */}
          <Button 
            onClick={handleRefresh} 
            variant="outline" 
            size="sm"
            className="w-full sm:hidden"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            刷新数据
          </Button>

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
                const stats = getAlgorithmStats(algo.algorithm);
                const colors = [
                  { bg: 'bg-green-50 border-green-300', text: 'text-green-700', gradient: 'from-green-400 to-green-600' },
                  { bg: 'bg-blue-50 border-blue-300', text: 'text-blue-700', gradient: 'from-blue-400 to-blue-600' },
                  { bg: 'bg-purple-50 border-purple-300', text: 'text-purple-700', gradient: 'from-purple-400 to-purple-600' },
                  { bg: 'bg-pink-50 border-pink-300', text: 'text-pink-700', gradient: 'from-pink-400 to-pink-600' },
                ];
                const color = colors[index];
                const isSelected = selectedAlgorithm === algo.algorithm;

                return (
                  <Card
                    key={algo.algorithm_id}
                    className={`cursor-pointer transition-all hover:shadow-xl border-2 ${
                      isSelected ? 'ring-2 ring-offset-2 ring-blue-500 scale-105' : color.bg
                    }`}
                    onClick={() => setSelectedAlgorithm(isSelected ? null : algo.algorithm)}
                  >
                    <CardContent className="pt-4 sm:pt-6">
                      <div className="flex items-center gap-2 mb-3">
                        {index === 0 && <Award className="w-5 h-5 text-yellow-500" />}
                        {index === 1 && <Award className="w-5 h-5 text-gray-400" />}
                        {index === 2 && <Award className="w-5 h-5 text-orange-600" />}
                        {index === 3 && <TrendingUp className="w-5 h-5 text-purple-500" />}
                        <h3 className={`font-bold text-sm sm:text-base ${color.text}`}>
                          {algo.algorithm}
                        </h3>
                      </div>
                      
                      <div className={`text-3xl sm:text-4xl font-bold bg-gradient-to-r ${color.gradient} bg-clip-text text-transparent mb-3`}>
                        {stats.accuracy}%
                      </div>
                      
                      <div className="space-y-1 text-xs sm:text-sm text-gray-600">
                        <div className="flex justify-between">
                          <span>最新100条</span>
                          <span className="font-semibold">{stats.total}</span>
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

          {selectedAlgorithm && (
            <Card className="border-0 shadow-xl bg-white">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base sm:text-lg">
                  <span>📊 {selectedAlgorithm} - 最近20条预测记录</span>
                  <Button 
                    variant="ghost" 
                    size="sm"
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
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                {pred.prediction}
                              </Badge>
                            </td>
                            <td className="py-3 px-2 sm:px-4">
                              {pred.actual_result ? (
                                <Badge variant="outline" className="bg-cyan-50 text-cyan-700 border-cyan-200">
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

export default PredictionFf28;

