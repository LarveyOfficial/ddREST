/**
 * GENERATED — do not edit.
 *
 * Response shapes as the DoorDash MCP gateway advertises them via tools/list.
 * Regenerate with:  bun run list-tools --dump && bun run gen-schemas
 *
 * These document the response; they do not validate it. DoorDash can add a
 * field at any time and a response carrying one must still pass through
 * untouched, so nothing here is enforced at runtime.
 *
 * 20 of 26 tools describe their output. The rest advertise a bare
 * `{additionalProperties: true}` and keep the generic pass-through result:
 *   - doordash_get_restaurant_menu
 *   - internal_get_item_details
 *   - doordash_list_active_carts
 *   - doordash_get_checkout_url
 *   - doordash_list_delivery_addresses
 *   - doordash_get_payment_info
 */

/** Shared object definitions, hoisted out of each tool's `$defs`. */
export const SHARED_RESULT_DEFS: Record<string, unknown> = {
  "DDStoreWithMenu": {
    "description": "Store information with menu data.",
    "properties": {
      "store_id": {
        "title": "Store Id",
        "type": "string"
      },
      "name": {
        "title": "Name",
        "type": "string"
      },
      "menu_id": {
        "default": "",
        "title": "Menu Id",
        "type": "string"
      },
      "image_url": {
        "title": "Image Url",
        "type": "string"
      },
      "business_id": {
        "anyOf": [
          {
            "type": "integer"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Business Id"
      },
      "business_vertical_id": {
        "anyOf": [
          {
            "type": "integer"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Business Vertical Id"
      },
      "distance_meters": {
        "anyOf": [
          {
            "type": "number"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Distance Meters"
      },
      "delivery_time": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Delivery Time"
      },
      "availability_status": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Availability Status"
      },
      "asap_delivery_availability": {
        "anyOf": [
          {
            "type": "number"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Asap Delivery Availability"
      },
      "scheduled_delivery_availability": {
        "anyOf": [
          {
            "type": "number"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Scheduled Delivery Availability"
      },
      "next_open_time_asap_delivery_ms": {
        "anyOf": [
          {
            "type": "number"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Next Open Time Asap Delivery Ms"
      },
      "next_open_time_scheduled_delivery_ms": {
        "anyOf": [
          {
            "type": "number"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Next Open Time Scheduled Delivery Ms"
      },
      "submarket_id": {
        "anyOf": [
          {
            "type": "integer"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Submarket Id"
      },
      "printable_address": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "description": "Pre-formatted street address (e.g. '789 Mission St, San Francisco, CA 94103, USA'). Useful for disambiguating multi-franchise chains where multiple branches share the same `name`.",
        "title": "Printable Address"
      }
    },
    "required": [
      "store_id",
      "name",
      "image_url"
    ],
    "title": "StoreWithMenu",
    "type": "object"
  },
  "DDDecoratedItem": {
    "description": "Represents a single menu item with additional details.",
    "properties": {
      "item_id": {
        "title": "Item Id",
        "type": "string"
      },
      "name": {
        "title": "Name",
        "type": "string"
      },
      "description": {
        "title": "Description",
        "type": "string"
      },
      "image_url": {
        "title": "Image Url",
        "type": "string"
      },
      "price": {
        "title": "Price",
        "type": "number"
      },
      "price_varies": {
        "default": false,
        "title": "Price Varies",
        "type": "boolean"
      },
      "extras": {
        "items": {
          "$ref": "#/components/schemas/DDExtra"
        },
        "title": "Extras",
        "type": "array"
      },
      "is_orderable": {
        "default": true,
        "title": "Is Orderable",
        "type": "boolean"
      },
      "unavailability_reason": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Unavailability Reason"
      },
      "popular_modifications": {
        "items": {
          "additionalProperties": true,
          "type": "object"
        },
        "title": "Popular Modifications",
        "type": "array"
      },
      "is_popular": {
        "default": false,
        "title": "Is Popular",
        "type": "boolean"
      },
      "popularity_rank": {
        "anyOf": [
          {
            "type": "integer"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Popularity Rank"
      },
      "category_id": {
        "default": "",
        "title": "Category Id",
        "type": "string"
      },
      "category_name": {
        "default": "",
        "title": "Category Name",
        "type": "string"
      }
    },
    "required": [
      "item_id",
      "name",
      "description",
      "image_url",
      "price",
      "extras"
    ],
    "title": "DecoratedItem",
    "type": "object"
  },
  "DDExtra": {
    "description": "Represents an extra option for a menu item.",
    "properties": {
      "extra_id": {
        "title": "Extra Id",
        "type": "string"
      },
      "title": {
        "title": "Title",
        "type": "string"
      },
      "min_num_options": {
        "title": "Min Num Options",
        "type": "integer"
      },
      "max_num_options": {
        "title": "Max Num Options",
        "type": "integer"
      },
      "num_free_options": {
        "title": "Num Free Options",
        "type": "integer"
      },
      "options": {
        "items": {
          "$ref": "#/components/schemas/DDExtraOption"
        },
        "title": "Options",
        "type": "array"
      }
    },
    "required": [
      "extra_id",
      "title",
      "min_num_options",
      "max_num_options",
      "num_free_options",
      "options"
    ],
    "title": "Extra",
    "type": "object"
  },
  "DDExtraOption": {
    "description": "Represents an option within an extra.",
    "properties": {
      "option_id": {
        "title": "Option Id",
        "type": "string"
      },
      "name": {
        "title": "Name",
        "type": "string"
      },
      "price": {
        "title": "Price",
        "type": "number"
      },
      "extras": {
        "default": [],
        "items": {
          "$ref": "#/components/schemas/DDExtra"
        },
        "title": "Extras",
        "type": "array"
      }
    },
    "required": [
      "option_id",
      "name",
      "price"
    ],
    "title": "ExtraOption",
    "type": "object"
  },
  "DDItemSearchResult": {
    "description": "Item search result with detailed product information.",
    "properties": {
      "item_id": {
        "title": "Item Id",
        "type": "string"
      },
      "item_name": {
        "title": "Item Name",
        "type": "string"
      },
      "primary_image_url": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Primary Image Url"
      },
      "main_price": {
        "anyOf": [
          {
            "type": "number"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Main Price"
      },
      "main_display_price": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Main Display Price"
      },
      "unit_price": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Unit Price"
      },
      "quantity_display": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Quantity Display"
      },
      "quantity_increment": {
        "anyOf": [
          {
            "type": "number"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Quantity Increment"
      },
      "non_discounted_price": {
        "anyOf": [
          {
            "type": "number"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Non Discounted Price"
      },
      "non_discounted_display_price": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Non Discounted Display Price"
      },
      "purchase_type": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Purchase Type"
      },
      "callout_text": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Callout Text"
      },
      "deal_badges": {
        "anyOf": [
          {
            "items": {
              "additionalProperties": true,
              "type": "object"
            },
            "type": "array"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Deal Badges"
      },
      "deal_text_entries": {
        "anyOf": [
          {
            "items": {
              "additionalProperties": true,
              "type": "object"
            },
            "type": "array"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Deal Text Entries"
      },
      "dd_sic": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Dd Sic"
      },
      "item_msid": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Item Msid"
      },
      "restriction_info_w_rules": {
        "anyOf": [
          {
            "additionalProperties": true,
            "type": "object"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Restriction Info W Rules"
      },
      "taxonomy": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Taxonomy"
      },
      "stock_badge_type": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Stock Badge Type"
      },
      "stock_text": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Stock Text"
      }
    },
    "required": [
      "item_id",
      "item_name"
    ],
    "title": "ItemSearchResult",
    "type": "object"
  },
  "DDAvailableStore": {
    "description": "Information about an available store.",
    "properties": {
      "store_id": {
        "title": "Store Id",
        "type": "string"
      },
      "name": {
        "title": "Name",
        "type": "string"
      },
      "distance_meters": {
        "anyOf": [
          {
            "type": "number"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Distance Meters"
      },
      "delivery_time": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Delivery Time"
      }
    },
    "required": [
      "store_id",
      "name"
    ],
    "title": "AvailableStore",
    "type": "object"
  },
  "DDDoorDashItemData": {
    "properties": {
      "id": {
        "title": "Id",
        "type": "string"
      },
      "name": {
        "title": "Name",
        "type": "string"
      },
      "price": {
        "title": "Price",
        "type": "number"
      },
      "original_price": {
        "anyOf": [
          {
            "type": "number"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Original Price"
      },
      "discount": {
        "anyOf": [
          {
            "type": "number"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Discount"
      },
      "discount_text": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Discount Text"
      },
      "quantity": {
        "default": 1,
        "title": "Quantity",
        "type": "number"
      },
      "category": {
        "default": "",
        "title": "Category",
        "type": "string"
      },
      "image": {
        "default": "",
        "title": "Image",
        "type": "string"
      },
      "store_id": {
        "default": "",
        "title": "Store Id",
        "type": "string"
      },
      "purchase_type": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Purchase Type"
      },
      "measurement_unit": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Measurement Unit"
      },
      "increment": {
        "anyOf": [
          {
            "type": "number"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Increment"
      },
      "substitutions": {
        "default": [],
        "items": {
          "$ref": "#/components/schemas/DDDoorDashItemData"
        },
        "title": "Substitutions",
        "type": "array"
      }
    },
    "required": [
      "id",
      "name",
      "price"
    ],
    "title": "DoorDashItemData",
    "type": "object"
  },
  "DDAddItemError": {
    "properties": {
      "request": {
        "anyOf": [
          {
            "additionalProperties": true,
            "type": "object"
          },
          {
            "type": "null"
          }
        ],
        "title": "Request"
      },
      "message": {
        "title": "Message",
        "type": "string"
      }
    },
    "required": [
      "request",
      "message"
    ],
    "title": "AddItemError",
    "type": "object"
  },
  "DDCart": {
    "properties": {
      "id": {
        "title": "Id",
        "type": "string"
      },
      "store_id": {
        "title": "Store Id",
        "type": "string"
      },
      "store_name": {
        "title": "Store Name",
        "type": "string"
      },
      "items": {
        "items": {
          "$ref": "#/components/schemas/DDCartItem"
        },
        "title": "Items",
        "type": "array"
      },
      "items_count": {
        "title": "Items Count",
        "type": "integer"
      },
      "group_cart_url": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Group Cart Url"
      },
      "spend_limit_cents": {
        "anyOf": [
          {
            "type": "integer"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Spend Limit Cents"
      },
      "is_group_cart": {
        "default": false,
        "title": "Is Group Cart",
        "type": "boolean"
      }
    },
    "required": [
      "id",
      "store_id",
      "store_name",
      "items",
      "items_count"
    ],
    "title": "Cart",
    "type": "object"
  },
  "DDCartItem": {
    "properties": {
      "id": {
        "title": "Id",
        "type": "string"
      },
      "item_id": {
        "title": "Item Id",
        "type": "string"
      },
      "menu_id": {
        "title": "Menu Id",
        "type": "string"
      },
      "name": {
        "title": "Name",
        "type": "string"
      },
      "description": {
        "title": "Description",
        "type": "string"
      },
      "image_url": {
        "title": "Image Url",
        "type": "string"
      },
      "quantity": {
        "title": "Quantity",
        "type": "number"
      },
      "price": {
        "title": "Price",
        "type": "number"
      },
      "nested_options": {
        "items": {
          "additionalProperties": true,
          "type": "object"
        },
        "title": "Nested Options",
        "type": "array"
      }
    },
    "required": [
      "id",
      "item_id",
      "menu_id",
      "name",
      "description",
      "image_url",
      "quantity",
      "price",
      "nested_options"
    ],
    "title": "CartItem",
    "type": "object"
  },
  "DDCartPromotionEntry": {
    "description": "One promotion in a cart's eligible or applied list.",
    "properties": {
      "code": {
        "default": "",
        "title": "Code",
        "type": "string"
      },
      "campaign_id": {
        "default": "",
        "title": "Campaign Id",
        "type": "string"
      },
      "ad_group_id": {
        "default": "",
        "title": "Ad Group Id",
        "type": "string"
      },
      "ad_id": {
        "default": "",
        "title": "Ad Id",
        "type": "string"
      },
      "title": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Title"
      },
      "description": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Description"
      },
      "discount_cents": {
        "default": 0,
        "title": "Discount Cents",
        "type": "integer"
      },
      "is_applied": {
        "default": false,
        "title": "Is Applied",
        "type": "boolean"
      },
      "source": {
        "default": "",
        "title": "Source",
        "type": "string"
      }
    },
    "title": "CartPromotionEntry",
    "type": "object"
  },
  "DDOrderHistoryEntry": {
    "description": "A single order from order history.",
    "properties": {
      "order_uuid": {
        "title": "Order Uuid",
        "type": "string"
      },
      "store_id": {
        "title": "Store Id",
        "type": "string"
      },
      "store_name": {
        "title": "Store Name",
        "type": "string"
      },
      "store_image_url": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Store Image Url"
      },
      "is_reorderable": {
        "title": "Is Reorderable",
        "type": "boolean"
      },
      "order_date": {
        "title": "Order Date",
        "type": "string"
      },
      "order_fulfilled_at": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Order Fulfilled At"
      },
      "total_price": {
        "anyOf": [
          {
            "type": "number"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Total Price"
      },
      "business_vertical_id": {
        "anyOf": [
          {
            "type": "integer"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Business Vertical Id"
      },
      "business_id": {
        "anyOf": [
          {
            "type": "integer"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Business Id"
      },
      "fulfillment_type": {
        "default": "FULFILLMENT_TYPE_UNSPECIFIED",
        "title": "Fulfillment Type",
        "type": "string"
      },
      "order_target": {
        "default": "ORDER_TARGET_UNSPECIFIED",
        "title": "Order Target",
        "type": "string"
      },
      "items": {
        "items": {
          "$ref": "#/components/schemas/DDOrderItem"
        },
        "title": "Items",
        "type": "array"
      }
    },
    "required": [
      "order_uuid",
      "store_id",
      "store_name",
      "is_reorderable",
      "order_date",
      "items"
    ],
    "title": "OrderHistoryEntry",
    "type": "object"
  },
  "DDOrderItem": {
    "description": "Order item from order history.",
    "properties": {
      "item_id": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Item Id"
      },
      "name": {
        "title": "Name",
        "type": "string"
      },
      "quantity": {
        "title": "Quantity",
        "type": "integer"
      },
      "dd_sic": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Dd Sic"
      },
      "dd_sic_v2": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ],
        "default": null,
        "title": "Dd Sic V2"
      }
    },
    "required": [
      "name",
      "quantity"
    ],
    "title": "OrderItem",
    "type": "object"
  }
}

/** Tool name -> the OpenAPI component name and schema for its result. */
export const TOOL_RESULT_SCHEMAS: Record<string, { component: string; schema: Record<string, unknown> }> = {
  "doordash_find_restaurants": {
    "component": "DDFindRestaurantsResult",
    "schema": {
      "type": "object",
      "properties": {
        "widget_type": {
          "type": "string"
        },
        "query": {
          "type": "string"
        },
        "stores": {
          "type": "array"
        },
        "items": {
          "type": "array"
        },
        "session_id": {
          "type": "string"
        },
        "needs_address": {
          "type": "boolean"
        },
        "delivery_address": {
          "type": "string"
        },
        "is_authenticated": {
          "type": "boolean"
        },
        "success": {
          "type": "boolean"
        }
      }
    }
  },
  "internal_get_store_info": {
    "component": "DDGetStoreInfoResult",
    "schema": {
      "description": "Response from get_store_info.",
      "properties": {
        "store": {
          "anyOf": [
            {
              "$ref": "#/components/schemas/DDStoreWithMenu"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "success": {
          "default": true,
          "title": "Success",
          "type": "boolean"
        },
        "message": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Message"
        }
      },
      "title": "GetStoreInfoResponse",
      "type": "object"
    }
  },
  "doordash_get_food_item": {
    "component": "DDGetFoodItemResult",
    "schema": {
      "properties": {
        "item": {
          "anyOf": [
            {
              "$ref": "#/components/schemas/DDDecoratedItem"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "success": {
          "default": true,
          "title": "Success",
          "type": "boolean"
        },
        "message": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Message"
        }
      },
      "title": "GetFoodItemToolResponse",
      "type": "object"
    }
  },
  "internal_find_items_in_store": {
    "component": "DDFindItemsInStoreResult",
    "schema": {
      "properties": {
        "results": {
          "additionalProperties": {
            "items": {
              "$ref": "#/components/schemas/DDItemSearchResult"
            },
            "type": "array"
          },
          "title": "Results",
          "type": "object"
        },
        "success": {
          "default": true,
          "title": "Success",
          "type": "boolean"
        },
        "message": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Message"
        }
      },
      "required": [
        "results"
      ],
      "title": "FindItemsResponse",
      "type": "object"
    }
  },
  "internal_find_nearby_stores": {
    "component": "DDFindNearbyStoresResult",
    "schema": {
      "properties": {
        "stores": {
          "items": {
            "$ref": "#/components/schemas/DDStoreWithMenu"
          },
          "title": "Stores",
          "type": "array"
        },
        "success": {
          "default": true,
          "title": "Success",
          "type": "boolean"
        },
        "message": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Message"
        }
      },
      "required": [
        "stores"
      ],
      "title": "FindStoresResponse",
      "type": "object"
    }
  },
  "doordash_create_product_list": {
    "component": "DDCreateProductListResult",
    "schema": {
      "description": "Response data for create_product_list with widget.",
      "properties": {
        "widget_type": {
          "default": "product_list",
          "title": "Widget Type",
          "type": "string"
        },
        "items": {
          "items": {
            "$ref": "#/components/schemas/DDDoorDashItemData"
          },
          "title": "Items",
          "type": "array"
        },
        "session_id": {
          "title": "Session Id",
          "type": "string"
        },
        "trace_id": {
          "title": "Trace Id",
          "type": "string"
        },
        "desired_mx_name": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Desired Mx Name"
        },
        "store_name": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Store Name"
        },
        "delivery_time": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Delivery Time"
        },
        "delivery_address": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Delivery Address"
        },
        "available_stores": {
          "anyOf": [
            {
              "items": {
                "$ref": "#/components/schemas/DDAvailableStore"
              },
              "type": "array"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Available Stores"
        },
        "menu_id": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Menu Id"
        },
        "servings": {
          "anyOf": [
            {
              "type": "integer"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Servings"
        },
        "timestamp": {
          "title": "Timestamp",
          "type": "string"
        },
        "success": {
          "default": true,
          "title": "Success",
          "type": "boolean"
        },
        "message": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Message"
        },
        "assistant_instructions": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Assistant Instructions"
        }
      },
      "required": [
        "items",
        "session_id",
        "trace_id",
        "timestamp"
      ],
      "title": "ProductListData",
      "type": "object"
    }
  },
  "doordash_add_to_cart": {
    "component": "DDAddToCartResult",
    "schema": {
      "properties": {
        "cart_uuid": {
          "title": "Cart Uuid",
          "type": "string"
        },
        "success": {
          "default": true,
          "title": "Success",
          "type": "boolean"
        },
        "message": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Message"
        },
        "item_errors": {
          "items": {
            "$ref": "#/components/schemas/DDAddItemError"
          },
          "title": "Item Errors",
          "type": "array"
        },
        "cart": {
          "$ref": "#/components/schemas/DDCart"
        }
      },
      "required": [
        "cart_uuid",
        "item_errors",
        "cart"
      ],
      "title": "AddToCartToolResponse",
      "type": "object"
    }
  },
  "doordash_get_cart": {
    "component": "DDGetCartResult",
    "schema": {
      "type": "object",
      "properties": {
        "widget_type": {
          "type": "string"
        },
        "cart": {
          "type": "object"
        },
        "cart_uuid": {
          "type": "string"
        },
        "success": {
          "type": "boolean"
        }
      }
    }
  },
  "doordash_remove_cart_item": {
    "component": "DDRemoveCartItemResult",
    "schema": {
      "properties": {
        "cart_uuid": {
          "title": "Cart Uuid",
          "type": "string"
        },
        "cart": {
          "$ref": "#/components/schemas/DDCart"
        },
        "success": {
          "default": true,
          "title": "Success",
          "type": "boolean"
        },
        "message": {
          "title": "Message",
          "type": "string"
        }
      },
      "required": [
        "cart_uuid",
        "cart",
        "message"
      ],
      "title": "CartMutationToolResponse",
      "type": "object"
    }
  },
  "doordash_clear_cart": {
    "component": "DDClearCartResult",
    "schema": {
      "properties": {
        "cart_uuid": {
          "title": "Cart Uuid",
          "type": "string"
        },
        "success": {
          "default": true,
          "title": "Success",
          "type": "boolean"
        },
        "message": {
          "title": "Message",
          "type": "string"
        }
      },
      "required": [
        "cart_uuid",
        "message"
      ],
      "title": "ClearCartToolResponse",
      "type": "object"
    }
  },
  "internal_list_eligible_cart_promotions": {
    "component": "DDListEligibleCartPromotionsResult",
    "schema": {
      "description": "Response from listing eligible promotions for a cart.",
      "properties": {
        "cart_uuid": {
          "description": "Cart this list is scoped to. Empty string when the list was requested by store_id (store-scoped) — do not forward an empty cart_uuid to internal_apply_cart_promotion.",
          "title": "Cart Uuid",
          "type": "string"
        },
        "store_id": {
          "title": "Store Id",
          "type": "string"
        },
        "promotions": {
          "items": {
            "$ref": "#/components/schemas/DDCartPromotionEntry"
          },
          "title": "Promotions",
          "type": "array"
        },
        "total": {
          "default": 0,
          "title": "Total",
          "type": "integer"
        },
        "success": {
          "default": true,
          "title": "Success",
          "type": "boolean"
        },
        "message": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Message"
        }
      },
      "required": [
        "cart_uuid",
        "store_id",
        "promotions"
      ],
      "title": "EligiblePromotionsResponse",
      "type": "object"
    }
  },
  "internal_apply_cart_promotion": {
    "component": "DDApplyCartPromotionResult",
    "schema": {
      "description": "Response from applying or removing a cart promotion.\n\nTools self-verify against preview_order so callers receive a definitive\noutcome — no follow-up preview call is required.",
      "properties": {
        "cart_uuid": {
          "title": "Cart Uuid",
          "type": "string"
        },
        "promo_code": {
          "title": "Promo Code",
          "type": "string"
        },
        "success": {
          "default": true,
          "title": "Success",
          "type": "boolean"
        },
        "discount_cents": {
          "default": 0,
          "title": "Discount Cents",
          "type": "integer"
        },
        "subtotal_cents": {
          "anyOf": [
            {
              "type": "integer"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Subtotal Cents"
        },
        "total_before_tip_cents": {
          "anyOf": [
            {
              "type": "integer"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Total Before Tip Cents"
        },
        "applied_promotions": {
          "default": [],
          "items": {
            "$ref": "#/components/schemas/DDCartPromotionEntry"
          },
          "title": "Applied Promotions",
          "type": "array"
        },
        "message": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Message"
        },
        "error_category": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Error Category"
        },
        "error_message": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Error Message"
        }
      },
      "required": [
        "cart_uuid",
        "promo_code"
      ],
      "title": "CartPromotionResponse",
      "type": "object"
    }
  },
  "internal_remove_cart_promotion": {
    "component": "DDRemoveCartPromotionResult",
    "schema": {
      "description": "Response from applying or removing a cart promotion.\n\nTools self-verify against preview_order so callers receive a definitive\noutcome — no follow-up preview call is required.",
      "properties": {
        "cart_uuid": {
          "title": "Cart Uuid",
          "type": "string"
        },
        "promo_code": {
          "title": "Promo Code",
          "type": "string"
        },
        "success": {
          "default": true,
          "title": "Success",
          "type": "boolean"
        },
        "discount_cents": {
          "default": 0,
          "title": "Discount Cents",
          "type": "integer"
        },
        "subtotal_cents": {
          "anyOf": [
            {
              "type": "integer"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Subtotal Cents"
        },
        "total_before_tip_cents": {
          "anyOf": [
            {
              "type": "integer"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Total Before Tip Cents"
        },
        "applied_promotions": {
          "default": [],
          "items": {
            "$ref": "#/components/schemas/DDCartPromotionEntry"
          },
          "title": "Applied Promotions",
          "type": "array"
        },
        "message": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Message"
        },
        "error_category": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Error Category"
        },
        "error_message": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Error Message"
        }
      },
      "required": [
        "cart_uuid",
        "promo_code"
      ],
      "title": "CartPromotionResponse",
      "type": "object"
    }
  },
  "internal_get_order_history": {
    "component": "DDGetOrderHistoryResult",
    "schema": {
      "description": "Response from getting order history.",
      "properties": {
        "orders": {
          "items": {
            "$ref": "#/components/schemas/DDOrderHistoryEntry"
          },
          "title": "Orders",
          "type": "array"
        },
        "success": {
          "default": true,
          "title": "Success",
          "type": "boolean"
        },
        "message": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Message"
        }
      },
      "required": [
        "orders"
      ],
      "title": "OrderHistoryResponse",
      "type": "object"
    }
  },
  "internal_reorder": {
    "component": "DDReorderResult",
    "schema": {
      "description": "Response from reorder operation.",
      "properties": {
        "success": {
          "title": "Success",
          "type": "boolean"
        },
        "cart_uuid": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Cart Uuid"
        },
        "fail_reason": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Fail Reason"
        },
        "message": {
          "title": "Message",
          "type": "string"
        }
      },
      "required": [
        "success",
        "message"
      ],
      "title": "ReorderResponse",
      "type": "object"
    }
  },
  "internal_get_order_receipt": {
    "component": "DDGetOrderReceiptResult",
    "schema": {
      "description": "Response from getting an order receipt.\n\nSurfaces the commonly-used slices (store, line items, ordered items,\npayment) for convenience and keeps the full receipt payload under\n`receipt` so callers can read any field. Money amounts inside these\ndicts are in cents (e.g. line_items[].final_money.unit_amount); the\ncaller formats for display.",
      "properties": {
        "success": {
          "title": "Success",
          "type": "boolean"
        },
        "store_name": {
          "default": "",
          "title": "Store Name",
          "type": "string"
        },
        "line_items": {
          "items": {
            "additionalProperties": true,
            "type": "object"
          },
          "title": "Line Items",
          "type": "array"
        },
        "orders": {
          "items": {
            "additionalProperties": true,
            "type": "object"
          },
          "title": "Orders",
          "type": "array"
        },
        "payment_charge_details": {
          "items": {
            "additionalProperties": true,
            "type": "object"
          },
          "title": "Payment Charge Details",
          "type": "array"
        },
        "credited_amount": {
          "additionalProperties": true,
          "title": "Credited Amount",
          "type": "object"
        },
        "receipt": {
          "additionalProperties": true,
          "title": "Receipt",
          "type": "object"
        },
        "message": {
          "default": "",
          "title": "Message",
          "type": "string"
        }
      },
      "required": [
        "success"
      ],
      "title": "OrderReceiptResponse",
      "type": "object"
    }
  },
  "internal_get_order_status": {
    "component": "DDGetOrderStatusResult",
    "schema": {
      "description": "Response for post-submit order-status polling.\n\nMinimal by design: only the polling-relevant status, a human hint, and\n(on a failure state) the error message. Payment / fraud internals are not\nsurfaced.",
      "properties": {
        "success": {
          "title": "Success",
          "type": "boolean"
        },
        "status": {
          "default": "",
          "title": "Status",
          "type": "string"
        },
        "action_required": {
          "default": false,
          "title": "Action Required",
          "type": "boolean"
        },
        "error_message": {
          "default": "",
          "title": "Error Message",
          "type": "string"
        },
        "message": {
          "default": "",
          "title": "Message",
          "type": "string"
        }
      },
      "required": [
        "success"
      ],
      "title": "OrderStatusResponse",
      "type": "object"
    }
  },
  "internal_preview_order": {
    "component": "DDPreviewOrderResult",
    "schema": {
      "description": "Response for order preview.",
      "properties": {
        "success": {
          "title": "Success",
          "type": "boolean"
        },
        "cart_uuid": {
          "default": "",
          "title": "Cart Uuid",
          "type": "string"
        },
        "plan_id": {
          "default": "",
          "title": "Plan Id",
          "type": "string"
        },
        "items": {
          "default": [],
          "items": {
            "additionalProperties": true,
            "type": "object"
          },
          "title": "Items",
          "type": "array"
        },
        "quote": {
          "additionalProperties": true,
          "default": {},
          "title": "Quote",
          "type": "object"
        },
        "stores": {
          "default": [],
          "items": {
            "additionalProperties": true,
            "type": "object"
          },
          "title": "Stores",
          "type": "array"
        },
        "fulfillment_options": {
          "default": [],
          "items": {
            "additionalProperties": true,
            "type": "object"
          },
          "title": "Fulfillment Options",
          "type": "array"
        },
        "alternate_plans": {
          "default": [],
          "items": {
            "additionalProperties": true,
            "type": "object"
          },
          "title": "Alternate Plans",
          "type": "array"
        },
        "partial_response": {
          "default": false,
          "title": "Partial Response",
          "type": "boolean"
        },
        "dropped_unknown_any_type_urls": {
          "items": {
            "type": "string"
          },
          "title": "Dropped Unknown Any Type Urls",
          "type": "array"
        },
        "error_type": {
          "default": "",
          "title": "Error Type",
          "type": "string"
        },
        "error_category": {
          "default": "",
          "title": "Error Category",
          "type": "string"
        },
        "error_message": {
          "default": "",
          "title": "Error Message",
          "type": "string"
        },
        "warning": {
          "default": "",
          "title": "Warning",
          "type": "string"
        },
        "message": {
          "default": "",
          "title": "Message",
          "type": "string"
        }
      },
      "required": [
        "success"
      ],
      "title": "PreviewOrderResponse",
      "type": "object"
    }
  },
  "internal_submit_order": {
    "component": "DDSubmitOrderResult",
    "schema": {
      "description": "Response for order submission.",
      "properties": {
        "success": {
          "title": "Success",
          "type": "boolean"
        },
        "order_uuid": {
          "default": "",
          "title": "Order Uuid",
          "type": "string"
        },
        "order_pdrn": {
          "default": "",
          "title": "Order Pdrn",
          "type": "string"
        },
        "operation_code": {
          "default": "",
          "title": "Operation Code",
          "type": "string"
        },
        "processing_status": {
          "default": "",
          "title": "Processing Status",
          "type": "string"
        },
        "partial_response": {
          "default": false,
          "title": "Partial Response",
          "type": "boolean"
        },
        "dropped_unknown_any_type_urls": {
          "items": {
            "type": "string"
          },
          "title": "Dropped Unknown Any Type Urls",
          "type": "array"
        },
        "error_type": {
          "default": "",
          "title": "Error Type",
          "type": "string"
        },
        "error_message": {
          "default": "",
          "title": "Error Message",
          "type": "string"
        },
        "warning": {
          "default": "",
          "title": "Warning",
          "type": "string"
        },
        "message": {
          "default": "",
          "title": "Message",
          "type": "string"
        }
      },
      "required": [
        "success"
      ],
      "title": "SubmitOrderResponse",
      "type": "object"
    }
  },
  "doordash_set_delivery_address": {
    "component": "DDSetDeliveryAddressResult",
    "schema": {
      "description": "Response data for set_delivery_address.",
      "properties": {
        "success": {
          "default": true,
          "title": "Success",
          "type": "boolean"
        },
        "address_id": {
          "title": "Address Id",
          "type": "string"
        },
        "trace_id": {
          "title": "Trace Id",
          "type": "string"
        },
        "timestamp": {
          "title": "Timestamp",
          "type": "string"
        },
        "message": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Message"
        }
      },
      "required": [
        "address_id",
        "trace_id",
        "timestamp"
      ],
      "title": "SetDeliveryAddressData",
      "type": "object"
    }
  }
}
