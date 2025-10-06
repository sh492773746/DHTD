import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { usePredictions, usePredictionStats, useAlgorithmCompare } from '@/hooks/usePredictionAPI';

function PredictionDashboard() {
  const [activeSystem, setActiveSystem] = useState('jnd28');
  const [selectedAlgorithm, setSelectedAlgorithm] = useState('全部');

  const { data: stats, loading: statsLoading, refetch: refetchStats } = usePredictionStats(activeSystem);
  const { data: predictions, loading: predictionsLoading, refetch: refetchPredictions } = usePredictions(activeSystem);
  const { data: algorithms, loading: algorithmsLoading, refetch: refetchAlgorithms } = useAlgorithmCompare(activeSystem);

  const systemLabels = {
    jnd28: '加拿大28',
    ff28: '分分28',
    bit28: '比特28',
  };

  const handleRefreshAll = () => {
    refetchStats();
    refetchPredictions();
    refetchAlgorithms();
  };

  // 篩選預測記錄
  const filteredPredictions = selectedAlgorithm === '全部' 
    ? predictions 
    : predictions.filter(p => p.algorithm === selectedAlgorithm);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 頂部標題 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              🎯 PC28 預測系統
            </h1>
            <p className="text-gray-600 mt-1">實時預測數據分析與算法對比</p>
          </div>
          <Button onClick={handleRefreshAll} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            刷新數據
          </Button>
        </div>

        {/* 系統選擇標籤 */}
        <div className="flex gap-3">
          {['jnd28', 'ff28', 'bit28'].map((system) => (
            <button
              key={system}
              onClick={() => setActiveSystem(system)}
              className={`flex-1 py-4 px-6 rounded-xl font-semibold text-lg transition-all duration-300 ${
                activeSystem === system
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg scale-105'
                  : 'bg-white text-gray-600 hover:bg-gray-50 shadow'
              }`}
            >
              {system === 'jnd28' && '👑 '}
              {system === 'ff28' && '⚡ '}
              {system === 'bit28' && '💎 '}
              {systemLabels[system]}
            </button>
          ))}
        </div>

        {/* 統計卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statsLoading ? (
            // 加載骨架
            Array(4).fill(0).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="pt-6">
                  <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
                  <div className="h-8 bg-gray-300 rounded"></div>
                </CardContent>
              </Card>
            ))
          ) : stats ? (
            <>
              <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow bg-white">
                <CardContent className="pt-6">
                  <div className="text-sm text-gray-600 mb-2">總預測數</div>
                  <div className="text-4xl font-bold text-indigo-600">
                    {stats.total_predictions || 0}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow bg-white">
                <CardContent className="pt-6">
                  <div className="text-sm text-gray-600 mb-2">正確預測</div>
                  <div className="text-4xl font-bold text-green-600">
                    {stats.correct_predictions || 0}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow bg-white">
                <CardContent className="pt-6">
                  <div className="text-sm text-gray-600 mb-2">錯誤預測</div>
                  <div className="text-4xl font-bold text-red-600">
                    {stats.wrong_predictions || 0}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow bg-white">
                <CardContent className="pt-6">
                  <div className="text-sm text-gray-600 mb-2">準確率</div>
                  <div className="text-4xl font-bold text-pink-600">
                    {stats.accuracy_rate ? `${parseFloat(stats.accuracy_rate).toFixed(2)}%` : '0%'}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>

        {/* 算法性能對比 */}
        <Card className="border-0 shadow-xl bg-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              🎯 算法性能對比
            </CardTitle>
          </CardHeader>
          <CardContent>
            {algorithmsLoading ? (
              <div className="text-center py-8 text-gray-500">加載中...</div>
            ) : algorithms.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {algorithms.slice(0, 4).map((algo, index) => {
                  const colors = [
                    'from-green-400 to-green-600',
                    'from-blue-400 to-blue-600',
                    'from-purple-400 to-purple-600',
                    'from-pink-400 to-pink-600',
                  ];
                  const bgColors = [
                    'bg-green-50 border-green-200',
                    'bg-blue-50 border-blue-200',
                    'bg-purple-50 border-purple-200',
                    'bg-pink-50 border-pink-200',
                  ];

                  return (
                    <div
                      key={algo.algorithm_id}
                      className={`p-4 rounded-xl border-2 ${bgColors[index]} hover:shadow-lg transition-all cursor-pointer`}
                      onClick={() => setSelectedAlgorithm(algo.algorithm)}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">
                          {index === 0 && '🥇'}
                          {index === 1 && '🥈'}
                          {index === 2 && '🥉'}
                          {index === 3 && '🎖️'}
                        </span>
                        <div className="font-semibold text-gray-800">{algo.algorithm}</div>
                      </div>
                      
                      <div className={`text-3xl font-bold bg-gradient-to-r ${colors[index]} bg-clip-text text-transparent mb-2`}>
                        {parseFloat(algo.accuracy_rate).toFixed(2)}%
                      </div>
                      
                      <div className="text-sm text-gray-600 space-y-1">
                        <div>{algo.total_predictions} 次預測</div>
                        <div className="flex gap-4">
                          <span className="text-green-600">大小✓{algo.size_correct_count || 0}</span>
                          <span className="text-blue-600">單雙✓{algo.parity_correct_count || 0}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">暫無數據</div>
            )}
          </CardContent>
        </Card>

        {/* 預測記錄 */}
        <Card className="border-0 shadow-xl bg-white">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                📊 預測記錄（最近20條）
              </span>
              <div className="flex gap-2">
                <Button
                  variant={selectedAlgorithm === '全部' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedAlgorithm('全部')}
                >
                  全部
                </Button>
                {algorithms.slice(0, 4).map((algo) => (
                  <Button
                    key={algo.algorithm_id}
                    variant={selectedAlgorithm === algo.algorithm ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedAlgorithm(algo.algorithm)}
                  >
                    {algo.algorithm}
                  </Button>
                ))}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {predictionsLoading ? (
              <div className="text-center py-8 text-gray-500">加載中...</div>
            ) : filteredPredictions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="text-left py-3 px-4 text-gray-600 font-semibold">期號</th>
                      <th className="text-left py-3 px-4 text-gray-600 font-semibold">預測結果</th>
                      <th className="text-left py-3 px-4 text-gray-600 font-semibold">實際結果</th>
                      <th className="text-left py-3 px-4 text-gray-600 font-semibold">狀態</th>
                      <th className="text-left py-3 px-4 text-gray-600 font-semibold">結果</th>
                      <th className="text-left py-3 px-4 text-gray-600 font-semibold">算法</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPredictions.slice(0, 20).map((pred) => (
                      <tr key={pred.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-4 font-mono text-sm">{pred.issue}</td>
                        <td className="py-3 px-4">
                          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                            {pred.prediction}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          {pred.actual_result ? (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                              {pred.actual_result}
                            </Badge>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant={pred.status === 'verified' ? 'default' : 'secondary'}>
                            {pred.status === 'verified' ? '已驗證' : '待驗證'}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          {pred.result === '對' ? (
                            <span className="text-green-600 font-semibold">✓ 對</span>
                          ) : pred.result === '錯' ? (
                            <span className="text-red-600 font-semibold">✗ 錯</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm text-gray-600">{pred.algorithm}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                {selectedAlgorithm === '全部' ? '暫無預測記錄' : `暫無 ${selectedAlgorithm} 的預測記錄`}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default PredictionDashboard;

