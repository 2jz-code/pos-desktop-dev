import { useState, useEffect, useCallback } from 'react';
import { useOnlineStatus } from './useOnlineStatus';

/**
 * Hook to get orders with offline support
 *
 * When online: Fetches from API
 * When offline: Shows only orders created during offline session (from local DB)
 *
 * @param {Function} fetchOrdersFn - API function to fetch orders
 * @param {Object} filters - Filter parameters for API call
 * @returns {Object} { orders, loading, error, isFromCache, refetch }
 */
export function useOfflineOrders(fetchOrdersFn, filters = {}) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFromCache, setIsFromCache] = useState(false);
  const [pagination, setPagination] = useState({
    count: 0,
    nextUrl: null,
    prevUrl: null,
    currentPage: 1
  });

  const isOnline = useOnlineStatus();

  const fetchOrders = useCallback(async (url = null) => {
    setLoading(true);
    setError(null);

    try {
      if (isOnline) {
        // Online: fetch from API
        const response = await fetchOrdersFn(filters, url);
        const data = response.data || response;

        setOrders(data.results || data || []);
        setPagination({
          count: data.count || 0,
          nextUrl: data.next || null,
          prevUrl: data.previous || null,
          currentPage: url ? pagination.currentPage : 1
        });
        setIsFromCache(false);
      } else {
        // Offline: fetch from local DB
        if (window.offlineAPI?.listOfflineOrders) {
          console.log('📴 [Orders] Fetching offline orders from local DB');
          const offlineOrders = await window.offlineAPI.listOfflineOrders();

          // Transform offline orders to match API format
          const transformedOrders = offlineOrders.map(order => ({
            id: order.local_id,
            local_id: order.local_id,
            server_order_id: order.server_order_id,
            order_number: order.server_order_number || `OFFLINE-${order.local_id.slice(0, 8).toUpperCase()}`,
            status: order.status === 'SYNCED' ? order.payload.status : 'PENDING_SYNC',
            sync_status: order.status,
            created_at: order.created_at,
            // Extract data from payload
            ...order.payload,
            // Mark as offline order
            is_offline: true,
            offline_status: order.status,
          }));

          setOrders(transformedOrders);
          setPagination({
            count: transformedOrders.length,
            nextUrl: null,
            prevUrl: null,
            currentPage: 1
          });
          setIsFromCache(true);
        } else {
          setOrders([]);
          setPagination({ count: 0, nextUrl: null, prevUrl: null, currentPage: 1 });
          setError('Offline orders not available in this environment');
        }
      }
    } catch (err) {
      console.error('Error fetching orders:', err);
      setError(err.message || 'Failed to load orders');

      // If online fetch failed due to network, try offline
      if (!isOnline || err.code === 'ERR_NETWORK') {
        try {
          if (window.offlineAPI?.listOfflineOrders) {
            const offlineOrders = await window.offlineAPI.listOfflineOrders();
            const transformedOrders = offlineOrders.map(order => ({
              id: order.local_id,
              local_id: order.local_id,
              order_number: order.server_order_number || `OFFLINE-${order.local_id.slice(0, 8).toUpperCase()}`,
              status: 'PENDING_SYNC',
              sync_status: order.status,
              created_at: order.created_at,
              ...order.payload,
              is_offline: true,
            }));
            setOrders(transformedOrders);
            setIsFromCache(true);
            setError(null);
          }
        } catch (offlineErr) {
          console.error('Error fetching offline orders:', offlineErr);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [isOnline, fetchOrdersFn, JSON.stringify(filters)]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleNavigate = useCallback((url) => {
    if (url) {
      setPagination(prev => ({
        ...prev,
        currentPage: url.includes('page=')
          ? parseInt(new URL(url).searchParams.get('page') || '1')
          : prev.currentPage
      }));
      fetchOrders(url);
    }
  }, [fetchOrders]);

  return {
    orders,
    loading,
    error,
    isFromCache,
    isOnline,
    ...pagination,
    refetch: () => fetchOrders(),
    handleNavigate
  };
}
