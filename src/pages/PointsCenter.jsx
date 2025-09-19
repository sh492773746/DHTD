import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { ArrowRightLeft, Gift, History, ShoppingCart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PointsMallEmbed from '@/components/PointsMallEmbed';

const PointsCenter = () => {
  const { profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [exchangeMode, setExchangeMode] = useState('pointsToCurrency'); // 'pointsToCurrency' or 'currencyToPoints'
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const pointsToCurrencyRate = 100; // 100 积分 = 1 虚拟分
  const currencyToPointsRate = 95; // 1 虚拟分 = 95 积分 (模拟手续费)

  const handleExchange = async (e) => {
    e.preventDefault();
    const numAmount = parseInt(amount, 10);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast({ variant: 'destructive', title: '错误', description: '请输入一个有效的正数。' });
      return;
    }

    setIsLoading(true);

    let points_amount = 0;
    let currency_amount = 0;

    if (exchangeMode === 'pointsToCurrency') {
      points_amount = numAmount;
      currency_amount = Math.floor(numAmount / pointsToCurrencyRate);
      if (profile.points < points_amount) {
        toast({ variant: 'destructive', title: '操作失败', description: '积分不足。' });
        setIsLoading(false);
        return;
      }
    } else {
      currency_amount = numAmount;
      points_amount = numAmount * currencyToPointsRate;
      if (profile.virtual_currency < currency_amount) {
        toast({ variant: 'destructive', title: '操作失败', description: '虚拟分不足。' });
        setIsLoading(false);
        return;
      }
    }
    
    if (points_amount === 0 && currency_amount === 0) {
        toast({ variant: 'destructive', title: '错误', description: '兑换金额过小。' });
        setIsLoading(false);
        return;
    }


    const { error } = await supabase.rpc('exchange_currency', {
      p_user_id: profile.id,
      p_exchange_mode: exchangeMode,
      p_points_amount: points_amount,
      p_currency_amount: currency_amount
    });

    if (error) {
      toast({ variant: 'destructive', title: '兑换失败', description: error.message });
    } else {
      toast({ title: '兑换成功！', description: '您的资产已更新。' });
      setAmount('');
      await refreshProfile();
    }
    setIsLoading(false);
  };

  const QuickExchangeButton = ({ points }) => {
    const currency = Math.floor(points / pointsToCurrencyRate);
    return (
        <Button 
            variant="outline" 
            size="sm"
            onClick={() => handleQuickExchange(points)}
            disabled={isLoading || profile.points < points}
        >
            {points >= 10000 ? `${points/10000}w` : points}积分 → {currency}分
        </Button>
    );
  };

  const handleQuickExchange = (pointsValue) => {
    setExchangeMode('pointsToCurrency');
    setAmount(pointsValue.toString());
  }

  return (
    <>
      <Helmet>
        <title>{String('积分中心')}</title>
        <meta name="description" content="管理您的积分和虚拟分，进行兑换操作。" />
      </Helmet>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="mb-8 bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50">
            <CardHeader>
              <CardTitle className="flex items-center text-2xl font-bold text-gray-800">
                <Gift className="mr-3 text-purple-500" />
                我的资产
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6 text-center">
              <div>
                <p className="text-lg text-gray-600">可用积分</p>
                <p className="text-4xl font-extrabold text-purple-600">{profile?.points || 0}</p>
              </div>
              <div>
                <p className="text-lg text-gray-600">可用虚拟分</p>
                <p className="text-4xl font-extrabold text-pink-600">{profile?.virtual_currency || 0}</p>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end">
                <Button variant="ghost" onClick={() => navigate('/points-history')}>
                    <History className="mr-2 h-4 w-4" />
                    查看历史
                </Button>
            </CardFooter>
          </Card>

          <Tabs defaultValue="exchange" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="exchange">
                <ArrowRightLeft className="mr-2 h-4 w-4" />
                积分兑换
              </TabsTrigger>
              <TabsTrigger value="mall">
                <ShoppingCart className="mr-2 h-4 w-4" />
                积分商城
              </TabsTrigger>
            </TabsList>
            <TabsContent value="exchange" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center text-2xl font-bold text-gray-800">
                    <ArrowRightLeft className="mr-3 text-green-500" />
                    积分兑换
                  </CardTitle>
                  <CardDescription>
                    {exchangeMode === 'pointsToCurrency' 
                      ? `使用积分兑换虚拟分（汇率: ${pointsToCurrencyRate} 积分 = 1 虚拟分）`
                      : `使用虚拟分兑换积分（汇率: 1 虚拟分 = ${currencyToPointsRate} 积分）`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-center mb-6">
                    <Button 
                      onClick={() => setExchangeMode('pointsToCurrency')}
                      variant={exchangeMode === 'pointsToCurrency' ? 'default' : 'outline'}
                      className="rounded-r-none"
                    >
                      积分 → 虚拟分
                    </Button>
                    <Button 
                      onClick={() => setExchangeMode('currencyToPoints')}
                      variant={exchangeMode === 'currencyToPoints' ? 'default' : 'outline'}
                      className="rounded-l-none"
                    >
                      虚拟分 → 积分
                    </Button>
                  </div>
                  <form onSubmit={handleExchange} className="space-y-4">
                    <div className="relative">
                      <Input
                        type="number"
                        placeholder={exchangeMode === 'pointsToCurrency' ? '输入要兑换的积分数量' : '输入要兑换的虚拟分数量'}
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="pr-20"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                        {exchangeMode === 'pointsToCurrency' ? '积分' : '虚拟分'}
                      </span>
                    </div>

                    {exchangeMode === 'pointsToCurrency' && (
                        <div className="space-y-2">
                            <p className="text-sm text-gray-500">快捷兑换：</p>
                            <div className="flex flex-wrap gap-2">
                                <QuickExchangeButton points={1000} />
                                <QuickExchangeButton points={10000} />
                                <QuickExchangeButton points={50000} />
                                <Button variant="outline" size="sm" onClick={() => handleQuickExchange(100000)} disabled={isLoading || profile.points < 100000}>
                                  <span className="font-bold">10w</span>万积分 → 1000分
                                </Button>
                            </div>
                        </div>
                    )}

                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? '处理中...' : '确认兑换'}
                    </Button>
                  </form>
                </CardContent>
                <CardFooter>
                    <p className="text-xs text-gray-500 text-center w-full">
                        {exchangeMode === 'pointsToCurrency' 
                          ? '兑换时将按整数虚拟分向下取整。'
                          : '虚拟分兑入积分可以享受更优汇率。'}
                      </p>
                </CardFooter>
              </Card>
            </TabsContent>
            <TabsContent value="mall" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center text-2xl font-bold text-gray-800">
                    <ShoppingCart className="mr-3 text-blue-500" />
                    积分商城
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <PointsMallEmbed />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </>
  );
};

export default PointsCenter;