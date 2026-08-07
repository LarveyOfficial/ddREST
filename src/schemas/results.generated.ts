/**
 * GENERATED — do not edit.
 *
 * Response shapes for each tool, from two sources:
 *
 *   - what the gateway advertises through tools/list, and
 *   - what real responses actually contain, captured by scripts/capture-shapes.ts.
 *
 * The second exists because the first is incomplete. Six tools advertise a bare
 * `{additionalProperties: true}`, and several described ones leave a leaf
 * untyped — doordash_find_restaurants declares `stores` as an array with no
 * item schema at all. Where the advertised schema says nothing, the observed
 * shape fills in; where it is specific, it wins, because its field names and
 * descriptions are DoorDash's own and the observed shape is one account's data
 * on one day.
 *
 * Regenerate with:
 *   bun run list-tools --dump      # advertised schemas
 *   bun run capture-shapes         # observed shapes (types only, no values)
 *   bun run gen-schemas
 *
 * These document the response; they do not validate it. DoorDash can add a
 * field at any time and a response carrying one must still pass through
 * untouched, so nothing here is enforced at runtime.
 *
 * advertised only:        11
 * advertised + observed:  9
 * observed only:          5
 * still undocumented:     1
 *   - internal_get_item_details
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
export const TOOL_RESULT_SCHEMAS: Record<string, { component: string; schema: Record<string, unknown>; source: string }> = {
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
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "store_id": {
                "type": "string"
              },
              "name": {
                "type": "string"
              },
              "image_url": {
                "type": "string"
              },
              "distance_meters": {
                "type": "number"
              },
              "distance": {
                "type": "string"
              },
              "delivery_time": {
                "type": "string"
              },
              "rating": {
                "type": "number"
              },
              "review_count": {
                "type": "integer"
              },
              "zesty_store_id": {
                "type": "string"
              },
              "verified_name": {
                "type": "string"
              },
              "is_link_out": {
                "type": "boolean"
              }
            },
            "required": [
              "store_id",
              "name",
              "image_url",
              "distance_meters",
              "distance",
              "delivery_time",
              "rating",
              "review_count",
              "zesty_store_id",
              "verified_name",
              "is_link_out"
            ],
            "additionalProperties": true
          }
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
        },
        "assistant_instructions": {
          "type": "string"
        },
        "title": {
          "type": "string"
        },
        "address_id": {
          "type": "string"
        },
        "search_radius": {
          "type": "integer"
        },
        "message": {
          "type": "string"
        }
      }
    },
    "source": "advertised + observed"
  },
  "doordash_get_restaurant_menu": {
    "component": "DDGetRestaurantMenuResult",
    "schema": {
      "type": "object",
      "properties": {
        "menu_id": {
          "type": "string"
        },
        "items": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "item_id": {
                "type": "string"
              },
              "name": {
                "type": "string"
              },
              "description": {
                "type": "string"
              },
              "image_url": {
                "type": "string"
              },
              "price": {
                "type": "number"
              },
              "price_varies": {
                "type": "boolean"
              },
              "extras": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "extra_id": {
                      "type": "string"
                    },
                    "title": {
                      "type": "string"
                    },
                    "min_num_options": {
                      "type": "integer"
                    },
                    "max_num_options": {
                      "type": "integer"
                    },
                    "num_free_options": {
                      "type": "integer"
                    },
                    "options": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "option_id": {
                            "type": "string"
                          },
                          "name": {
                            "type": "string"
                          },
                          "price": {
                            "type": "number"
                          },
                          "extras": {
                            "type": "array"
                          }
                        },
                        "required": [
                          "option_id",
                          "name",
                          "price",
                          "extras"
                        ],
                        "additionalProperties": true
                      }
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
                  "additionalProperties": true
                }
              },
              "is_orderable": {
                "type": "boolean"
              },
              "unavailability_reason": {
                "type": "null"
              },
              "popular_modifications": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "description": {
                      "type": "string"
                    },
                    "extras": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "extra_id": {
                            "type": "string"
                          },
                          "title": {
                            "type": "string"
                          },
                          "num_free_options": {
                            "type": "integer"
                          },
                          "options": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "properties": {
                                "option_id": {
                                  "type": "string"
                                },
                                "name": {
                                  "type": "string"
                                },
                                "price": {
                                  "type": "number"
                                },
                                "quantity": {
                                  "type": "integer"
                                },
                                "extras": {
                                  "type": "array"
                                }
                              },
                              "required": [
                                "option_id",
                                "name",
                                "price",
                                "quantity",
                                "extras"
                              ],
                              "additionalProperties": true
                            }
                          }
                        },
                        "required": [
                          "extra_id",
                          "title",
                          "num_free_options",
                          "options"
                        ],
                        "additionalProperties": true
                      }
                    }
                  },
                  "required": [
                    "description",
                    "extras"
                  ],
                  "additionalProperties": true
                }
              },
              "is_popular": {
                "type": "boolean"
              },
              "popularity_rank": {
                "type": "integer",
                "nullable": true
              },
              "category_id": {
                "type": "string"
              },
              "category_name": {
                "type": "string"
              },
              "has_modifiers": {
                "type": "boolean"
              },
              "has_required_modifiers": {
                "type": "boolean"
              }
            },
            "required": [
              "item_id",
              "name",
              "description",
              "image_url",
              "price",
              "price_varies",
              "extras",
              "is_orderable",
              "unavailability_reason",
              "popular_modifications",
              "is_popular",
              "popularity_rank",
              "category_id",
              "category_name",
              "has_modifiers",
              "has_required_modifiers"
            ],
            "additionalProperties": true
          }
        },
        "success": {
          "type": "boolean"
        },
        "message": {
          "type": "string"
        },
        "store_is_open": {
          "type": "boolean"
        },
        "widget_type": {
          "type": "string"
        },
        "store_id": {
          "type": "string"
        },
        "store_name": {
          "type": "string"
        },
        "is_authenticated": {
          "type": "boolean"
        },
        "session_id": {
          "type": "string"
        },
        "assistant_instructions": {
          "type": "string"
        },
        "categories": {
          "type": "array"
        }
      },
      "required": [
        "menu_id",
        "items",
        "success",
        "message",
        "store_is_open",
        "widget_type",
        "store_id",
        "store_name",
        "is_authenticated",
        "session_id",
        "assistant_instructions",
        "categories"
      ],
      "additionalProperties": true
    },
    "source": "observed"
  },
  "internal_get_store_info": {
    "component": "DDGetStoreInfoResult",
    "schema": {
      "description": "Response from get_store_info.",
      "properties": {
        "store": {
          "type": "object",
          "properties": {
            "store_id": {
              "type": "string"
            },
            "name": {
              "type": "string"
            },
            "menu_id": {
              "type": "string"
            },
            "image_url": {
              "type": "string"
            },
            "business_id": {
              "type": "integer"
            },
            "business_vertical_id": {
              "type": "null"
            },
            "distance_meters": {
              "type": "null"
            },
            "delivery_time": {
              "type": "string"
            },
            "availability_status": {
              "type": "null"
            },
            "asap_delivery_availability": {
              "type": "null"
            },
            "scheduled_delivery_availability": {
              "type": "null"
            },
            "next_open_time_asap_delivery_ms": {
              "type": "null"
            },
            "next_open_time_scheduled_delivery_ms": {
              "type": "null"
            },
            "submarket_id": {
              "type": "integer"
            },
            "printable_address": {
              "type": "string"
            }
          },
          "required": [
            "store_id",
            "name",
            "menu_id",
            "image_url",
            "business_id",
            "business_vertical_id",
            "distance_meters",
            "delivery_time",
            "availability_status",
            "asap_delivery_availability",
            "scheduled_delivery_availability",
            "next_open_time_asap_delivery_ms",
            "next_open_time_scheduled_delivery_ms",
            "submarket_id",
            "printable_address"
          ],
          "additionalProperties": true
        },
        "success": {
          "default": true,
          "title": "Success",
          "type": "boolean"
        },
        "message": {
          "type": "string"
        }
      },
      "title": "GetStoreInfoResponse",
      "type": "object"
    },
    "source": "advertised + observed"
  },
  "doordash_get_food_item": {
    "component": "DDGetFoodItemResult",
    "schema": {
      "properties": {
        "item": {
          "type": "object",
          "properties": {
            "item_id": {
              "type": "string"
            },
            "name": {
              "type": "string"
            },
            "description": {
              "type": "string"
            },
            "image_url": {
              "type": "string"
            },
            "price": {
              "type": "number"
            },
            "price_varies": {
              "type": "boolean"
            },
            "extras": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "extra_id": {
                    "type": "string"
                  },
                  "title": {
                    "type": "string"
                  },
                  "min_num_options": {
                    "type": "integer"
                  },
                  "max_num_options": {
                    "type": "integer"
                  },
                  "num_free_options": {
                    "type": "integer"
                  },
                  "options": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "properties": {
                        "option_id": {
                          "type": "string"
                        },
                        "name": {
                          "type": "string"
                        },
                        "price": {
                          "type": "number"
                        },
                        "extras": {
                          "type": "array"
                        }
                      },
                      "required": [
                        "option_id",
                        "name",
                        "price",
                        "extras"
                      ],
                      "additionalProperties": true
                    }
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
                "additionalProperties": true
              }
            },
            "is_orderable": {
              "type": "boolean"
            },
            "unavailability_reason": {
              "type": "null"
            },
            "popular_modifications": {
              "type": "array"
            },
            "is_popular": {
              "type": "boolean"
            },
            "popularity_rank": {
              "type": "null"
            },
            "category_id": {
              "type": "string"
            },
            "category_name": {
              "type": "string"
            },
            "has_modifiers": {
              "type": "boolean"
            },
            "has_required_modifiers": {
              "type": "boolean"
            }
          },
          "required": [
            "item_id",
            "name",
            "description",
            "image_url",
            "price",
            "price_varies",
            "extras",
            "is_orderable",
            "unavailability_reason",
            "popular_modifications",
            "is_popular",
            "popularity_rank",
            "category_id",
            "category_name",
            "has_modifiers",
            "has_required_modifiers"
          ],
          "additionalProperties": true
        },
        "success": {
          "default": true,
          "title": "Success",
          "type": "boolean"
        },
        "message": {
          "type": "string"
        }
      },
      "title": "GetFoodItemToolResponse",
      "type": "object"
    },
    "source": "advertised + observed"
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
    },
    "source": "advertised"
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
          "type": "string"
        }
      },
      "required": [
        "stores"
      ],
      "title": "FindStoresResponse",
      "type": "object"
    },
    "source": "advertised + observed"
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
    },
    "source": "advertised"
  },
  "doordash_list_active_carts": {
    "component": "DDListActiveCartsResult",
    "schema": {
      "type": "object",
      "properties": {
        "carts": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "cart_uuid": {
                "type": "string"
              },
              "store_id": {
                "type": "string"
              },
              "store_name": {
                "type": "string"
              },
              "items": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "id": {
                      "type": "string"
                    },
                    "item_id": {
                      "type": "string"
                    },
                    "name": {
                      "type": "string"
                    },
                    "quantity": {
                      "type": "integer"
                    },
                    "price": {
                      "type": "number"
                    },
                    "nested_options": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "id": {
                            "type": "string"
                          },
                          "name": {
                            "type": "string"
                          },
                          "quantity": {
                            "type": "integer"
                          }
                        },
                        "required": [
                          "id",
                          "name",
                          "quantity"
                        ],
                        "additionalProperties": true
                      }
                    }
                  },
                  "required": [
                    "id",
                    "item_id",
                    "name",
                    "quantity",
                    "price",
                    "nested_options"
                  ],
                  "additionalProperties": true
                }
              },
              "items_count": {
                "type": "integer"
              },
              "created_at": {
                "type": "integer"
              },
              "updated_at": {
                "type": "integer"
              }
            },
            "required": [
              "cart_uuid",
              "store_id",
              "store_name",
              "items",
              "items_count",
              "created_at",
              "updated_at"
            ],
            "additionalProperties": true
          }
        },
        "success": {
          "type": "boolean"
        }
      },
      "required": [
        "carts",
        "success"
      ],
      "additionalProperties": true
    },
    "source": "observed"
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
    },
    "source": "advertised"
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
          "type": "object",
          "properties": {
            "id": {
              "type": "string"
            },
            "store_id": {
              "type": "string"
            },
            "store_name": {
              "type": "string"
            },
            "items": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "id": {
                    "type": "string"
                  },
                  "item_id": {
                    "type": "string"
                  },
                  "menu_id": {
                    "type": "string"
                  },
                  "name": {
                    "type": "string"
                  },
                  "description": {
                    "type": "string"
                  },
                  "image_url": {
                    "type": "string"
                  },
                  "quantity": {
                    "type": "integer"
                  },
                  "price": {
                    "type": "number"
                  },
                  "nested_options": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "properties": {
                        "id": {
                          "type": "string"
                        },
                        "quantity": {
                          "type": "integer"
                        },
                        "options": {
                          "type": "array"
                        },
                        "item_extra_option": {
                          "type": "object",
                          "properties": {
                            "id": {
                              "type": "string"
                            },
                            "name": {
                              "type": "string"
                            }
                          },
                          "required": [
                            "id",
                            "name"
                          ],
                          "additionalProperties": true
                        }
                      },
                      "required": [
                        "id",
                        "quantity",
                        "options",
                        "item_extra_option"
                      ],
                      "additionalProperties": true
                    }
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
                "additionalProperties": true
              }
            },
            "items_count": {
              "type": "integer"
            },
            "group_cart_url": {
              "type": "null"
            },
            "spend_limit_cents": {
              "type": "null"
            },
            "is_group_cart": {
              "type": "boolean"
            }
          },
          "required": [
            "id",
            "store_id",
            "store_name",
            "items",
            "items_count",
            "group_cart_url",
            "spend_limit_cents",
            "is_group_cart"
          ],
          "additionalProperties": true
        },
        "cart_uuid": {
          "type": "string"
        },
        "success": {
          "type": "boolean"
        },
        "assistant_instructions": {
          "type": "string"
        },
        "session_id": {
          "type": "string"
        },
        "is_authenticated": {
          "type": "boolean"
        },
        "pricing": {
          "type": "object",
          "properties": {
            "subtotal": {
              "type": "object",
              "properties": {
                "amount_cents": {
                  "type": "integer"
                },
                "display": {
                  "type": "string"
                }
              },
              "required": [
                "amount_cents",
                "display"
              ],
              "additionalProperties": true
            },
            "taxes_and_fees": {
              "type": "object",
              "properties": {
                "total": {
                  "type": "object",
                  "properties": {
                    "amount_cents": {
                      "type": "integer"
                    },
                    "display": {
                      "type": "string"
                    }
                  },
                  "required": [
                    "amount_cents",
                    "display"
                  ],
                  "additionalProperties": true
                },
                "breakdown": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "label": {
                        "type": "string"
                      },
                      "amount_cents": {
                        "type": "integer"
                      },
                      "display": {
                        "type": "string"
                      }
                    },
                    "required": [
                      "label",
                      "amount_cents"
                    ],
                    "additionalProperties": true
                  }
                }
              },
              "required": [
                "total",
                "breakdown"
              ],
              "additionalProperties": true
            },
            "discounts": {
              "type": "object",
              "properties": {
                "total": {
                  "type": "object",
                  "properties": {
                    "amount_cents": {
                      "type": "integer"
                    },
                    "display": {
                      "type": "string"
                    }
                  },
                  "required": [
                    "amount_cents",
                    "display"
                  ],
                  "additionalProperties": true
                },
                "breakdown": {
                  "type": "array"
                }
              },
              "required": [
                "total",
                "breakdown"
              ],
              "additionalProperties": true
            },
            "total_before_tip": {
              "type": "object",
              "properties": {
                "amount_cents": {
                  "type": "integer"
                },
                "display": {
                  "type": "string"
                }
              },
              "required": [
                "amount_cents",
                "display"
              ],
              "additionalProperties": true
            }
          },
          "required": [
            "subtotal",
            "taxes_and_fees",
            "discounts",
            "total_before_tip"
          ],
          "additionalProperties": true
        }
      }
    },
    "source": "advertised + observed"
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
    },
    "source": "advertised"
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
    },
    "source": "advertised"
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
          "type": "string"
        }
      },
      "required": [
        "cart_uuid",
        "store_id",
        "promotions"
      ],
      "title": "EligiblePromotionsResponse",
      "type": "object"
    },
    "source": "advertised + observed"
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
    },
    "source": "advertised"
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
    },
    "source": "advertised"
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
          "type": "string"
        }
      },
      "required": [
        "orders"
      ],
      "title": "OrderHistoryResponse",
      "type": "object"
    },
    "source": "advertised + observed"
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
    },
    "source": "advertised"
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
            "type": "object",
            "properties": {
              "charge_id": {
                "type": "string"
              },
              "label": {
                "type": "string"
              },
              "final_money": {
                "type": "object",
                "properties": {
                  "unit_amount": {
                    "type": "integer"
                  },
                  "currency": {
                    "type": "string"
                  },
                  "display_string": {
                    "type": "string"
                  },
                  "decimal_places": {
                    "type": "integer"
                  },
                  "sign": {
                    "type": "boolean"
                  },
                  "symbol": {
                    "type": "string"
                  }
                },
                "required": [
                  "unit_amount",
                  "currency",
                  "display_string",
                  "decimal_places",
                  "sign",
                  "symbol"
                ],
                "additionalProperties": true
              },
              "original_money": {
                "type": "object",
                "properties": {
                  "unit_amount": {
                    "type": "integer"
                  },
                  "currency": {
                    "type": "string"
                  },
                  "display_string": {
                    "type": "string"
                  },
                  "decimal_places": {
                    "type": "integer"
                  },
                  "sign": {
                    "type": "boolean"
                  },
                  "symbol": {
                    "type": "string"
                  }
                },
                "required": [
                  "unit_amount",
                  "currency",
                  "display_string",
                  "decimal_places",
                  "sign",
                  "symbol"
                ],
                "additionalProperties": true
              },
              "tooltip": {
                "type": "object",
                "properties": {
                  "title": {
                    "type": "string"
                  },
                  "paragraphs": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "properties": {
                        "description": {
                          "type": "string"
                        },
                        "title": {
                          "type": "string"
                        },
                        "hyperlink": {
                          "type": "string"
                        },
                        "hyperlink_title": {
                          "type": "string"
                        }
                      },
                      "required": [
                        "description"
                      ],
                      "additionalProperties": true
                    }
                  }
                },
                "required": [
                  "title",
                  "paragraphs"
                ],
                "additionalProperties": true
              },
              "label_icon": {
                "type": "string"
              },
              "highlight": {
                "type": "string"
              }
            },
            "required": [
              "charge_id",
              "label",
              "final_money"
            ],
            "additionalProperties": true
          },
          "title": "Line Items",
          "type": "array"
        },
        "orders": {
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string"
              },
              "order_items": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "special_instructions": {
                      "type": "string"
                    },
                    "quantity": {
                      "type": "integer"
                    },
                    "id": {
                      "type": "string"
                    },
                    "options": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "quantity": {
                            "type": "integer"
                          },
                          "id": {
                            "type": "string"
                          },
                          "item_extra_option": {
                            "type": "object",
                            "properties": {
                              "quantity": {
                                "type": "integer"
                              },
                              "id": {
                                "type": "string"
                              },
                              "price_monetary_fields": {
                                "type": "object",
                                "properties": {
                                  "unit_amount": {
                                    "type": "integer"
                                  },
                                  "currency": {
                                    "type": "string"
                                  },
                                  "display_string": {
                                    "type": "string"
                                  },
                                  "decimal_places": {
                                    "type": "integer"
                                  },
                                  "sign": {
                                    "type": "boolean"
                                  },
                                  "symbol": {
                                    "type": "string"
                                  }
                                },
                                "required": [
                                  "unit_amount",
                                  "currency",
                                  "display_string",
                                  "decimal_places",
                                  "sign",
                                  "symbol"
                                ],
                                "additionalProperties": true
                              },
                              "name": {
                                "type": "string"
                              },
                              "description": {
                                "type": "string"
                              }
                            },
                            "required": [
                              "quantity",
                              "id",
                              "price_monetary_fields",
                              "name",
                              "description"
                            ],
                            "additionalProperties": true
                          }
                        },
                        "required": [
                          "quantity",
                          "id",
                          "item_extra_option"
                        ],
                        "additionalProperties": true
                      }
                    },
                    "item": {
                      "type": "object",
                      "properties": {
                        "id": {
                          "type": "string"
                        },
                        "name": {
                          "type": "string"
                        },
                        "price": {
                          "type": "integer"
                        },
                        "description": {
                          "type": "string"
                        },
                        "price_monetary_fields": {
                          "type": "object",
                          "properties": {
                            "unit_amount": {
                              "type": "integer"
                            },
                            "currency": {
                              "type": "string"
                            },
                            "display_string": {
                              "type": "string"
                            },
                            "decimal_places": {
                              "type": "integer"
                            },
                            "sign": {
                              "type": "boolean"
                            },
                            "symbol": {
                              "type": "string"
                            }
                          },
                          "required": [
                            "unit_amount",
                            "currency",
                            "display_string",
                            "decimal_places",
                            "sign",
                            "symbol"
                          ],
                          "additionalProperties": true
                        }
                      },
                      "required": [
                        "id",
                        "name",
                        "price",
                        "description",
                        "price_monetary_fields"
                      ],
                      "additionalProperties": true
                    },
                    "unit_price_monetary_fields": {
                      "type": "object",
                      "properties": {
                        "unit_amount": {
                          "type": "integer"
                        },
                        "currency": {
                          "type": "string"
                        },
                        "display_string": {
                          "type": "string"
                        },
                        "decimal_places": {
                          "type": "integer"
                        },
                        "sign": {
                          "type": "boolean"
                        },
                        "symbol": {
                          "type": "string"
                        }
                      },
                      "required": [
                        "unit_amount",
                        "currency",
                        "display_string",
                        "decimal_places",
                        "sign",
                        "symbol"
                      ],
                      "additionalProperties": true
                    },
                    "item_gift_info": {
                      "type": "object",
                      "properties": {},
                      "required": [],
                      "additionalProperties": true
                    }
                  },
                  "required": [
                    "special_instructions",
                    "quantity",
                    "id",
                    "options",
                    "item",
                    "unit_price_monetary_fields",
                    "item_gift_info"
                  ],
                  "additionalProperties": true
                }
              },
              "creator": {
                "type": "object",
                "properties": {
                  "id": {
                    "type": "string"
                  },
                  "first_name": {
                    "type": "string"
                  },
                  "last_name": {
                    "type": "string"
                  },
                  "localized_names": {
                    "type": "object",
                    "properties": {
                      "informal_name": {
                        "type": "string"
                      },
                      "formal_name": {
                        "type": "string"
                      },
                      "formal_name_abbreviated": {
                        "type": "string"
                      }
                    },
                    "required": [
                      "informal_name",
                      "formal_name",
                      "formal_name_abbreviated"
                    ],
                    "additionalProperties": true
                  }
                },
                "required": [
                  "id",
                  "first_name",
                  "last_name",
                  "localized_names"
                ],
                "additionalProperties": true
              },
              "order_item_line_details": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "item_name": {
                      "type": "string"
                    },
                    "subtotal": {
                      "type": "object",
                      "properties": {
                        "unit_amount": {
                          "type": "integer"
                        },
                        "currency": {
                          "type": "string"
                        },
                        "display_string": {
                          "type": "string"
                        },
                        "decimal_places": {
                          "type": "integer"
                        },
                        "sign": {
                          "type": "boolean"
                        },
                        "symbol": {
                          "type": "string"
                        }
                      },
                      "required": [
                        "unit_amount",
                        "currency",
                        "display_string",
                        "decimal_places",
                        "sign",
                        "symbol"
                      ],
                      "additionalProperties": true
                    },
                    "substitution_preference": {
                      "type": "string"
                    },
                    "is_out_of_stock": {
                      "type": "boolean"
                    },
                    "purchase_type": {
                      "type": "string"
                    },
                    "requested_quantity": {
                      "type": "object",
                      "properties": {
                        "discrete_quantity": {
                          "type": "object",
                          "properties": {
                            "quantity": {
                              "type": "integer"
                            },
                            "unit": {
                              "type": "string"
                            }
                          },
                          "required": [
                            "quantity",
                            "unit"
                          ],
                          "additionalProperties": true
                        }
                      },
                      "required": [
                        "discrete_quantity"
                      ],
                      "additionalProperties": true
                    },
                    "fulfilled_quantity": {
                      "type": "object",
                      "properties": {
                        "discrete_quantity": {
                          "type": "object",
                          "properties": {
                            "quantity": {
                              "type": "integer"
                            },
                            "unit": {
                              "type": "string"
                            }
                          },
                          "required": [
                            "quantity",
                            "unit"
                          ],
                          "additionalProperties": true
                        }
                      },
                      "required": [
                        "discrete_quantity"
                      ],
                      "additionalProperties": true
                    },
                    "item_option_details": {
                      "type": "array",
                      "items": {
                        "type": "string"
                      }
                    },
                    "missing_and_incorrect_info": {
                      "type": "object",
                      "properties": {},
                      "required": [],
                      "additionalProperties": true
                    },
                    "is_undeliverable": {
                      "type": "boolean"
                    },
                    "image_url": {
                      "type": "string"
                    }
                  },
                  "required": [
                    "item_name",
                    "subtotal",
                    "substitution_preference",
                    "is_out_of_stock",
                    "purchase_type",
                    "requested_quantity",
                    "fulfilled_quantity",
                    "item_option_details",
                    "missing_and_incorrect_info",
                    "is_undeliverable",
                    "image_url"
                  ],
                  "additionalProperties": true
                }
              }
            },
            "required": [
              "id",
              "order_items",
              "creator",
              "order_item_line_details"
            ],
            "additionalProperties": true
          },
          "title": "Orders",
          "type": "array"
        },
        "payment_charge_details": {
          "items": {
            "type": "object",
            "properties": {
              "count": {
                "type": "integer"
              },
              "data": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "net_amount": {
                      "type": "object",
                      "properties": {
                        "unit_amount": {
                          "type": "integer"
                        },
                        "currency": {
                          "type": "string"
                        },
                        "display_string": {
                          "type": "string"
                        },
                        "decimal_places": {
                          "type": "integer"
                        },
                        "sign": {
                          "type": "boolean"
                        },
                        "symbol": {
                          "type": "string"
                        }
                      },
                      "required": [
                        "unit_amount",
                        "currency",
                        "display_string",
                        "decimal_places",
                        "sign",
                        "symbol"
                      ],
                      "additionalProperties": true
                    },
                    "original_amount": {
                      "type": "object",
                      "properties": {
                        "unit_amount": {
                          "type": "integer"
                        },
                        "currency": {
                          "type": "string"
                        },
                        "display_string": {
                          "type": "string"
                        },
                        "decimal_places": {
                          "type": "integer"
                        },
                        "sign": {
                          "type": "boolean"
                        },
                        "symbol": {
                          "type": "string"
                        }
                      },
                      "required": [
                        "unit_amount",
                        "currency",
                        "display_string",
                        "decimal_places",
                        "sign",
                        "symbol"
                      ],
                      "additionalProperties": true
                    },
                    "status": {
                      "type": "string"
                    },
                    "created_at": {
                      "type": "string"
                    },
                    "updated_at": {
                      "type": "string"
                    },
                    "payment_method": {
                      "type": "object",
                      "properties": {
                        "dd_payment_method_id": {
                          "type": "string"
                        },
                        "last4": {
                          "type": "string"
                        },
                        "brand": {
                          "type": "string"
                        }
                      },
                      "required": [
                        "dd_payment_method_id",
                        "last4",
                        "brand"
                      ],
                      "additionalProperties": true
                    }
                  },
                  "required": [
                    "net_amount",
                    "original_amount",
                    "status",
                    "created_at",
                    "updated_at",
                    "payment_method"
                  ],
                  "additionalProperties": true
                }
              }
            },
            "required": [
              "count",
              "data"
            ],
            "additionalProperties": true
          },
          "title": "Payment Charge Details",
          "type": "array"
        },
        "credited_amount": {
          "type": "object",
          "properties": {},
          "required": [],
          "additionalProperties": true
        },
        "receipt": {
          "type": "object",
          "properties": {
            "line_items": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "charge_id": {
                    "type": "string"
                  },
                  "label": {
                    "type": "string"
                  },
                  "final_money": {
                    "type": "object",
                    "properties": {
                      "unit_amount": {
                        "type": "integer"
                      },
                      "currency": {
                        "type": "string"
                      },
                      "display_string": {
                        "type": "string"
                      },
                      "decimal_places": {
                        "type": "integer"
                      },
                      "sign": {
                        "type": "boolean"
                      },
                      "symbol": {
                        "type": "string"
                      }
                    },
                    "required": [
                      "unit_amount",
                      "currency",
                      "display_string",
                      "decimal_places",
                      "sign",
                      "symbol"
                    ],
                    "additionalProperties": true
                  },
                  "original_money": {
                    "type": "object",
                    "properties": {
                      "unit_amount": {
                        "type": "integer"
                      },
                      "currency": {
                        "type": "string"
                      },
                      "display_string": {
                        "type": "string"
                      },
                      "decimal_places": {
                        "type": "integer"
                      },
                      "sign": {
                        "type": "boolean"
                      },
                      "symbol": {
                        "type": "string"
                      }
                    },
                    "required": [
                      "unit_amount",
                      "currency",
                      "display_string",
                      "decimal_places",
                      "sign",
                      "symbol"
                    ],
                    "additionalProperties": true
                  },
                  "tooltip": {
                    "type": "object",
                    "properties": {
                      "title": {
                        "type": "string"
                      },
                      "paragraphs": {
                        "type": "array",
                        "items": {
                          "type": "object",
                          "properties": {
                            "description": {
                              "type": "string"
                            },
                            "title": {
                              "type": "string"
                            },
                            "hyperlink": {
                              "type": "string"
                            },
                            "hyperlink_title": {
                              "type": "string"
                            }
                          },
                          "required": [
                            "description"
                          ],
                          "additionalProperties": true
                        }
                      }
                    },
                    "required": [
                      "title",
                      "paragraphs"
                    ],
                    "additionalProperties": true
                  },
                  "label_icon": {
                    "type": "string"
                  },
                  "highlight": {
                    "type": "string"
                  }
                },
                "required": [
                  "charge_id",
                  "label",
                  "final_money"
                ],
                "additionalProperties": true
              }
            },
            "orders": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "id": {
                    "type": "string"
                  },
                  "order_items": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "properties": {
                        "special_instructions": {
                          "type": "string"
                        },
                        "quantity": {
                          "type": "integer"
                        },
                        "id": {
                          "type": "string"
                        },
                        "options": {
                          "type": "array",
                          "items": {
                            "type": "object",
                            "properties": {
                              "quantity": {
                                "type": "integer"
                              },
                              "id": {
                                "type": "string"
                              },
                              "item_extra_option": {
                                "type": "object",
                                "properties": {
                                  "quantity": {
                                    "type": "integer"
                                  },
                                  "id": {
                                    "type": "string"
                                  },
                                  "price_monetary_fields": {
                                    "type": "object",
                                    "properties": {
                                      "unit_amount": {
                                        "type": "integer"
                                      },
                                      "currency": {
                                        "type": "string"
                                      },
                                      "display_string": {
                                        "type": "string"
                                      },
                                      "decimal_places": {
                                        "type": "integer"
                                      },
                                      "sign": {
                                        "type": "boolean"
                                      },
                                      "symbol": {
                                        "type": "string"
                                      }
                                    },
                                    "required": [
                                      "unit_amount",
                                      "currency",
                                      "display_string",
                                      "decimal_places",
                                      "sign",
                                      "symbol"
                                    ],
                                    "additionalProperties": true
                                  },
                                  "name": {
                                    "type": "string"
                                  },
                                  "description": {
                                    "type": "string"
                                  }
                                },
                                "required": [
                                  "quantity",
                                  "id",
                                  "price_monetary_fields",
                                  "name",
                                  "description"
                                ],
                                "additionalProperties": true
                              }
                            },
                            "required": [
                              "quantity",
                              "id",
                              "item_extra_option"
                            ],
                            "additionalProperties": true
                          }
                        },
                        "item": {
                          "type": "object",
                          "properties": {
                            "id": {
                              "type": "string"
                            },
                            "name": {
                              "type": "string"
                            },
                            "price": {
                              "type": "integer"
                            },
                            "description": {
                              "type": "string"
                            },
                            "price_monetary_fields": {
                              "type": "object",
                              "properties": {
                                "unit_amount": {
                                  "type": "integer"
                                },
                                "currency": {
                                  "type": "string"
                                },
                                "display_string": {
                                  "type": "string"
                                },
                                "decimal_places": {
                                  "type": "integer"
                                },
                                "sign": {
                                  "type": "boolean"
                                },
                                "symbol": {
                                  "type": "string"
                                }
                              },
                              "required": [
                                "unit_amount",
                                "currency",
                                "display_string",
                                "decimal_places",
                                "sign",
                                "symbol"
                              ],
                              "additionalProperties": true
                            }
                          },
                          "required": [
                            "id",
                            "name",
                            "price",
                            "description",
                            "price_monetary_fields"
                          ],
                          "additionalProperties": true
                        },
                        "unit_price_monetary_fields": {
                          "type": "object",
                          "properties": {
                            "unit_amount": {
                              "type": "integer"
                            },
                            "currency": {
                              "type": "string"
                            },
                            "display_string": {
                              "type": "string"
                            },
                            "decimal_places": {
                              "type": "integer"
                            },
                            "sign": {
                              "type": "boolean"
                            },
                            "symbol": {
                              "type": "string"
                            }
                          },
                          "required": [
                            "unit_amount",
                            "currency",
                            "display_string",
                            "decimal_places",
                            "sign",
                            "symbol"
                          ],
                          "additionalProperties": true
                        },
                        "item_gift_info": {
                          "type": "object",
                          "properties": {},
                          "required": [],
                          "additionalProperties": true
                        }
                      },
                      "required": [
                        "special_instructions",
                        "quantity",
                        "id",
                        "options",
                        "item",
                        "unit_price_monetary_fields",
                        "item_gift_info"
                      ],
                      "additionalProperties": true
                    }
                  },
                  "creator": {
                    "type": "object",
                    "properties": {
                      "id": {
                        "type": "string"
                      },
                      "first_name": {
                        "type": "string"
                      },
                      "last_name": {
                        "type": "string"
                      },
                      "localized_names": {
                        "type": "object",
                        "properties": {
                          "informal_name": {
                            "type": "string"
                          },
                          "formal_name": {
                            "type": "string"
                          },
                          "formal_name_abbreviated": {
                            "type": "string"
                          }
                        },
                        "required": [
                          "informal_name",
                          "formal_name",
                          "formal_name_abbreviated"
                        ],
                        "additionalProperties": true
                      }
                    },
                    "required": [
                      "id",
                      "first_name",
                      "last_name",
                      "localized_names"
                    ],
                    "additionalProperties": true
                  },
                  "order_item_line_details": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "properties": {
                        "item_name": {
                          "type": "string"
                        },
                        "subtotal": {
                          "type": "object",
                          "properties": {
                            "unit_amount": {
                              "type": "integer"
                            },
                            "currency": {
                              "type": "string"
                            },
                            "display_string": {
                              "type": "string"
                            },
                            "decimal_places": {
                              "type": "integer"
                            },
                            "sign": {
                              "type": "boolean"
                            },
                            "symbol": {
                              "type": "string"
                            }
                          },
                          "required": [
                            "unit_amount",
                            "currency",
                            "display_string",
                            "decimal_places",
                            "sign",
                            "symbol"
                          ],
                          "additionalProperties": true
                        },
                        "substitution_preference": {
                          "type": "string"
                        },
                        "is_out_of_stock": {
                          "type": "boolean"
                        },
                        "purchase_type": {
                          "type": "string"
                        },
                        "requested_quantity": {
                          "type": "object",
                          "properties": {
                            "discrete_quantity": {
                              "type": "object",
                              "properties": {
                                "quantity": {
                                  "type": "integer"
                                },
                                "unit": {
                                  "type": "string"
                                }
                              },
                              "required": [
                                "quantity",
                                "unit"
                              ],
                              "additionalProperties": true
                            }
                          },
                          "required": [
                            "discrete_quantity"
                          ],
                          "additionalProperties": true
                        },
                        "fulfilled_quantity": {
                          "type": "object",
                          "properties": {
                            "discrete_quantity": {
                              "type": "object",
                              "properties": {
                                "quantity": {
                                  "type": "integer"
                                },
                                "unit": {
                                  "type": "string"
                                }
                              },
                              "required": [
                                "quantity",
                                "unit"
                              ],
                              "additionalProperties": true
                            }
                          },
                          "required": [
                            "discrete_quantity"
                          ],
                          "additionalProperties": true
                        },
                        "item_option_details": {
                          "type": "array",
                          "items": {
                            "type": "string"
                          }
                        },
                        "missing_and_incorrect_info": {
                          "type": "object",
                          "properties": {},
                          "required": [],
                          "additionalProperties": true
                        },
                        "is_undeliverable": {
                          "type": "boolean"
                        },
                        "image_url": {
                          "type": "string"
                        }
                      },
                      "required": [
                        "item_name",
                        "subtotal",
                        "substitution_preference",
                        "is_out_of_stock",
                        "purchase_type",
                        "requested_quantity",
                        "fulfilled_quantity",
                        "item_option_details",
                        "missing_and_incorrect_info",
                        "is_undeliverable",
                        "image_url"
                      ],
                      "additionalProperties": true
                    }
                  }
                },
                "required": [
                  "id",
                  "order_items",
                  "creator",
                  "order_item_line_details"
                ],
                "additionalProperties": true
              }
            },
            "store_name": {
              "type": "string"
            },
            "creditsback_details": {
              "type": "object",
              "properties": {
                "amount": {
                  "type": "object",
                  "properties": {
                    "unit_amount": {
                      "type": "integer"
                    },
                    "currency": {
                      "type": "string"
                    },
                    "display_string": {
                      "type": "string"
                    },
                    "decimal_places": {
                      "type": "integer"
                    },
                    "sign": {
                      "type": "boolean"
                    },
                    "symbol": {
                      "type": "string"
                    }
                  },
                  "required": [
                    "unit_amount",
                    "currency",
                    "display_string",
                    "decimal_places",
                    "sign",
                    "symbol"
                  ],
                  "additionalProperties": true
                }
              },
              "required": [
                "amount"
              ],
              "additionalProperties": true
            },
            "store_address": {
              "type": "object",
              "properties": {
                "printable_address": {
                  "type": "string"
                },
                "street": {
                  "type": "string"
                },
                "city": {
                  "type": "string"
                },
                "subpremise": {
                  "type": "string"
                },
                "state": {
                  "type": "string"
                },
                "zip_code": {
                  "type": "string"
                },
                "lng": {
                  "type": "string"
                },
                "lat": {
                  "type": "string"
                },
                "country_code": {
                  "type": "string"
                },
                "timezone": {
                  "type": "string"
                },
                "postal_code_suffix": {
                  "type": "string"
                }
              },
              "required": [
                "printable_address",
                "street",
                "city",
                "subpremise",
                "state",
                "zip_code",
                "lng",
                "lat",
                "country_code",
                "timezone",
                "postal_code_suffix"
              ],
              "additionalProperties": true
            },
            "store_id": {
              "type": "string"
            },
            "payment_charge_details": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "count": {
                    "type": "integer"
                  },
                  "data": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "properties": {
                        "net_amount": {
                          "type": "object",
                          "properties": {
                            "unit_amount": {
                              "type": "integer"
                            },
                            "currency": {
                              "type": "string"
                            },
                            "display_string": {
                              "type": "string"
                            },
                            "decimal_places": {
                              "type": "integer"
                            },
                            "sign": {
                              "type": "boolean"
                            },
                            "symbol": {
                              "type": "string"
                            }
                          },
                          "required": [
                            "unit_amount",
                            "currency",
                            "display_string",
                            "decimal_places",
                            "sign",
                            "symbol"
                          ],
                          "additionalProperties": true
                        },
                        "original_amount": {
                          "type": "object",
                          "properties": {
                            "unit_amount": {
                              "type": "integer"
                            },
                            "currency": {
                              "type": "string"
                            },
                            "display_string": {
                              "type": "string"
                            },
                            "decimal_places": {
                              "type": "integer"
                            },
                            "sign": {
                              "type": "boolean"
                            },
                            "symbol": {
                              "type": "string"
                            }
                          },
                          "required": [
                            "unit_amount",
                            "currency",
                            "display_string",
                            "decimal_places",
                            "sign",
                            "symbol"
                          ],
                          "additionalProperties": true
                        },
                        "status": {
                          "type": "string"
                        },
                        "created_at": {
                          "type": "string"
                        },
                        "updated_at": {
                          "type": "string"
                        },
                        "payment_method": {
                          "type": "object",
                          "properties": {
                            "dd_payment_method_id": {
                              "type": "string"
                            },
                            "last4": {
                              "type": "string"
                            },
                            "brand": {
                              "type": "string"
                            }
                          },
                          "required": [
                            "dd_payment_method_id",
                            "last4",
                            "brand"
                          ],
                          "additionalProperties": true
                        }
                      },
                      "required": [
                        "net_amount",
                        "original_amount",
                        "status",
                        "created_at",
                        "updated_at",
                        "payment_method"
                      ],
                      "additionalProperties": true
                    }
                  }
                },
                "required": [
                  "count",
                  "data"
                ],
                "additionalProperties": true
              }
            }
          },
          "required": [
            "line_items",
            "orders",
            "store_name",
            "creditsback_details",
            "store_address",
            "store_id",
            "payment_charge_details"
          ],
          "additionalProperties": true
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
    },
    "source": "advertised + observed"
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
    },
    "source": "advertised"
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
          "type": "object",
          "properties": {
            "line_items": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "charge_id": {
                    "type": "string"
                  },
                  "label": {
                    "type": "string"
                  },
                  "final_money": {
                    "type": "object",
                    "properties": {
                      "unit_amount": {
                        "type": "integer"
                      },
                      "currency": {
                        "type": "string"
                      },
                      "display_string": {
                        "type": "string"
                      },
                      "decimal_places": {
                        "type": "integer"
                      },
                      "sign": {
                        "type": "boolean"
                      },
                      "symbol": {
                        "type": "string"
                      }
                    },
                    "required": [
                      "unit_amount",
                      "currency",
                      "display_string",
                      "decimal_places",
                      "sign",
                      "symbol"
                    ],
                    "additionalProperties": true
                  },
                  "tooltip": {
                    "type": "object",
                    "properties": {
                      "title": {
                        "type": "string"
                      },
                      "paragraphs": {
                        "type": "array",
                        "items": {
                          "type": "object",
                          "properties": {
                            "title": {
                              "type": "string"
                            },
                            "description": {
                              "type": "string"
                            },
                            "hyperlink": {
                              "type": "string"
                            },
                            "hyperlink_title": {
                              "type": "string"
                            }
                          },
                          "required": [
                            "description"
                          ],
                          "additionalProperties": true
                        }
                      }
                    },
                    "required": [
                      "title",
                      "paragraphs"
                    ],
                    "additionalProperties": true
                  },
                  "label_icon": {
                    "type": "string"
                  },
                  "original_money": {
                    "type": "object",
                    "properties": {
                      "unit_amount": {
                        "type": "integer"
                      },
                      "currency": {
                        "type": "string"
                      },
                      "display_string": {
                        "type": "string"
                      },
                      "decimal_places": {
                        "type": "integer"
                      },
                      "sign": {
                        "type": "boolean"
                      },
                      "symbol": {
                        "type": "string"
                      }
                    },
                    "required": [
                      "unit_amount",
                      "currency",
                      "display_string",
                      "decimal_places",
                      "sign",
                      "symbol"
                    ],
                    "additionalProperties": true
                  },
                  "discount_icon": {
                    "type": "string"
                  },
                  "highlight": {
                    "type": "string"
                  }
                },
                "required": [
                  "charge_id",
                  "label",
                  "final_money"
                ],
                "additionalProperties": true
              }
            },
            "store_order_cart": {
              "type": "object",
              "properties": {
                "is_consumer_pickup": {
                  "type": "boolean"
                },
                "menu": {
                  "type": "object",
                  "properties": {
                    "id": {
                      "type": "string"
                    },
                    "catering_info": {
                      "type": "object",
                      "properties": {
                        "is_catering": {
                          "type": "boolean"
                        }
                      },
                      "required": [
                        "is_catering"
                      ],
                      "additionalProperties": true
                    }
                  },
                  "required": [
                    "id",
                    "catering_info"
                  ],
                  "additionalProperties": true
                },
                "orders": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "id": {
                        "type": "string"
                      },
                      "order_items": {
                        "type": "array",
                        "items": {
                          "type": "object",
                          "properties": {
                            "id": {
                              "type": "string"
                            },
                            "unit_price_monetary_fields": {
                              "type": "object",
                              "properties": {
                                "unit_amount": {
                                  "type": "integer"
                                },
                                "currency": {
                                  "type": "string"
                                },
                                "display_string": {
                                  "type": "string"
                                },
                                "decimal_places": {
                                  "type": "integer"
                                },
                                "sign": {
                                  "type": "boolean"
                                }
                              },
                              "required": [
                                "unit_amount",
                                "currency",
                                "display_string",
                                "decimal_places",
                                "sign"
                              ],
                              "additionalProperties": true
                            },
                            "item": {
                              "type": "object",
                              "properties": {
                                "id": {
                                  "type": "string"
                                },
                                "name": {
                                  "type": "string"
                                },
                                "price": {
                                  "type": "integer"
                                },
                                "description": {
                                  "type": "string"
                                },
                                "category": {
                                  "type": "object",
                                  "properties": {
                                    "id": {
                                      "type": "string"
                                    },
                                    "name": {
                                      "type": "string"
                                    }
                                  },
                                  "required": [
                                    "id",
                                    "name"
                                  ],
                                  "additionalProperties": true
                                },
                                "price_monetary_fields": {
                                  "type": "object",
                                  "properties": {
                                    "unit_amount": {
                                      "type": "integer"
                                    },
                                    "currency": {
                                      "type": "string"
                                    },
                                    "display_string": {
                                      "type": "string"
                                    },
                                    "decimal_places": {
                                      "type": "integer"
                                    },
                                    "sign": {
                                      "type": "boolean"
                                    },
                                    "symbol": {
                                      "type": "string"
                                    }
                                  },
                                  "required": [
                                    "unit_amount",
                                    "currency",
                                    "display_string",
                                    "decimal_places",
                                    "sign",
                                    "symbol"
                                  ],
                                  "additionalProperties": true
                                },
                                "image_url": {
                                  "type": "string"
                                },
                                "store_id": {
                                  "type": "string"
                                },
                                "dd_sic": {
                                  "type": "string"
                                }
                              },
                              "required": [
                                "id",
                                "name",
                                "price",
                                "description",
                                "category",
                                "price_monetary_fields",
                                "image_url",
                                "store_id",
                                "dd_sic"
                              ],
                              "additionalProperties": true
                            },
                            "quantity": {
                              "type": "integer"
                            },
                            "substitution_preference": {
                              "type": "string"
                            },
                            "special_instructions": {
                              "type": "string"
                            },
                            "purchase_type": {
                              "type": "string"
                            },
                            "item_quantity_info": {
                              "type": "object",
                              "properties": {
                                "discrete_quantity": {
                                  "type": "object",
                                  "properties": {
                                    "quantity": {
                                      "type": "integer"
                                    },
                                    "unit": {
                                      "type": "string"
                                    }
                                  },
                                  "required": [
                                    "quantity",
                                    "unit"
                                  ],
                                  "additionalProperties": true
                                }
                              },
                              "required": [
                                "discrete_quantity"
                              ],
                              "additionalProperties": true
                            },
                            "merchant_supplied_item_id": {
                              "type": "string"
                            },
                            "options": {
                              "type": "array",
                              "items": {
                                "type": "object",
                                "properties": {
                                  "id": {
                                    "type": "string"
                                  },
                                  "quantity": {
                                    "type": "integer"
                                  },
                                  "item_extra_option": {
                                    "type": "object",
                                    "properties": {
                                      "id": {
                                        "type": "string"
                                      },
                                      "name": {
                                        "type": "string"
                                      },
                                      "price": {
                                        "type": "integer"
                                      },
                                      "quantity": {
                                        "type": "integer"
                                      },
                                      "description": {
                                        "type": "string"
                                      },
                                      "item_extra": {
                                        "type": "object",
                                        "properties": {
                                          "id": {
                                            "type": "string"
                                          },
                                          "name": {
                                            "type": "string"
                                          }
                                        },
                                        "required": [
                                          "id",
                                          "name"
                                        ],
                                        "additionalProperties": true
                                      },
                                      "price_monetary_fields": {
                                        "type": "object",
                                        "properties": {
                                          "unit_amount": {
                                            "type": "integer"
                                          },
                                          "currency": {
                                            "type": "string"
                                          },
                                          "display_string": {
                                            "type": "string"
                                          },
                                          "decimal_places": {
                                            "type": "integer"
                                          },
                                          "sign": {
                                            "type": "boolean"
                                          },
                                          "symbol": {
                                            "type": "string"
                                          }
                                        },
                                        "required": [
                                          "unit_amount",
                                          "currency",
                                          "display_string",
                                          "decimal_places",
                                          "sign",
                                          "symbol"
                                        ],
                                        "additionalProperties": true
                                      },
                                      "merchant_supplied_item_id": {
                                        "type": "string"
                                      }
                                    },
                                    "required": [
                                      "id",
                                      "name",
                                      "price",
                                      "quantity",
                                      "description",
                                      "item_extra",
                                      "price_monetary_fields",
                                      "merchant_supplied_item_id"
                                    ],
                                    "additionalProperties": true
                                  }
                                },
                                "required": [
                                  "id",
                                  "quantity",
                                  "item_extra_option"
                                ],
                                "additionalProperties": true
                              }
                            }
                          },
                          "required": [
                            "id",
                            "unit_price_monetary_fields",
                            "item",
                            "quantity",
                            "substitution_preference",
                            "special_instructions",
                            "purchase_type",
                            "item_quantity_info",
                            "merchant_supplied_item_id"
                          ],
                          "additionalProperties": true
                        }
                      },
                      "creator": {
                        "type": "object",
                        "properties": {
                          "id": {
                            "type": "string"
                          },
                          "first_name": {
                            "type": "string"
                          },
                          "last_name": {
                            "type": "string"
                          },
                          "localized_names": {
                            "type": "object",
                            "properties": {
                              "informal_name": {
                                "type": "string"
                              },
                              "formal_name": {
                                "type": "string"
                              },
                              "formal_name_abbreviated": {
                                "type": "string"
                              }
                            },
                            "required": [
                              "informal_name",
                              "formal_name",
                              "formal_name_abbreviated"
                            ],
                            "additionalProperties": true
                          }
                        },
                        "required": [
                          "id",
                          "first_name",
                          "last_name",
                          "localized_names"
                        ],
                        "additionalProperties": true
                      }
                    },
                    "required": [
                      "id",
                      "order_items",
                      "creator"
                    ],
                    "additionalProperties": true
                  }
                },
                "store": {
                  "type": "object",
                  "properties": {
                    "id": {
                      "type": "string"
                    },
                    "name": {
                      "type": "string"
                    },
                    "is_good_for_group_orders": {
                      "type": "boolean"
                    },
                    "offers_pickup": {
                      "type": "boolean"
                    },
                    "provides_external_courier_tracking": {
                      "type": "boolean"
                    },
                    "fulfills_own_deliveries": {
                      "type": "boolean"
                    },
                    "is_consumer_subscription_eligible": {
                      "type": "boolean"
                    },
                    "business": {
                      "type": "object",
                      "properties": {
                        "business_vertical_id": {
                          "type": "string"
                        },
                        "name": {
                          "type": "string"
                        },
                        "id": {
                          "type": "string"
                        },
                        "dynamic_properties": {
                          "type": "object",
                          "properties": {},
                          "required": [],
                          "additionalProperties": true
                        }
                      },
                      "required": [
                        "business_vertical_id",
                        "name",
                        "id",
                        "dynamic_properties"
                      ],
                      "additionalProperties": true
                    },
                    "address": {
                      "type": "object",
                      "properties": {
                        "printable_address": {
                          "type": "string"
                        },
                        "street": {
                          "type": "string"
                        },
                        "city": {
                          "type": "string"
                        },
                        "subpremise": {
                          "type": "string"
                        },
                        "state": {
                          "type": "string"
                        },
                        "zip_code": {
                          "type": "string"
                        },
                        "lng": {
                          "type": "number"
                        },
                        "lat": {
                          "type": "number"
                        },
                        "country_code": {
                          "type": "string"
                        },
                        "short_name": {
                          "type": "string"
                        }
                      },
                      "required": [
                        "printable_address",
                        "street",
                        "city",
                        "subpremise",
                        "state",
                        "zip_code",
                        "lng",
                        "lat",
                        "country_code",
                        "short_name"
                      ],
                      "additionalProperties": true
                    },
                    "should_show_store_logo": {
                      "type": "boolean"
                    },
                    "cover_img_url": {
                      "type": "string"
                    },
                    "slug": {
                      "type": "string"
                    },
                    "consumer_pickup_requires_checkin": {
                      "type": "boolean"
                    },
                    "square_cover_img_url": {
                      "type": "string"
                    },
                    "is_retail": {
                      "type": "boolean"
                    },
                    "offers_shipping": {
                      "type": "boolean"
                    },
                    "ads_vertical": {
                      "type": "string"
                    },
                    "order_protocol": {
                      "type": "string"
                    },
                    "ideal_group_size": {
                      "type": "string"
                    },
                    "high_quality_subtotal_threshold": {
                      "type": "string"
                    },
                    "timezone": {
                      "type": "string"
                    }
                  },
                  "required": [
                    "id",
                    "name",
                    "is_good_for_group_orders",
                    "offers_pickup",
                    "provides_external_courier_tracking",
                    "fulfills_own_deliveries",
                    "is_consumer_subscription_eligible",
                    "business",
                    "address",
                    "should_show_store_logo",
                    "cover_img_url",
                    "slug",
                    "consumer_pickup_requires_checkin",
                    "square_cover_img_url",
                    "is_retail",
                    "offers_shipping",
                    "ads_vertical",
                    "order_protocol",
                    "ideal_group_size",
                    "high_quality_subtotal_threshold",
                    "timezone"
                  ],
                  "additionalProperties": true
                },
                "offers_delivery": {
                  "type": "boolean"
                },
                "submarket_id": {
                  "type": "string"
                },
                "domain": {
                  "type": "object",
                  "properties": {
                    "gift_options": {
                      "type": "object",
                      "properties": {},
                      "required": [],
                      "additionalProperties": true
                    }
                  },
                  "required": [
                    "gift_options"
                  ],
                  "additionalProperties": true
                },
                "is_merchant_shipping": {
                  "type": "boolean"
                },
                "is_drone_delivery": {
                  "type": "boolean"
                },
                "cart_experience": {
                  "type": "string"
                },
                "cart_type": {
                  "type": "string"
                }
              },
              "required": [
                "is_consumer_pickup",
                "menu",
                "orders",
                "store",
                "offers_delivery",
                "submarket_id",
                "domain",
                "is_merchant_shipping",
                "is_drone_delivery",
                "cart_experience",
                "cart_type"
              ],
              "additionalProperties": true
            },
            "creator": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string"
                },
                "email": {
                  "type": "string"
                },
                "first_name": {
                  "type": "string"
                },
                "last_name": {
                  "type": "string"
                },
                "localized_names": {
                  "type": "object",
                  "properties": {
                    "informal_name": {
                      "type": "string"
                    },
                    "formal_name": {
                      "type": "string"
                    },
                    "formal_name_abbreviated": {
                      "type": "string"
                    }
                  },
                  "required": [
                    "informal_name",
                    "formal_name",
                    "formal_name_abbreviated"
                  ],
                  "additionalProperties": true
                }
              },
              "required": [
                "id",
                "email",
                "first_name",
                "last_name",
                "localized_names"
              ],
              "additionalProperties": true
            },
            "min_age_requirement": {
              "type": "integer"
            },
            "currency": {
              "type": "string"
            },
            "delivery_availability": {
              "type": "object",
              "properties": {
                "asap_available": {
                  "type": "boolean"
                },
                "asap_minutes_range": {
                  "type": "array",
                  "items": {
                    "type": "integer"
                  }
                },
                "asap_pickup_available": {
                  "type": "boolean"
                },
                "asap_pickup_minutes_range": {
                  "type": "array",
                  "items": {
                    "type": "integer"
                  }
                },
                "is_killed": {
                  "type": "boolean"
                },
                "is_within_delivery_region": {
                  "type": "boolean"
                },
                "asap_minutes_range_string": {
                  "type": "string"
                },
                "asap_pickup_minutes_range_string": {
                  "type": "string"
                },
                "available_days": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "day_timestamp": {
                        "type": "object",
                        "properties": {
                          "year": {
                            "type": "integer"
                          },
                          "month": {
                            "type": "integer"
                          },
                          "day": {
                            "type": "integer"
                          }
                        },
                        "required": [
                          "year",
                          "month",
                          "day"
                        ],
                        "additionalProperties": true
                      },
                      "time_windows": {
                        "type": "array",
                        "items": {
                          "type": "object",
                          "properties": {
                            "display_string": {
                              "type": "string"
                            },
                            "midpoint_timestamp": {
                              "type": "string"
                            },
                            "range_min": {
                              "type": "string"
                            },
                            "range_max": {
                              "type": "string"
                            }
                          },
                          "required": [
                            "display_string",
                            "midpoint_timestamp",
                            "range_min",
                            "range_max"
                          ],
                          "additionalProperties": true
                        }
                      }
                    },
                    "required": [
                      "day_timestamp",
                      "time_windows"
                    ],
                    "additionalProperties": true
                  }
                },
                "timezone": {
                  "type": "string"
                },
                "delivery_options": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "delivery_option_type": {
                        "type": "string"
                      },
                      "option_title": {
                        "type": "string"
                      },
                      "eta_minutes_range": {
                        "type": "string"
                      },
                      "option_quote_message": {
                        "type": "string"
                      },
                      "title": {
                        "type": "object",
                        "properties": {
                          "display_string": {
                            "type": "string"
                          },
                          "text_style": {
                            "type": "string"
                          },
                          "text_color": {
                            "type": "string"
                          }
                        },
                        "required": [
                          "display_string",
                          "text_style",
                          "text_color"
                        ],
                        "additionalProperties": true
                      },
                      "sub_title": {
                        "type": "object",
                        "properties": {
                          "display_string": {
                            "type": "string"
                          },
                          "text_style": {
                            "type": "string"
                          },
                          "text_color": {
                            "type": "string"
                          }
                        },
                        "required": [
                          "display_string",
                          "text_style",
                          "text_color"
                        ],
                        "additionalProperties": true
                      },
                      "description": {
                        "type": "object",
                        "properties": {
                          "display_string": {
                            "type": "string"
                          },
                          "text_style": {
                            "type": "string"
                          },
                          "text_color": {
                            "type": "string"
                          }
                        },
                        "required": [
                          "display_string",
                          "text_style",
                          "text_color"
                        ],
                        "additionalProperties": true
                      },
                      "sub_description": {
                        "type": "object",
                        "properties": {
                          "display_string": {
                            "type": "string"
                          },
                          "text_style": {
                            "type": "string"
                          },
                          "text_color": {
                            "type": "string"
                          }
                        },
                        "required": [
                          "display_string",
                          "text_style",
                          "text_color"
                        ],
                        "additionalProperties": true
                      },
                      "is_option_selectable": {
                        "type": "boolean"
                      },
                      "is_schedule_delivery": {
                        "type": "boolean"
                      }
                    },
                    "required": [
                      "delivery_option_type",
                      "option_title",
                      "eta_minutes_range",
                      "option_quote_message",
                      "title",
                      "sub_title",
                      "is_option_selectable"
                    ],
                    "additionalProperties": true
                  }
                },
                "schedule_longer_in_advance_time": {
                  "type": "boolean"
                },
                "asap_num_minutes_until_close": {
                  "type": "integer"
                },
                "asap_pickup_num_minutes_until_close": {
                  "type": "integer"
                },
                "scheduled_delivery_available": {
                  "type": "boolean"
                },
                "enable_new_schedule_ahead_ui": {
                  "type": "boolean"
                },
                "delivery_options_ui_config": {
                  "type": "object",
                  "properties": {
                    "enable_new_schedule_ahead_modal": {
                      "type": "boolean"
                    },
                    "enable_vertical_delivery_options": {
                      "type": "boolean"
                    },
                    "enable_be_driven_delivery_options": {
                      "type": "boolean"
                    },
                    "enable_standard_option_awareness_banner": {
                      "type": "boolean"
                    },
                    "enable_standard_option_eta_text": {
                      "type": "boolean"
                    },
                    "enable_order_confirmation_screen": {
                      "type": "boolean"
                    },
                    "enable_delivery_option_persistence": {
                      "type": "boolean"
                    },
                    "enable_dsd_tip_messaging": {
                      "type": "boolean"
                    },
                    "enable_scheduled_delivery_option_eta_text": {
                      "type": "boolean"
                    },
                    "enable_dynamic_delivery_options_parsing_sequencing_defaulting": {
                      "type": "boolean"
                    },
                    "checkout_warning_bottom_sheet_visibility_max_count": {
                      "type": "integer"
                    },
                    "enable_skip_standard_delivery_option": {
                      "type": "boolean"
                    },
                    "enable_delivery_option_revalidation": {
                      "type": "boolean"
                    }
                  },
                  "required": [
                    "enable_new_schedule_ahead_modal",
                    "enable_vertical_delivery_options",
                    "enable_be_driven_delivery_options",
                    "enable_standard_option_awareness_banner",
                    "enable_standard_option_eta_text",
                    "enable_order_confirmation_screen",
                    "enable_delivery_option_persistence",
                    "enable_dsd_tip_messaging",
                    "enable_scheduled_delivery_option_eta_text",
                    "enable_dynamic_delivery_options_parsing_sequencing_defaulting",
                    "checkout_warning_bottom_sheet_visibility_max_count",
                    "enable_skip_standard_delivery_option",
                    "enable_delivery_option_revalidation"
                  ],
                  "additionalProperties": true
                },
                "precheckout_eta_info": {
                  "type": "object",
                  "properties": {
                    "group_order_preview_asap_eta_buffer_mins": {
                      "type": "integer"
                    },
                    "group_order_preview_asap_eta_buffer_subtotal_threshold": {
                      "type": "object",
                      "properties": {
                        "unit_amount": {
                          "type": "integer"
                        }
                      },
                      "required": [
                        "unit_amount"
                      ],
                      "additionalProperties": true
                    }
                  },
                  "required": [
                    "group_order_preview_asap_eta_buffer_mins",
                    "group_order_preview_asap_eta_buffer_subtotal_threshold"
                  ],
                  "additionalProperties": true
                },
                "is_gated_store": {
                  "type": "boolean"
                }
              },
              "required": [
                "asap_available",
                "asap_minutes_range",
                "asap_pickup_available",
                "asap_pickup_minutes_range",
                "is_killed",
                "is_within_delivery_region",
                "asap_minutes_range_string",
                "asap_pickup_minutes_range_string",
                "available_days",
                "timezone",
                "delivery_options",
                "schedule_longer_in_advance_time",
                "asap_num_minutes_until_close",
                "asap_pickup_num_minutes_until_close",
                "scheduled_delivery_available",
                "enable_new_schedule_ahead_ui",
                "delivery_options_ui_config",
                "precheckout_eta_info",
                "is_gated_store"
              ],
              "additionalProperties": true
            },
            "delivery_address": {
              "type": "object",
              "properties": {
                "printable_address": {
                  "type": "string"
                },
                "street": {
                  "type": "string"
                },
                "city": {
                  "type": "string"
                },
                "subpremise": {
                  "type": "string"
                },
                "state": {
                  "type": "string"
                },
                "zip_code": {
                  "type": "string"
                },
                "lng": {
                  "type": "string"
                },
                "lat": {
                  "type": "string"
                },
                "country_code": {
                  "type": "string"
                }
              },
              "required": [
                "printable_address",
                "street",
                "city",
                "subpremise",
                "state",
                "zip_code",
                "lng",
                "lat",
                "country_code"
              ],
              "additionalProperties": true
            },
            "is_group": {
              "type": "boolean"
            },
            "top_off_enabled": {
              "type": "boolean"
            },
            "is_digital_wallet_allowed": {
              "type": "boolean"
            },
            "should_suggest_pickup": {
              "type": "boolean"
            },
            "total_before_tip": {
              "type": "object",
              "properties": {
                "unit_amount": {
                  "type": "integer"
                },
                "currency": {
                  "type": "string"
                },
                "display_string": {
                  "type": "string"
                },
                "decimal_places": {
                  "type": "integer"
                },
                "sign": {
                  "type": "boolean"
                },
                "symbol": {
                  "type": "string"
                }
              },
              "required": [
                "unit_amount",
                "currency",
                "display_string",
                "decimal_places",
                "sign",
                "symbol"
              ],
              "additionalProperties": true
            },
            "tip_suggestion_details": {
              "type": "object",
              "properties": {},
              "required": [],
              "additionalProperties": true
            },
            "discount_banner_details": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "discount_details_message": {
                    "type": "string"
                  },
                  "discount_details_message_description": {
                    "type": "string"
                  },
                  "is_new_dashpass_user": {
                    "type": "boolean"
                  },
                  "upsell_banner_action": {
                    "type": "object",
                    "properties": {},
                    "required": [],
                    "additionalProperties": true
                  },
                  "minimum_subtotal_percentage": {
                    "type": "integer"
                  },
                  "badge_Type": {
                    "type": "string"
                  },
                  "promotion_type": {
                    "type": "string"
                  },
                  "additional_subtotal": {
                    "type": "object",
                    "properties": {
                      "unit_amount": {
                        "type": "integer"
                      },
                      "currency": {
                        "type": "string"
                      },
                      "display_string": {
                        "type": "string"
                      },
                      "decimal_places": {
                        "type": "integer"
                      },
                      "sign": {
                        "type": "boolean"
                      },
                      "symbol": {
                        "type": "string"
                      }
                    },
                    "required": [
                      "unit_amount",
                      "currency",
                      "display_string",
                      "decimal_places",
                      "sign",
                      "symbol"
                    ],
                    "additionalProperties": true
                  },
                  "banner_type": {
                    "type": "string"
                  }
                },
                "required": [
                  "discount_details_message",
                  "discount_details_message_description",
                  "is_new_dashpass_user",
                  "upsell_banner_action",
                  "minimum_subtotal_percentage",
                  "badge_Type",
                  "promotion_type",
                  "additional_subtotal",
                  "banner_type"
                ],
                "additionalProperties": true
              }
            },
            "credit_details": {
              "type": "object",
              "properties": {
                "total_credits_applied": {
                  "type": "object",
                  "properties": {
                    "unit_amount": {
                      "type": "integer"
                    },
                    "currency": {
                      "type": "string"
                    },
                    "display_string": {
                      "type": "string"
                    },
                    "decimal_places": {
                      "type": "integer"
                    },
                    "sign": {
                      "type": "boolean"
                    },
                    "symbol": {
                      "type": "string"
                    }
                  },
                  "required": [
                    "unit_amount",
                    "currency",
                    "display_string",
                    "decimal_places",
                    "sign",
                    "symbol"
                  ],
                  "additionalProperties": true
                },
                "credit_breakdowns": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "credit_amount_applied": {
                        "type": "object",
                        "properties": {
                          "unit_amount": {
                            "type": "integer"
                          },
                          "currency": {
                            "type": "string"
                          },
                          "display_string": {
                            "type": "string"
                          },
                          "decimal_places": {
                            "type": "integer"
                          },
                          "sign": {
                            "type": "boolean"
                          },
                          "symbol": {
                            "type": "string"
                          }
                        },
                        "required": [
                          "unit_amount",
                          "currency",
                          "display_string",
                          "decimal_places",
                          "sign",
                          "symbol"
                        ],
                        "additionalProperties": true
                      }
                    },
                    "required": [
                      "credit_amount_applied"
                    ],
                    "additionalProperties": true
                  }
                },
                "credits_applicable_before_tip": {
                  "type": "object",
                  "properties": {
                    "unit_amount": {
                      "type": "integer"
                    },
                    "currency": {
                      "type": "string"
                    },
                    "display_string": {
                      "type": "string"
                    },
                    "decimal_places": {
                      "type": "integer"
                    },
                    "sign": {
                      "type": "boolean"
                    },
                    "symbol": {
                      "type": "string"
                    }
                  },
                  "required": [
                    "unit_amount",
                    "currency",
                    "display_string",
                    "decimal_places",
                    "sign",
                    "symbol"
                  ],
                  "additionalProperties": true
                },
                "line_item_label": {
                  "type": "string"
                },
                "tooltip": {
                  "type": "object",
                  "properties": {},
                  "required": [],
                  "additionalProperties": true
                },
                "total_credits_available": {
                  "type": "object",
                  "properties": {
                    "unit_amount": {
                      "type": "integer"
                    },
                    "currency": {
                      "type": "string"
                    },
                    "display_string": {
                      "type": "string"
                    },
                    "decimal_places": {
                      "type": "integer"
                    },
                    "sign": {
                      "type": "boolean"
                    },
                    "symbol": {
                      "type": "string"
                    }
                  },
                  "required": [
                    "unit_amount",
                    "currency",
                    "display_string",
                    "decimal_places",
                    "sign",
                    "symbol"
                  ],
                  "additionalProperties": true
                }
              },
              "required": [
                "total_credits_applied",
                "credit_breakdowns",
                "credits_applicable_before_tip",
                "line_item_label",
                "tooltip",
                "total_credits_available"
              ],
              "additionalProperties": true
            },
            "is_dashpass_applied": {
              "type": "boolean"
            },
            "creditsback_details": {
              "type": "object",
              "properties": {
                "amount": {
                  "type": "object",
                  "properties": {
                    "unit_amount": {
                      "type": "integer"
                    },
                    "currency": {
                      "type": "string"
                    },
                    "display_string": {
                      "type": "string"
                    },
                    "decimal_places": {
                      "type": "integer"
                    },
                    "sign": {
                      "type": "boolean"
                    },
                    "symbol": {
                      "type": "string"
                    }
                  },
                  "required": [
                    "unit_amount",
                    "currency",
                    "display_string",
                    "decimal_places",
                    "sign",
                    "symbol"
                  ],
                  "additionalProperties": true
                }
              },
              "required": [
                "amount"
              ],
              "additionalProperties": true
            },
            "is_pre_tippable": {
              "type": "boolean"
            },
            "id": {
              "type": "string"
            },
            "pickup_saving_details": {
              "type": "object",
              "properties": {},
              "required": [],
              "additionalProperties": true
            },
            "differential_pricing_details": {
              "type": "object",
              "properties": {
                "is_enabled": {
                  "type": "boolean"
                },
                "message": {
                  "type": "string"
                },
                "disclaimer_title": {
                  "type": "string"
                },
                "disclaimer_message": {
                  "type": "string"
                }
              },
              "required": [
                "is_enabled",
                "message",
                "disclaimer_title",
                "disclaimer_message"
              ],
              "additionalProperties": true
            },
            "tips_suggestion_details": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string"
                  },
                  "monetary_values": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "properties": {
                        "unit_amount": {
                          "type": "integer"
                        },
                        "currency": {
                          "type": "string"
                        },
                        "display_string": {
                          "type": "string"
                        },
                        "decimal_places": {
                          "type": "integer"
                        },
                        "sign": {
                          "type": "boolean"
                        },
                        "symbol": {
                          "type": "string"
                        }
                      },
                      "required": [
                        "unit_amount",
                        "currency",
                        "display_string",
                        "decimal_places",
                        "sign",
                        "symbol"
                      ],
                      "additionalProperties": true
                    }
                  },
                  "default_index": {
                    "type": "integer"
                  },
                  "tip_recipient": {
                    "type": "string"
                  },
                  "tip_messaging": {
                    "type": "object",
                    "properties": {
                      "info_sheet_title": {
                        "type": "string"
                      },
                      "info_sheet_detail": {
                        "type": "string"
                      },
                      "checkout_title": {
                        "type": "string"
                      },
                      "checkout_subtitle": {
                        "type": "string"
                      },
                      "checkout_effort_based_subtitle": {
                        "type": "string"
                      },
                      "line_item_title": {
                        "type": "string"
                      },
                      "custom_tip_title": {
                        "type": "string"
                      },
                      "custom_tip_subtitle": {
                        "type": "string"
                      },
                      "fullscreen_title": {
                        "type": "string"
                      },
                      "fullscreen_subtitle": {
                        "type": "string"
                      },
                      "fullscreen_body": {
                        "type": "string"
                      },
                      "fullscreen_custom_tip_subtitle": {
                        "type": "string"
                      },
                      "fullscreen_image_url": {
                        "type": "string"
                      },
                      "fullscreen_caption": {
                        "type": "string"
                      }
                    },
                    "required": [
                      "info_sheet_title",
                      "info_sheet_detail",
                      "checkout_title",
                      "checkout_subtitle",
                      "checkout_effort_based_subtitle",
                      "line_item_title",
                      "custom_tip_title",
                      "custom_tip_subtitle",
                      "fullscreen_title",
                      "fullscreen_subtitle",
                      "fullscreen_body",
                      "fullscreen_custom_tip_subtitle",
                      "fullscreen_image_url",
                      "fullscreen_caption"
                    ],
                    "additionalProperties": true
                  },
                  "default_tip_index": {
                    "type": "integer"
                  }
                },
                "required": [
                  "type",
                  "monetary_values",
                  "default_index",
                  "tip_recipient",
                  "tip_messaging",
                  "default_tip_index"
                ],
                "additionalProperties": true
              }
            },
            "logging": {
              "type": "object",
              "properties": {
                "delivery_discount_min_subtotal": {
                  "type": "string"
                },
                "address_id": {
                  "type": "string"
                },
                "cx_delivery_fee_promotion_amount": {
                  "type": "string"
                },
                "total_promotion_amount": {
                  "type": "string"
                },
                "is_dashpass": {
                  "type": "boolean"
                }
              },
              "required": [
                "delivery_discount_min_subtotal",
                "address_id",
                "cx_delivery_fee_promotion_amount",
                "total_promotion_amount",
                "is_dashpass"
              ],
              "additionalProperties": true
            },
            "is_bundle": {
              "type": "boolean"
            },
            "eligible_subscription": {
              "type": "object",
              "properties": {
                "should_show_dashpass": {
                  "type": "boolean"
                },
                "eligible_subscription_saving_details": {
                  "type": "object",
                  "properties": {},
                  "required": [],
                  "additionalProperties": true
                }
              },
              "required": [
                "should_show_dashpass",
                "eligible_subscription_saving_details"
              ],
              "additionalProperties": true
            },
            "alcohol_food_constraint_cart_level": {
              "type": "string"
            },
            "contains_alcohol_item": {
              "type": "boolean"
            },
            "signature_required": {
              "type": "boolean"
            },
            "applicable_loyalty_rewards": {
              "type": "object",
              "properties": {},
              "required": [],
              "additionalProperties": true
            },
            "is_package_return": {
              "type": "boolean"
            },
            "self_delivery_type": {
              "type": "string"
            },
            "is_free_direct_delivery_applied": {
              "type": "boolean"
            },
            "meal_train_details": {
              "type": "object",
              "properties": {
                "meal_train_uuid": {
                  "type": "string"
                }
              },
              "required": [
                "meal_train_uuid"
              ],
              "additionalProperties": true
            },
            "loyalty_points_summary": {
              "type": "object",
              "properties": {},
              "required": [],
              "additionalProperties": true
            },
            "map_item_subtotal": {
              "type": "object",
              "properties": {
                "unit_amount": {
                  "type": "integer"
                },
                "currency": {
                  "type": "string"
                },
                "display_string": {
                  "type": "string"
                },
                "decimal_places": {
                  "type": "integer"
                },
                "sign": {
                  "type": "boolean"
                },
                "symbol": {
                  "type": "string"
                }
              },
              "required": [
                "unit_amount",
                "currency",
                "display_string",
                "decimal_places",
                "sign",
                "symbol"
              ],
              "additionalProperties": true
            },
            "total_savings": {
              "type": "object",
              "properties": {
                "unit_amount": {
                  "type": "integer"
                },
                "currency": {
                  "type": "string"
                },
                "display_string": {
                  "type": "string"
                },
                "decimal_places": {
                  "type": "integer"
                },
                "sign": {
                  "type": "boolean"
                },
                "symbol": {
                  "type": "string"
                }
              },
              "required": [
                "unit_amount",
                "currency",
                "display_string",
                "decimal_places",
                "sign",
                "symbol"
              ],
              "additionalProperties": true
            },
            "accessibility_input_enabled": {
              "type": "boolean"
            },
            "should_apply_credits": {
              "type": "boolean"
            },
            "total_before_discounts_and_credits": {
              "type": "object",
              "properties": {
                "unit_amount": {
                  "type": "integer"
                },
                "currency": {
                  "type": "string"
                },
                "display_string": {
                  "type": "string"
                },
                "decimal_places": {
                  "type": "integer"
                },
                "sign": {
                  "type": "boolean"
                }
              },
              "required": [
                "unit_amount",
                "currency",
                "display_string",
                "decimal_places",
                "sign"
              ],
              "additionalProperties": true
            },
            "pricing_summary_collapsed_view_details": {
              "type": "object",
              "properties": {
                "original_taxes_and_fees": {
                  "type": "object",
                  "properties": {
                    "unit_amount": {
                      "type": "integer"
                    },
                    "currency": {
                      "type": "string"
                    },
                    "display_string": {
                      "type": "string"
                    },
                    "decimal_places": {
                      "type": "integer"
                    },
                    "sign": {
                      "type": "boolean"
                    },
                    "symbol": {
                      "type": "string"
                    }
                  },
                  "required": [
                    "unit_amount",
                    "currency",
                    "display_string",
                    "decimal_places",
                    "sign",
                    "symbol"
                  ],
                  "additionalProperties": true
                },
                "final_taxes_and_fees": {
                  "type": "object",
                  "properties": {
                    "unit_amount": {
                      "type": "integer"
                    },
                    "currency": {
                      "type": "string"
                    },
                    "display_string": {
                      "type": "string"
                    },
                    "decimal_places": {
                      "type": "integer"
                    },
                    "sign": {
                      "type": "boolean"
                    },
                    "symbol": {
                      "type": "string"
                    }
                  },
                  "required": [
                    "unit_amount",
                    "currency",
                    "display_string",
                    "decimal_places",
                    "sign",
                    "symbol"
                  ],
                  "additionalProperties": true
                }
              },
              "required": [
                "original_taxes_and_fees",
                "final_taxes_and_fees"
              ],
              "additionalProperties": true
            },
            "payment_profile_type": {
              "type": "string"
            },
            "pricing_quote_id": {
              "type": "string"
            },
            "net_total_before_tip": {
              "type": "object",
              "properties": {
                "unit_amount": {
                  "type": "integer"
                },
                "currency": {
                  "type": "string"
                },
                "display_string": {
                  "type": "string"
                },
                "decimal_places": {
                  "type": "integer"
                },
                "sign": {
                  "type": "boolean"
                },
                "symbol": {
                  "type": "string"
                }
              },
              "required": [
                "unit_amount",
                "currency",
                "display_string",
                "decimal_places",
                "sign",
                "symbol"
              ],
              "additionalProperties": true
            },
            "expand_address_details": {
              "type": "boolean"
            },
            "is_cx_in_challenge": {
              "type": "boolean"
            },
            "items_with_validation_errors": {
              "type": "object",
              "properties": {},
              "required": [],
              "additionalProperties": true
            }
          },
          "required": [
            "line_items",
            "store_order_cart",
            "creator",
            "min_age_requirement",
            "currency",
            "delivery_availability",
            "delivery_address",
            "is_group",
            "top_off_enabled",
            "is_digital_wallet_allowed",
            "should_suggest_pickup",
            "total_before_tip",
            "tip_suggestion_details",
            "discount_banner_details",
            "credit_details",
            "is_dashpass_applied",
            "creditsback_details",
            "is_pre_tippable",
            "id",
            "pickup_saving_details",
            "differential_pricing_details",
            "tips_suggestion_details",
            "logging",
            "is_bundle",
            "eligible_subscription",
            "alcohol_food_constraint_cart_level",
            "contains_alcohol_item",
            "signature_required",
            "applicable_loyalty_rewards",
            "is_package_return",
            "self_delivery_type",
            "is_free_direct_delivery_applied",
            "meal_train_details",
            "loyalty_points_summary",
            "map_item_subtotal",
            "total_savings",
            "accessibility_input_enabled",
            "should_apply_credits",
            "total_before_discounts_and_credits",
            "pricing_summary_collapsed_view_details",
            "payment_profile_type",
            "pricing_quote_id",
            "net_total_before_tip",
            "expand_address_details",
            "is_cx_in_challenge",
            "items_with_validation_errors"
          ],
          "additionalProperties": true
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
    },
    "source": "advertised + observed"
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
    },
    "source": "advertised"
  },
  "doordash_get_checkout_url": {
    "component": "DDGetCheckoutUrlResult",
    "schema": {
      "type": "object",
      "properties": {
        "checkout_url": {
          "type": "string"
        },
        "success": {
          "type": "boolean"
        }
      },
      "required": [
        "checkout_url",
        "success"
      ],
      "additionalProperties": true
    },
    "source": "observed"
  },
  "doordash_list_delivery_addresses": {
    "component": "DDListDeliveryAddressesResult",
    "schema": {
      "type": "object",
      "properties": {
        "widget_type": {
          "type": "string"
        },
        "addresses": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "address_id": {
                "type": "string"
              },
              "address_link_id": {
                "type": "string"
              },
              "printable_address": {
                "type": "string"
              },
              "street_address": {
                "type": "string"
              },
              "city": {
                "type": "string"
              },
              "state": {
                "type": "string"
              },
              "zip_code": {
                "type": "string"
              },
              "lat": {
                "type": "number"
              },
              "lng": {
                "type": "number"
              },
              "is_default": {
                "type": "boolean"
              },
              "label": {
                "type": [
                  "string",
                  "string",
                  "string"
                ],
                "nullable": true
              },
              "delivery_instructions": {
                "type": "string"
              }
            },
            "required": [
              "address_id",
              "address_link_id",
              "printable_address",
              "street_address",
              "city",
              "state",
              "zip_code",
              "lat",
              "lng",
              "is_default",
              "label",
              "delivery_instructions"
            ],
            "additionalProperties": true
          }
        },
        "trace_id": {
          "type": "string"
        },
        "timestamp": {
          "type": "string"
        },
        "success": {
          "type": "boolean"
        },
        "message": {
          "type": "null"
        }
      },
      "required": [
        "widget_type",
        "addresses",
        "trace_id",
        "timestamp",
        "success",
        "message"
      ],
      "additionalProperties": true
    },
    "source": "observed"
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
    },
    "source": "advertised"
  },
  "doordash_get_payment_info": {
    "component": "DDGetPaymentInfoResult",
    "schema": {
      "type": "object",
      "properties": {
        "success": {
          "type": "boolean"
        },
        "message": {
          "type": "string"
        },
        "cards": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "payment_method_id": {
                "type": "string"
              },
              "last4": {
                "type": "string"
              },
              "brand": {
                "type": "string"
              },
              "exp_month": {
                "type": "string"
              },
              "exp_year": {
                "type": "string"
              },
              "provider_payment_method_id": {
                "type": "string"
              }
            },
            "required": [
              "payment_method_id",
              "last4",
              "brand",
              "exp_month",
              "exp_year",
              "provider_payment_method_id"
            ],
            "additionalProperties": true
          }
        },
        "default_payment_method_id": {
          "type": "string"
        }
      },
      "required": [
        "success",
        "message",
        "cards",
        "default_payment_method_id"
      ],
      "additionalProperties": true
    },
    "source": "observed"
  }
}
