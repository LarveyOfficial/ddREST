/**
 * The 38 MCP tool names, and the server-generated `intent` each one is called
 * with.
 *
 * Most tools accept an `intent` string, and per the CLI's own help text
 * DoorDash "may review this data for research and product-improvement
 * purposes". This API never exposes `intent` to callers and never forwards an
 * end-user prompt, so each intent states the operation and says plainly that no
 * user text is attached. Keeping the strings here — rather than inline at each
 * route — makes it possible to audit in one place exactly what we tell DoorDash.
 *
 * Twelve tools declare no `intent` in their input schema at all (see SUMMARIES).
 * They get no intent rather than one the gateway never asked for — sending an
 * undeclared argument is at best ignored and at worst rejected, and it is
 * disclosure with no upside either way.
 */

export const TOOLS = {
  findRestaurants: 'doordash_find_restaurants',
  getRestaurantMenu: 'doordash_get_restaurant_menu',
  getStoreInfo: 'internal_get_store_info',
  getItemDetails: 'internal_get_item_details',
  getFoodItem: 'doordash_get_food_item',
  findItemsInStore: 'internal_find_items_in_store',
  findNearbyStores: 'internal_find_nearby_stores',
  getNearbyOffers: 'internal_get_nearby_offers',
  getStoreDeals: 'internal_get_store_deals',

  createProductList: 'doordash_create_product_list',

  listActiveCarts: 'doordash_list_active_carts',
  addToCart: 'doordash_add_to_cart',
  getCart: 'doordash_get_cart',
  removeCartItem: 'doordash_remove_cart_item',
  clearCart: 'doordash_clear_cart',
  updateCartItem: 'internal_update_cart_item',
  updateDeliveryOption: 'doordash_update_delivery_option',

  listPromotions: 'internal_list_eligible_cart_promotions',
  applyPromotion: 'internal_apply_cart_promotion',
  removePromotion: 'internal_remove_cart_promotion',
  getAppliedPromotions: 'internal_get_applied_cart_promotions',
  getPromoEligibleItems: 'internal_get_promo_eligible_items',

  getOrderHistory: 'internal_get_order_history',
  reorder: 'internal_reorder',
  getOrderReceipt: 'internal_get_order_receipt',
  getOrderStatus: 'internal_get_order_status',
  previewOrder: 'internal_preview_order',
  submitOrder: 'internal_submit_order',
  getCheckoutUrl: 'doordash_get_checkout_url',

  micCarousel: 'internal_get_mic_carousel',

  listDeliveryAddresses: 'doordash_list_delivery_addresses',
  setDeliveryAddress: 'doordash_set_delivery_address',
  getPaymentInfo: 'doordash_get_payment_info',
  setDeliveryInstructions: 'internal_set_delivery_instructions',
  setAddressLabel: 'internal_set_address_label',
  addressAutocomplete: 'doordash_address_autocomplete',
  selectAddress: 'doordash_select_address',
  getUserInfo: 'doordash_get_user_info',
} as const

export type ToolName = (typeof TOOLS)[keyof typeof TOOLS]

/**
 * One summary per tool whose input schema declares `intent`.
 *
 * Deliberately partial: the eight tools missing below do not advertise the
 * argument, so nothing is sent for them. Check with `bun run list-tools` before
 * adding an entry — a tool absent from this map is a decision, not an omission.
 */
const SUMMARIES: Partial<Record<ToolName, string>> = {
  [TOOLS.findRestaurants]: 'Find restaurants near a location on the user’s behalf.',
  [TOOLS.getRestaurantMenu]: 'Retrieve a restaurant menu the user asked to see.',
  [TOOLS.getStoreInfo]: 'Retrieve details about a store the user asked about.',
  [TOOLS.getItemDetails]: 'Retrieve details about a store item the user asked about.',
  [TOOLS.getFoodItem]: 'Retrieve details about a menu item the user asked about.',
  [TOOLS.findItemsInStore]: 'Locate specific items within a store for the user.',
  [TOOLS.findNearbyStores]: 'Find nearby non-restaurant stores for the user.',
  // getNearbyOffers, getStoreDeals: no `intent` in their schemas.

  [TOOLS.createProductList]: 'Build a grocery product list from items the user supplied.',

  [TOOLS.listActiveCarts]: 'List the user’s active carts so they can review them.',
  [TOOLS.addToCart]: 'Add items the user selected to a cart.',
  [TOOLS.getCart]: 'Show the contents of a cart the user asked to see.',
  [TOOLS.removeCartItem]: 'Remove an item the user asked to take out of their cart.',
  [TOOLS.clearCart]: 'Delete a cart at the user’s request.',
  // updateCartItem, updateDeliveryOption: no `intent` in their schemas.

  [TOOLS.listPromotions]: 'List promotions the user is eligible for at a store.',
  [TOOLS.applyPromotion]: 'Apply a promotion the user chose to their cart.',
  [TOOLS.removePromotion]: 'Remove a promotion the user asked to take off their cart.',
  // getAppliedPromotions, getPromoEligibleItems: no `intent` in their schemas.

  [TOOLS.getOrderHistory]: 'Show the user their own past orders.',
  [TOOLS.reorder]: 'Recreate a past order the user asked to reorder.',
  [TOOLS.getOrderReceipt]: 'Show the user the receipt for one of their orders.',
  [TOOLS.getOrderStatus]: 'Check the status of an order the user placed.',
  [TOOLS.previewOrder]: 'Price and preview a cart before the user commits to it.',
  [TOOLS.submitOrder]: 'Place an order the user explicitly confirmed.',
  [TOOLS.getCheckoutUrl]: 'Give the user a checkout link for their cart.',

  [TOOLS.listDeliveryAddresses]: 'List the user’s saved delivery addresses.',
  [TOOLS.setDeliveryAddress]: 'Set the delivery address the user selected.',
  [TOOLS.getPaymentInfo]: 'Show the user their saved payment methods.',
  // setDeliveryInstructions, setAddressLabel, micCarousel, addressAutocomplete,
  // selectAddress, getUserInfo: no `intent` in their schemas.
}

/**
 * Uses the shape dd-cli sends ("Summary: ...\nuser prompt/purpose: ...") so
 * the field reads the way DoorDash expects, while being honest that this API
 * carries no end-user prompt to forward.
 *
 * Undefined for the tools that do not declare `intent`; callTool drops it.
 */
export function intentFor(tool: ToolName): string | undefined {
  const summary = SUMMARIES[tool]
  if (summary === undefined) return undefined
  return (
    `Summary: ${summary}\n` +
    'Audience: the authenticated DoorDash account holder, acting through a self-hosted REST API.\n' +
    'user prompt/purpose: (not supplied — this API issues a fixed per-operation intent and forwards no end-user text)'
  )
}
