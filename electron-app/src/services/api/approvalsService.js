import apiClient from "@/shared/lib/apiClient";

const approvalsService = {
	/**
	 * Approve a manager approval request
	 * @param {string} approvalRequestId - UUID of the approval request
	 * @param {string} username - Manager's username
	 * @param {string} pin - Manager's PIN
	 * @returns {Promise} Response with success status and message
	 */
	approveRequest: (approvalRequestId, username, pin) => {
		return apiClient.post(`/approvals/requests/${approvalRequestId}/approve/`, {
			username: username,
			pin: pin,
		});
	},

	/**
	 * Deny a manager approval request
	 * @param {string} approvalRequestId - UUID of the approval request
	 * @param {string} username - Manager's username
	 * @param {string} pin - Manager's PIN
	 * @param {string} reason - Optional reason for denial
	 * @returns {Promise} Response with success status and message
	 */
	denyRequest: (approvalRequestId, username, pin, reason = "") => {
		return apiClient.post(`/approvals/requests/${approvalRequestId}/deny/`, {
			username: username,
			pin: pin,
			...(reason && { reason }),
		});
	},

	/**
	 * Get list of pending approval requests for the current store location
	 * @param {Object} params - Query parameters (status, action_type, etc.)
	 * @returns {Promise} List of approval requests
	 */
	getPendingRequests: (params = {}) => {
		return apiClient.get("/approvals/requests/", {
			params: {
				is_actionable: true,
				...params,
			},
		});
	},

	/**
	 * Get approval request by ID
	 * @param {string} approvalRequestId - UUID of the approval request
	 * @returns {Promise} Approval request details
	 */
	getRequest: (approvalRequestId) => {
		return apiClient.get(`/approvals/requests/${approvalRequestId}/`);
	},
};

export default approvalsService;
