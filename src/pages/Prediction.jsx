import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Activity, Zap, ChevronRight, RefreshCw, Award } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useAlgorithmCompare } from '@/hooks/usePredictionAPI';

function Prediction() {
  const { siteSettings } = useAuth();
  const navigate = useNavigate();

  // 获取三个系统的算法数据
  const { data: jnd28Algos, loading: jnd28Loading, refetch: refetchJnd28 } = useAlgorithmCompare('jnd28');
  const { data: ff28Algos, loading: ff28Loading, refetch: refetchFf28 } = useAlgorithmCompare('ff28');
  const { data: bit28Algos, loading: bit28Loading, refetch: refetchBit28 } = useAlgorithmCompare('bit28');

  const handleRefreshAll = () => {
    refetchJnd28();
    refetchFf28();
    refetchBit28();
  };

  // 计算最佳算法
  const getBestAlgorithm = (algorithms) => {
    if (!algorithms || algorithms.length === 0) return null;
    return algorithms.reduce((best, current) => {
      const bestRate = parseFloat(best.accuracy_rate || 0);
      const currentRate = parseFloat(current.accuracy_rate || 0);
      return currentRate > bestRate ? current : best;
    }, algorithms[0]);
  };

  // 预测系统配置
  const systems = [
    {
      id: 'jnd28',
      name: '加拿大28',
      icon: '🍁',
      path: '/prediction/jnd28',
      gradient: 'from-purple-500 via-pink-500 to-indigo-500',
      bgGradient: 'from-purple-50 via-pink-50 to-indigo-50',
      borderColor: 'border-purple-200',
      textColor: 'text-purple-700',
      algorithms: jnd28Algos,
      loading: jnd28Loading,
      description: '基于加拿大28开奖数据的智能预测系统',
    },
    {
      id: 'ff28',
      name: '分分28',
      icon: '⚡',
      path: '/prediction/ff28',
      gradient: 'from-blue-500 via-cyan-500 to-teal-500',
      bgGradient: 'from-blue-50 via-cyan-50 to-teal-50',
      borderColor: 'border-blue-200',
      textColor: 'text-blue-700',
      algorithms: ff28Algos,
      loading: ff28Loading,
      description: '高频分分28彩种的实时预测分析',
    },
    {
      id: 'bit28',
      name: '比特28',
      icon: '₿',
      path: '/prediction/bit28',
      gradient: 'from-orange-500 via-amber-500 to-yellow-500',
      bgGradient: 'from-orange-50 via-amber-50 to-yellow-50',
      borderColor: 'border-orange-200',
      textColor: 'text-orange-700',
      algorithms: bit28Algos,
      loading: bit28Loading,
      description: '区块链驱动的比特28预测引擎',
    },
  ];

  return (
    <>
      <Helmet>
        <title>{String('预测系统 - ' + (siteSettings?.site_name ?? '大海团队'))}</title>
        <meta name="description" content="智能预测系统 - 加拿大28、分分28、比特28算法预测" />
      </Helmet>
      
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-zinc-50 p-4 pb-20">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* 顶部横幅 */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-600 via-pink-600 to-indigo-600 p-8 text-white shadow-2xl">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 rounded-full -mr-32 -mt-32"></div>
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-white opacity-5 rounded-full -ml-48 -mb-48"></div>
            
            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold mb-2 flex items-center gap-3">
                    🎯 智能预测系统
                  </h1>
                  <p className="text-purple-100 text-sm sm:text-base">
                    基于先进算法的多系统预测平台，实时分析海量数据，精准预测开奖结果
                  </p>
                </div>
                <Button 
                  onClick={handleRefreshAll} 
                  variant="secondary" 
                  size="sm"
                  className="hidden sm:flex"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  刷新全部
                </Button>
              </div>

              {/* 统计数据 */}
              <div className="grid grid-cols-3 gap-4 mt-6">
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                  <div className="text-2xl font-bold">3</div>
                  <div className="text-purple-100 text-sm">预测系统</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                  <div className="text-2xl font-bold">12</div>
                  <div className="text-purple-100 text-sm">智能算法</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                  <div className="text-2xl font-bold">24/7</div>
                  <div className="text-purple-100 text-sm">实时更新</div>
                </div>
              </div>
            </div>
          </div>

          {/* 移动端刷新按钮 */}
          <Button 
            onClick={handleRefreshAll} 
            variant="outline" 
            size="sm"
            className="w-full sm:hidden"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            刷新全部数据
          </Button>

          {/* 预测系统卡片 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {systems.map((system) => {
              const bestAlgo = getBestAlgorithm(system.algorithms);
              const totalAlgos = system.algorithms?.length || 0;
              
              return (
                <Card 
                  key={system.id}
                  className={`overflow-hidden border-2 ${system.borderColor} hover:shadow-2xl transition-all duration-300 cursor-pointer group`}
                  onClick={() => navigate(system.path)}
                >
                  <CardHeader className={`bg-gradient-to-br ${system.bgGradient} pb-4`}>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-3xl">{system.icon}</span>
                        <span className={`text-xl font-bold ${system.textColor}`}>
                          {system.name}
                        </span>
                      </div>
                      <ChevronRight className={`w-5 h-5 ${system.textColor} group-hover:translate-x-1 transition-transform`} />
                    </CardTitle>
                    <CardDescription className="text-gray-600 text-sm mt-2">
                      {system.description}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="pt-6 space-y-4">
                    {system.loading ? (
                      <div className="space-y-3">
                        <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                        <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
                        <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2"></div>
                      </div>
                    ) : bestAlgo ? (
                      <>
                        {/* 最佳算法 */}
                        <div className={`p-4 rounded-lg bg-gradient-to-r ${system.gradient} text-white`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Award className="w-5 h-5" />
                              <span className="font-semibold">最佳算法</span>
                            </div>
                            <Badge className="bg-white/20 text-white border-white/30">
                              {bestAlgo.algorithm}
                            </Badge>
                          </div>
                          <div className="text-3xl font-bold">
                            {bestAlgo.accuracy_rate}%
                          </div>
                          <div className="text-sm text-white/80 mt-1">
                            准确率 ({bestAlgo.correct_predictions}/{bestAlgo.total_predictions})
                          </div>
                        </div>

                        {/* 算法统计 */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="text-center p-3 bg-gray-50 rounded-lg">
                            <div className="text-2xl font-bold text-gray-800">
                              {totalAlgos}
                            </div>
                            <div className="text-xs text-gray-600">算法数量</div>
                          </div>
                          <div className="text-center p-3 bg-gray-50 rounded-lg">
                            <div className="text-2xl font-bold text-green-600">
                              {bestAlgo.total_predictions}
                            </div>
                            <div className="text-xs text-gray-600">总预测数</div>
                          </div>
                        </div>

                        {/* 算法列表预览 */}
                        <div className="space-y-2">
                          <div className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <Activity className="w-4 h-4" />
                            算法准确率排名
                          </div>
                          {system.algorithms.slice(0, 4).map((algo, idx) => (
                            <div key={algo.algorithm_id} className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-gray-500">
                                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🎖️'}
                                </span>
                                <span className="text-gray-700">{algo.algorithm}</span>
                              </div>
                              <span className={`font-semibold ${
                                parseFloat(algo.accuracy_rate) >= 75 ? 'text-green-600' :
                                parseFloat(algo.accuracy_rate) >= 70 ? 'text-blue-600' :
                                'text-gray-600'
                              }`}>
                                {algo.accuracy_rate}%
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* 查看详情按钮 */}
                        <Button 
                          className={`w-full bg-gradient-to-r ${system.gradient} text-white hover:opacity-90`}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(system.path);
                          }}
                        >
                          查看详细预测
                          <ChevronRight className="w-4 h-4 ml-2" />
                        </Button>
                      </>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">暂无数据</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* 功能说明 */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Zap className="w-5 h-5 text-yellow-500" />
                系统特色
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center mb-3">
                    <TrendingUp className="w-6 h-6 text-purple-600" />
                  </div>
                  <h3 className="font-semibold text-gray-800">智能算法</h3>
                  <p className="text-sm text-gray-600">
                    采用多种先进预测算法，综合分析历史数据，提供高准确率的预测结果
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center mb-3">
                    <Activity className="w-6 h-6 text-blue-600" />
                  </div>
                  <h3 className="font-semibold text-gray-800">实时更新</h3>
                  <p className="text-sm text-gray-600">
                    24/7 实时监控开奖数据，自动验证预测结果，动态更新算法准确率
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center mb-3">
                    <Award className="w-6 h-6 text-green-600" />
                  </div>
                  <h3 className="font-semibold text-gray-800">数据透明</h3>
                  <p className="text-sm text-gray-600">
                    所有预测记录公开透明，支持历史数据查询，算法性能一目了然
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 使用提示 */}
          <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white text-lg">💡</span>
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-blue-900 mb-1">使用提示</h4>
                <p className="text-sm text-blue-700">
                  点击任意预测系统卡片即可查看详细的算法分析和预测记录。建议综合参考多个算法的预测结果，理性投注。
                  所有预测仅供参考，不构成投资建议。
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default Prediction;

