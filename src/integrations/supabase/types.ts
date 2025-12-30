export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      category_monitors: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          last_item_count: number | null
          name: string
          subtract_from_total: boolean
          threshold: number
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_item_count?: number | null
          name: string
          subtract_from_total?: boolean
          threshold?: number
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_item_count?: number | null
          name?: string
          subtract_from_total?: boolean
          threshold?: number
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      firecrawl_api_keys: {
        Row: {
          api_key: string
          created_at: string
          id: string
          is_active: boolean
          label: string | null
          last_error: string | null
          last_used_at: string | null
          updated_at: string
        }
        Insert: {
          api_key: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          last_error?: string | null
          last_used_at?: string | null
          updated_at?: string
        }
        Update: {
          api_key?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          last_error?: string | null
          last_used_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      monitor_history: {
        Row: {
          created_at: string
          exceeds_threshold: boolean
          id: string
          item_count: number
          telegram_error: string | null
          telegram_sent: boolean
          threshold: number
        }
        Insert: {
          created_at?: string
          exceeds_threshold?: boolean
          id?: string
          item_count: number
          telegram_error?: string | null
          telegram_sent?: boolean
          threshold: number
        }
        Update: {
          created_at?: string
          exceeds_threshold?: boolean
          id?: string
          item_count?: number
          telegram_error?: string | null
          telegram_sent?: boolean
          threshold?: number
        }
        Relationships: []
      }
      monitor_settings: {
        Row: {
          created_at: string
          firecrawl_api_key: string | null
          id: string
          interval_seconds: number
          is_paused: boolean
          jump_threshold: number
          last_api_key_alert_at: string | null
          threshold: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          firecrawl_api_key?: string | null
          id?: string
          interval_seconds?: number
          is_paused?: boolean
          jump_threshold?: number
          last_api_key_alert_at?: string | null
          threshold?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          firecrawl_api_key?: string | null
          id?: string
          interval_seconds?: number
          is_paused?: boolean
          jump_threshold?: number
          last_api_key_alert_at?: string | null
          threshold?: number
          updated_at?: string
        }
        Relationships: []
      }
      monitored_products: {
        Row: {
          category_id: string | null
          created_at: string
          first_seen_at: string
          id: string
          notified: boolean
          product_url: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          first_seen_at?: string
          id?: string
          notified?: boolean
          product_url: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          first_seen_at?: string
          id?: string
          notified?: boolean
          product_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitored_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "category_monitors"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_pricing: {
        Row: {
          id: string
          price_1_month: number
          price_1_week: number
          price_3_days: number
          updated_at: string
        }
        Insert: {
          id?: string
          price_1_month?: number
          price_1_week?: number
          price_3_days?: number
          updated_at?: string
        }
        Update: {
          id?: string
          price_1_month?: number
          price_1_week?: number
          price_3_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      telegram_messages: {
        Row: {
          chat_id: string
          created_at: string
          first_name: string | null
          id: string
          message_text: string
          username: string | null
        }
        Insert: {
          chat_id: string
          created_at?: string
          first_name?: string | null
          id?: string
          message_text: string
          username?: string | null
        }
        Update: {
          chat_id?: string
          created_at?: string
          first_name?: string | null
          id?: string
          message_text?: string
          username?: string | null
        }
        Relationships: []
      }
      telegram_subscribers: {
        Row: {
          chat_id: string
          first_name: string | null
          id: string
          is_active: boolean
          subscribed_at: string
          subscription_expires_at: string | null
          username: string | null
        }
        Insert: {
          chat_id: string
          first_name?: string | null
          id?: string
          is_active?: boolean
          subscribed_at?: string
          subscription_expires_at?: string | null
          username?: string | null
        }
        Update: {
          chat_id?: string
          first_name?: string | null
          id?: string
          is_active?: boolean
          subscribed_at?: string
          subscription_expires_at?: string | null
          username?: string | null
        }
        Relationships: []
      }
      telegram_subscriptions: {
        Row: {
          amount: number
          approved_at: string | null
          chat_id: string
          created_at: string
          expires_at: string | null
          first_name: string | null
          id: string
          plan_type: string
          requested_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          username: string | null
          utr_id: string | null
        }
        Insert: {
          amount: number
          approved_at?: string | null
          chat_id: string
          created_at?: string
          expires_at?: string | null
          first_name?: string | null
          id?: string
          plan_type: string
          requested_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          username?: string | null
          utr_id?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          chat_id?: string
          created_at?: string
          expires_at?: string | null
          first_name?: string | null
          id?: string
          plan_type?: string
          requested_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          username?: string | null
          utr_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      subscription_status: "pending" | "active" | "expired"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      subscription_status: ["pending", "active", "expired"],
    },
  },
} as const
