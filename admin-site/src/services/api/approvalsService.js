import apiClient from "./client";

/**
 * Approvals Service
 * Handles manager approval system API interactions
 */

// === Approval Policies ===

/**
 * Get all approval policies
 * @returns {Promise} Array of approval policies
 */
export const getApprovalPolicies = async () => {
	const response = await apiClient.get("approvals/policies/");
	return response.data.results;
};

/**
 * Get approval policy by ID
 * @param {string} policyId - UUID of the approval policy
 * @returns {Promise} Approval policy object
 */
export const getApprovalPolicy = async (policyId) => {
	const response = await apiClient.get(`approvals/policies/${policyId}/`);
	return response.data;
};

/**
 * Get approval policy for a specific store location
 * @param {string} locationId - UUID of the store location
 * @returns {Promise} Approval policy object for that location
 */
export const getApprovalPolicyByLocation = async (locationId) => {
	const response = await apiClient.get(
		`approvals/policies/?store_location=${locationId}`
	);
	// Return the first result since there's only one policy per location
	return response.data.results?.[0] || null;
};

/**
 * Update approval policy thresholds
 * @param {string} policyId - UUID of the approval policy
 * @param {Object} policyData - Policy threshold data
 * @param {number} policyData.max_discount_percent - Max discount % without approval
 * @param {number} policyData.max_refund_amount - Max refund amount without approval
 * @param {number} policyData.max_price_override_amount - Max price override without approval
 * @param {number} policyData.max_void_order_amount - Max order void amount without approval
 * @param {boolean} policyData.allow_self_approval - Allow manager self-approval
 * @returns {Promise} Updated approval policy object
 */
export const updateApprovalPolicy = async (policyId, policyData) => {
	const response = await apiClient.patch(
		`approvals/policies/${policyId}/`,
		policyData
	);
	return response.data;
};

// === Approval Requests (for future POS integration) ===

/**
 * Get approval requests (for manager queue)
 * @param {Object} filters - Query filters
 * @param {string} filters.status - Filter by status (PENDING, APPROVED, DENIED, EXPIRED)
 * @param {string} filters.action_type - Filter by action type (DISCOUNT, ORDER_VOID, etc)
 * @param {string} filters.store_location - Filter by store location ID
 * @param {boolean} filters.is_actionable - If true, only pending & non-expired
 * @returns {Promise} Array of approval requests
 */
export const getApprovalRequests = async (filters = {}) => {
	const params = new URLSearchParams();

	if (filters.status) params.append("status", filters.status);
	if (filters.action_type) params.append("action_type", filters.action_type);
	if (filters.store_location)
		params.append("store_location", filters.store_location);
	if (filters.is_actionable) params.append("is_actionable", "true");

	const response = await apiClient.get(
		`approvals/requests/?${params.toString()}`
	);
	return response.data.results;
};

/**
 * Get approval request detail
 * @param {string} requestId - UUID of the approval request
 * @returns {Promise} Approval request object
 */
export const getApprovalRequest = async (requestId) => {
	const response = await apiClient.get(`approvals/requests/${requestId}/`);
	return response.data;
};

/**
 * Approve an approval request (requires manager role + PIN)
 * @param {string} requestId - UUID of the approval request
 * @param {string} pin - Manager's PIN code
 * @returns {Promise} Approval result with updated request
 */
export const approveRequest = async (requestId, pin) => {
	const response = await apiClient.post(
		`approvals/requests/${requestId}/approve/`,
		{ pin }
	);
	return response.data;
};

/**
 * Deny an approval request (requires manager role + PIN)
 * @param {string} requestId - UUID of the approval request
 * @param {string} pin - Manager's PIN code
 * @param {string} reason - Optional denial reason
 * @returns {Promise} Denial result with updated request
 */
export const denyRequest = async (requestId, pin, reason = "") => {
	const response = await apiClient.post(
		`approvals/requests/${requestId}/deny/`,
		{ pin, reason }
	);
	return response.data;
};
