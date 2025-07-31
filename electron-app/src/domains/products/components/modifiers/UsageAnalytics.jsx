
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import {
  BarChart3,
  TrendingUp,
  Users,
  ShoppingBag,
  Eye,
  AlertTriangle,
  CheckCircle
} from "lucide-react";
import { useToast } from "@/shared/components/ui/use-toast";
import * as modifierService from "@/domains/products/services/modifierService";

const UsageAnalytics = ({ modifierSets }) => {
  const [analytics, setAnalytics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (modifierSets.length > 0) {
      fetchAnalytics();
    }
  }, [modifierSets]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const analyticsPromises = modifierSets.map(async (modifierSet) => {
        try {
          // Get usage data for each modifier set
          const usageResponse = await modifierService.getModifierSetUsage(modifierSet.id);
          const productsResponse = await modifierService.getProductsUsingModifierSet(modifierSet.id);
          
          return {
            ...modifierSet,
            usage: usageResponse.data || {},
            products: productsResponse.data || [],
            product_count: usageResponse.data?.product_count || productsResponse.data?.length || modifierSet.product_count || 0,
            usage_level: usageResponse.data?.usage_level || 'unused',
            is_used: usageResponse.data?.is_used || false
          };
        } catch (error) {
          // If analytics endpoints don't exist or fail, use fallback data
          console.warn(`Analytics not available for modifier set ${modifierSet.id}:`, error);
          return {
            ...modifierSet,
            usage: {},
            products: [],
            product_count: modifierSet.product_count || 0,
            usage_level: (modifierSet.product_count || 0) === 0 ? 'unused' : 'medium',
            is_used: (modifierSet.product_count || 0) > 0
          };
        }
      });

      const results = await Promise.all(analyticsPromises);
      setAnalytics(results);
    } catch (error) {
      console.error('Error fetching analytics:', error);
      // Fallback to basic data from modifierSets
      setAnalytics(modifierSets.map(set => ({
        ...set,
        usage: {},
        products: [],
        product_count: set.product_count || 0,
        usage_level: (set.product_count || 0) === 0 ? 'unused' : 'medium',
        is_used: (set.product_count || 0) > 0
      })));
    } finally {
      setLoading(false);
    }
  };

  const filteredAnalytics = analytics.filter(item => 
    !searchTerm || item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getUsageLevel = (productCount) => {
    if (productCount === 0) return { level: 'unused', color: 'text-red-600', icon: AlertTriangle };
    if (productCount <= 3) return { level: 'low', color: 'text-yellow-600', icon: TrendingUp };
    if (productCount <= 10) return { level: 'medium', color: 'text-blue-600', icon: BarChart3 };
    return { level: 'high', color: 'text-green-600', icon: CheckCircle };
  };

  const getUsageBadge = (productCount) => {
    const { level, color } = getUsageLevel(productCount);
    return (
      <Badge 
        variant="outline" 
        className={`${color} border-current`}
      >
        {level === 'unused' ? 'Unused' : 
         level === 'low' ? 'Low Usage' : 
         level === 'medium' ? 'Medium Usage' : 'High Usage'}
      </Badge>
    );
  };

  const totalModifierSets = analytics.length;
  const unusedSets = analytics.filter(item => item.product_count === 0).length;
  const averageProductsPerSet = totalModifierSets > 0 
    ? (analytics.reduce((sum, item) => sum + item.product_count, 0) / totalModifierSets).toFixed(1)
    : 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Modifier Sets</CardTitle>
            <BarChart3 className="h-4 w-4 text-gray-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalModifierSets}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unused Sets</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{unusedSets}</div>
            {totalModifierSets > 0 && (
              <p className="text-xs text-gray-500">
                {((unusedSets / totalModifierSets) * 100).toFixed(1)}% of total
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Products/Set</CardTitle>
            <ShoppingBag className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{averageProductsPerSet}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Sets</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {totalModifierSets - unusedSets}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Unused Modifier Sets Alert */}
      {unusedSets > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-orange-800 text-base">
              <AlertTriangle className="h-4 w-4" />
              Unused Modifier Sets
            </CardTitle>
            <CardDescription className="text-orange-700 text-sm">
              {unusedSets} modifier set{unusedSets !== 1 ? 's' : ''} not being used by any products.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-1">
              {analytics
                .filter(item => item.product_count === 0)
                .slice(0, 3)
                .map((item) => (
                  <Badge key={item.id} variant="outline" className="text-orange-700 border-orange-300 text-xs">
                    {item.name}
                  </Badge>
                ))}
              {unusedSets > 3 && (
                <Badge variant="outline" className="text-orange-700 border-orange-300 text-xs">
                  +{unusedSets - 3} more
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search and Analytics Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Modifier Set Usage Analytics
              </CardTitle>
              <CardDescription>
                Detailed usage statistics for each modifier set
              </CardDescription>
            </div>
            <div className="w-64">
              <Input
                placeholder="Search modifier sets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
              <p className="text-sm text-gray-500">Loading analytics...</p>
            </div>
          ) : (
            <div className="max-h-[600px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-white z-10 border-b">
                  <TableRow>
                    <TableHead>Modifier Set</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Options</TableHead>
                    <TableHead>Products Using</TableHead>
                    <TableHead>Usage Level</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAnalytics.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                        {searchTerm ? 'No modifier sets match your search' : 'No modifier sets available'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAnalytics.map((item) => {
                      const { color, icon: Icon } = getUsageLevel(item.product_count);
                      
                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{item.name}</div>
                              <div className="text-sm text-gray-500">{item.internal_name}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {item.selection_type === 'SINGLE' ? '○ Single' : '☑ Multiple'}
                              {item.min_selections > 0 && ' • Required'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <span>{item.options?.length || 0}</span>
                              {item.options && item.options.length > 0 && (
                                <div className="flex gap-1 ml-2">
                                  {item.options.slice(0, 2).map((option, idx) => (
                                    <Badge key={idx} variant="secondary" className="text-xs">
                                      {option.name}
                                    </Badge>
                                  ))}
                                  {item.options.length > 2 && (
                                    <Badge variant="secondary" className="text-xs">
                                      +{item.options.length - 2}
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Icon className={`h-4 w-4 ${color}`} />
                              <span className="font-medium">{item.product_count}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {getUsageBadge(item.product_count)}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  if (item.products && item.products.length > 0) {
                                    // Navigate to products page with modifier filter
                                    navigate(`/products?modifier=${item.id}&modifierName=${encodeURIComponent(item.name)}&from=modifiers`);
                                  } else {
                                    toast({
                                      title: "No Products Found",
                                      description: `No products are currently using "${item.name}".`,
                                      variant: "destructive"
                                    });
                                  }
                                }}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                View Products
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default UsageAnalytics;
