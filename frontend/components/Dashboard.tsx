'use client';

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { 
  Search, Package, TrendingUp, AlertCircle, BarChart3, 
  Users, ShoppingCart, RefreshCw, Filter, Download,
  ChevronRight, Clock, DollarSign, Zap, MessageSquare,
  Settings, Bell, HelpCircle, Menu, X, ArrowUp, ArrowDown,
  Activity, Truck, Tag, Eye, Edit, Plus
} from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://35.226.177.85';

interface Product {
  sku: string;
  name: string;
  category: string;
  price: number | null;
  list_price?: number | null;
  in_stock: boolean;
  manufacturer?: string;
  availability?: string;
  confidence_score?: number;
}

interface Stats {
  total_products: number;
  in_stock: number;
  categories: number;
  out_of_stock?: number;
}

interface SalesMetric {
  label: string;
  value: string | number;
  change: number;
  trend: 'up' | 'down';
  icon?: any;
  color?: string;
}

// Utility functions
const formatCurrency = (value: number | null) => {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(value);
};

const formatNumber = (value: number) => {
  return new Intl.NumberFormat('en-US').format(value);
};

// Mock data for charts
const salesData = [
  { name: 'Mon', sales: 4200, orders: 24, profit: 1260 },
  { name: 'Tue', sales: 5300, orders: 31, profit: 1590 },
  { name: 'Wed', sales: 4800, orders: 28, profit: 1440 },
  { name: 'Thu', sales: 6200, orders: 37, profit: 1860 },
  { name: 'Fri', sales: 7100, orders: 42, profit: 2130 },
  { name: 'Sat', sales: 5900, orders: 35, profit: 1770 },
  { name: 'Sun', sales: 4500, orders: 26, profit: 1350 }
];

const categoryPerformance = [
  { category: 'Oven Parts', sales: 12500, units: 156 },
  { category: 'Refrigerator', sales: 9800, units: 98 },
  { category: 'Dishwasher', sales: 8200, units: 124 },
  { category: 'Washer Parts', sales: 7600, units: 89 },
  { category: 'Dryer Parts', sales: 6400, units: 72 },
];

export default function Dashboard() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [aiQuery, setAiQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [activeView, setActiveView] = useState<'grid' | 'table'>('table');
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  // AI states
  const [aiResponse, setAiResponse] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Fetch stats
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: async () => {
      try {
        const response = await axios.get(`${API_URL}/api/stats`);
        return response.data;
      } catch (error) {
        console.error('Error fetching stats:', error);
        // Return mock data for demo
        return {
          total_products: 24,
          in_stock: 18,
          categories: 6,
          out_of_stock: 6
        };
      }
    },
    refetchOnWindowFocus: false,
  });

  // Fetch products
  const { data: products = [], isLoading: productsLoading, refetch: refetchProducts } = useQuery<Product[]>({
    queryKey: ['products', selectedCategory],
    queryFn: async () => {
      try {
        const params = selectedCategory ? `?category=${selectedCategory}` : '';
        const response = await axios.get(`${API_URL}/api/products${params}`);
        return response.data;
      } catch (error) {
        console.error('Error fetching products:', error);
        // Return mock data for demo
        return [
          { sku: 'WP-001', name: 'Whirlpool Water Filter', category: 'Filters', price: 45.99, in_stock: true, manufacturer: 'Whirlpool' },
          { sku: 'GE-002', name: 'GE Oven Heating Element', category: 'Oven Parts', price: 89.99, in_stock: true, manufacturer: 'GE' },
          { sku: 'LG-003', name: 'LG Dishwasher Pump', category: 'Dishwasher Parts', price: 125.50, in_stock: false, manufacturer: 'LG' },
          { sku: 'SM-004', name: 'Samsung Dryer Belt', category: 'Dryer Parts', price: 32.99, in_stock: true, manufacturer: 'Samsung' },
          { sku: 'WP-005', name: 'Whirlpool Agitator', category: 'Washer Parts', price: 78.50, in_stock: true, manufacturer: 'Whirlpool' },
        ];
      }
    },
    refetchOnWindowFocus: false,
  });

  // Filter products
  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (product.manufacturer && product.manufacturer.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Pagination calculations
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentProducts = filteredProducts.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);

  // Pagination handlers
  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
    // Scroll to top of table
    const tableElement = document.querySelector('.overflow-x-auto');
    if (tableElement) {
      tableElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      handlePageChange(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      handlePageChange(currentPage + 1);
    }
  };

  // Generate page numbers with ellipsis
  const getPageNumbers = (): (number | string)[] => {
    const delta = 2;
    const range: number[] = [];
    const rangeWithDots: (number | string)[] = [];
    let l: number | undefined;

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
        range.push(i);
      }
    }

    range.forEach((i) => {
      if (l) {
        if (i - l === 2) {
          rangeWithDots.push(l + 1);
        } else if (i - l !== 1) {
          rangeWithDots.push('...');
        }
      }
      rangeWithDots.push(i);
      l = i;
    });

    return rangeWithDots;
  };

  // Reset to page 1 when search or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory]);

  // Sales metrics
  const salesMetrics: SalesMetric[] = [
    { label: 'Today\'s Revenue', value: '$3,247', change: 12.5, trend: 'up', icon: DollarSign, color: 'green' },
    { label: 'Orders Today', value: '42', change: -2.1, trend: 'down', icon: ShoppingCart, color: 'blue' },
    { label: 'Avg Order Value', value: '$156', change: 8.7, trend: 'up', icon: TrendingUp, color: 'purple' },
    { label: 'Conversion Rate', value: '24.3%', change: 15.2, trend: 'up', icon: Activity, color: 'orange' }
  ];

  const handleRefresh = () => {
    refetchStats();
    refetchProducts();
  };

  // AI Query Handler
  const handleAIQuery = async () => {
    if (aiQuery.trim()) {
      setAiLoading(true);
      try {
        const response = await fetch('/api/ai', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: aiQuery }),
        });
        
        const data = await response.json();
        console.log('AI Response:', data);
        
        // Store the AI response
        setAiResponse(data);
        
        // If AI found products, update the search
        if (data.recommendedProducts && data.recommendedProducts.length > 0) {
          setSearchTerm(aiQuery);
        }
        
        // Clear the query
        setAiQuery('');
      } catch (error) {
        console.error('AI Query failed:', error);
        // Fallback to basic search
        setSearchTerm(aiQuery);
        setAiQuery('');
      } finally {
        setAiLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 transform transition-transform duration-200 lg:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex items-center justify-between h-16 px-6 bg-gray-800">
          <div className="flex items-center">
            <Package className="h-8 w-8 text-blue-400 mr-2" />
            <span className="text-white font-bold">ReliableParts AI</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-gray-400 hover:text-white"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        
        <nav className="mt-8 px-4">
          <div className="space-y-2">
            <a href="#" className="flex items-center px-4 py-2 text-white bg-blue-600 rounded-lg">
              <BarChart3 className="h-5 w-5 mr-3" />
              Dashboard
            </a>
            <a href="#" className="flex items-center px-4 py-2 text-gray-300 hover:bg-gray-800 rounded-lg">
              <Package className="h-5 w-5 mr-3" />
              Products
            </a>
            <a href="#" className="flex items-center px-4 py-2 text-gray-300 hover:bg-gray-800 rounded-lg">
              <ShoppingCart className="h-5 w-5 mr-3" />
              Orders
            </a>
            <a href="#" className="flex items-center px-4 py-2 text-gray-300 hover:bg-gray-800 rounded-lg">
              <Users className="h-5 w-5 mr-3" />
              Customers
            </a>
            <a href="#" className="flex items-center px-4 py-2 text-gray-300 hover:bg-gray-800 rounded-lg">
              <MessageSquare className="h-5 w-5 mr-3" />
              AI Assistant
            </a>
            <a href="#" className="flex items-center px-4 py-2 text-gray-300 hover:bg-gray-800 rounded-lg">
              <Activity className="h-5 w-5 mr-3" />
              Analytics
            </a>
          </div>
          
          <div className="mt-8 pt-8 border-t border-gray-700">
            <a href="#" className="flex items-center px-4 py-2 text-gray-300 hover:bg-gray-800 rounded-lg">
              <Settings className="h-5 w-5 mr-3" />
              Settings
            </a>
            <a href="#" className="flex items-center px-4 py-2 text-gray-300 hover:bg-gray-800 rounded-lg">
              <HelpCircle className="h-5 w-5 mr-3" />
              Help
            </a>
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 lg:ml-64">
        {/* Header */}
        <header className="bg-white shadow-sm border-b sticky top-0 z-40">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="lg:hidden text-gray-600 hover:text-gray-900 mr-4"
                >
                  <Menu className="h-6 w-6" />
                </button>
                <h1 className="text-xl font-semibold text-gray-900">Sales Dashboard</h1>
              </div>
              
              <div className="flex items-center space-x-4">
                <button className="relative p-2 text-gray-600 hover:text-gray-900">
                  <Bell className="h-5 w-5" />
                  <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full"></span>
                </button>
                <button
                  onClick={handleRefresh}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  <RefreshCw className={`h-4 w-4 ${statsLoading || productsLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Dashboard Content */}
        <main className="p-4 sm:p-6 lg:p-8">
          {/* Sales Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {salesMetrics.map((metric, index) => {
              const Icon = metric.icon;
              return (
                <div key={index} className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center">
                      <Icon className={`h-5 w-5 text-${metric.color}-500 mr-2`} />
                      <p className="text-sm text-gray-600">{metric.label}</p>
                    </div>
                    <span className={`flex items-center text-sm font-medium ${
                      metric.trend === 'up' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {metric.trend === 'up' ? <ArrowUp className="h-3 w-3 mr-1" /> : <ArrowDown className="h-3 w-3 mr-1" />}
                      {Math.abs(metric.change)}%
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{metric.value}</p>
                </div>
              );
            })}
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg shadow p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100">Total Products</p>
                  <p className="text-3xl font-bold">
                    {statsLoading ? '...' : formatNumber(stats?.total_products || 0)}
                  </p>
                </div>
                <Package className="h-12 w-12 text-blue-200" />
              </div>
            </div>

            <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg shadow p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100">In Stock</p>
                  <p className="text-3xl font-bold">
                    {statsLoading ? '...' : formatNumber(stats?.in_stock || 0)}
                  </p>
                </div>
                <TrendingUp className="h-12 w-12 text-green-200" />
              </div>
            </div>

            <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg shadow p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100">Categories</p>
                  <p className="text-3xl font-bold">
                    {statsLoading ? '...' : formatNumber(stats?.categories || 0)}
                  </p>
                </div>
                <Tag className="h-12 w-12 text-purple-200" />
              </div>
            </div>

            <div className="bg-gradient-to-r from-red-500 to-red-600 rounded-lg shadow p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-red-100">Out of Stock</p>
                  <p className="text-3xl font-bold">
                    {statsLoading ? '...' : 
                      formatNumber((stats?.total_products || 0) - (stats?.in_stock || 0))}
                  </p>
                </div>
                <AlertCircle className="h-12 w-12 text-red-200" />
              </div>
            </div>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Sales Trend Chart */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Weekly Sales Trend</h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={salesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Legend />
                  <Line type="monotone" dataKey="sales" stroke="#3b82f6" name="Sales" strokeWidth={2} />
                  <Line type="monotone" dataKey="profit" stroke="#10b981" name="Profit" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Category Performance */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Category Performance</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={categoryPerformance}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="category" angle={-45} textAnchor="end" height={80} />
                  <YAxis />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Bar dataKey="sales" fill="#8b5cf6" name="Sales" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* AI Assistant Card */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg shadow-lg p-6 text-white mb-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-xl font-bold mb-4 flex items-center">
                  <Zap className="h-6 w-6 mr-2" />
                  AI Sales Assistant
                </h3>
                <div className="bg-white/10 backdrop-blur rounded-lg p-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Ask me anything... e.g., 'Show dishwasher pumps under $100' or 'What Whirlpool parts are in stock?'"
                      className="flex-1 bg-transparent text-white placeholder-white/70 outline-none"
                      value={aiQuery}
                      onChange={(e) => setAiQuery(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleAIQuery();
                        }
                      }}
                    />
                    <button 
                      onClick={handleAIQuery}
                      disabled={aiLoading}
                      className={`px-4 py-1 rounded transition ${
                        aiLoading 
                          ? 'bg-white/10 cursor-not-allowed' 
                          : 'bg-white/20 hover:bg-white/30'
                      }`}
                    >
                      {aiLoading ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        'Search'
                      )}
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button 
                    onClick={() => setAiQuery('Show best selling oven parts')}
                    className="text-xs bg-white/20 px-2 py-1 rounded hover:bg-white/30 transition"
                  >
                    Try: "Best selling oven parts"
                  </button>
                  <button 
                    onClick={() => setAiQuery('GE refrigerator parts')}
                    className="text-xs bg-white/20 px-2 py-1 rounded hover:bg-white/30 transition"
                  >
                    Try: "GE refrigerator parts"
                  </button>
                  <button 
                    onClick={() => setAiQuery('Parts with highest profit margin')}
                    className="text-xs bg-white/20 px-2 py-1 rounded hover:bg-white/30 transition"
                  >
                    Try: "High margin parts"
                  </button>
                </div>
              </div>
              <MessageSquare className="h-8 w-8 text-white/50 ml-4" />
            </div>
          </div>

          {/* AI Response Display */}
          {aiResponse && (
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg shadow-lg p-6 mb-6 border-l-4 border-indigo-500">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <MessageSquare className="h-5 w-5 mr-2 text-indigo-600" />
                  AI Assistant Response
                </h3>
                <button 
                  onClick={() => setAiResponse(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              {/* AI Answer */}
              <div className="mb-4">
                <p className="text-gray-700">{aiResponse.answer || 'Processing your request...'}</p>
              </div>
              
              {/* Recommended Products */}
              {aiResponse.recommendedProducts && aiResponse.recommendedProducts.length > 0 && (
                <div className="mb-4">
                  <h4 className="font-medium text-gray-900 mb-2">Recommended Products:</h4>
                  <div className="space-y-2">
                    {aiResponse.recommendedProducts.map((product: any, index: number) => (
                      <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                        <div>
                          <span className="font-medium">{product.name}</span>
                          <span className="text-sm text-gray-500 ml-2">SKU: {product.sku}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-green-600">
                            {product.price ? `$${product.price}` : 'Price N/A'}
                          </span>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            product.in_stock ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {product.in_stock ? 'In Stock' : 'Out of Stock'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Related Suggestions */}
              {aiResponse.relatedSuggestions && aiResponse.relatedSuggestions.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Related Suggestions:</h4>
                  <div className="flex flex-wrap gap-2">
                    {aiResponse.relatedSuggestions.map((suggestion: string, index: number) => (
                      <span key={index} className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm">
                        {suggestion}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Search and Filters */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                  <input
                    type="text"
                    placeholder="Search products by name, SKU, or manufacturer..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="flex gap-2">
                <select
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  <option value="">All Categories</option>
                  <option value="Oven Parts">Oven Parts</option>
                  <option value="Refrigerator Parts">Refrigerator Parts</option>
                  <option value="Dishwasher Parts">Dishwasher Parts</option>
                  <option value="Washer Parts">Washer Parts</option>
                  <option value="Dryer Parts">Dryer Parts</option>
                  <option value="Filters">Filters</option>
                </select>
                
                <select
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(parseInt(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  <option value="10">10 per page</option>
                  <option value="20">20 per page</option>
                  <option value="50">50 per page</option>
                  <option value="100">100 per page</option>
                </select>
                
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                >
                  <Filter className="h-4 w-4" />
                  Filters
                </button>
                
                <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Export
                </button>
              </div>
            </div>

            {/* Advanced Filters */}
            {showFilters && (
              <div className="mt-4 pt-4 border-t grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price Range</label>
                  <div className="flex gap-2">
                    <input type="number" placeholder="Min" className="w-1/2 px-3 py-1 border rounded" />
                    <input type="number" placeholder="Max" className="w-1/2 px-3 py-1 border rounded" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Availability</label>
                  <select className="w-full px-3 py-1 border rounded">
                    <option value="">All</option>
                    <option value="in_stock">In Stock Only</option>
                    <option value="out_of_stock">Out of Stock</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturer</label>
                  <select className="w-full px-3 py-1 border rounded">
                    <option value="">All Brands</option>
                    <option value="whirlpool">Whirlpool</option>
                    <option value="ge">GE</option>
                    <option value="lg">LG</option>
                    <option value="samsung">Samsung</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Products Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900">Products Inventory</h2>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500">
                  Showing {filteredProducts.length} of {products.length} products
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setActiveView('grid')}
                    className={`p-2 rounded ${activeView === 'grid' ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setActiveView('table')}
                    className={`p-2 rounded ${activeView === 'table' ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            
            {activeView === 'table' ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        SKU
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Product Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Category
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Price
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Margin
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {productsLoading ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                          <div className="flex justify-center items-center">
                            <RefreshCw className="h-5 w-5 animate-spin mr-2" />
                            Loading products...
                          </div>
                        </td>
                      </tr>
                    ) : filteredProducts.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                          No products found
                        </td>
                      </tr>
                    ) : (
                      currentProducts.map((product) => (
                        <tr key={product.sku} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {product.sku}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            <div>
                              <div className="font-medium">{product.name}</div>
                              {product.manufacturer && (
                                <div className="text-xs text-gray-500">{product.manufacturer}</div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {product.category || 'Uncategorized'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <div>
                              <div className="font-medium">{formatCurrency(product.price)}</div>
                              {product.list_price && product.list_price > (product.price || 0) && (
                                <div className="text-xs text-gray-500 line-through">
                                  {formatCurrency(product.list_price)}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <span className="text-green-600 font-medium">32%</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              product.in_stock
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {product.in_stock ? 'In Stock' : 'Out of Stock'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <button 
                              onClick={() => setSelectedProduct(product)}
                              className="text-blue-600 hover:text-blue-900 mr-3"
                            >
                              <Eye className="h-4 w-4 inline" />
                            </button>
                            <button className="text-gray-600 hover:text-gray-900">
                              <Edit className="h-4 w-4 inline" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {currentProducts.map((product) => (
                  <div key={product.sku} className="bg-white border rounded-lg p-4 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setSelectedProduct(product)}>
                    <div className="aspect-w-1 aspect-h-1 bg-gray-200 rounded-lg mb-3">
                      <div className="flex items-center justify-center h-32">
                        <Package className="h-16 w-16 text-gray-400" />
                      </div>
                    </div>
                    <h3 className="font-semibold text-sm text-gray-900 mb-1 line-clamp-2">{product.name}</h3>
                    <p className="text-xs text-gray-500 mb-2">{product.sku}</p>
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-bold text-gray-900">{formatCurrency(product.price)}</span>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        product.in_stock ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {product.in_stock ? 'In Stock' : 'Out'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {filteredProducts.length > 0 && (
              <div className="px-6 py-3 border-t flex items-center justify-between bg-white">
                <div className="text-sm text-gray-700">
                  {filteredProducts.length === 0 ? (
                    'No results found'
                  ) : (
                    <>
                      Showing <span className="font-medium">{indexOfFirstItem + 1}</span> to{' '}
                      <span className="font-medium">
                        {Math.min(indexOfLastItem, filteredProducts.length)}
                      </span>{' '}
                      of <span className="font-medium">{filteredProducts.length}</span> results
                    </>
                  )}
                </div>
                
                {totalPages > 1 && (
                  <div className="flex items-center space-x-1">
                    {/* Previous Button */}
                    <button
                      onClick={handlePreviousPage}
                      disabled={currentPage === 1}
                      className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                        currentPage === 1
                          ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400 cursor-pointer'
                      }`}
                      aria-label="Previous page"
                    >
                      Previous
                    </button>

                    {/* Page Numbers */}
                    <div className="flex items-center space-x-1">
                      {getPageNumbers().map((number, index) => (
                        <React.Fragment key={index}>
                          {number === '...' ? (
                            <span className="px-2 py-1 text-gray-500">⋯</span>
                          ) : (
                            <button
                              onClick={() => handlePageChange(number as number)}
                              className={`min-w-[32px] px-2 py-1.5 text-sm rounded-md border transition-colors ${
                                currentPage === number
                                  ? 'bg-blue-600 text-white border-blue-600 font-medium'
                                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                              }`}
                              aria-label={`Go to page ${number}`}
                              aria-current={currentPage === number ? 'page' : undefined}
                            >
                              {number}
                            </button>
                          )}
                        </React.Fragment>
                      ))}
                    </div>

                    {/* Next Button */}
                    <button
                      onClick={handleNextPage}
                      disabled={currentPage === totalPages}
                      className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                        currentPage === totalPages
                          ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400 cursor-pointer'
                      }`}
                      aria-label="Next page"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
              <h3 className="font-semibold text-gray-900 mb-2">Low Stock Alert</h3>
              <p className="text-sm text-gray-600">3 products need reordering</p>
              <button className="mt-2 text-blue-600 text-sm font-medium hover:text-blue-700">
                View Items →
              </button>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
              <h3 className="font-semibold text-gray-900 mb-2">Top Performer</h3>
              <p className="text-sm text-gray-600">WP Water Filter - 142 units sold</p>
              <button className="mt-2 text-green-600 text-sm font-medium hover:text-green-700">
                View Details →
              </button>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4 border-l-4 border-purple-500">
              <h3 className="font-semibold text-gray-900 mb-2">Price Updates</h3>
              <p className="text-sm text-gray-600">5 competitor price changes detected</p>
              <button className="mt-2 text-purple-600 text-sm font-medium hover:text-purple-700">
                Review Changes →
              </button>
            </div>
          </div>
        </main>
      </div>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl font-bold text-gray-900">{selectedProduct.name}</h2>
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-sm text-gray-600">SKU</p>
                  <p className="font-medium">{selectedProduct.sku}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Category</p>
                  <p className="font-medium">{selectedProduct.category}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Price</p>
                  <p className="font-medium text-lg">{formatCurrency(selectedProduct.price)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Status</p>
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    selectedProduct.in_stock
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {selectedProduct.in_stock ? 'In Stock' : 'Out of Stock'}
                  </span>
                </div>
              </div>
              
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-2">AI Recommendations</h3>
                <div className="space-y-2">
                  <div className="flex items-center text-sm">
                    <ChevronRight className="h-4 w-4 text-blue-500 mr-2" />
                    <span>Cross-sell: Customers also bought installation kit (+$12.99)</span>
                  </div>
                  <div className="flex items-center text-sm">
                    <ChevronRight className="h-4 w-4 text-green-500 mr-2" />
                    <span>High margin item (32%) - prioritize in recommendations</span>
                  </div>
                  <div className="flex items-center text-sm">
                    <ChevronRight className="h-4 w-4 text-purple-500 mr-2" />
                    <span>Compatible with 15 popular models</span>
                  </div>
                </div>
              </div>
              
              <div className="mt-6 flex gap-2">
                <button className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center justify-center">
                  <Plus className="h-4 w-4 mr-2" />
                  Add to Quote
                </button>
                <button 
                  onClick={() => setSelectedProduct(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}