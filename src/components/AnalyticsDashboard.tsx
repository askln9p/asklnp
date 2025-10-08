import React, { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, Users, Gift, DollarSign, Target,
  Calendar, ArrowUpRight, ArrowDownRight, RefreshCw, AlertCircle,
  BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import LoadingBar from './LoadingBar';

interface MonthlyMetrics {
  month: string;
  year: number;
  customerCount: number;
  customerGrowth: number;
  newCustomers: number;
  returningCustomers: number;
  revenue: number;
  revenueGrowth: number;
  pointsIssued: number;
  pointsIssuedGrowth: number;
  pointsRedeemed: number;
  pointsRedeemedGrowth: number;
  rewardsRedeemed: number;
  rewardsRedeemedGrowth: number;
  averageOrderValue: number;
  aovGrowth: number;
  retentionRate: number;
  retentionGrowth: number;
}

interface ComparisonMetrics {
  current: number;
  previous: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'neutral';
}

const AnalyticsDashboard: React.FC = () => {
  const { restaurant } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyMetrics[]>([]);
  const [timeRange, setTimeRange] = useState<'6m' | '12m' | 'all'>('12m');

  useEffect(() => {
    if (restaurant) {
      fetchAnalytics();
    }
  }, [restaurant, timeRange]);

  const fetchAnalytics = async () => {
    if (!restaurant) return;

    try {
      setLoading(true);
      setError(null);

      const monthsToFetch = timeRange === '6m' ? 6 : timeRange === '12m' ? 12 : 24;
      const months: MonthlyMetrics[] = [];

      for (let i = monthsToFetch - 1; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
        const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);

        const prevMonthStart = new Date(date.getFullYear(), date.getMonth() - 1, 1);
        const prevMonthEnd = new Date(date.getFullYear(), date.getMonth(), 0, 23, 59, 59);

        const [currentMetrics, previousMetrics] = await Promise.all([
          getMonthMetrics(restaurant.id, monthStart, monthEnd),
          i > 0 ? getMonthMetrics(restaurant.id, prevMonthStart, prevMonthEnd) : null
        ]);

        const calculateGrowth = (current: number, previous: number | null) => {
          if (!previous || previous === 0) return 0;
          return ((current - previous) / previous) * 100;
        };

        months.push({
          month: date.toLocaleDateString('en-US', { month: 'short' }),
          year: date.getFullYear(),
          customerCount: currentMetrics.customers,
          customerGrowth: calculateGrowth(currentMetrics.customers, previousMetrics?.customers || null),
          newCustomers: currentMetrics.newCustomers,
          returningCustomers: currentMetrics.returningCustomers,
          revenue: currentMetrics.revenue,
          revenueGrowth: calculateGrowth(currentMetrics.revenue, previousMetrics?.revenue || null),
          pointsIssued: currentMetrics.pointsIssued,
          pointsIssuedGrowth: calculateGrowth(currentMetrics.pointsIssued, previousMetrics?.pointsIssued || null),
          pointsRedeemed: currentMetrics.pointsRedeemed,
          pointsRedeemedGrowth: calculateGrowth(currentMetrics.pointsRedeemed, previousMetrics?.pointsRedeemed || null),
          rewardsRedeemed: currentMetrics.rewardsRedeemed,
          rewardsRedeemedGrowth: calculateGrowth(currentMetrics.rewardsRedeemed, previousMetrics?.rewardsRedeemed || null),
          averageOrderValue: currentMetrics.averageOrderValue,
          aovGrowth: calculateGrowth(currentMetrics.averageOrderValue, previousMetrics?.averageOrderValue || null),
          retentionRate: currentMetrics.retentionRate,
          retentionGrowth: calculateGrowth(currentMetrics.retentionRate, previousMetrics?.retentionRate || null)
        });
      }

      setMonthlyData(months);
    } catch (err: any) {
      console.error('Error fetching analytics:', err);
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const getMonthMetrics = async (restaurantId: string, start: Date, end: Date) => {
    const { data: customers, error: customersError } = await supabase
      .from('customers')
      .select('created_at, total_spent, visit_count')
      .eq('restaurant_id', restaurantId)
      .lte('created_at', end.toISOString());

    if (customersError) throw customersError;

    const monthCustomers = customers.filter(c => new Date(c.created_at) >= start && new Date(c.created_at) <= end);
    const allActiveCustomers = customers.filter(c => new Date(c.created_at) <= end);

    const { data: transactions, error: transError } = await supabase
      .from('transactions')
      .select('type, points, created_at')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    if (transError) throw transError;

    const { data: redemptions, error: redError } = await supabase
      .from('reward_redemptions')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    if (redError) throw redError;

    const revenue = allActiveCustomers.reduce((sum, c) => sum + c.total_spent, 0);
    const pointsIssued = transactions.filter(t => t.type === 'earn' && t.points > 0).reduce((sum, t) => sum + t.points, 0);
    const pointsRedeemed = transactions.filter(t => t.type === 'redemption').reduce((sum, t) => sum + Math.abs(t.points), 0);
    const totalOrders = allActiveCustomers.reduce((sum, c) => sum + c.visit_count, 0);
    const returningCustomers = allActiveCustomers.filter(c => c.visit_count > 1).length;

    return {
      customers: allActiveCustomers.length,
      newCustomers: monthCustomers.length,
      returningCustomers,
      revenue,
      pointsIssued,
      pointsRedeemed,
      rewardsRedeemed: redemptions.length,
      averageOrderValue: totalOrders > 0 ? revenue / totalOrders : 0,
      retentionRate: allActiveCustomers.length > 0 ? (returningCustomers / allActiveCustomers.length) * 100 : 0
    };
  };

  const getComparison = (data: MonthlyMetrics[], key: keyof MonthlyMetrics): ComparisonMetrics => {
    if (data.length < 2) {
      return { current: 0, previous: 0, change: 0, changePercent: 0, trend: 'neutral' };
    }

    const current = Number(data[data.length - 1][key]);
    const previous = Number(data[data.length - 2][key]);
    const change = current - previous;
    const changePercent = previous !== 0 ? (change / previous) * 100 : 0;
    const trend = change > 0 ? 'up' : change < 0 ? 'down' : 'neutral';

    return { current, previous, change, changePercent, trend };
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US').format(Math.round(value));
  };

  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  const MetricCard: React.FC<{
    title: string;
    icon: React.ElementType;
    comparison: ComparisonMetrics;
    format: 'currency' | 'number' | 'percent';
    iconColor: string;
  }> = ({ title, icon: Icon, comparison, format, iconColor }) => {
    const formattedCurrent =
      format === 'currency' ? formatCurrency(comparison.current) :
      format === 'percent' ? `${comparison.current.toFixed(1)}%` :
      formatNumber(comparison.current);

    const TrendIcon = comparison.trend === 'up' ? ArrowUpRight : ArrowDownRight;
    const trendColor = comparison.trend === 'up' ? 'text-green-600' : comparison.trend === 'down' ? 'text-red-600' : 'text-gray-600';
    const bgColor = comparison.trend === 'up' ? 'bg-green-50' : comparison.trend === 'down' ? 'bg-red-50' : 'bg-gray-50';

    return (
      <div className="bg-white rounded-2xl p-6 border border-gray-200 hover:shadow-lg transition-all duration-300">
        <div className="flex items-start justify-between mb-4">
          <div className={`w-12 h-12 ${iconColor} rounded-xl flex items-center justify-center`}>
            <Icon className="h-6 w-6 text-white" />
          </div>
          <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${trendColor} ${bgColor}`}>
            <TrendIcon className="h-3 w-3" />
            {formatPercent(comparison.changePercent)}
          </div>
        </div>
        <h3 className="text-sm font-medium text-gray-600 mb-1">{title}</h3>
        <p className="text-3xl font-bold text-gray-900 mb-2">{formattedCurrent}</p>
        <p className="text-xs text-gray-500">vs previous month: {format === 'currency' ? formatCurrency(comparison.previous) : formatNumber(comparison.previous)}</p>
      </div>
    );
  };

  if (loading) {
    return (
      <>
        <LoadingBar isLoading={loading} />
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-64"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-48 bg-gray-200 rounded-2xl"></div>
            ))}
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Unable to Load Analytics</h2>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={fetchAnalytics}
            className="px-6 py-3 bg-gradient-to-r from-[#E6A85C] via-[#E85A9B] to-[#D946EF] text-white rounded-lg hover:shadow-lg transition-all flex items-center gap-2 mx-auto"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const customerComparison = getComparison(monthlyData, 'customerCount');
  const revenueComparison = getComparison(monthlyData, 'revenue');
  const pointsIssuedComparison = getComparison(monthlyData, 'pointsIssued');
  const pointsRedeemedComparison = getComparison(monthlyData, 'pointsRedeemed');
  const rewardsComparison = getComparison(monthlyData, 'rewardsRedeemed');
  const aovComparison = getComparison(monthlyData, 'averageOrderValue');
  const retentionComparison = getComparison(monthlyData, 'retentionRate');

  return (
    <>
      <LoadingBar isLoading={loading} />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
            <p className="text-gray-600">Comprehensive metrics and month-over-month growth</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as any)}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#E85A9B] focus:border-transparent"
            >
              <option value="6m">Last 6 Months</option>
              <option value="12m">Last 12 Months</option>
              <option value="all">All Time</option>
            </select>
            <button
              onClick={fetchAnalytics}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard
            title="Total Customers"
            icon={Users}
            comparison={customerComparison}
            format="number"
            iconColor="bg-gradient-to-br from-blue-500 to-blue-600"
          />
          <MetricCard
            title="Revenue"
            icon={DollarSign}
            comparison={revenueComparison}
            format="currency"
            iconColor="bg-gradient-to-br from-green-500 to-green-600"
          />
          <MetricCard
            title="Points Issued"
            icon={TrendingUp}
            comparison={pointsIssuedComparison}
            format="number"
            iconColor="bg-gradient-to-br from-[#E6A85C] to-[#E85A9B]"
          />
          <MetricCard
            title="Rewards Redeemed"
            icon={Gift}
            comparison={rewardsComparison}
            format="number"
            iconColor="bg-gradient-to-br from-[#E85A9B] to-[#D946EF]"
          />
          <MetricCard
            title="Points Redeemed"
            icon={Target}
            comparison={pointsRedeemedComparison}
            format="number"
            iconColor="bg-gradient-to-br from-orange-500 to-orange-600"
          />
          <MetricCard
            title="Avg Order Value"
            icon={BarChart3}
            comparison={aovComparison}
            format="currency"
            iconColor="bg-gradient-to-br from-teal-500 to-teal-600"
          />
          <MetricCard
            title="Retention Rate"
            icon={Users}
            comparison={retentionComparison}
            format="percent"
            iconColor="bg-gradient-to-br from-purple-500 to-purple-600"
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Customer Growth</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyData}>
                  <defs>
                    <linearGradient id="colorCustomers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="customerCount"
                    stroke="#3B82F6"
                    fillOpacity={1}
                    fill="url(#colorCustomers)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Trend</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyData}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `$${value}`} />
                  <Tooltip formatter={(value: any) => formatCurrency(value)} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#10B981"
                    fillOpacity={1}
                    fill="url(#colorRevenue)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Points Activity</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="pointsIssued" fill="#E6A85C" name="Points Issued" radius={[4, 4, 0, 0]} />
                <Bar dataKey="pointsRedeemed" fill="#E85A9B" name="Points Redeemed" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">New vs Returning Customers</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="newCustomers" fill="#3B82F6" name="New Customers" radius={[4, 4, 0, 0]} />
                <Bar dataKey="returningCustomers" fill="#8B5CF6" name="Returning Customers" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </>
  );
};

export default AnalyticsDashboard;
