/**
 * @typedef {Object} NavigationSubPage
 * @property {string} path - The route path
 * @property {string} title - Display title
 * @property {string} [description] - Optional description
 */

/**
 * @typedef {Object} NavigationRoute
 * @property {string} path - The main route path
 * @property {string} title - Display title
 * @property {React.ComponentType} icon - Lucide icon component
 * @property {NavigationSubPage[]} subPages - Array of sub-pages
 */

/**
 * @typedef {Object.<string, NavigationRoute>} NavigationConfig
 */

export {};